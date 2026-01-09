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
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body>
        <!-- Particles Background -->
        <div class="particles" id="particles"></div>

        <!-- Navigation -->
        <nav class="glass-card fixed w-full top-0 z-50 border-b border-white/20">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-20">
                    <div class="flex items-center space-x-3">
                        <div class="icon-pulse bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl shadow-lg">
                            <i class="fas fa-heartbeat text-white text-2xl"></i>
                        </div>
                        <span class="font-black text-2xl gradient-text">메디케어 AI</span>
                    </div>
                    <div class="hidden md:flex space-x-6 items-center">
                        <a href="#features" class="text-gray-700 hover:text-purple-600 font-semibold transition">기능소개</a>
                        <a href="#services" class="text-gray-700 hover:text-purple-600 font-semibold transition">서비스</a>
                        <a href="#dashboard" class="btn-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg glow">
                            <i class="fas fa-rocket mr-2"></i>시작하기
                        </a>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="gradient-bg min-h-screen flex items-center justify-center relative overflow-hidden pt-20">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="text-center">
                    <div class="fade-in mb-8">
                        <span class="inline-block bg-white/20 backdrop-blur-md text-white px-6 py-2 rounded-full text-sm font-semibold border border-white/30 shadow-lg">
                            🎉 AI 기반 스마트 의료 플랫폼
                        </span>
                    </div>
                    <h1 class="text-6xl md:text-7xl font-black text-white mb-6 fade-in-delay-1 neon-text">
                        AI가 도와주는<br>
                        <span class="bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
                            스마트 병원 예약
                        </span>
                    </h1>
                    <p class="text-xl md:text-2xl mb-12 text-white/90 max-w-3xl mx-auto fade-in-delay-2">
                        음성과 채팅으로 간편하게 예약하고,<br class="hidden md:block"> 
                        의료 기록을 체계적으로 관리하세요
                    </p>
                    <div class="flex flex-col sm:flex-row justify-center gap-6 fade-in-delay-3">
                        <a href="#dashboard" class="group btn-primary text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-2xl hover:shadow-purple-500/50 transition-all">
                            <i class="fas fa-rocket mr-2 group-hover:rotate-12 transition-transform"></i>
                            지금 무료로 시작하기
                        </a>
                        <a href="#features" class="glass-card-dark text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-white/20 transition-all">
                            <i class="fas fa-play-circle mr-2"></i>
                            데모 보기
                        </a>
                    </div>
                    
                    <!-- Floating Icons -->
                    <div class="mt-20 relative h-64">
                        <div class="absolute top-0 left-1/4 float-animation">
                            <div class="glass-card p-6 rounded-2xl shadow-xl">
                                <i class="fas fa-hospital text-4xl text-purple-600"></i>
                            </div>
                        </div>
                        <div class="absolute top-10 right-1/4 float-animation" style="animation-delay: 0.5s">
                            <div class="glass-card p-6 rounded-2xl shadow-xl">
                                <i class="fas fa-user-md text-4xl text-pink-600"></i>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 float-animation" style="animation-delay: 1s">
                            <div class="glass-card p-6 rounded-2xl shadow-xl">
                                <i class="fas fa-robot text-4xl text-indigo-600"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section id="features" class="py-32 relative">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        ✨ 주요 기능
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        메디케어 AI의 특별함
                    </h2>
                    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
                        최첨단 AI 기술로 더 편리하고 스마트한 의료 서비스를 경험하세요
                    </p>
                </div>
                
                <div class="grid md:grid-cols-3 gap-8">
                    <!-- Feature 1 -->
                    <div class="card-hover glass-card p-8 rounded-3xl border-gradient scale-in">
                        <div class="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-5 rounded-2xl inline-block mb-6 shadow-lg">
                            <i class="fas fa-calendar-check text-4xl icon-pulse"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">스마트 예약</h3>
                        <p class="text-gray-600 mb-6 leading-relaxed">
                            AI 챗봇과 자연스러운 대화로 병원 예약을 진행하세요. 
                            음성 또는 채팅으로 간편하게!
                        </p>
                        <ul class="space-y-3">
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-blue-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">실시간 예약 가능 시간 확인</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-blue-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">증상 기반 병원/의사 추천</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-blue-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">예약 알림 및 리마인더</span>
                            </li>
                        </ul>
                    </div>

                    <!-- Feature 2 -->
                    <div class="card-hover glass-card p-8 rounded-3xl border-gradient scale-in" style="animation-delay: 0.2s">
                        <div class="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-5 rounded-2xl inline-block mb-6 shadow-lg">
                            <i class="fas fa-file-medical text-4xl icon-pulse"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">의료 기록 관리</h3>
                        <p class="text-gray-600 mb-6 leading-relaxed">
                            모든 진료 기록을 한 곳에서 체계적으로 관리하고, 
                            언제든지 확인하세요.
                        </p>
                        <ul class="space-y-3">
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-green-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">진료 이력 자동 저장</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-green-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">진단 및 치료 내용 기록</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-green-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">검색 및 필터링 기능</span>
                            </li>
                        </ul>
                    </div>

                    <!-- Feature 3 -->
                    <div class="card-hover glass-card p-8 rounded-3xl border-gradient scale-in" style="animation-delay: 0.4s">
                        <div class="bg-gradient-to-br from-purple-500 to-pink-600 text-white p-5 rounded-2xl inline-block mb-6 shadow-lg">
                            <i class="fas fa-pills text-4xl icon-pulse"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">처방전 관리</h3>
                        <p class="text-gray-600 mb-6 leading-relaxed">
                            처방받은 약 정보와 복용 방법을 체계적으로 관리하고, 
                            복약 알림을 받으세요.
                        </p>
                        <ul class="space-y-3">
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-purple-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">처방전 히스토리 관리</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-purple-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">복약 일정 알림</span>
                            </li>
                            <li class="flex items-start">
                                <span class="flex-shrink-0 w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                                    <i class="fas fa-check text-purple-600 text-xs"></i>
                                </span>
                                <span class="text-gray-700">약물 상호작용 안내</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- AI Assistant Section -->
        <section id="services" class="py-32 gradient-bg relative overflow-hidden">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="text-center mb-20">
                    <span class="inline-block bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-bold mb-4 border border-white/30">
                        🤖 AI 어시스턴트
                    </span>
                    <h2 class="text-5xl font-black text-white mb-6">
                        24/7 똑똑한 의료 비서
                    </h2>
                    <p class="text-xl text-white/90 max-w-2xl mx-auto">
                        음성과 채팅으로 모든 의료 서비스를 편리하게 이용하세요
                    </p>
                </div>

                <div class="grid md:grid-cols-2 gap-12 items-center">
                    <div class="space-y-6">
                        <div class="glass-card-dark p-8 rounded-3xl card-hover">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-blue-400 to-blue-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-microphone text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-white mb-3">음성 예약</h3>
                                    <p class="text-white/80 leading-relaxed">
                                        "다음주 화요일 오전에 내과 예약해줘" - 자연스러운 대화로 
                                        예약을 완료하세요.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card-dark p-8 rounded-3xl card-hover">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-green-400 to-emerald-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-comments text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-white mb-3">채팅 상담</h3>
                                    <p class="text-white/80 leading-relaxed">
                                        증상을 설명하면 AI가 적합한 진료과와 병원을 
                                        추천해드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card-dark p-8 rounded-3xl card-hover">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-purple-400 to-pink-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-clock text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-white mb-3">24/7 지원</h3>
                                    <p class="text-white/80 leading-relaxed">
                                        언제든지 AI 어시스턴트가 예약, 조회, 관리를 
                                        도와드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="relative">
                        <div class="glass-card p-12 rounded-3xl shadow-2xl">
                            <div class="aspect-square bg-gradient-to-br from-purple-200 via-pink-200 to-blue-200 rounded-3xl flex items-center justify-center relative overflow-hidden">
                                <div class="absolute inset-0 shimmer"></div>
                                <div class="text-center relative z-10 float-animation">
                                    <div class="inline-block p-8 bg-white/50 backdrop-blur-md rounded-full mb-6 shadow-xl">
                                        <i class="fas fa-robot text-purple-600 text-8xl"></i>
                                    </div>
                                    <p class="text-3xl font-black text-gray-800">AI 어시스턴트</p>
                                    <p class="text-xl text-gray-600 mt-3">당신의 건강 파트너</p>
                                    <div class="mt-8 flex justify-center gap-3">
                                        <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                        <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse" style="animation-delay: 0.2s"></span>
                                        <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse" style="animation-delay: 0.4s"></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- How It Works -->
        <section class="py-32 relative">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        📱 간편한 이용
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        3단계로 시작하세요
                    </h2>
                    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
                        복잡한 절차 없이, 누구나 쉽게 사용할 수 있습니다
                    </p>
                </div>

                <div class="grid md:grid-cols-3 gap-12">
                    <div class="text-center group">
                        <div class="relative inline-block mb-8">
                            <div class="w-32 h-32 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 transition-transform glow">
                                <span class="text-5xl font-black text-white">1</span>
                            </div>
                            <div class="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-star text-white text-sm"></i>
                            </div>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">회원가입</h3>
                        <p class="text-gray-600 leading-relaxed">
                            간단한 정보 입력으로<br>
                            메디케어 AI 서비스를<br>
                            바로 시작하세요
                        </p>
                    </div>

                    <div class="text-center group">
                        <div class="relative inline-block mb-8">
                            <div class="w-32 h-32 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 transition-transform glow">
                                <span class="text-5xl font-black text-white">2</span>
                            </div>
                            <div class="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-star text-white text-sm"></i>
                            </div>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">AI와 대화</h3>
                        <p class="text-gray-600 leading-relaxed">
                            음성 또는 채팅으로<br>
                            AI 어시스턴트에게<br>
                            예약을 요청하세요
                        </p>
                    </div>

                    <div class="text-center group">
                        <div class="relative inline-block mb-8">
                            <div class="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto shadow-2xl group-hover:scale-110 transition-transform glow">
                                <span class="text-5xl font-black text-white">3</span>
                            </div>
                            <div class="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-star text-white text-sm"></i>
                            </div>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">예약 완료</h3>
                        <p class="text-gray-600 leading-relaxed">
                            예약 확인 및 알림을 받고,<br>
                            편리하게 병원을<br>
                            방문하세요
                        </p>
                    </div>
                </div>

                <!-- Connection Lines -->
                <div class="hidden md:flex justify-center items-center mt-12">
                    <div class="flex-1 h-1 bg-gradient-to-r from-blue-500 to-green-500 rounded-full"></div>
                    <div class="flex-1 h-1 bg-gradient-to-r from-green-500 to-purple-500 rounded-full"></div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="py-32 gradient-bg relative overflow-hidden">
            <div class="max-w-4xl mx-auto text-center px-4 relative z-10">
                <div class="glass-card-dark p-16 rounded-3xl">
                    <h2 class="text-5xl md:text-6xl font-black text-white mb-6 neon-text">
                        지금 바로 시작하세요
                    </h2>
                    <p class="text-xl md:text-2xl text-white/90 mb-12 leading-relaxed">
                        메디케어 AI와 함께<br class="md:hidden">
                        더 스마트하고 편리한<br class="md:hidden">
                        의료 서비스를 경험하세요
                    </p>
                    <a href="#dashboard" class="inline-block btn-primary text-white px-12 py-5 rounded-2xl font-bold hover:shadow-purple-500/50 transition-all text-xl glow">
                        <i class="fas fa-user-plus mr-3"></i>
                        무료로 시작하기
                        <i class="fas fa-arrow-right ml-3"></i>
                    </a>
                    <p class="text-white/70 mt-6 text-sm">
                        ✨ 신용카드 필요 없음 · 즉시 사용 가능
                    </p>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-900 text-white py-16">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="grid md:grid-cols-4 gap-12 mb-12">
                    <div class="md:col-span-2">
                        <div class="flex items-center space-x-3 mb-6">
                            <div class="bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl">
                                <i class="fas fa-heartbeat text-white text-2xl"></i>
                            </div>
                            <span class="font-black text-2xl">메디케어 AI</span>
                        </div>
                        <p class="text-gray-400 leading-relaxed mb-6">
                            AI 기술로 더 편리하고 스마트한 병원 예약과<br>
                            의료 기록 관리 서비스를 제공합니다.
                        </p>
                        <div class="flex space-x-4">
                            <a href="#" class="w-10 h-10 bg-gray-800 hover:bg-purple-600 rounded-lg flex items-center justify-center transition">
                                <i class="fab fa-facebook-f"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 hover:bg-purple-600 rounded-lg flex items-center justify-center transition">
                                <i class="fab fa-twitter"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 hover:bg-purple-600 rounded-lg flex items-center justify-center transition">
                                <i class="fab fa-instagram"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 hover:bg-purple-600 rounded-lg flex items-center justify-center transition">
                                <i class="fab fa-linkedin-in"></i>
                            </a>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-bold text-lg mb-4">서비스</h4>
                        <ul class="space-y-3">
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">병원 예약</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">의료 기록</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">처방전 관리</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">AI 상담</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="font-bold text-lg mb-4">고객지원</h4>
                        <ul class="space-y-3">
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">이용약관</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">개인정보처리방침</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">고객센터</a></li>
                            <li><a href="#" class="text-gray-400 hover:text-purple-400 transition">자주 묻는 질문</a></li>
                        </ul>
                    </div>
                </div>
                <div class="border-t border-gray-800 pt-8 text-center">
                    <p class="text-gray-400">
                        &copy; 2026 메디케어 AI. All rights reserved. Made with <i class="fas fa-heart text-red-500"></i> in Korea
                    </p>
                </div>
            </div>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
        <script>
          // Particle effect
          function createParticles() {
            const container = document.getElementById('particles');
            if (!container) return;
            
            for (let i = 0; i < 50; i++) {
              const particle = document.createElement('div');
              particle.className = 'particle';
              particle.style.width = Math.random() * 10 + 5 + 'px';
              particle.style.height = particle.style.width;
              particle.style.left = Math.random() * 100 + '%';
              particle.style.top = Math.random() * 100 + '%';
              particle.style.animationDelay = Math.random() * 20 + 's';
              particle.style.animationDuration = Math.random() * 10 + 15 + 's';
              container.appendChild(particle);
            }
          }
          
          document.addEventListener('DOMContentLoaded', createParticles);
          
          // Smooth scroll
          document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
              e.preventDefault();
              const href = this.getAttribute('href');
              if (href === '#dashboard') {
                window.location.href = '/dashboard';
              } else {
                const target = document.querySelector(href);
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }
            });
          });
          
          // Scroll animations
          const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -100px 0px'
          };
          
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
              }
            });
          }, observerOptions);
          
          document.querySelectorAll('.card-hover, .scale-in').forEach(el => {
            observer.observe(el);
          });
        </script>
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
    <body>
        <!-- Navigation -->
        <nav class="glass-card fixed w-full top-0 z-50 border-b border-white/20">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-20">
                    <div class="flex items-center space-x-3">
                        <div class="bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl shadow-lg">
                            <i class="fas fa-heartbeat text-white text-2xl"></i>
                        </div>
                        <span class="font-black text-2xl gradient-text">메디케어 AI</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        <button id="aiChatBtn" class="btn-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg glow hover:scale-105 transition-transform">
                            <i class="fas fa-robot mr-2"></i>AI 어시스턴트
                        </button>
                        <div class="flex items-center space-x-3 glass-card px-4 py-2 rounded-xl">
                            <span class="font-semibold text-gray-700">홍길동님</span>
                            <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-white"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-28">
            <!-- Summary Cards -->
            <div class="grid md:grid-cols-4 gap-6 mb-8">
                <div class="glass-card rounded-2xl p-6 card-hover border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">다가오는 예약</p>
                            <p class="text-4xl font-black gradient-text" id="upcomingCount">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-calendar-check text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-green-600 font-semibold"><i class="fas fa-arrow-up mr-1"></i>12%</span>
                        <span class="text-gray-500 ml-2">이번 달</span>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 card-hover border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">의료 기록</p>
                            <p class="text-4xl font-black gradient-text" id="recordsCount">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-file-medical text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-blue-600 font-semibold"><i class="fas fa-chart-line mr-1"></i>전체</span>
                        <span class="text-gray-500 ml-2">진료 이력</span>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 card-hover border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">활성 처방전</p>
                            <p class="text-4xl font-black gradient-text" id="prescriptionsCount">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-purple-500 to-pink-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-pills text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-purple-600 font-semibold"><i class="fas fa-check-circle mr-1"></i>복용 중</span>
                        <span class="text-gray-500 ml-2">현재</span>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 card-hover border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">등록 병원</p>
                            <p class="text-4xl font-black gradient-text" id="hospitalsCount">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-red-500 to-orange-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-hospital text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-orange-600 font-semibold"><i class="fas fa-star mr-1"></i>평점순</span>
                        <span class="text-gray-500 ml-2">정렬</span>
                    </div>
                </div>
            </div>

            <!-- Main Content Tabs -->
            <div class="glass-card rounded-3xl shadow-2xl overflow-hidden">
                <div class="border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
                    <nav class="flex">
                        <button class="tab-btn px-8 py-5 font-bold text-purple-600 border-b-4 border-purple-600 bg-white/50" data-tab="appointments">
                            <i class="fas fa-calendar-alt mr-2"></i>예약 관리
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="records">
                            <i class="fas fa-file-medical-alt mr-2"></i>의료 기록
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="prescriptions">
                            <i class="fas fa-prescription mr-2"></i>처방전
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="hospitals">
                            <i class="fas fa-hospital-alt mr-2"></i>병원 찾기
                        </button>
                    </nav>
                </div>

                <div class="p-8">
                    <!-- Appointments Tab -->
                    <div id="tab-appointments" class="tab-content">
                        <div class="flex justify-between items-center mb-8">
                            <div>
                                <h2 class="text-3xl font-black gradient-text mb-2">내 예약</h2>
                                <p class="text-gray-600">예정된 병원 방문 일정을 관리하세요</p>
                            </div>
                            <button id="newAppointmentBtn" class="btn-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:scale-105 transition-transform">
                                <i class="fas fa-plus mr-2"></i>새 예약
                            </button>
                        </div>
                        <div id="appointmentsList"></div>
                    </div>

                    <!-- Medical Records Tab -->
                    <div id="tab-records" class="tab-content hidden">
                        <div class="mb-8">
                            <h2 class="text-3xl font-black gradient-text mb-2">의료 기록</h2>
                            <p class="text-gray-600">나의 진료 이력을 확인하세요</p>
                        </div>
                        <div id="recordsList"></div>
                    </div>

                    <!-- Prescriptions Tab -->
                    <div id="tab-prescriptions" class="tab-content hidden">
                        <div class="mb-8">
                            <h2 class="text-3xl font-black gradient-text mb-2">처방전 관리</h2>
                            <p class="text-gray-600">약물 복용 정보를 확인하세요</p>
                        </div>
                        <div id="prescriptionsList"></div>
                    </div>

                    <!-- Hospitals Tab -->
                    <div id="tab-hospitals" class="tab-content hidden">
                        <div class="mb-8">
                            <h2 class="text-3xl font-black gradient-text mb-2">병원 찾기</h2>
                            <p class="text-gray-600">가까운 병원을 검색하세요</p>
                        </div>
                        <div id="hospitalsList"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- AI Chat Modal -->
        <div id="aiChatModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm hidden flex items-center justify-center z-50">
            <div class="glass-card rounded-3xl shadow-2xl w-full max-w-3xl h-4/5 flex flex-col m-4">
                <div class="gradient-bg text-white p-6 rounded-t-3xl flex justify-between items-center relative overflow-hidden">
                    <div class="flex items-center z-10">
                        <div class="bg-white/20 backdrop-blur-md p-3 rounded-xl mr-4">
                            <i class="fas fa-robot text-3xl"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-2xl">AI 어시스턴트</h3>
                            <p class="text-sm text-white/80 flex items-center">
                                <span class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                                온라인 · 즉시 응답 가능
                            </p>
                        </div>
                    </div>
                    <button id="closeChatBtn" class="text-white hover:bg-white/20 p-3 rounded-xl transition z-10">
                        <i class="fas fa-times text-2xl"></i>
                    </button>
                    <div class="absolute inset-0 shimmer"></div>
                </div>

                <div id="chatMessages" class="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-br from-purple-50/50 to-pink-50/50">
                    <div class="flex items-start fade-in">
                        <div class="bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-2xl p-3 mr-3 shadow-lg">
                            <i class="fas fa-robot text-xl"></i>
                        </div>
                        <div class="glass-card rounded-2xl shadow-lg p-5 max-w-md">
                            <p class="text-gray-800 leading-relaxed">
                                안녕하세요! 저는 메디케어 AI 어시스턴트입니다. 
                                <strong>병원 예약, 의료 기록 조회, 처방전 관리</strong> 등을 도와드릴 수 있습니다. 
                                무엇을 도와드릴까요? 😊
                            </p>
                        </div>
                    </div>
                </div>

                <div class="p-6 border-t border-gray-200">
                    <div class="flex items-center space-x-3 mb-4">
                        <button id="voiceBtn" class="glass-card hover:bg-purple-100 text-purple-600 p-4 rounded-xl transition-all hover:scale-105 shadow-md">
                            <i class="fas fa-microphone text-xl"></i>
                        </button>
                        <input type="text" id="chatInput" placeholder="메시지를 입력하세요..." 
                               class="flex-1 glass-card border-2 border-purple-200 rounded-xl px-6 py-4 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition font-medium">
                        <button id="sendBtn" class="btn-primary text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:scale-105 transition-transform">
                            <i class="fas fa-paper-plane text-lg"></i>
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button class="quick-action text-sm glass-card text-gray-700 px-4 py-2 rounded-full hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600 hover:text-white transition font-semibold" data-action="내과 예약하기">
                            🏥 내과 예약하기
                        </button>
                        <button class="quick-action text-sm glass-card text-gray-700 px-4 py-2 rounded-full hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600 hover:text-white transition font-semibold" data-action="예약 확인하기">
                            📅 예약 확인하기
                        </button>
                        <button class="quick-action text-sm glass-card text-gray-700 px-4 py-2 rounded-full hover:bg-gradient-to-r hover:from-purple-600 hover:to-pink-600 hover:text-white transition font-semibold" data-action="처방전 보기">
                            💊 처방전 보기
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
