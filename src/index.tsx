import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== API Routes ====================

// Get all hospitals
app.get('/api/hospitals', async (c) => {
  const { DB } = c.env
  const result = await DB.prepare('SELECT * FROM hospitals ORDER BY rating DESC').all()
  return c.json({ success: true, data: result.results })
})

// Get hospital by ID
app.get('/api/hospitals/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const result = await DB.prepare('SELECT * FROM hospitals WHERE id = ?').bind(id).first()
  return c.json({ success: true, data: result })
})

// Get doctors by hospital ID
app.get('/api/hospitals/:id/doctors', async (c) => {
  const { DB } = c.env
  const hospitalId = c.req.param('id')
  const result = await DB.prepare('SELECT * FROM doctors WHERE hospital_id = ? ORDER BY rating DESC').bind(hospitalId).all()
  return c.json({ success: true, data: result.results })
})

// Get all doctors
app.get('/api/doctors', async (c) => {
  const { DB } = c.env
  const specialty = c.req.query('specialty')
  
  let query = 'SELECT d.*, h.name as hospital_name FROM doctors d JOIN hospitals h ON d.hospital_id = h.id'
  let params: any[] = []
  
  if (specialty) {
    query += ' WHERE d.specialty = ?'
    params.push(specialty)
  }
  
  query += ' ORDER BY d.rating DESC'
  
  const stmt = params.length > 0 ? DB.prepare(query).bind(...params) : DB.prepare(query)
  const result = await stmt.all()
  
  return c.json({ success: true, data: result.results })
})

// Create appointment
app.post('/api/appointments', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO appointments (user_id, hospital_id, doctor_id, appointment_date, appointment_time, symptoms, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.hospital_id,
    body.doctor_id,
    body.appointment_date,
    body.appointment_time,
    body.symptoms || '',
    body.notes || ''
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Get user appointments
app.get('/api/users/:userId/appointments', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const status = c.req.query('status')
  
  let query = `
    SELECT a.*, h.name as hospital_name, h.address as hospital_address, 
           d.name as doctor_name, d.specialty as doctor_specialty
    FROM appointments a
    JOIN hospitals h ON a.hospital_id = h.id
    JOIN doctors d ON a.doctor_id = d.id
    WHERE a.user_id = ?
  `
  let params: any[] = [userId]
  
  if (status) {
    query += ' AND a.status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Update appointment
app.put('/api/appointments/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const body = await c.req.json()
  
  const updates: string[] = []
  const params: any[] = []
  
  if (body.status) {
    updates.push('status = ?')
    params.push(body.status)
  }
  if (body.appointment_date) {
    updates.push('appointment_date = ?')
    params.push(body.appointment_date)
  }
  if (body.appointment_time) {
    updates.push('appointment_time = ?')
    params.push(body.appointment_time)
  }
  if (body.symptoms !== undefined) {
    updates.push('symptoms = ?')
    params.push(body.symptoms)
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?')
    params.push(body.notes)
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  
  await DB.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  
  return c.json({ success: true })
})

// Get user medical records
app.get('/api/users/:userId/medical-records', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  
  const result = await DB.prepare(`
    SELECT mr.*, h.name as hospital_name, d.name as doctor_name, d.specialty as doctor_specialty
    FROM medical_records mr
    JOIN hospitals h ON mr.hospital_id = h.id
    JOIN doctors d ON mr.doctor_id = d.id
    WHERE mr.user_id = ?
    ORDER BY mr.visit_date DESC
  `).bind(userId).all()
  
  return c.json({ success: true, data: result.results })
})

// Create medical record
app.post('/api/medical-records', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO medical_records (user_id, appointment_id, doctor_id, hospital_id, visit_date, diagnosis, symptoms, treatment, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.appointment_id || null,
    body.doctor_id,
    body.hospital_id,
    body.visit_date,
    body.diagnosis,
    body.symptoms || '',
    body.treatment || '',
    body.notes || ''
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Get user prescriptions
app.get('/api/users/:userId/prescriptions', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const status = c.req.query('status')
  
  let query = `
    SELECT p.*, h.name as hospital_name, d.name as doctor_name, d.specialty as doctor_specialty
    FROM prescriptions p
    JOIN hospitals h ON p.hospital_id = h.id
    JOIN doctors d ON p.doctor_id = d.id
    WHERE p.user_id = ?
  `
  let params: any[] = [userId]
  
  if (status) {
    query += ' AND p.status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY p.prescription_date DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Create prescription
app.post('/api/prescriptions', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO prescriptions (user_id, medical_record_id, doctor_id, hospital_id, prescription_date, medications, dosage_instructions, duration_days, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.medical_record_id || null,
    body.doctor_id,
    body.hospital_id,
    body.prescription_date,
    body.medications,
    body.dosage_instructions,
    body.duration_days,
    body.notes || '',
    body.status || 'active'
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Create chat session
app.post('/api/chat/sessions', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO chat_sessions (user_id, session_type, status)
    VALUES (?, ?, ?)
  `).bind(body.user_id, body.session_type, 'active').run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Add chat message
app.post('/api/chat/messages', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO chat_messages (session_id, role, content, message_type)
    VALUES (?, ?, ?, ?)
  `).bind(body.session_id, body.role, body.content, body.message_type || 'text').run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Get chat history
app.get('/api/chat/sessions/:sessionId/messages', async (c) => {
  const { DB } = c.env
  const sessionId = c.req.param('sessionId')
  
  const result = await DB.prepare(`
    SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC
  `).bind(sessionId).all()
  
  return c.json({ success: true, data: result.results })
})

// Get user info
app.get('/api/users/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  const result = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  return c.json({ success: true, data: result })
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>메디케어 AI - 스마트 병원 예약 플랫폼</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .fade-in { animation: fadeIn 0.6s ease-out; }
          .gradient-bg {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .card-hover {
            transition: all 0.3s ease;
          }
          .card-hover:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Navigation -->
        <nav class="gradient-bg text-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center">
                        <i class="fas fa-heartbeat text-3xl mr-3"></i>
                        <span class="font-bold text-xl">메디케어 AI</span>
                    </div>
                    <div class="hidden md:flex space-x-8">
                        <a href="#features" class="hover:text-gray-200 transition">기능소개</a>
                        <a href="#services" class="hover:text-gray-200 transition">서비스</a>
                        <a href="#dashboard" class="hover:text-gray-200 transition bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold">시작하기</a>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="gradient-bg text-white py-20">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center fade-in">
                    <h1 class="text-5xl font-bold mb-6">
                        AI가 도와주는 스마트한<br>병원 예약 & 의료 관리
                    </h1>
                    <p class="text-xl mb-8 text-gray-100">
                        음성과 채팅으로 간편하게 예약하고, 의료 기록을 체계적으로 관리하세요
                    </p>
                    <div class="flex justify-center gap-4">
                        <a href="#dashboard" class="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition text-lg">
                            <i class="fas fa-rocket mr-2"></i>지금 시작하기
                        </a>
                        <a href="#features" class="bg-purple-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-purple-800 transition text-lg">
                            <i class="fas fa-info-circle mr-2"></i>더 알아보기
                        </a>
                    </div>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section id="features" class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-800 mb-4">주요 기능</h2>
                    <p class="text-xl text-gray-600">메디케어 AI가 제공하는 편리한 기능들</p>
                </div>
                
                <div class="grid md:grid-cols-3 gap-8">
                    <!-- Feature 1 -->
                    <div class="card-hover bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-xl">
                        <div class="text-blue-600 text-5xl mb-4">
                            <i class="fas fa-calendar-check"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-800 mb-3">스마트 예약</h3>
                        <p class="text-gray-600 mb-4">
                            AI 챗봇과 대화하며 병원 예약을 진행하세요. 음성 또는 채팅으로 편리하게 예약할 수 있습니다.
                        </p>
                        <ul class="text-gray-600 space-y-2">
                            <li><i class="fas fa-check text-blue-600 mr-2"></i>실시간 예약 가능 시간 확인</li>
                            <li><i class="fas fa-check text-blue-600 mr-2"></i>증상 기반 병원/의사 추천</li>
                            <li><i class="fas fa-check text-blue-600 mr-2"></i>예약 알림 및 리마인더</li>
                        </ul>
                    </div>

                    <!-- Feature 2 -->
                    <div class="card-hover bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-xl">
                        <div class="text-green-600 text-5xl mb-4">
                            <i class="fas fa-file-medical"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-800 mb-3">의료 기록 관리</h3>
                        <p class="text-gray-600 mb-4">
                            모든 진료 기록을 한 곳에서 체계적으로 관리하고, 언제든지 확인할 수 있습니다.
                        </p>
                        <ul class="text-gray-600 space-y-2">
                            <li><i class="fas fa-check text-green-600 mr-2"></i>진료 이력 자동 저장</li>
                            <li><i class="fas fa-check text-green-600 mr-2"></i>진단 및 치료 내용 기록</li>
                            <li><i class="fas fa-check text-green-600 mr-2"></i>검색 및 필터링 기능</li>
                        </ul>
                    </div>

                    <!-- Feature 3 -->
                    <div class="card-hover bg-gradient-to-br from-purple-50 to-purple-100 p-8 rounded-xl">
                        <div class="text-purple-600 text-5xl mb-4">
                            <i class="fas fa-pills"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-800 mb-3">처방전 관리</h3>
                        <p class="text-gray-600 mb-4">
                            처방받은 약 정보와 복용 방법을 체계적으로 관리하고, 복약 알림을 받으세요.
                        </p>
                        <ul class="text-gray-600 space-y-2">
                            <li><i class="fas fa-check text-purple-600 mr-2"></i>처방전 히스토리 관리</li>
                            <li><i class="fas fa-check text-purple-600 mr-2"></i>복약 일정 알림</li>
                            <li><i class="fas fa-check text-purple-600 mr-2"></i>약물 상호작용 안내</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- AI Assistant Section -->
        <section id="services" class="py-20 bg-gradient-to-r from-purple-100 to-blue-100">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-800 mb-4">AI 어시스턴트</h2>
                    <p class="text-xl text-gray-600">음성과 채팅으로 모든 의료 서비스를 편리하게</p>
                </div>

                <div class="grid md:grid-cols-2 gap-12 items-center">
                    <div class="space-y-6">
                        <div class="bg-white p-6 rounded-xl shadow-lg card-hover">
                            <div class="flex items-start">
                                <div class="bg-blue-100 p-3 rounded-lg mr-4">
                                    <i class="fas fa-microphone text-blue-600 text-2xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">음성 예약</h3>
                                    <p class="text-gray-600">
                                        "다음주 화요일 오전에 내과 예약해줘" - 자연스러운 대화로 예약을 완료하세요.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-6 rounded-xl shadow-lg card-hover">
                            <div class="flex items-start">
                                <div class="bg-green-100 p-3 rounded-lg mr-4">
                                    <i class="fas fa-comments text-green-600 text-2xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">채팅 상담</h3>
                                    <p class="text-gray-600">
                                        증상을 설명하면 AI가 적합한 진료과와 병원을 추천해드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white p-6 rounded-xl shadow-lg card-hover">
                            <div class="flex items-start">
                                <div class="bg-purple-100 p-3 rounded-lg mr-4">
                                    <i class="fas fa-robot text-purple-600 text-2xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">24/7 지원</h3>
                                    <p class="text-gray-600">
                                        언제든지 AI 어시스턴트가 예약, 조회, 관리를 도와드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white rounded-2xl shadow-2xl p-8">
                        <div class="aspect-square bg-gradient-to-br from-purple-200 to-blue-200 rounded-xl flex items-center justify-center">
                            <div class="text-center">
                                <i class="fas fa-robot text-purple-600 text-9xl mb-6"></i>
                                <p class="text-2xl font-bold text-gray-800">AI 어시스턴트</p>
                                <p class="text-gray-600 mt-2">똑똑한 의료 비서</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- How It Works -->
        <section class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-800 mb-4">이용 방법</h2>
                    <p class="text-xl text-gray-600">3단계로 간편하게 시작하세요</p>
                </div>

                <div class="grid md:grid-cols-3 gap-8">
                    <div class="text-center">
                        <div class="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span class="text-3xl font-bold text-blue-600">1</span>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-3">회원가입</h3>
                        <p class="text-gray-600">
                            간단한 정보 입력으로 메디케어 AI 서비스를 시작하세요
                        </p>
                    </div>

                    <div class="text-center">
                        <div class="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span class="text-3xl font-bold text-green-600">2</span>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-3">AI와 대화</h3>
                        <p class="text-gray-600">
                            음성 또는 채팅으로 AI 어시스턴트에게 예약을 요청하세요
                        </p>
                    </div>

                    <div class="text-center">
                        <div class="bg-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span class="text-3xl font-bold text-purple-600">3</span>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800 mb-3">예약 완료</h3>
                        <p class="text-gray-600">
                            예약 확인 및 알림을 받고, 편리하게 병원을 방문하세요
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="gradient-bg text-white py-20">
            <div class="max-w-4xl mx-auto text-center px-4">
                <h2 class="text-4xl font-bold mb-6">지금 바로 시작하세요</h2>
                <p class="text-xl mb-8">
                    메디케어 AI와 함께 더 스마트하고 편리한 의료 서비스를 경험하세요
                </p>
                <a href="#dashboard" class="inline-block bg-white text-purple-600 px-10 py-4 rounded-lg font-bold hover:bg-gray-100 transition text-xl">
                    <i class="fas fa-user-plus mr-2"></i>무료로 시작하기
                </a>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-800 text-white py-8">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <p class="text-gray-400">
                    &copy; 2026 메디케어 AI. All rights reserved.
                </p>
                <div class="mt-4 space-x-6">
                    <a href="#" class="text-gray-400 hover:text-white transition">이용약관</a>
                    <a href="#" class="text-gray-400 hover:text-white transition">개인정보처리방침</a>
                    <a href="#" class="text-gray-400 hover:text-white transition">고객센터</a>
                </div>
            </div>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

// Dashboard page
app.get('/dashboard', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>대시보드 - 메디케어 AI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <!-- Navigation -->
        <nav class="bg-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center">
                        <i class="fas fa-heartbeat text-3xl text-purple-600 mr-3"></i>
                        <span class="font-bold text-xl text-gray-800">메디케어 AI</span>
                    </div>
                    <div class="flex items-center space-x-6">
                        <button id="aiChatBtn" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
                            <i class="fas fa-robot mr-2"></i>AI 어시스턴트
                        </button>
                        <div class="flex items-center">
                            <span class="text-gray-700 mr-2">홍길동님</span>
                            <i class="fas fa-user-circle text-2xl text-gray-600"></i>
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <!-- Summary Cards -->
            <div class="grid md:grid-cols-4 gap-6 mb-8">
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm mb-1">다가오는 예약</p>
                            <p class="text-3xl font-bold text-gray-800" id="upcomingCount">0</p>
                        </div>
                        <div class="bg-blue-100 p-3 rounded-lg">
                            <i class="fas fa-calendar-check text-blue-600 text-2xl"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm mb-1">의료 기록</p>
                            <p class="text-3xl font-bold text-gray-800" id="recordsCount">0</p>
                        </div>
                        <div class="bg-green-100 p-3 rounded-lg">
                            <i class="fas fa-file-medical text-green-600 text-2xl"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm mb-1">활성 처방전</p>
                            <p class="text-3xl font-bold text-gray-800" id="prescriptionsCount">0</p>
                        </div>
                        <div class="bg-purple-100 p-3 rounded-lg">
                            <i class="fas fa-pills text-purple-600 text-2xl"></i>
                        </div>
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow p-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-500 text-sm mb-1">전체 병원 수</p>
                            <p class="text-3xl font-bold text-gray-800" id="hospitalsCount">0</p>
                        </div>
                        <div class="bg-red-100 p-3 rounded-lg">
                            <i class="fas fa-hospital text-red-600 text-2xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content Tabs -->
            <div class="bg-white rounded-lg shadow">
                <div class="border-b">
                    <nav class="flex">
                        <button class="tab-btn px-6 py-4 font-semibold text-purple-600 border-b-2 border-purple-600" data-tab="appointments">
                            <i class="fas fa-calendar-alt mr-2"></i>예약 관리
                        </button>
                        <button class="tab-btn px-6 py-4 font-semibold text-gray-600 hover:text-purple-600" data-tab="records">
                            <i class="fas fa-file-medical-alt mr-2"></i>의료 기록
                        </button>
                        <button class="tab-btn px-6 py-4 font-semibold text-gray-600 hover:text-purple-600" data-tab="prescriptions">
                            <i class="fas fa-prescription mr-2"></i>처방전
                        </button>
                        <button class="tab-btn px-6 py-4 font-semibold text-gray-600 hover:text-purple-600" data-tab="hospitals">
                            <i class="fas fa-hospital-alt mr-2"></i>병원 찾기
                        </button>
                    </nav>
                </div>

                <div class="p-6">
                    <!-- Appointments Tab -->
                    <div id="tab-appointments" class="tab-content">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-2xl font-bold text-gray-800">내 예약</h2>
                            <button id="newAppointmentBtn" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
                                <i class="fas fa-plus mr-2"></i>새 예약
                            </button>
                        </div>
                        <div id="appointmentsList"></div>
                    </div>

                    <!-- Medical Records Tab -->
                    <div id="tab-records" class="tab-content hidden">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">의료 기록</h2>
                        <div id="recordsList"></div>
                    </div>

                    <!-- Prescriptions Tab -->
                    <div id="tab-prescriptions" class="tab-content hidden">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">처방전 관리</h2>
                        <div id="prescriptionsList"></div>
                    </div>

                    <!-- Hospitals Tab -->
                    <div id="tab-hospitals" class="tab-content hidden">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">병원 찾기</h2>
                        <div id="hospitalsList"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- AI Chat Modal -->
        <div id="aiChatModal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-2xl w-full max-w-2xl h-3/4 flex flex-col">
                <div class="bg-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">
                    <div class="flex items-center">
                        <i class="fas fa-robot text-2xl mr-3"></i>
                        <div>
                            <h3 class="font-bold text-lg">AI 어시스턴트</h3>
                            <p class="text-sm text-purple-200">무엇을 도와드릴까요?</p>
                        </div>
                    </div>
                    <button id="closeChatBtn" class="text-white hover:text-gray-200">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                </div>

                <div id="chatMessages" class="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                    <div class="flex items-start">
                        <div class="bg-purple-600 text-white rounded-full p-2 mr-3">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div class="bg-white rounded-lg shadow p-4 max-w-md">
                            <p class="text-gray-800">안녕하세요! 저는 메디케어 AI 어시스턴트입니다. 병원 예약, 의료 기록 조회, 처방전 관리 등을 도와드릴 수 있습니다. 어떻게 도와드릴까요?</p>
                        </div>
                    </div>
                </div>

                <div class="p-4 border-t bg-white rounded-b-lg">
                    <div class="flex items-center space-x-2">
                        <button id="voiceBtn" class="bg-purple-100 text-purple-600 p-3 rounded-lg hover:bg-purple-200">
                            <i class="fas fa-microphone"></i>
                        </button>
                        <input type="text" id="chatInput" placeholder="메시지를 입력하세요..." 
                               class="flex-1 border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-600">
                        <button id="sendBtn" class="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2">
                        <button class="quick-action text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200" data-action="내과 예약하기">
                            내과 예약하기
                        </button>
                        <button class="quick-action text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200" data-action="예약 확인하기">
                            예약 확인하기
                        </button>
                        <button class="quick-action text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200" data-action="처방전 보기">
                            처방전 보기
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/dashboard.js"></script>
    </body>
    </html>
  `)
})

export default app
