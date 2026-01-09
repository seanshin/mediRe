// Dashboard functionality
const API_BASE = '/api';

// Get current user from localStorage
let currentUser = null;
try {
  currentUser = JSON.parse(localStorage.getItem('user'));
} catch (e) {
  console.error('Failed to parse user data');
}

const CURRENT_USER_ID = currentUser?.id || 1; // Fallback to demo user

// State management
let currentTab = 'appointments';
let currentInsuranceTab = 'policies';
let appointments = [];
let medicalRecords = [];
let prescriptions = [];
let hospitals = [];
let insurancePolicies = [];
let insuranceClaims = [];
let insuranceReceipts = [];
let insuranceStats = {};
let chatSessionId = null;

// Initialize dashboard
async function initDashboard() {
  // Check if user is logged in
  if (currentUser) {
    document.getElementById('userName').textContent = currentUser.name + '님';
  }
  
  await loadData();
  updateSummaryCards();
  setupEventListeners();
}

// Logout function
function logout() {
  if (confirm('로그아웃 하시겠습니까?')) {
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

// Toggle user menu
function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  menu.classList.toggle('hidden');
}

// Close user menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  const userInfo = e.target.closest('[onclick="toggleUserMenu()"]');
  if (!userInfo && !menu?.contains(e.target)) {
    menu?.classList.add('hidden');
  }
});

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

    // Load insurance data
    const policiesResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/insurance/policies`);
    insurancePolicies = policiesResponse.data.data || [];

    const claimsResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/insurance/claims`);
    insuranceClaims = claimsResponse.data.data || [];

    const receiptsResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/insurance/receipts`);
    insuranceReceipts = receiptsResponse.data.data || [];

    const statsResponse = await axios.get(`${API_BASE}/users/${CURRENT_USER_ID}/insurance/statistics`);
    insuranceStats = statsResponse.data.data || {};

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
  document.getElementById('insuranceClaimsCount').textContent = insuranceStats.pending_claims || 0;
  
  // Update insurance summary
  if (document.getElementById('insurancePoliciesCount')) {
    document.getElementById('insurancePoliciesCount').textContent = insuranceStats.active_policies || 0;
    document.getElementById('insuranceTotalClaimed').textContent = formatCurrency(insuranceStats.total_claimed || 0);
    document.getElementById('insuranceTotalPaid').textContent = formatCurrency(insuranceStats.total_paid || 0);
    document.getElementById('insurancePendingCount').textContent = insuranceStats.pending_claims || 0;
  }
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
    case 'insurance':
      renderInsuranceTab();
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

// ==================== Insurance Functions ====================

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
}

// Render insurance tab
function renderInsuranceTab() {
  renderInsurancePolicies();
  renderInsuranceClaims();
  renderInsuranceReceipts();
  
  // Setup insurance sub-tab switching
  document.querySelectorAll('.insurance-sub-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.insuranceTab;
      switchInsuranceTab(tab);
    });
  });
}

// Switch insurance sub-tab
function switchInsuranceTab(tab) {
  currentInsuranceTab = tab;
  
  // Update tab buttons
  document.querySelectorAll('.insurance-sub-tab').forEach(btn => {
    if (btn.dataset.insuranceTab === tab) {
      btn.classList.add('text-purple-600', 'border-b-2', 'border-purple-600');
      btn.classList.remove('text-gray-600');
    } else {
      btn.classList.remove('text-purple-600', 'border-b-2', 'border-purple-600');
      btn.classList.add('text-gray-600');
    }
  });
  
  // Show/hide content
  document.querySelectorAll('.insurance-sub-content').forEach(content => {
    content.classList.add('hidden');
  });
  document.getElementById(`insurance-sub-${tab}`).classList.remove('hidden');
}

// Render insurance policies
function renderInsurancePolicies() {
  const container = document.getElementById('insurancePoliciesList');
  
  if (!insurancePolicies || insurancePolicies.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="fas fa-shield-alt text-gray-300 text-6xl mb-4"></i>
        <p class="text-gray-500 text-lg">가입된 보험이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">보험을 추가하여 관리를 시작하세요</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = insurancePolicies.map(policy => `
    <div class="glass-card rounded-2xl p-6 mb-4 card-hover">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <div class="flex items-center mb-2">
            <h3 class="text-xl font-bold text-gray-900">${policy.policy_name}</h3>
            <span class="ml-3 px-3 py-1 rounded-full text-xs font-semibold ${
              policy.status === 'active' ? 'bg-green-100 text-green-700' :
              policy.status === 'expired' ? 'bg-gray-100 text-gray-700' :
              'bg-red-100 text-red-700'
            }">
              ${policy.status === 'active' ? '활성' : policy.status === 'expired' ? '만료' : '취소'}
            </span>
          </div>
          <p class="text-gray-600 font-semibold">${policy.insurance_company}</p>
        </div>
        <div class="text-right">
          <p class="text-sm text-gray-500">증권번호</p>
          <p class="text-sm font-mono font-semibold text-gray-700">${policy.policy_number}</p>
        </div>
      </div>
      
      <div class="grid md:grid-cols-4 gap-4 mb-4">
        <div>
          <p class="text-xs text-gray-500 mb-1">보험 종류</p>
          <p class="font-semibold text-gray-900">${getPolicyTypeName(policy.policy_type)}</p>
        </div>
        <div>
          <p class="text-xs text-gray-500 mb-1">보장 금액</p>
          <p class="font-semibold text-gray-900">${policy.coverage_amount ? formatCurrency(policy.coverage_amount) : '-'}</p>
        </div>
        <div>
          <p class="text-xs text-gray-500 mb-1">보험료</p>
          <p class="font-semibold text-gray-900">${policy.premium_amount ? formatCurrency(policy.premium_amount) + '/월' : '-'}</p>
        </div>
        <div>
          <p class="text-xs text-gray-500 mb-1">보험 기간</p>
          <p class="font-semibold text-gray-900">${policy.start_date} ~ ${policy.end_date || '평생'}</p>
        </div>
      </div>
      
      ${policy.notes ? `<p class="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded-lg">${policy.notes}</p>` : ''}
    </div>
  `).join('');
}

// Render insurance claims
function renderInsuranceClaims() {
  const container = document.getElementById('insuranceClaimsList');
  
  if (!insuranceClaims || insuranceClaims.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="fas fa-file-invoice-dollar text-gray-300 text-6xl mb-4"></i>
        <p class="text-gray-500 text-lg">보험 청구 내역이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">진료 후 보험 청구를 신청하세요</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = insuranceClaims.map(claim => `
    <div class="glass-card rounded-2xl p-6 mb-4 card-hover">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <div class="flex items-center mb-2">
            <h3 class="text-xl font-bold text-gray-900">${claim.hospital_name}</h3>
            <span class="ml-3 px-3 py-1 rounded-full text-xs font-semibold ${getClaimStatusColor(claim.status)}">
              ${getClaimStatusText(claim.status)}
            </span>
          </div>
          <p class="text-gray-600">${claim.policy_name} · ${claim.insurance_company}</p>
        </div>
        <div class="text-right">
          <p class="text-sm text-gray-500">청구번호</p>
          <p class="text-sm font-mono font-semibold text-gray-700">${claim.claim_number}</p>
        </div>
      </div>
      
      <div class="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <p class="text-sm text-gray-600 mb-2"><i class="fas fa-stethoscope mr-2 text-blue-500"></i><strong>진단:</strong> ${claim.diagnosis}</p>
          <p class="text-sm text-gray-600 mb-2"><i class="fas fa-procedures mr-2 text-green-500"></i><strong>치료:</strong> ${claim.treatment_type}</p>
          <p class="text-sm text-gray-600"><i class="fas fa-calendar mr-2 text-purple-500"></i><strong>진료일:</strong> ${claim.treatment_date}</p>
        </div>
        <div>
          <p class="text-sm text-gray-600 mb-2"><strong>총 진료비:</strong> ${formatCurrency(claim.total_amount)}</p>
          <p class="text-sm text-gray-600 mb-2"><strong>청구 금액:</strong> ${formatCurrency(claim.claimed_amount)}</p>
          ${claim.approved_amount ? `<p class="text-sm text-gray-600 mb-2"><strong>승인 금액:</strong> ${formatCurrency(claim.approved_amount)}</p>` : ''}
          ${claim.paid_amount ? `<p class="text-sm font-bold text-green-600"><strong>지급 완료:</strong> ${formatCurrency(claim.paid_amount)}</p>` : ''}
        </div>
      </div>
      
      <div class="flex justify-between items-center pt-4 border-t border-gray-200">
        <div class="text-sm text-gray-500">
          청구일: ${claim.claim_date}
          ${claim.submission_date ? ` · 제출일: ${claim.submission_date}` : ''}
          ${claim.approval_date ? ` · 승인일: ${claim.approval_date}` : ''}
          ${claim.payment_date ? ` · 지급일: ${claim.payment_date}` : ''}
        </div>
        ${claim.status === 'pending' ? `
          <button onclick="submitClaim(${claim.id})" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:scale-105 transition">
            <i class="fas fa-paper-plane mr-1"></i>보험사 제출
          </button>
        ` : ''}
      </div>
      
      ${claim.rejection_reason ? `<div class="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700"><strong>거절 사유:</strong> ${claim.rejection_reason}</div>` : ''}
    </div>
  `).join('');
}

// Render insurance receipts
function renderInsuranceReceipts() {
  const container = document.getElementById('insuranceReceiptsList');
  
  if (!insuranceReceipts || insuranceReceipts.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <i class="fas fa-receipt text-gray-300 text-6xl mb-4"></i>
        <p class="text-gray-500 text-lg">등록된 영수증이 없습니다</p>
        <p class="text-gray-400 text-sm mt-2">진료비 영수증을 추가하세요</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = insuranceReceipts.map(receipt => `
    <div class="glass-card rounded-2xl p-6 mb-4 card-hover">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <div class="flex items-center mb-2">
            <h3 class="text-lg font-bold text-gray-900">${receipt.hospital_name}</h3>
            ${receipt.is_claimed ? 
              '<span class="ml-3 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><i class="fas fa-check mr-1"></i>청구 완료</span>' :
              '<span class="ml-3 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">미청구</span>'
            }
          </div>
          <p class="text-gray-600">${receipt.treatment_type}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-black gradient-text">${formatCurrency(receipt.amount)}</p>
          <p class="text-xs text-gray-500">${receipt.receipt_date}</p>
        </div>
      </div>
      
      <div class="mt-4 flex items-center justify-between text-sm">
        <div>
          <span class="text-gray-500">영수증 번호:</span>
          <span class="font-mono font-semibold text-gray-700 ml-2">${receipt.receipt_number}</span>
          <span class="text-gray-500 ml-4">결제:</span>
          <span class="font-semibold text-gray-700 ml-2">${getPaymentMethodText(receipt.payment_method)}</span>
        </div>
        ${!receipt.is_claimed ? `
          <button onclick="createClaimFromReceipt(${receipt.id})" class="btn-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:scale-105 transition">
            <i class="fas fa-file-invoice mr-1"></i>보험 청구하기
          </button>
        ` : ''}
      </div>
      
      ${receipt.notes ? `<p class="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded-lg">${receipt.notes}</p>` : ''}
    </div>
  `).join('');
}

// Helper functions
function getPolicyTypeName(type) {
  const types = {
    'medical': '실손의료보험',
    'dental': '치과보험',
    'vision': '안과보험',
    'long_term_care': '장기요양보험',
    'critical_illness': '중대질병보험',
    'accident': '상해보험'
  };
  return types[type] || type;
}

function getClaimStatusColor(status) {
  const colors = {
    'pending': 'bg-gray-100 text-gray-700',
    'submitted': 'bg-blue-100 text-blue-700',
    'under_review': 'bg-yellow-100 text-yellow-700',
    'approved': 'bg-green-100 text-green-700',
    'rejected': 'bg-red-100 text-red-700',
    'paid': 'bg-purple-100 text-purple-700'
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

function getClaimStatusText(status) {
  const texts = {
    'pending': '대기 중',
    'submitted': '제출 완료',
    'under_review': '심사 중',
    'approved': '승인 완료',
    'rejected': '거절됨',
    'paid': '지급 완료'
  };
  return texts[status] || status;
}

function getPaymentMethodText(method) {
  const methods = {
    'card': '카드',
    'cash': '현금',
    'transfer': '계좌이체',
    'insurance': '보험'
  };
  return methods[method] || method;
}

// Submit claim to insurance company
async function submitClaim(claimId) {
  if (!confirm('이 청구 건을 보험사에 제출하시겠습니까?')) return;
  
  try {
    await axios.put(`${API_BASE}/insurance/claims/${claimId}`, {
      status: 'submitted'
    });
    alert('보험사에 청구가 제출되었습니다.');
    await loadData();
    renderInsuranceClaims();
    updateSummaryCards();
  } catch (error) {
    console.error('청구 제출 실패:', error);
    alert('청구 제출 중 오류가 발생했습니다.');
  }
}

// Create claim from receipt
async function createClaimFromReceipt(receiptId) {
  alert('영수증 기반 보험 청구 기능은 개발 중입니다.');
}

// Make insurance functions globally accessible
window.submitClaim = submitClaim;
window.createClaimFromReceipt = createClaimFromReceipt;
