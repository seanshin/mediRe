// Dashboard functionality
const API_BASE = '/api';
const CURRENT_USER_ID = 1; // Demo user ID

// State management
let currentTab = 'appointments';
let appointments = [];
let medicalRecords = [];
let prescriptions = [];
let hospitals = [];
let chatSessionId = null;

// Initialize dashboard
async function initDashboard() {
  await loadData();
  updateSummaryCards();
  setupEventListeners();
}

// Load all data
async function loadData() {
  try {
    // Load appointments
    const apptResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/appointments`);
    appointments = apptResponse.data.data || [];

    // Load medical records
    const recordsResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/medical-records`);
    medicalRecords = recordsResponse.data.data || [];

    // Load prescriptions
    const prescResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/prescriptions?status=active`);
    prescriptions = prescResponse.data.data || [];

    // Load hospitals
    const hospitalsResponse = await axios.get(`${API_BASE}/hospitals`);
    hospitals = hospitalsResponse.data.data || [];

    renderCurrentTab();
  } catch (error) {
    console.error('데이터 로드 실패:', error);
  }
}

// Update summary cards
function updateSummaryCards() {
  const upcomingAppointments = appointments.filter(a => a.status === 'scheduled').length;
  document.getElementById('upcomingCount').textContent = upcomingAppointments;
  document.getElementById('recordsCount').textContent = medicalRecords.length;
  document.getElementById('prescriptionsCount').textContent = prescriptions.length;
  document.getElementById('hospitalsCount').textContent = hospitals.length;
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // AI Chat modal
  document.getElementById('aiChatBtn').addEventListener('click', openAIChat);
  document.getElementById('closeChatBtn').addEventListener('click', closeAIChat);
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Voice button
  document.getElementById('voiceBtn').addEventListener('click', startVoiceInput);

  // Quick actions
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      document.getElementById('chatInput').value = action;
      sendMessage();
    });
  });

  // New appointment button
  const newApptBtn = document.getElementById('newAppointmentBtn');
  if (newApptBtn) {
    newApptBtn.addEventListener('click', () => {
      openAIChat();
      setTimeout(() => {
        document.getElementById('chatInput').value = '병원 예약하고 싶어요';
        sendMessage();
      }, 500);
    });
  }
}

// Switch tab
function switchTab(tab) {
  currentTab = tab;
  
  // Update button styles
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tab) {
      btn.classList.add('text-purple-600', 'border-b-2', 'border-purple-600');
      btn.classList.remove('text-gray-600');
    } else {
      btn.classList.remove('text-purple-600', 'border-b-2', 'border-purple-600');
      btn.classList.add('text-gray-600');
    }
  });

  // Show/hide content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  document.getElementById(`tab-${tab}`).classList.remove('hidden');

  renderCurrentTab();
}

// Render current tab content
function renderCurrentTab() {
  switch (currentTab) {
    case 'appointments':
      renderAppointments();
      break;
    case 'records':
      renderMedicalRecords();
      break;
    case 'prescriptions':
      renderPrescriptions();
      break;
    case 'hospitals':
      renderHospitals();
      break;
  }
}

// Render appointments
function renderAppointments() {
  const container = document.getElementById('appointmentsList');
  if (!appointments || appointments.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">예약이 없습니다. AI 어시스턴트를 통해 새로운 예약을 만들어보세요!</p>';
    return;
  }

  const statusColors = {
    scheduled: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };

  const statusText = {
    scheduled: '예정',
    completed: '완료',
    cancelled: '취소'
  };

  container.innerHTML = appointments.map(apt => `
    <div class="border rounded-lg p-4 mb-4 hover:shadow-lg transition">
      <div class="flex justify-between items-start mb-3">
        <div>
          <h3 class="font-bold text-lg text-gray-800">${apt.hospital_name}</h3>
          <p class="text-gray-600">${apt.doctor_name} (${apt.doctor_specialty})</p>
        </div>
        <span class="px-3 py-1 rounded-full text-sm font-semibold ${statusColors[apt.status] || 'bg-gray-100 text-gray-800'}">
          ${statusText[apt.status] || apt.status}
        </span>
      </div>
      <div class="space-y-2 text-sm text-gray-600">
        <p><i class="fas fa-calendar mr-2 text-purple-600"></i>${apt.appointment_date} ${apt.appointment_time}</p>
        <p><i class="fas fa-map-marker-alt mr-2 text-purple-600"></i>${apt.hospital_address}</p>
        ${apt.symptoms ? `<p><i class="fas fa-notes-medical mr-2 text-purple-600"></i>${apt.symptoms}</p>` : ''}
      </div>
      ${apt.status === 'scheduled' ? `
        <div class="mt-4 flex gap-2">
          <button onclick="cancelAppointment(${apt.id})" class="text-red-600 hover:text-red-700 text-sm font-semibold">
            <i class="fas fa-times-circle mr-1"></i>예약 취소
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

// Render medical records
function renderMedicalRecords() {
  const container = document.getElementById('recordsList');
  if (!medicalRecords || medicalRecords.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">의료 기록이 없습니다.</p>';
    return;
  }

  container.innerHTML = medicalRecords.map(record => `
    <div class="border rounded-lg p-4 mb-4 hover:shadow-lg transition">
      <div class="flex justify-between items-start mb-3">
        <div>
          <h3 class="font-bold text-lg text-gray-800">${record.hospital_name}</h3>
          <p class="text-gray-600">${record.doctor_name} (${record.doctor_specialty})</p>
        </div>
        <span class="text-sm text-gray-500">${record.visit_date}</span>
      </div>
      <div class="bg-gray-50 rounded-lg p-4 space-y-2">
        <div>
          <span class="font-semibold text-gray-700">진단:</span>
          <p class="text-gray-800 mt-1">${record.diagnosis}</p>
        </div>
        ${record.symptoms ? `
          <div>
            <span class="font-semibold text-gray-700">증상:</span>
            <p class="text-gray-600 mt-1">${record.symptoms}</p>
          </div>
        ` : ''}
        ${record.treatment ? `
          <div>
            <span class="font-semibold text-gray-700">치료:</span>
            <p class="text-gray-600 mt-1">${record.treatment}</p>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// Render prescriptions
function renderPrescriptions() {
  const container = document.getElementById('prescriptionsList');
  if (!prescriptions || prescriptions.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">활성 처방전이 없습니다.</p>';
    return;
  }

  container.innerHTML = prescriptions.map(presc => {
    const medications = JSON.parse(presc.medications);
    return `
      <div class="border rounded-lg p-4 mb-4 hover:shadow-lg transition">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${presc.hospital_name}</h3>
            <p class="text-gray-600">${presc.doctor_name} (${presc.doctor_specialty})</p>
          </div>
          <span class="text-sm text-gray-500">${presc.prescription_date}</span>
        </div>
        <div class="bg-purple-50 rounded-lg p-4 mb-3">
          <h4 class="font-semibold text-gray-700 mb-2">처방 약물:</h4>
          <div class="space-y-1">
            ${medications.map(med => `
              <p class="text-gray-800"><i class="fas fa-pills text-purple-600 mr-2"></i>${med.name} - ${med.dosage}</p>
            `).join('')}
          </div>
        </div>
        <div class="bg-gray-50 rounded-lg p-4 space-y-2">
          <div>
            <span class="font-semibold text-gray-700">복용 방법:</span>
            <p class="text-gray-600 mt-1 whitespace-pre-line">${presc.dosage_instructions}</p>
          </div>
          <div>
            <span class="font-semibold text-gray-700">복용 기간:</span>
            <p class="text-gray-600 mt-1">${presc.duration_days}일</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render hospitals
function renderHospitals() {
  const container = document.getElementById('hospitalsList');
  if (!hospitals || hospitals.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">병원 정보를 불러올 수 없습니다.</p>';
    return;
  }

  container.innerHTML = hospitals.map(hospital => {
    const specialties = JSON.parse(hospital.specialties);
    return `
      <div class="border rounded-lg p-4 mb-4 hover:shadow-lg transition cursor-pointer" onclick="viewHospitalDetails(${hospital.id})">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h3 class="font-bold text-xl text-gray-800">${hospital.name}</h3>
            <p class="text-gray-600 mt-1"><i class="fas fa-map-marker-alt mr-2"></i>${hospital.address}</p>
            <p class="text-gray-600 mt-1"><i class="fas fa-phone mr-2"></i>${hospital.phone}</p>
          </div>
          <div class="text-right">
            <div class="flex items-center">
              <i class="fas fa-star text-yellow-500 mr-1"></i>
              <span class="font-bold text-lg">${hospital.rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          ${specialties.map(spec => `
            <span class="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">${spec}</span>
          `).join('')}
        </div>
        <div class="mt-3 flex gap-2">
          <button onclick="bookHospital(${hospital.id}, event)" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm">
            <i class="fas fa-calendar-plus mr-2"></i>예약하기
          </button>
          <button onclick="viewDoctors(${hospital.id}, event)" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm">
            <i class="fas fa-user-md mr-2"></i>의사 보기
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Cancel appointment
async function cancelAppointment(appointmentId) {
  if (!confirm('정말 이 예약을 취소하시겠습니까?')) return;

  try {
    await axios.put(`${API_BASE}/appointments/${appointmentId}`, {
      status: 'cancelled'
    });
    alert('예약이 취소되었습니다.');
    await loadData();
  } catch (error) {
    console.error('예약 취소 실패:', error);
    alert('예약 취소에 실패했습니다.');
  }
}

// View hospital details
function viewHospitalDetails(hospitalId) {
  const hospital = hospitals.find(h => h.id === hospitalId);
  if (!hospital) return;
  
  alert(`병원 상세 정보\n\n이름: ${hospital.name}\n주소: ${hospital.address}\n전화: ${hospital.phone}\n평점: ${hospital.rating}`);
}

// Book hospital
function bookHospital(hospitalId, event) {
  event.stopPropagation();
  openAIChat();
  const hospital = hospitals.find(h => h.id === hospitalId);
  if (hospital) {
    setTimeout(() => {
      document.getElementById('chatInput').value = `${hospital.name}에 예약하고 싶어요`;
      sendMessage();
    }, 500);
  }
}

// View doctors
async function viewDoctors(hospitalId, event) {
  event.stopPropagation();
  try {
    const response = await axios.get(`${API_BASE}/hospitals/${hospitalId}/doctors`);
    const doctors = response.data.data || [];
    
    if (doctors.length === 0) {
      alert('등록된 의사가 없습니다.');
      return;
    }

    const doctorsList = doctors.map(doc => 
      `• ${doc.name} (${doc.specialty}) - 평점: ${doc.rating} - 경력: ${doc.experience_years}년`
    ).join('\n');

    alert(`의사 목록\n\n${doctorsList}`);
  } catch (error) {
    console.error('의사 목록 로드 실패:', error);
    alert('의사 목록을 불러올 수 없습니다.');
  }
}

// AI Chat functions
async function openAIChat() {
  document.getElementById('aiChatModal').classList.remove('hidden');
  
  if (!chatSessionId) {
    try {
      const response = await axios.post(`${API_BASE}/chat/sessions`, {
        user_id: CURRENT_USER_ID,
        session_type: 'general'
      });
      chatSessionId = response.data.data.id;
    } catch (error) {
      console.error('채팅 세션 생성 실패:', error);
    }
  }
}

function closeAIChat() {
  document.getElementById('aiChatModal').classList.add('hidden');
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;

  // Add user message to UI
  addMessageToChat('user', message);
  input.value = '';

  // Save message to database
  if (chatSessionId) {
    try {
      await axios.post(`${API_BASE}/chat/messages`, {
        session_id: chatSessionId,
        role: 'user',
        content: message,
        message_type: 'text'
      });
    } catch (error) {
      console.error('메시지 저장 실패:', error);
    }
  }

  // Generate AI response
  setTimeout(() => {
    const response = generateAIResponse(message);
    addMessageToChat('assistant', response);
    
    // Save AI response
    if (chatSessionId) {
      axios.post(`${API_BASE}/chat/messages`, {
        session_id: chatSessionId,
        role: 'assistant',
        content: response,
        message_type: 'text'
      }).catch(error => console.error('AI 응답 저장 실패:', error));
    }
  }, 1000);
}

function addMessageToChat(role, content) {
  const messagesContainer = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  
  if (role === 'user') {
    messageDiv.className = 'flex items-start justify-end';
    messageDiv.innerHTML = `
      <div class="bg-purple-600 text-white rounded-lg shadow p-4 max-w-md">
        <p>${content}</p>
      </div>
      <div class="bg-gray-300 text-gray-700 rounded-full p-2 ml-3">
        <i class="fas fa-user"></i>
      </div>
    `;
  } else {
    messageDiv.className = 'flex items-start';
    messageDiv.innerHTML = `
      <div class="bg-purple-600 text-white rounded-full p-2 mr-3">
        <i class="fas fa-robot"></i>
      </div>
      <div class="bg-white rounded-lg shadow p-4 max-w-md">
        <p class="text-gray-800">${content}</p>
      </div>
    `;
  }
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function generateAIResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  
  if (msg.includes('예약') || msg.includes('병원')) {
    return '병원 예약을 도와드리겠습니다. 어떤 진료과목을 원하시나요? (예: 내과, 정형외과, 소아과 등)';
  } else if (msg.includes('내과')) {
    const internalDoctors = ['김민수 (서울대학교병원)', '박준호 (삼성서울병원)'];
    return `내과 전문의를 찾아드렸습니다:\n\n${internalDoctors.join('\n')}\n\n언제 예약하시겠습니까?`;
  } else if (msg.includes('처방') || msg.includes('약')) {
    const activePresc = prescriptions.length;
    return `현재 활성 처방전이 ${activePresc}개 있습니다. 처방전 탭에서 자세한 내용을 확인하실 수 있습니다.`;
  } else if (msg.includes('확인') || msg.includes('조회')) {
    const upcomingAppts = appointments.filter(a => a.status === 'scheduled').length;
    return `다가오는 예약이 ${upcomingAppts}건 있습니다. 예약 관리 탭에서 확인하실 수 있습니다.`;
  } else {
    return '무엇을 도와드릴까요? 병원 예약, 의료 기록 조회, 처방전 확인 등을 도와드릴 수 있습니다.';
  }
}

function startVoiceInput() {
  alert('음성 입력 기능은 실제 배포 환경에서 Web Speech API를 통해 구현됩니다.');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initDashboard);

// Make functions globally accessible
window.cancelAppointment = cancelAppointment;
window.viewHospitalDetails = viewHospitalDetails;
window.bookHospital = bookHospital;
window.viewDoctors = viewDoctors;
