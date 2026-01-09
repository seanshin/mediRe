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
  
  const result = await DB.prepare('SELECT id, name, email, phone, birth_date, gender, blood_type, allergies, address, status, created_at FROM users WHERE id = ?').bind(id).first()
  return c.json({ success: true, data: result })
})

// Register new user
app.post('/api/auth/register', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  try {
    // Check if email already exists
    const existing = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first()
    if (existing) {
      return c.json({ success: false, message: '이미 등록된 이메일입니다.' }, 400)
    }

    // Simple password hash (in production, use proper bcrypt)
    const hashedPassword = body.password // TODO: Add proper hashing
    
    const result = await DB.prepare(`
      INSERT INTO users (name, email, password, phone, birth_date, gender, blood_type, allergies, address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name,
      body.email,
      hashedPassword,
      body.phone,
      body.birth_date,
      body.gender || 'other',
      body.blood_type || null,
      body.allergies || null,
      body.address || null,
      'active'
    ).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id }, message: '회원가입이 완료되었습니다.' })
  } catch (error) {
    return c.json({ success: false, message: '회원가입 중 오류가 발생했습니다.' }, 500)
  }
})

// Login
app.post('/api/auth/login', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  try {
    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first()
    
    if (!user) {
      return c.json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }
    
    // Check password (in production, use proper bcrypt compare)
    if (user.password !== body.password) {
      return c.json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
    }
    
    // Remove password from response
    const { password, ...userWithoutPassword } = user as any
    
    return c.json({ success: true, data: userWithoutPassword, message: '로그인 성공' })
  } catch (error) {
    return c.json({ success: false, message: '로그인 중 오류가 발생했습니다.' }, 500)
  }
})

// Update user profile
app.put('/api/users/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const body = await c.req.json()
  
  const updates: string[] = []
  const params: any[] = []
  
  if (body.name) {
    updates.push('name = ?')
    params.push(body.name)
  }
  if (body.phone) {
    updates.push('phone = ?')
    params.push(body.phone)
  }
  if (body.birth_date) {
    updates.push('birth_date = ?')
    params.push(body.birth_date)
  }
  if (body.gender) {
    updates.push('gender = ?')
    params.push(body.gender)
  }
  if (body.blood_type !== undefined) {
    updates.push('blood_type = ?')
    params.push(body.blood_type)
  }
  if (body.allergies !== undefined) {
    updates.push('allergies = ?')
    params.push(body.allergies)
  }
  if (body.address !== undefined) {
    updates.push('address = ?')
    params.push(body.address)
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  
  await DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  
  return c.json({ success: true, message: '프로필이 업데이트되었습니다.' })
})

// Get all users (admin)
app.get('/api/admin/users', async (c) => {
  const { DB } = c.env
  const status = c.req.query('status')
  
  let query = 'SELECT id, name, email, phone, birth_date, gender, status, created_at FROM users'
  let params: any[] = []
  
  if (status) {
    query += ' WHERE status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY created_at DESC'
  
  const stmt = params.length > 0 ? DB.prepare(query).bind(...params) : DB.prepare(query)
  const result = await stmt.all()
  
  return c.json({ success: true, data: result.results })
})

// Update user status (admin)
app.put('/api/admin/users/:id/status', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const body = await c.req.json()
  
  await DB.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(body.status, id)
    .run()
  
  return c.json({ success: true, message: '사용자 상태가 업데이트되었습니다.' })
})

// Register page
app.get('/register', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>회원가입 - 메디케어 AI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body>
        <div class="min-h-screen gradient-bg flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div class="max-w-2xl w-full">
                <div class="text-center mb-8">
                    <a href="/" class="inline-flex items-center space-x-3 mb-6">
                        <div class="bg-white p-3 rounded-xl shadow-lg">
                            <i class="fas fa-heartbeat text-purple-600 text-3xl"></i>
                        </div>
                        <span class="font-black text-3xl text-white">메디케어 AI</span>
                    </a>
                    <h2 class="text-4xl font-black text-white mb-2">회원가입</h2>
                    <p class="text-white/80 text-lg">메디케어 AI와 함께 건강을 관리하세요</p>
                </div>

                <div class="glass-card rounded-3xl p-8 shadow-2xl">
                    <form id="registerForm" class="space-y-6">
                        <!-- Basic Info -->
                        <div>
                            <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <i class="fas fa-user-circle text-purple-600 mr-2"></i>
                                기본 정보
                            </h3>
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">이름 *</label>
                                    <input type="text" name="name" required
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">생년월일 *</label>
                                    <input type="date" name="birth_date" required
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition">
                                </div>
                            </div>
                        </div>

                        <!-- Contact Info -->
                        <div>
                            <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <i class="fas fa-envelope text-purple-600 mr-2"></i>
                                연락처 정보
                            </h3>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">이메일 *</label>
                                    <input type="email" name="email" required
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                           placeholder="example@email.com">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">비밀번호 *</label>
                                    <input type="password" name="password" required minlength="6"
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                           placeholder="6자 이상 입력하세요">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">비밀번호 확인 *</label>
                                    <input type="password" name="password_confirm" required minlength="6"
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                           placeholder="비밀번호를 다시 입력하세요">
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">전화번호 *</label>
                                    <input type="tel" name="phone" required pattern="[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}"
                                           class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                           placeholder="010-1234-5678">
                                </div>
                            </div>
                        </div>

                        <!-- Additional Info -->
                        <div>
                            <h3 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
                                <i class="fas fa-notes-medical text-purple-600 mr-2"></i>
                                건강 정보 (선택)
                            </h3>
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">성별</label>
                                    <select name="gender"
                                            class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition">
                                        <option value="male">남성</option>
                                        <option value="female">여성</option>
                                        <option value="other">기타</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">혈액형</label>
                                    <select name="blood_type"
                                            class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition">
                                        <option value="">선택 안함</option>
                                        <option value="A+">A+</option>
                                        <option value="A-">A-</option>
                                        <option value="B+">B+</option>
                                        <option value="B-">B-</option>
                                        <option value="AB+">AB+</option>
                                        <option value="AB-">AB-</option>
                                        <option value="O+">O+</option>
                                        <option value="O-">O-</option>
                                    </select>
                                </div>
                            </div>
                            <div class="mt-4">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">알러지 정보</label>
                                <textarea name="allergies" rows="2"
                                          class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                          placeholder="알러지가 있다면 입력해주세요"></textarea>
                            </div>
                            <div class="mt-4">
                                <label class="block text-sm font-semibold text-gray-700 mb-2">주소</label>
                                <input type="text" name="address"
                                       class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                       placeholder="서울특별시 강남구...">
                            </div>
                        </div>

                        <!-- Terms -->
                        <div class="glass-card p-4 rounded-xl bg-purple-50">
                            <label class="flex items-start cursor-pointer">
                                <input type="checkbox" name="terms" required class="mt-1 mr-3 w-5 h-5 text-purple-600 rounded">
                                <span class="text-sm text-gray-700">
                                    <strong>이용약관</strong> 및 <strong>개인정보처리방침</strong>에 동의합니다. (필수)
                                </span>
                            </label>
                        </div>

                        <!-- Submit Button -->
                        <button type="submit"
                                class="w-full btn-primary text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform">
                            <i class="fas fa-user-plus mr-2"></i>회원가입 완료
                        </button>

                        <div class="text-center">
                            <p class="text-gray-600">
                                이미 계정이 있으신가요?
                                <a href="/login" class="text-purple-600 font-bold hover:text-purple-700">로그인</a>
                            </p>
                        </div>
                    </form>

                    <div id="message" class="mt-4 hidden"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            // Validate password match
            if (data.password !== data.password_confirm) {
              showMessage('비밀번호가 일치하지 않습니다.', 'error');
              return;
            }
            
            // Remove password_confirm before sending
            delete data.password_confirm;
            delete data.terms;
            
            try {
              const response = await axios.post('/api/auth/register', data);
              
              if (response.data.success) {
                showMessage(response.data.message, 'success');
                setTimeout(() => {
                  window.location.href = '/login';
                }, 2000);
              }
            } catch (error) {
              const message = error.response?.data?.message || '회원가입 중 오류가 발생했습니다.';
              showMessage(message, 'error');
            }
          });
          
          function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = \`mt-4 p-4 rounded-xl \${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`;
            messageDiv.textContent = text;
            messageDiv.classList.remove('hidden');
          }
        </script>
    </body>
    </html>
  `)
})

// Login page
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>로그인 - 메디케어 AI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body>
        <div class="min-h-screen gradient-bg flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div class="max-w-md w-full">
                <div class="text-center mb-8">
                    <a href="/" class="inline-flex items-center space-x-3 mb-6">
                        <div class="bg-white p-3 rounded-xl shadow-lg">
                            <i class="fas fa-heartbeat text-purple-600 text-3xl"></i>
                        </div>
                        <span class="font-black text-3xl text-white">메디케어 AI</span>
                    </a>
                    <h2 class="text-4xl font-black text-white mb-2">로그인</h2>
                    <p class="text-white/80 text-lg">계정에 로그인하세요</p>
                </div>

                <div class="glass-card rounded-3xl p-8 shadow-2xl">
                    <form id="loginForm" class="space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
                            <input type="email" name="email" required
                                   class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                   placeholder="example@email.com">
                        </div>

                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">비밀번호</label>
                            <input type="password" name="password" required
                                   class="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-200 transition"
                                   placeholder="비밀번호를 입력하세요">
                        </div>

                        <div class="flex items-center justify-between">
                            <label class="flex items-center cursor-pointer">
                                <input type="checkbox" name="remember" class="mr-2 w-4 h-4 text-purple-600 rounded">
                                <span class="text-sm text-gray-700">로그인 상태 유지</span>
                            </label>
                            <a href="#" class="text-sm text-purple-600 font-semibold hover:text-purple-700">
                                비밀번호 찾기
                            </a>
                        </div>

                        <button type="submit"
                                class="w-full btn-primary text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:scale-105 transition-transform">
                            <i class="fas fa-sign-in-alt mr-2"></i>로그인
                        </button>

                        <div class="text-center">
                            <p class="text-gray-600">
                                계정이 없으신가요?
                                <a href="/register" class="text-purple-600 font-bold hover:text-purple-700">회원가입</a>
                            </p>
                        </div>
                    </form>

                    <div id="message" class="mt-4 hidden"></div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            try {
              const response = await axios.post('/api/auth/login', {
                email: data.email,
                password: data.password
              });
              
              if (response.data.success) {
                // Store user info in localStorage
                localStorage.setItem('user', JSON.stringify(response.data.data));
                showMessage(response.data.message, 'success');
                setTimeout(() => {
                  window.location.href = '/dashboard';
                }, 1000);
              }
            } catch (error) {
              const message = error.response?.data?.message || '로그인 중 오류가 발생했습니다.';
              showMessage(message, 'error');
            }
          });
          
          function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = \`mt-4 p-4 rounded-xl \${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`;
            messageDiv.textContent = text;
            messageDiv.classList.remove('hidden');
          }
        </script>
    </body>
    </html>
  `)
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
                        <a href="/login" class="glass-card text-gray-700 px-4 py-2 rounded-xl font-semibold hover:bg-purple-50 transition">
                            <i class="fas fa-sign-in-alt mr-2"></i>로그인
                        </a>
                        <a href="/register" class="btn-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg glow">
                            <i class="fas fa-user-plus mr-2"></i>회원가입
                        </a>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="gradient-bg min-h-screen flex items-center justify-center relative overflow-hidden pt-20">
            <!-- Animated circles background -->
            <div class="absolute inset-0 overflow-hidden">
                <div class="absolute w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -top-20 -left-20 animate-pulse"></div>
                <div class="absolute w-96 h-96 bg-pink-500/20 rounded-full blur-3xl -bottom-20 -right-20 animate-pulse" style="animation-delay: 1s"></div>
                <div class="absolute w-64 h-64 bg-blue-500/20 rounded-full blur-3xl top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" style="animation-delay: 2s"></div>
            </div>

            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="text-center">
                    <div class="fade-in mb-8">
                        <span class="inline-block bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-full text-base font-bold border border-white/30 shadow-lg hover:scale-105 transition-transform">
                            🎉 AI 기반 스마트 의료 플랫폼 · 3,000개 병원 제휴
                        </span>
                    </div>
                    <h1 class="text-6xl md:text-8xl font-black text-white mb-8 fade-in-delay-1 neon-text leading-tight">
                        AI가 도와주는<br>
                        <span class="bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
                            스마트 병원 예약
                        </span>
                    </h1>
                    <p class="text-xl md:text-2xl mb-8 text-white/90 max-w-3xl mx-auto fade-in-delay-2 leading-relaxed">
                        음성과 채팅으로 간편하게 예약하고,<br class="hidden md:block"> 
                        의료 기록을 체계적으로 관리하세요
                    </p>
                    
                    <!-- Trust indicators -->
                    <div class="flex flex-wrap justify-center gap-6 mb-12 fade-in-delay-2">
                        <div class="flex items-center gap-2 text-white/90">
                            <i class="fas fa-check-circle text-green-300"></i>
                            <span class="font-semibold">24/7 AI 상담</span>
                        </div>
                        <div class="flex items-center gap-2 text-white/90">
                            <i class="fas fa-check-circle text-green-300"></i>
                            <span class="font-semibold">실시간 예약</span>
                        </div>
                        <div class="flex items-center gap-2 text-white/90">
                            <i class="fas fa-check-circle text-green-300"></i>
                            <span class="font-semibold">무료 사용</span>
                        </div>
                        <div class="flex items-center gap-2 text-white/90">
                            <i class="fas fa-check-circle text-green-300"></i>
                            <span class="font-semibold">안전한 보안</span>
                        </div>
                    </div>

                    <div class="flex flex-col sm:flex-row justify-center gap-6 mb-16 fade-in-delay-3">
                        <a href="/register" class="group btn-primary text-white px-12 py-5 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-purple-500/50 transition-all hover:scale-105">
                            <i class="fas fa-rocket mr-2 group-hover:rotate-12 transition-transform"></i>
                            지금 무료로 시작하기
                        </a>
                        <a href="#features" class="glass-card-dark text-white px-12 py-5 rounded-2xl font-bold text-xl hover:bg-white/20 transition-all hover:scale-105">
                            <i class="fas fa-play-circle mr-2"></i>
                            데모 보기
                        </a>
                    </div>

                    <!-- Use Case Scenarios -->
                    <div class="max-w-6xl mx-auto mt-20">
                        <div class="grid md:grid-cols-3 gap-8 mb-12">
                            <!-- Scenario 1 -->
                            <div class="glass-card-dark p-8 rounded-2xl card-hover fade-in-delay-3">
                                <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <i class="fas fa-comments text-white text-3xl"></i>
                                </div>
                                <h3 class="text-xl font-bold text-white mb-4 text-center">간편한 대화형 예약</h3>
                                <p class="text-white/80 text-center leading-relaxed mb-4">
                                    "내일 오후에 내과 예약 가능해?"
                                </p>
                                <p class="text-white/60 text-sm text-center">
                                    → AI가 즉시 가능한 시간과 의사를 추천해드립니다
                                </p>
                            </div>

                            <!-- Scenario 2 -->
                            <div class="glass-card-dark p-8 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 0.8s">
                                <div class="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <i class="fas fa-notes-medical text-white text-3xl"></i>
                                </div>
                                <h3 class="text-xl font-bold text-white mb-4 text-center">스마트 증상 분석</h3>
                                <p class="text-white/80 text-center leading-relaxed mb-4">
                                    "머리가 아프고 열이 나요"
                                </p>
                                <p class="text-white/60 text-sm text-center">
                                    → AI가 증상을 분석하여 적합한 진료과를 추천합니다
                                </p>
                            </div>

                            <!-- Scenario 3 -->
                            <div class="glass-card-dark p-8 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 1s">
                                <div class="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                                    <i class="fas fa-history text-white text-3xl"></i>
                                </div>
                                <h3 class="text-xl font-bold text-white mb-4 text-center">통합 건강 관리</h3>
                                <p class="text-white/80 text-center leading-relaxed mb-4">
                                    "지난 진료 기록 보여줘"
                                </p>
                                <p class="text-white/60 text-sm text-center">
                                    → 모든 병원의 진료 기록을 한 곳에서 확인 가능
                                </p>
                            </div>
                        </div>

                        <!-- Marketing Message -->
                        <div class="glass-card-dark p-10 rounded-3xl text-center fade-in-delay-3" style="animation-delay: 1.2s">
                            <div class="flex items-center justify-center gap-4 mb-6">
                                <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                <span class="text-white font-bold text-lg">지금 이 순간에도</span>
                                <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse" style="animation-delay: 0.5s"></div>
                            </div>
                            <p class="text-3xl md:text-4xl font-black text-white mb-4">
                                <span class="text-green-300">1,234명</span>의 사용자가
                            </p>
                            <p class="text-2xl md:text-3xl font-bold text-white/90 mb-6">
                                메디케어 AI로 병원 예약 중
                            </p>
                            <div class="flex flex-wrap justify-center gap-6 text-white/70 text-sm">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-clock text-green-300"></i>
                                    <span>평균 예약 시간: <strong class="text-white">2분 30초</strong></span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-star text-yellow-300"></i>
                                    <span>고객 만족도: <strong class="text-white">98.5%</strong></span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-shield-alt text-blue-300"></i>
                                    <span>보안 등급: <strong class="text-white">AAA</strong></span>
                                </div>
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

        <!-- Benefits Section -->
        <section class="py-32 bg-gradient-to-br from-purple-50 to-pink-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        💎 메디케어 AI의 장점
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        왜 메디케어 AI인가?
                    </h2>
                </div>

                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <!-- Benefit 1 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-bolt text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">즉시 예약</h3>
                        <p class="text-gray-600 leading-relaxed">
                            복잡한 전화 통화 없이 AI와 대화만으로 3분 이내 예약 완료
                        </p>
                    </div>

                    <!-- Benefit 2 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-shield-alt text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">안전한 보안</h3>
                        <p class="text-gray-600 leading-relaxed">
                            의료법 준수 및 개인정보 암호화로 안전하게 정보 보호
                        </p>
                    </div>

                    <!-- Benefit 3 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-chart-line text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">건강 트렌드</h3>
                        <p class="text-gray-600 leading-relaxed">
                            나의 건강 데이터를 분석하여 맞춤형 건강 관리 제안
                        </p>
                    </div>

                    <!-- Benefit 4 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-bell text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">스마트 알림</h3>
                        <p class="text-gray-600 leading-relaxed">
                            예약일, 복약 시간을 자동으로 알려주는 지능형 알림 시스템
                        </p>
                    </div>

                    <!-- Benefit 5 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-mobile-alt text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">모바일 최적화</h3>
                        <p class="text-gray-600 leading-relaxed">
                            언제 어디서나 스마트폰으로 간편하게 이용 가능
                        </p>
                    </div>

                    <!-- Benefit 6 -->
                    <div class="glass-card p-8 rounded-3xl card-hover">
                        <div class="w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center mb-6">
                            <i class="fas fa-headset text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-3">친절한 지원</h3>
                        <p class="text-gray-600 leading-relaxed">
                            AI가 해결하지 못하는 문제는 전문 상담사가 직접 지원
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Partner Hospitals Section -->
        <section class="py-32 relative">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        🏥 파트너 병원
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        신뢰할 수 있는 의료 기관
                    </h2>
                    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
                        국내 최고 수준의 병원들과 함께합니다
                    </p>
                </div>

                <div class="grid md:grid-cols-3 gap-8 mb-16">
                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-hospital text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-2">서울대학교병원</h3>
                        <p class="text-gray-600 mb-4">종로구 대학로 103</p>
                        <div class="flex items-center justify-center text-yellow-500 mb-4">
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <span class="ml-2 text-gray-700 font-bold">4.8</span>
                        </div>
                        <div class="flex flex-wrap gap-2 justify-center">
                            <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">내과</span>
                            <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">외과</span>
                            <span class="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">소아과</span>
                        </div>
                    </div>

                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-hospital text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-2">삼성서울병원</h3>
                        <p class="text-gray-600 mb-4">강남구 일원로 81</p>
                        <div class="flex items-center justify-center text-yellow-500 mb-4">
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star-half-alt"></i>
                            <span class="ml-2 text-gray-700 font-bold">4.7</span>
                        </div>
                        <div class="flex flex-wrap gap-2 justify-center">
                            <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">심장내과</span>
                            <span class="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold">종양내과</span>
                            <span class="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-semibold">정형외과</span>
                        </div>
                    </div>

                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-hospital text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-2">아산병원</h3>
                        <p class="text-gray-600 mb-4">송파구 올림픽로43길 88</p>
                        <div class="flex items-center justify-center text-yellow-500 mb-4">
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <span class="ml-2 text-gray-700 font-bold">4.9</span>
                        </div>
                        <div class="flex flex-wrap gap-2 justify-center">
                            <span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">신경외과</span>
                            <span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-semibold">산부인과</span>
                            <span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold">내과</span>
                        </div>
                    </div>
                </div>

                <div class="text-center">
                    <p class="text-gray-600 mb-6">그 외 3,000개 이상의 의료 기관과 파트너십</p>
                    <a href="#dashboard" class="inline-block btn-primary text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:scale-105 transition-transform">
                        <i class="fas fa-search mr-2"></i>병원 찾아보기
                    </a>
                </div>
            </div>
        </section>

        <!-- Testimonials Section -->
        <section class="py-32 gradient-bg relative overflow-hidden">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="text-center mb-20">
                    <span class="inline-block bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-bold mb-4 border border-white/30">
                        💬 고객 후기
                    </span>
                    <h2 class="text-5xl font-black text-white mb-6">
                        사용자들의 생생한 경험
                    </h2>
                    <p class="text-xl text-white/90 max-w-2xl mx-auto">
                        메디케어 AI를 사용하는 고객들의 실제 후기입니다
                    </p>
                </div>

                <div class="grid md:grid-cols-3 gap-8">
                    <!-- Testimonial 1 -->
                    <div class="glass-card-dark p-8 rounded-3xl card-hover">
                        <div class="flex items-center mb-6">
                            <div class="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                김
                            </div>
                            <div class="ml-4">
                                <h4 class="text-white font-bold text-lg">김민지</h4>
                                <div class="flex text-yellow-400">
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                </div>
                            </div>
                        </div>
                        <p class="text-white/90 leading-relaxed">
                            "AI 챗봇이 정말 똑똑해요! 전화로 예약하느라 오래 기다릴 필요 없이 
                            바로바로 예약할 수 있어서 너무 편해요. 의료 기록도 한 곳에서 볼 수 있어서 좋습니다."
                        </p>
                    </div>

                    <!-- Testimonial 2 -->
                    <div class="glass-card-dark p-8 rounded-3xl card-hover">
                        <div class="flex items-center mb-6">
                            <div class="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                박
                            </div>
                            <div class="ml-4">
                                <h4 class="text-white font-bold text-lg">박준호</h4>
                                <div class="flex text-yellow-400">
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                </div>
                            </div>
                        </div>
                        <p class="text-white/90 leading-relaxed">
                            "처방전 관리 기능이 정말 유용해요. 약 먹을 시간마다 알림이 와서 
                            깜빡하는 일이 없어졌어요. 가족들과도 공유할 수 있어서 부모님 약 챙기기도 편해졌습니다."
                        </p>
                    </div>

                    <!-- Testimonial 3 -->
                    <div class="glass-card-dark p-8 rounded-3xl card-hover">
                        <div class="flex items-center mb-6">
                            <div class="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                이
                            </div>
                            <div class="ml-4">
                                <h4 class="text-white font-bold text-lg">이서연</h4>
                                <div class="flex text-yellow-400">
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                    <i class="fas fa-star text-sm"></i>
                                </div>
                            </div>
                        </div>
                        <p class="text-white/90 leading-relaxed">
                            "음성으로도 예약할 수 있어서 정말 신기했어요! 타이핑하기 귀찮을 때 
                            말로만 해도 알아서 예약해주니까 너무 편리합니다. 미래가 온 것 같아요."
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- AI Assistant Section -->
        <section id="services" class="py-32 relative overflow-hidden bg-gradient-to-br from-gray-50 to-purple-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        🤖 AI 어시스턴트
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        24/7 똑똑한 의료 비서
                    </h2>
                    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
                        음성과 채팅으로 모든 의료 서비스를 편리하게 이용하세요
                    </p>
                </div>

                <div class="grid md:grid-cols-2 gap-12 items-center">
                    <div class="space-y-6">
                        <div class="glass-card p-8 rounded-3xl card-hover border-gradient">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-blue-400 to-blue-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-microphone text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">음성 예약</h3>
                                    <p class="text-gray-600 leading-relaxed">
                                        "다음주 화요일 오전에 내과 예약해줘" - 자연스러운 대화로 
                                        예약을 완료하세요.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card p-8 rounded-3xl card-hover border-gradient">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-green-400 to-emerald-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-comments text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">채팅 상담</h3>
                                    <p class="text-gray-600 leading-relaxed">
                                        증상을 설명하면 AI가 적합한 진료과와 병원을 
                                        추천해드립니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div class="glass-card p-8 rounded-3xl card-hover border-gradient">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="bg-gradient-to-br from-purple-400 to-pink-600 p-4 rounded-2xl shadow-lg">
                                        <i class="fas fa-clock text-white text-3xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">24/7 지원</h3>
                                    <p class="text-gray-600 leading-relaxed">
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

        <!-- FAQ Section -->
        <section class="py-32 bg-gradient-to-br from-purple-50 to-pink-50">
            <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-20">
                    <span class="inline-block bg-purple-100 text-purple-600 px-4 py-2 rounded-full text-sm font-bold mb-4">
                        ❓ 자주 묻는 질문
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        궁금하신 점이 있으신가요?
                    </h2>
                    <p class="text-xl text-gray-600">
                        메디케어 AI에 대해 자주 묻는 질문들을 확인해보세요
                    </p>
                </div>

                <div class="space-y-4">
                    <!-- FAQ 1 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    1
                                </span>
                                메디케어 AI는 무료인가요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            네, 기본 서비스는 완전 무료입니다! 병원 예약, 의료 기록 조회, 처방전 관리 등 
                            모든 핵심 기능을 무료로 이용하실 수 있습니다. 추가 프리미엄 기능은 별도 요금제가 있습니다.
                        </p>
                    </details>

                    <!-- FAQ 2 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    2
                                </span>
                                AI가 정확한 병원을 추천해주나요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            메디케어 AI는 최신 의료 데이터와 병원 정보를 기반으로 증상에 맞는 병원과 의사를 추천합니다. 
                            하지만 최종 진단은 의료 전문가의 판단이 필요하며, AI는 보조 도구로 활용됩니다.
                        </p>
                    </details>

                    <!-- FAQ 3 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    3
                                </span>
                                의료 정보가 안전하게 보호되나요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            네, 절대적으로 안전합니다. 모든 의료 정보는 최고 수준의 암호화로 보호되며, 
                            의료법 및 개인정보보호법을 철저히 준수합니다. 사용자의 동의 없이 절대 제3자에게 공유되지 않습니다.
                        </p>
                    </details>

                    <!-- FAQ 4 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    4
                                </span>
                                예약 취소나 변경도 가능한가요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            물론입니다! 대시보드에서 언제든지 예약을 취소하거나 변경할 수 있습니다. 
                            다만 병원별 취소 정책에 따라 취소 가능 시간이 다를 수 있으니 미리 확인해주세요.
                        </p>
                    </details>

                    <!-- FAQ 5 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    5
                                </span>
                                음성 예약 기능이 정확한가요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            최신 AI 음성 인식 기술을 사용하여 높은 정확도를 자랑합니다. 
                            자연스러운 대화로 예약할 수 있으며, 잘못 인식된 경우 바로 수정할 수 있습니다.
                        </p>
                    </details>

                    <!-- FAQ 6 -->
                    <details class="glass-card rounded-2xl p-6 cursor-pointer group">
                        <summary class="flex justify-between items-center font-bold text-lg text-gray-900 list-none">
                            <span class="flex items-center">
                                <span class="w-8 h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center text-white mr-4">
                                    6
                                </span>
                                모든 병원에서 사용할 수 있나요?
                            </span>
                            <i class="fas fa-chevron-down text-purple-600 group-open:rotate-180 transition-transform"></i>
                        </summary>
                        <p class="mt-4 pl-12 text-gray-600 leading-relaxed">
                            현재 전국 3,000개 이상의 병원과 제휴를 맺고 있으며, 지속적으로 확대하고 있습니다. 
                            대학병원, 종합병원, 개인병원 등 다양한 의료 기관에서 이용 가능합니다.
                        </p>
                    </details>
                </div>

                <div class="text-center mt-12">
                    <p class="text-gray-600 mb-6">더 궁금한 사항이 있으신가요?</p>
                    <a href="#" class="inline-block glass-card text-purple-600 px-8 py-4 rounded-xl font-bold hover:bg-purple-50 transition border-2 border-purple-200">
                        <i class="fas fa-headset mr-2"></i>고객센터 문의하기
                    </a>
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

// User management page (Admin)
app.get('/admin/users', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>사용자 관리 - 메디케어 AI</title>
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
                        <span class="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">ADMIN</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        <a href="/dashboard" class="glass-card text-gray-700 px-4 py-2 rounded-xl font-semibold hover:bg-purple-50 transition">
                            <i class="fas fa-arrow-left mr-2"></i>대시보드
                        </a>
                        <button onclick="logout()" class="glass-card text-red-600 px-4 py-2 rounded-xl font-semibold hover:bg-red-50 transition">
                            <i class="fas fa-sign-out-alt mr-2"></i>로그아웃
                        </button>
                    </div>
                </div>
            </div>
        </nav>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-28">
            <!-- Header -->
            <div class="mb-8">
                <h1 class="text-4xl font-black gradient-text mb-2">사용자 관리</h1>
                <p class="text-gray-600 text-lg">등록된 사용자를 관리하고 상태를 변경할 수 있습니다</p>
            </div>

            <!-- Filters -->
            <div class="glass-card rounded-2xl p-6 mb-8">
                <div class="flex flex-wrap gap-4 items-center">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-2">상태 필터</label>
                        <select id="statusFilter" class="px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-purple-500 transition">
                            <option value="">전체</option>
                            <option value="active">활성</option>
                            <option value="pending">대기</option>
                            <option value="suspended">정지</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="block text-sm font-semibold text-gray-700 mb-2">검색</label>
                        <input type="text" id="searchInput" placeholder="이름 또는 이메일 검색..." 
                               class="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-purple-500 transition">
                    </div>
                    <div class="self-end">
                        <button onclick="loadUsers()" class="btn-primary text-white px-6 py-2 rounded-xl font-bold shadow-lg">
                            <i class="fas fa-sync mr-2"></i>새로고침
                        </button>
                    </div>
                </div>
            </div>

            <!-- Statistics -->
            <div class="grid md:grid-cols-4 gap-6 mb-8">
                <div class="glass-card rounded-2xl p-6 border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">전체 사용자</p>
                            <p class="text-4xl font-black gradient-text" id="totalUsers">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-users text-white text-3xl"></i>
                        </div>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">활성 사용자</p>
                            <p class="text-4xl font-black gradient-text" id="activeUsers">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-green-500 to-emerald-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-user-check text-white text-3xl"></i>
                        </div>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">대기 사용자</p>
                            <p class="text-4xl font-black gradient-text" id="pendingUsers">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-yellow-500 to-orange-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-clock text-white text-3xl"></i>
                        </div>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">정지 사용자</p>
                            <p class="text-4xl font-black gradient-text" id="suspendedUsers">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-red-500 to-pink-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-user-slash text-white text-3xl"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Users Table -->
            <div class="glass-card rounded-3xl overflow-hidden shadow-2xl">
                <div class="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
                    <h2 class="text-2xl font-bold text-gray-900">사용자 목록</h2>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">ID</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">이름</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">이메일</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">전화번호</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">성별</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">생년월일</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">상태</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">가입일</th>
                                <th class="px-6 py-4 text-left text-sm font-bold text-gray-700">액션</th>
                            </tr>
                        </thead>
                        <tbody id="usersTableBody" class="divide-y divide-gray-200">
                            <!-- Users will be loaded here -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
          let allUsers = [];

          async function loadUsers() {
            try {
              const status = document.getElementById('statusFilter').value;
              const url = status ? \`/api/admin/users?status=\${status}\` : '/api/admin/users';
              
              const response = await axios.get(url);
              allUsers = response.data.data || [];
              
              updateStatistics();
              renderUsers(allUsers);
            } catch (error) {
              console.error('사용자 목록 로드 실패:', error);
              alert('사용자 목록을 불러오는데 실패했습니다.');
            }
          }

          function updateStatistics() {
            const total = allUsers.length;
            const active = allUsers.filter(u => u.status === 'active').length;
            const pending = allUsers.filter(u => u.status === 'pending').length;
            const suspended = allUsers.filter(u => u.status === 'suspended').length;

            document.getElementById('totalUsers').textContent = total;
            document.getElementById('activeUsers').textContent = active;
            document.getElementById('pendingUsers').textContent = pending;
            document.getElementById('suspendedUsers').textContent = suspended;
          }

          function renderUsers(users) {
            const tbody = document.getElementById('usersTableBody');
            
            if (users.length === 0) {
              tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-gray-500">사용자가 없습니다.</td></tr>';
              return;
            }

            const statusColors = {
              active: 'bg-green-100 text-green-800',
              pending: 'bg-yellow-100 text-yellow-800',
              suspended: 'bg-red-100 text-red-800'
            };

            const statusText = {
              active: '활성',
              pending: '대기',
              suspended: '정지'
            };

            const genderText = {
              male: '남성',
              female: '여성',
              other: '기타'
            };

            tbody.innerHTML = users.map(user => \`
              <tr class="hover:bg-purple-50 transition">
                <td class="px-6 py-4 text-sm font-semibold text-gray-900">\${user.id}</td>
                <td class="px-6 py-4 text-sm font-semibold text-gray-900">\${user.name}</td>
                <td class="px-6 py-4 text-sm text-gray-600">\${user.email}</td>
                <td class="px-6 py-4 text-sm text-gray-600">\${user.phone}</td>
                <td class="px-6 py-4 text-sm text-gray-600">\${genderText[user.gender] || user.gender}</td>
                <td class="px-6 py-4 text-sm text-gray-600">\${user.birth_date}</td>
                <td class="px-6 py-4">
                  <span class="px-3 py-1 rounded-full text-xs font-bold \${statusColors[user.status] || 'bg-gray-100 text-gray-800'}">
                    \${statusText[user.status] || user.status}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-600">\${new Date(user.created_at).toLocaleDateString('ko-KR')}</td>
                <td class="px-6 py-4">
                  <div class="flex gap-2">
                    \${user.status !== 'active' ? \`
                      <button onclick="changeStatus(\${user.id}, 'active')" 
                              class="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition">
                        활성화
                      </button>
                    \` : ''}
                    \${user.status !== 'suspended' ? \`
                      <button onclick="changeStatus(\${user.id}, 'suspended')" 
                              class="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 transition">
                        정지
                      </button>
                    \` : ''}
                  </div>
                </td>
              </tr>
            \`).join('');
          }

          async function changeStatus(userId, newStatus) {
            if (!confirm(\`사용자 상태를 '\${newStatus === 'active' ? '활성' : '정지'}'로 변경하시겠습니까?\`)) {
              return;
            }

            try {
              await axios.put(\`/api/admin/users/\${userId}/status\`, { status: newStatus });
              alert('상태가 변경되었습니다.');
              loadUsers();
            } catch (error) {
              console.error('상태 변경 실패:', error);
              alert('상태 변경에 실패했습니다.');
            }
          }

          function logout() {
            localStorage.removeItem('user');
            window.location.href = '/';
          }

          // Search functionality
          document.getElementById('searchInput').addEventListener('input', (e) => {
            const search = e.target.value.toLowerCase();
            const filtered = allUsers.filter(user => 
              user.name.toLowerCase().includes(search) || 
              user.email.toLowerCase().includes(search)
            );
            renderUsers(filtered);
          });

          // Status filter
          document.getElementById('statusFilter').addEventListener('change', loadUsers);

          // Load users on page load
          document.addEventListener('DOMContentLoaded', loadUsers);
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
                        <a href="/admin/users" class="glass-card px-4 py-2 rounded-xl text-gray-700 font-semibold hover:bg-purple-50 transition">
                            <i class="fas fa-users-cog mr-2"></i>관리
                        </a>
                        <div class="flex items-center space-x-3 glass-card px-4 py-2 rounded-xl cursor-pointer" onclick="toggleUserMenu()">
                            <span class="font-semibold text-gray-700" id="userName">홍길동님</span>
                            <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-white"></i>
                            </div>
                        </div>
                        <div id="userMenu" class="hidden absolute right-4 top-24 glass-card rounded-xl shadow-xl p-4 z-50 min-w-[200px]">
                            <a href="/profile" class="block px-4 py-2 text-gray-700 hover:bg-purple-50 rounded-lg transition">
                                <i class="fas fa-user-circle mr-2"></i>내 프로필
                            </a>
                            <button onclick="logout()" class="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                                <i class="fas fa-sign-out-alt mr-2"></i>로그아웃
                            </button>
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
