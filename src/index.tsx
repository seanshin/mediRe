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

// ==================== Health Status API Routes ====================

// Get user health status
app.get('/api/users/:userId/health/status', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  
  const result = await DB.prepare(`
    SELECT * FROM health_status WHERE user_id = ? ORDER BY status_date DESC LIMIT 1
  `).bind(userId).all()
  
  return c.json({ success: true, data: result.results[0] || null })
})

// Get health status history
app.get('/api/users/:userId/health/history', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const limit = c.req.query('limit') || '30'
  
  const result = await DB.prepare(`
    SELECT * FROM health_status WHERE user_id = ? ORDER BY status_date DESC LIMIT ?
  `).bind(userId, parseInt(limit)).all()
  
  return c.json({ success: true, data: result.results })
})

// Get health trends
app.get('/api/users/:userId/health/trends', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const metricName = c.req.query('metric')
  const limit = c.req.query('limit') || '30'
  
  let query = 'SELECT * FROM health_trends WHERE user_id = ?'
  let params: any[] = [userId]
  
  if (metricName) {
    query += ' AND metric_name = ?'
    params.push(metricName)
  }
  
  query += ' ORDER BY recorded_date DESC LIMIT ?'
  params.push(parseInt(limit))
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Get health goals
app.get('/api/users/:userId/health/goals', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const status = c.req.query('status')
  
  let query = 'SELECT * FROM health_goals WHERE user_id = ?'
  let params: any[] = [userId]
  
  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY created_at DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Create health goal
app.post('/api/health/goals', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO health_goals (user_id, goal_type, goal_title, goal_description, target_value, current_value, start_date, target_date, status, progress_percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.goal_type,
    body.goal_title,
    body.goal_description || null,
    body.target_value,
    body.current_value || null,
    body.start_date,
    body.target_date || null,
    body.status || 'active',
    body.progress_percentage || 0
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Update health goal
app.put('/api/health/goals/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const body = await c.req.json()
  
  const updates: string[] = []
  const params: any[] = []
  
  if (body.current_value !== undefined) {
    updates.push('current_value = ?')
    params.push(body.current_value)
  }
  if (body.progress_percentage !== undefined) {
    updates.push('progress_percentage = ?')
    params.push(body.progress_percentage)
  }
  if (body.status !== undefined) {
    updates.push('status = ?')
    params.push(body.status)
  }
  if (body.notes !== undefined) {
    updates.push('notes = ?')
    params.push(body.notes)
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  
  await DB.prepare(`UPDATE health_goals SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  
  return c.json({ success: true, message: '건강 목표가 업데이트되었습니다.' })
})

// Get health alerts
app.get('/api/users/:userId/health/alerts', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const unreadOnly = c.req.query('unread') === 'true'
  const unresolvedOnly = c.req.query('unresolved') === 'true'
  
  let query = 'SELECT * FROM health_alerts WHERE user_id = ?'
  let params: any[] = [userId]
  
  if (unreadOnly) {
    query += ' AND is_read = FALSE'
  }
  if (unresolvedOnly) {
    query += ' AND is_resolved = FALSE'
  }
  
  query += ' ORDER BY priority DESC, created_at DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Mark alert as read
app.put('/api/health/alerts/:id/read', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  await DB.prepare('UPDATE health_alerts SET is_read = TRUE WHERE id = ?').bind(id).run()
  
  return c.json({ success: true })
})

// Get health dashboard summary
app.get('/api/users/:userId/health/dashboard', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  
  // Get latest health status
  const statusResult = await DB.prepare(`
    SELECT * FROM health_status WHERE user_id = ? ORDER BY status_date DESC LIMIT 1
  `).bind(userId).all()
  
  const healthStatus = statusResult.results[0] || null
  
  // Get active goals count
  const goalsResult = await DB.prepare(`
    SELECT COUNT(*) as count FROM health_goals WHERE user_id = ? AND status = 'active'
  `).bind(userId).all()
  
  const activeGoalsCount = goalsResult.results[0]?.count || 0
  
  // Get unread alerts count
  const alertsResult = await DB.prepare(`
    SELECT COUNT(*) as count FROM health_alerts WHERE user_id = ? AND is_read = FALSE
  `).bind(userId).all()
  
  const unreadAlertsCount = alertsResult.results[0]?.count || 0
  
  // Get recent medical visits count (last 30 days)
  const visitsResult = await DB.prepare(`
    SELECT COUNT(*) as count FROM medical_records 
    WHERE user_id = ? AND visit_date >= date('now', '-30 days')
  `).bind(userId).all()
  
  const recentVisitsCount = visitsResult.results[0]?.count || 0
  
  return c.json({
    success: true,
    data: {
      healthStatus,
      activeGoalsCount,
      unreadAlertsCount,
      recentVisitsCount
    }
  })
})

// ==================== Insurance API Routes ====================

// Get user insurance policies
app.get('/api/users/:userId/insurance/policies', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const status = c.req.query('status')
  
  let query = 'SELECT * FROM insurance_policies WHERE user_id = ?'
  let params: any[] = [userId]
  
  if (status) {
    query += ' AND status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY created_at DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Create insurance policy
app.post('/api/insurance/policies', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO insurance_policies (user_id, insurance_company, policy_number, policy_type, policy_name, coverage_amount, premium_amount, start_date, end_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.insurance_company,
    body.policy_number,
    body.policy_type,
    body.policy_name,
    body.coverage_amount || null,
    body.premium_amount || null,
    body.start_date,
    body.end_date || null,
    body.status || 'active',
    body.notes || null
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Get user insurance claims
app.get('/api/users/:userId/insurance/claims', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  const status = c.req.query('status')
  
  let query = `
    SELECT ic.*, ip.policy_name, ip.insurance_company
    FROM insurance_claims ic
    JOIN insurance_policies ip ON ic.policy_id = ip.id
    WHERE ic.user_id = ?
  `
  let params: any[] = [userId]
  
  if (status) {
    query += ' AND ic.status = ?'
    params.push(status)
  }
  
  query += ' ORDER BY ic.created_at DESC'
  
  const result = await DB.prepare(query).bind(...params).all()
  return c.json({ success: true, data: result.results })
})

// Create insurance claim
app.post('/api/insurance/claims', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  // Generate claim number
  const claimNumber = `CLM${Date.now()}`
  
  const result = await DB.prepare(`
    INSERT INTO insurance_claims (
      user_id, policy_id, medical_record_id, claim_number, claim_date, 
      treatment_date, hospital_name, diagnosis, treatment_type, 
      total_amount, claimed_amount, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.policy_id,
    body.medical_record_id || null,
    claimNumber,
    new Date().toISOString().split('T')[0],
    body.treatment_date,
    body.hospital_name,
    body.diagnosis,
    body.treatment_type,
    body.total_amount,
    body.claimed_amount,
    'pending',
    body.notes || null
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id, claim_number: claimNumber } })
})

// Update insurance claim status
app.put('/api/insurance/claims/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  const body = await c.req.json()
  
  const updates: string[] = []
  const params: any[] = []
  
  if (body.status) {
    updates.push('status = ?')
    params.push(body.status)
    
    if (body.status === 'submitted' && !body.submission_date) {
      updates.push('submission_date = ?')
      params.push(new Date().toISOString().split('T')[0])
    }
    if (body.status === 'approved') {
      updates.push('approval_date = ?')
      params.push(new Date().toISOString().split('T')[0])
      if (body.approved_amount) {
        updates.push('approved_amount = ?')
        params.push(body.approved_amount)
      }
    }
    if (body.status === 'paid') {
      updates.push('payment_date = ?')
      params.push(new Date().toISOString().split('T')[0])
      if (body.paid_amount) {
        updates.push('paid_amount = ?')
        params.push(body.paid_amount)
      }
    }
    if (body.status === 'rejected' && body.rejection_reason) {
      updates.push('rejection_reason = ?')
      params.push(body.rejection_reason)
    }
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP')
  params.push(id)
  
  await DB.prepare(`UPDATE insurance_claims SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run()
  
  return c.json({ success: true })
})

// Get user medical receipts
app.get('/api/users/:userId/insurance/receipts', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  
  const result = await DB.prepare(`
    SELECT * FROM medical_receipts WHERE user_id = ? ORDER BY receipt_date DESC
  `).bind(userId).all()
  
  return c.json({ success: true, data: result.results })
})

// Create medical receipt
app.post('/api/insurance/receipts', async (c) => {
  const { DB } = c.env
  const body = await c.req.json()
  
  const result = await DB.prepare(`
    INSERT INTO medical_receipts (
      user_id, medical_record_id, claim_id, receipt_number, receipt_date,
      hospital_name, treatment_type, amount, payment_method, receipt_image_url,
      is_claimed, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.medical_record_id || null,
    body.claim_id || null,
    body.receipt_number,
    body.receipt_date,
    body.hospital_name,
    body.treatment_type,
    body.amount,
    body.payment_method || 'card',
    body.receipt_image_url || null,
    body.is_claimed || 0,
    body.notes || null
  ).run()
  
  return c.json({ success: true, data: { id: result.meta.last_row_id } })
})

// Get insurance statistics
app.get('/api/users/:userId/insurance/statistics', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('userId')
  
  // Get total policies
  const policies = await DB.prepare('SELECT COUNT(*) as count FROM insurance_policies WHERE user_id = ? AND status = ?').bind(userId, 'active').first()
  
  // Get total claims
  const claims = await DB.prepare('SELECT COUNT(*) as count, SUM(claimed_amount) as total FROM insurance_claims WHERE user_id = ?').bind(userId).first()
  
  // Get paid claims
  const paidClaims = await DB.prepare('SELECT COUNT(*) as count, SUM(paid_amount) as total FROM insurance_claims WHERE user_id = ? AND status = ?').bind(userId, 'paid').first()
  
  // Get pending claims
  const pendingClaims = await DB.prepare('SELECT COUNT(*) as count FROM insurance_claims WHERE user_id = ? AND status IN (?, ?, ?)').bind(userId, 'pending', 'submitted', 'under_review').first()
  
  return c.json({
    success: true,
    data: {
      active_policies: policies?.count || 0,
      total_claims: claims?.count || 0,
      total_claimed: claims?.total || 0,
      total_paid: paidClaims?.total || 0,
      pending_claims: pendingClaims?.count || 0
    }
  })
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
        <title>회원가입 - WeRuby AI</title>
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
                        <span class="font-black text-3xl text-white">WeRuby AI</span>
                    </a>
                    <h2 class="text-4xl font-black text-white mb-2">회원가입</h2>
                    <p class="text-white/80 text-lg">WeRuby AI와 함께 건강을 관리하세요</p>
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
        <title>로그인 - WeRuby AI</title>
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
                        <span class="font-black text-3xl text-white">WeRuby AI</span>
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

// Main page (Service Concept)
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>서비스 컨셉 - WeRuby AI</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
        <style>
          .diagram-box {
            position: relative;
            background: white;
            border-radius: 20px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }
          .diagram-box:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.15);
          }
          .arrow-right {
            position: relative;
          }
          .arrow-right::after {
            content: '→';
            font-size: 32px;
            color: #9333ea;
            position: absolute;
            right: -50px;
            top: 50%;
            transform: translateY(-50%);
          }
          .arrow-down {
            position: relative;
          }
          .arrow-down::after {
            content: '↓';
            font-size: 32px;
            color: #9333ea;
            position: absolute;
            bottom: -50px;
            left: 50%;
            transform: translateX(-50%);
          }
          .flow-step {
            counter-increment: step;
          }
          .flow-step::before {
            content: counter(step);
            position: absolute;
            top: -12px;
            left: -12px;
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #9333ea, #ec4899);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            box-shadow: 0 4px 12px rgba(147, 51, 234, 0.4);
          }
          .service-flow {
            counter-reset: step;
          }
        </style>
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
                        <span class="font-black text-2xl gradient-text">WeRuby AI</span>
                    </div>
                    <div class="hidden md:flex space-x-6 items-center">
                        <a href="/" class="text-purple-600 font-bold border-b-2 border-purple-600">서비스 컨셉</a>
                        <a href="/about" class="text-gray-700 hover:text-purple-600 font-semibold transition">소개</a>
                        <a href="https://weruby.co.kr" target="_blank" rel="noopener noreferrer" class="text-gray-700 hover:text-purple-600 font-semibold transition">
                            <i class="fas fa-building mr-1"></i>서비스 제공업체
                            <i class="fas fa-external-link-alt text-xs ml-1"></i>
                        </a>
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
        <section class="gradient-bg pt-32 pb-20">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div class="mb-6">
                    <span class="inline-block bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-bold border border-white/30 shadow-lg">
                        💡 서비스 컨셉
                    </span>
                </div>
                <h1 class="text-5xl md:text-7xl font-black text-white mb-6 neon-text">
                    일정 기반<br>
                    <span class="bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 bg-clip-text text-transparent">
                        통합 의료 서비스
                    </span>
                </h1>
                <p class="text-xl md:text-2xl text-white/90 max-w-4xl mx-auto leading-relaxed">
                    채팅으로 시작해서 예약, 진료, 보험청구까지<br>
                    모든 의료 여정을 하나의 플랫폼에서 완성합니다
                </p>
            </div>
        </section>

        <!-- Core Concept Section -->
        <section class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl md:text-5xl font-black gradient-text mb-4">
                        WeRuby AI 핵심 컨셉
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        사용자의 일정을 중심으로 모든 의료 서비스가 자동으로 연결되고 처리됩니다
                    </p>
                </div>

                <div class="grid md:grid-cols-3 gap-8 mb-16">
                    <!-- Concept 1 -->
                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-calendar-check text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">일정 중심</h3>
                        <p class="text-gray-600 leading-relaxed">
                            사용자의 캘린더를 기반으로 최적의 예약 시간을 자동으로 제안하고 관리합니다
                        </p>
                    </div>

                    <!-- Concept 2 -->
                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-comments text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">대화형 인터페이스</h3>
                        <p class="text-gray-600 leading-relaxed">
                            복잡한 양식 없이 AI와 자연스러운 대화만으로 모든 절차를 완료합니다
                        </p>
                    </div>

                    <!-- Concept 3 -->
                    <div class="glass-card p-8 rounded-3xl text-center card-hover">
                        <div class="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i class="fas fa-link text-white text-3xl"></i>
                        </div>
                        <h3 class="text-2xl font-bold text-gray-900 mb-4">완전 통합</h3>
                        <p class="text-gray-600 leading-relaxed">
                            예약부터 진료, 보험청구까지 모든 과정이 끊김없이 연결됩니다
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- Service Flow Diagram -->
        <section class="py-20 bg-gradient-to-br from-purple-50 to-pink-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl md:text-5xl font-black gradient-text mb-4">
                        서비스 흐름도
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        사용자의 단 한 번의 요청으로 시작되는 완벽한 의료 서비스 여정
                    </p>
                </div>

                <!-- Flow Diagram -->
                <div class="service-flow space-y-12">
                    <!-- Step 1: User Input -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-user text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">사용자 요청</h3>
                                    <p class="text-gray-700 mb-4 text-lg">
                                        "다음주 화요일 오전에 내과 예약해줘"
                                    </p>
                                    <div class="bg-blue-50 rounded-xl p-4">
                                        <ul class="space-y-2 text-gray-700">
                                            <li class="flex items-start">
                                                <i class="fas fa-check text-blue-600 mt-1 mr-3"></i>
                                                <span>채팅 또는 음성으로 간단히 요청</span>
                                            </li>
                                            <li class="flex items-start">
                                                <i class="fas fa-check text-blue-600 mt-1 mr-3"></i>
                                                <span>증상, 희망 시간, 위치 등 자연어로 입력</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: AI Analysis -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-brain text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">AI 분석 및 처리</h3>
                                    <div class="grid md:grid-cols-2 gap-4">
                                        <div class="bg-purple-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2 flex items-center">
                                                <i class="fas fa-calendar text-purple-600 mr-2"></i>
                                                일정 분석
                                            </h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>• 사용자 캘린더 확인</li>
                                                <li>• 가능한 시간대 추출</li>
                                                <li>• 이동 시간 계산</li>
                                            </ul>
                                        </div>
                                        <div class="bg-pink-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2 flex items-center">
                                                <i class="fas fa-stethoscope text-pink-600 mr-2"></i>
                                                의료 정보 분석
                                            </h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>• 증상 기반 진료과 추천</li>
                                                <li>• 과거 진료 기록 참조</li>
                                                <li>• 최적 병원/의사 매칭</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 3: Smart Recommendation -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-lightbulb text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">맞춤형 추천</h3>
                                    <div class="bg-green-50 rounded-xl p-4 mb-4">
                                        <p class="text-gray-700 mb-3">
                                            <strong>AI 추천:</strong> "화요일 오전 10시, 서울대병원 김민수 내과 전문의를 추천합니다"
                                        </p>
                                        <div class="grid grid-cols-3 gap-3 text-sm">
                                            <div class="bg-white rounded-lg p-3 text-center">
                                                <i class="fas fa-star text-yellow-500 mb-1"></i>
                                                <p class="font-bold">평점 4.9</p>
                                            </div>
                                            <div class="bg-white rounded-lg p-3 text-center">
                                                <i class="fas fa-car text-blue-500 mb-1"></i>
                                                <p class="font-bold">15분 거리</p>
                                            </div>
                                            <div class="bg-white rounded-lg p-3 text-center">
                                                <i class="fas fa-clock text-purple-500 mb-1"></i>
                                                <p class="font-bold">대기 5분</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 4: Automatic Booking -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-check-circle text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">자동 예약 및 일정 등록</h3>
                                    <div class="grid md:grid-cols-2 gap-4">
                                        <div class="bg-orange-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2">예약 완료</h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>✓ 병원 예약 시스템 연동</li>
                                                <li>✓ 예약 확정 및 예약번호 발급</li>
                                                <li>✓ 확인 문자/알림 발송</li>
                                            </ul>
                                        </div>
                                        <div class="bg-red-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2">캘린더 통합</h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>✓ 사용자 캘린더에 자동 등록</li>
                                                <li>✓ 진료 전 리마인더 설정</li>
                                                <li>✓ 이동 시간 알림</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 5: Pre-Visit Preparation -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-clipboard-list text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">진료 전 준비</h3>
                                    <div class="bg-indigo-50 rounded-xl p-4">
                                        <ul class="space-y-2 text-gray-700">
                                            <li class="flex items-start">
                                                <i class="fas fa-file-medical text-indigo-600 mt-1 mr-3"></i>
                                                <span>과거 진료 기록 자동 전송</span>
                                            </li>
                                            <li class="flex items-start">
                                                <i class="fas fa-clipboard-check text-indigo-600 mt-1 mr-3"></i>
                                                <span>문진표 AI 작성 (증상 기반)</span>
                                            </li>
                                            <li class="flex items-start">
                                                <i class="fas fa-pills text-indigo-600 mt-1 mr-3"></i>
                                                <span>현재 복용 중인 약 정보 공유</span>
                                            </li>
                                            <li class="flex items-start">
                                                <i class="fas fa-bell text-indigo-600 mt-1 mr-3"></i>
                                                <span>진료 1시간 전 출발 알림</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 6: Medical Visit -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-hospital text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">진료 진행</h3>
                                    <div class="grid md:grid-cols-2 gap-4">
                                        <div class="bg-teal-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2">실시간 업데이트</h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>• 대기 순서 실시간 알림</li>
                                                <li>• 예상 대기 시간 안내</li>
                                                <li>• QR 체크인으로 빠른 접수</li>
                                            </ul>
                                        </div>
                                        <div class="bg-cyan-50 rounded-xl p-4">
                                            <h4 class="font-bold text-gray-900 mb-2">진료 기록</h4>
                                            <ul class="text-sm text-gray-700 space-y-1">
                                                <li>• 진단 내용 자동 저장</li>
                                                <li>• 처방전 디지털화</li>
                                                <li>• 검사 결과 연동</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 7: Post-Visit Processing -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step arrow-down">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-file-invoice-dollar text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">진료 후 처리</h3>
                                    <div class="bg-pink-50 rounded-xl p-4 mb-4">
                                        <h4 class="font-bold text-gray-900 mb-3">자동 처리 항목</h4>
                                        <div class="space-y-3">
                                            <div class="flex items-start bg-white rounded-lg p-3">
                                                <i class="fas fa-prescription text-pink-600 mt-1 mr-3"></i>
                                                <div>
                                                    <p class="font-semibold text-gray-900">처방전 관리</p>
                                                    <p class="text-sm text-gray-600">약국 전송, 복약 알림 설정</p>
                                                </div>
                                            </div>
                                            <div class="flex items-start bg-white rounded-lg p-3">
                                                <i class="fas fa-credit-card text-pink-600 mt-1 mr-3"></i>
                                                <div>
                                                    <p class="font-semibold text-gray-900">간편 결제</p>
                                                    <p class="text-sm text-gray-600">앱 내 결제 또는 모바일 간편결제</p>
                                                </div>
                                            </div>
                                            <div class="flex items-start bg-white rounded-lg p-3">
                                                <i class="fas fa-shield-alt text-pink-600 mt-1 mr-3"></i>
                                                <div>
                                                    <p class="font-semibold text-gray-900">보험 청구</p>
                                                    <p class="text-sm text-gray-600">보험사 자동 청구 및 환급 처리</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 8: Insurance Processing -->
                    <div class="max-w-4xl mx-auto">
                        <div class="diagram-box flow-step">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center">
                                        <i class="fas fa-file-contract text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">보험 자동 처리</h3>
                                    <div class="bg-emerald-50 rounded-xl p-4">
                                        <div class="grid md:grid-cols-3 gap-4 mb-4">
                                            <div class="bg-white rounded-lg p-4 text-center">
                                                <i class="fas fa-file-upload text-emerald-600 text-2xl mb-2"></i>
                                                <p class="font-bold text-gray-900 mb-1">1. 자동 제출</p>
                                                <p class="text-xs text-gray-600">진료 기록 → 보험사</p>
                                            </div>
                                            <div class="bg-white rounded-lg p-4 text-center">
                                                <i class="fas fa-search-dollar text-emerald-600 text-2xl mb-2"></i>
                                                <p class="font-bold text-gray-900 mb-1">2. 심사 진행</p>
                                                <p class="text-xs text-gray-600">실시간 진행상황</p>
                                            </div>
                                            <div class="bg-white rounded-lg p-4 text-center">
                                                <i class="fas fa-money-check-alt text-emerald-600 text-2xl mb-2"></i>
                                                <p class="font-bold text-gray-900 mb-1">3. 환급 완료</p>
                                                <p class="text-xs text-gray-600">계좌로 자동 입금</p>
                                            </div>
                                        </div>
                                        <div class="bg-white rounded-lg p-3">
                                            <p class="text-sm text-gray-700">
                                                <i class="fas fa-info-circle text-emerald-600 mr-2"></i>
                                                <strong>평균 처리 시간:</strong> 3-5 영업일 (기존 2-3주 대비 획기적 단축)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 9: Health Status Monitoring -->
                    <div class="max-w-5xl mx-auto mt-16">
                        <div class="glass-card p-10 rounded-3xl border-gradient bg-gradient-to-br from-pink-50 via-purple-50 to-blue-50">
                            <div class="flex items-start gap-6">
                                <div class="flex-shrink-0">
                                    <div class="w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center animate-pulse">
                                        <i class="fas fa-heartbeat text-white text-2xl"></i>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <h3 class="text-2xl font-bold text-gray-900 mb-3">
                                        <span class="gradient-text">지능형 건강상태 모니터링</span>
                                    </h3>
                                    
                                    <!-- Main Feature -->
                                    <div class="bg-white/80 rounded-xl p-6 mb-4 shadow-lg">
                                        <div class="flex items-center mb-4">
                                            <i class="fas fa-chart-line text-purple-600 text-3xl mr-4"></i>
                                            <div>
                                                <h4 class="font-bold text-gray-900 text-lg">의료 기록 기반 건강 분석</h4>
                                                <p class="text-sm text-gray-600">AI가 당신의 의료 기록을 분석하여 건강 상태를 실시간으로 모니터링합니다</p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Feature Grid -->
                                    <div class="grid md:grid-cols-3 gap-4 mb-4">
                                        <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-gauge-high text-purple-600 text-2xl mr-3"></i>
                                                <h5 class="font-bold text-gray-900">종합 건강 점수</h5>
                                            </div>
                                            <p class="text-sm text-gray-700 mb-2">100점 만점 기준으로 현재 건강 상태를 한눈에 확인</p>
                                            <div class="flex items-baseline">
                                                <span class="text-3xl font-black gradient-text">75</span>
                                                <span class="text-lg text-gray-500 ml-1">/100</span>
                                            </div>
                                        </div>

                                        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-heart-pulse text-blue-600 text-2xl mr-3"></i>
                                                <h5 class="font-bold text-gray-900">주요 건강 지표</h5>
                                            </div>
                                            <p class="text-sm text-gray-700 mb-2">혈압, 심박수, BMI 등 중요 지표 추적</p>
                                            <div class="flex gap-2">
                                                <span class="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs font-bold">혈압</span>
                                                <span class="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs font-bold">심박수</span>
                                                <span class="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs font-bold">BMI</span>
                                            </div>
                                        </div>

                                        <div class="bg-gradient-to-br from-pink-50 to-pink-100 rounded-xl p-4 border border-pink-200">
                                            <div class="flex items-center mb-3">
                                                <i class="fas fa-exclamation-triangle text-pink-600 text-2xl mr-3"></i>
                                                <h5 class="font-bold text-gray-900">위험도 평가</h5>
                                            </div>
                                            <p class="text-sm text-gray-700 mb-2">당뇨, 고혈압, 심혈관 질환 위험도 분석</p>
                                            <div class="flex gap-2">
                                                <span class="px-2 py-1 bg-green-200 text-green-800 rounded text-xs font-bold">낮음</span>
                                                <span class="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs font-bold">보통</span>
                                                <span class="px-2 py-1 bg-red-200 text-red-800 rounded text-xs font-bold">높음</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Advanced Features -->
                                    <div class="grid md:grid-cols-2 gap-4 mb-4">
                                        <div class="bg-white/80 rounded-xl p-4 border-l-4 border-purple-500">
                                            <div class="flex items-start">
                                                <i class="fas fa-bullseye text-purple-600 text-2xl mr-3 mt-1"></i>
                                                <div class="flex-1">
                                                    <h5 class="font-bold text-gray-900 mb-2">건강 목표 관리</h5>
                                                    <p class="text-sm text-gray-700">체중 감량, 혈압 조절 등 개인별 건강 목표 설정 및 진행도 추적</p>
                                                    <div class="mt-2 h-2 bg-gray-200 rounded-full">
                                                        <div class="h-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style="width: 60%"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="bg-white/80 rounded-xl p-4 border-l-4 border-orange-500">
                                            <div class="flex items-start">
                                                <i class="fas fa-bell text-orange-600 text-2xl mr-3 mt-1"></i>
                                                <div class="flex-1">
                                                    <h5 class="font-bold text-gray-900 mb-2">스마트 건강 알림</h5>
                                                    <p class="text-sm text-gray-700">이상 징후 감지 시 즉시 알림 및 권장 조치 안내</p>
                                                    <div class="mt-2 flex gap-2">
                                                        <span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">
                                                            <i class="fas fa-exclamation-circle mr-1"></i>긴급
                                                        </span>
                                                        <span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                                                            <i class="fas fa-triangle-exclamation mr-1"></i>주의
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Health Trends -->
                                    <div class="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
                                        <div class="flex items-center justify-between mb-4">
                                            <div>
                                                <h5 class="font-bold text-lg mb-1"><i class="fas fa-chart-area mr-2"></i>건강 추이 분석</h5>
                                                <p class="text-sm opacity-90">시간에 따른 건강 지표 변화를 그래프로 시각화</p>
                                            </div>
                                            <div class="text-right">
                                                <div class="text-3xl font-black">📊</div>
                                            </div>
                                        </div>
                                        <div class="grid grid-cols-3 gap-4 text-center">
                                            <div class="bg-white/20 rounded-lg p-3">
                                                <div class="text-2xl font-bold">7일</div>
                                                <div class="text-xs opacity-90">최근 추이</div>
                                            </div>
                                            <div class="bg-white/20 rounded-lg p-3">
                                                <div class="text-2xl font-bold">30일</div>
                                                <div class="text-xs opacity-90">월간 분석</div>
                                            </div>
                                            <div class="bg-white/20 rounded-lg p-3">
                                                <div class="text-2xl font-bold">1년</div>
                                                <div class="text-xs opacity-90">연간 비교</div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Benefits -->
                                    <div class="mt-4 bg-white/60 rounded-xl p-4">
                                        <div class="grid md:grid-cols-2 gap-4">
                                            <div class="flex items-start">
                                                <i class="fas fa-check-circle text-green-600 text-xl mr-3 mt-1"></i>
                                                <div>
                                                    <p class="font-semibold text-gray-900">예방적 건강 관리</p>
                                                    <p class="text-sm text-gray-600">질병 발생 전 조기 발견 및 예방</p>
                                                </div>
                                            </div>
                                            <div class="flex items-start">
                                                <i class="fas fa-check-circle text-green-600 text-xl mr-3 mt-1"></i>
                                                <div>
                                                    <p class="font-semibold text-gray-900">맞춤형 건강 권장사항</p>
                                                    <p class="text-sm text-gray-600">개인별 건강 상태에 맞는 조언 제공</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Summary Box -->
                <div class="max-w-4xl mx-auto mt-16">
                    <div class="glass-card p-8 rounded-3xl border-gradient">
                        <h3 class="text-3xl font-black gradient-text mb-6 text-center">
                            <i class="fas fa-magic mr-3"></i>
                            모든 과정이 자동으로
                        </h3>
                        <div class="grid md:grid-cols-3 gap-6">
                            <div class="text-center">
                                <div class="text-4xl font-black text-purple-600 mb-2">1회</div>
                                <p class="text-gray-700">사용자 요청</p>
                            </div>
                            <div class="text-center">
                                <div class="text-4xl font-black text-pink-600 mb-2">9단계</div>
                                <p class="text-gray-700">자동 처리 + 건강 분석</p>
                            </div>
                            <div class="text-center">
                                <div class="text-4xl font-black text-blue-600 mb-2">0회</div>
                                <p class="text-gray-700">추가 입력</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Key Benefits -->
        <section class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl md:text-5xl font-black gradient-text mb-4">
                        왜 WeRuby AI인가?
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        기존 의료 서비스와 완전히 다른 경험을 제공합니다
                    </p>
                </div>

                <div class="grid md:grid-cols-2 gap-8">
                    <!-- Before -->
                    <div class="glass-card p-8 rounded-3xl border-2 border-red-200">
                        <div class="flex items-center mb-6">
                            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-times text-red-600 text-xl"></i>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-900">기존 방식</h3>
                        </div>
                        <ul class="space-y-4">
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">병원 전화로 예약 (대기 시간 10-30분)</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">수기로 문진표 작성</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">진료 기록 종이로 보관</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">처방전 약국 직접 제출</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">보험 청구 별도 서류 작성 (2-3주 소요)</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-minus-circle text-red-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">일정 관리 직접 수동 입력</span>
                            </li>
                        </ul>
                        <div class="mt-6 bg-red-50 rounded-xl p-4 text-center">
                            <p class="text-2xl font-black text-red-600 mb-1">평균 소요 시간</p>
                            <p class="text-4xl font-black text-red-700">2-3시간</p>
                        </div>
                    </div>

                    <!-- After -->
                    <div class="glass-card p-8 rounded-3xl border-2 border-green-200">
                        <div class="flex items-center mb-6">
                            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                                <i class="fas fa-check text-green-600 text-xl"></i>
                            </div>
                            <h3 class="text-2xl font-bold text-gray-900">WeRuby AI</h3>
                        </div>
                        <ul class="space-y-4">
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">채팅으로 즉시 예약 (5초)</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">AI가 자동으로 문진표 작성</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">진료 기록 자동 저장 및 관리</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">처방전 약국 자동 전송</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">보험 자동 청구 (3-5일 완료)</span>
                            </li>
                            <li class="flex items-start">
                                <i class="fas fa-check-circle text-green-500 mt-1 mr-3"></i>
                                <span class="text-gray-700">캘린더 자동 등록 및 알림</span>
                            </li>
                        </ul>
                        <div class="mt-6 bg-green-50 rounded-xl p-4 text-center">
                            <p class="text-2xl font-black text-green-600 mb-1">평균 소요 시간</p>
                            <p class="text-4xl font-black text-green-700">3-5분</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="py-20 gradient-bg">
            <div class="max-w-4xl mx-auto text-center px-4">
                <h2 class="text-4xl md:text-5xl font-black text-white mb-6">
                    지금 바로 경험해보세요
                </h2>
                <p class="text-xl text-white/90 mb-8">
                    단 한 번의 대화로 시작되는 완벽한 의료 서비스 여정
                </p>
                <a href="/register" class="inline-block btn-primary text-white px-12 py-5 rounded-2xl font-bold text-xl shadow-2xl hover:scale-105 transition-transform glow">
                    <i class="fas fa-rocket mr-3"></i>
                    무료로 시작하기
                    <i class="fas fa-arrow-right ml-3"></i>
                </a>
            </div>
        </section>

        <!-- Footer -->
        <footer class="bg-gray-900 text-white py-12">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div class="flex items-center justify-center space-x-3 mb-4">
                    <div class="bg-gradient-to-br from-purple-600 to-pink-600 p-3 rounded-xl">
                        <i class="fas fa-heartbeat text-white text-2xl"></i>
                    </div>
                    <span class="font-black text-2xl">WeRuby AI</span>
                </div>
                <p class="text-gray-400 mb-4">
                    AI 기술로 더 편리하고 스마트한 의료 서비스를 제공합니다
                </p>
                <p class="text-gray-500 text-sm">
                    &copy; 2026 WeRuby AI. All rights reserved.
                </p>
            </div>
        </footer>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    </body>
    </html>
  `)
})

// About page (Original home)
app.get('/about', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WeRuby AI - 스마트 병원 예약 플랫폼</title>
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
                        <span class="font-black text-2xl gradient-text">WeRuby AI</span>
                    </div>
                    <div class="hidden md:flex space-x-6 items-center">
                        <a href="/" class="text-gray-700 hover:text-purple-600 font-semibold transition">서비스 컨셉</a>
                        <a href="/about" class="text-purple-600 font-bold border-b-2 border-purple-600">소개</a>
                        <a href="#features" class="text-gray-700 hover:text-purple-600 font-semibold transition">기능소개</a>
                        <a href="https://weruby.co.kr" target="_blank" rel="noopener noreferrer" class="text-gray-700 hover:text-purple-600 font-semibold transition">
                            <i class="fas fa-building mr-1"></i>서비스 제공업체
                            <i class="fas fa-external-link-alt text-xs ml-1"></i>
                        </a>
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

                    <div class="flex flex-col sm:flex-row justify-center gap-6 mb-8 fade-in-delay-3">
                        <a href="/register" class="group btn-primary text-white px-12 py-5 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-purple-500/50 transition-all hover:scale-105">
                            <i class="fas fa-rocket mr-2 group-hover:rotate-12 transition-transform"></i>
                            지금 무료로 시작하기
                        </a>
                        <a href="#features" class="glass-card-dark text-white px-12 py-5 rounded-2xl font-bold text-xl hover:bg-white/20 transition-all hover:scale-105">
                            <i class="fas fa-play-circle mr-2"></i>
                            데모 보기
                        </a>
                    </div>

                    <!-- Quick Features Preview -->
                    <div class="max-w-5xl mx-auto mb-8 fade-in-delay-3" style="animation-delay: 0.7s">
                        <div class="glass-card-dark p-6 rounded-2xl">
                            <div class="grid md:grid-cols-5 gap-4">
                                <div class="text-center">
                                    <div class="text-3xl mb-2">🎤</div>
                                    <p class="text-white/90 text-sm font-semibold">음성 인식</p>
                                    <p class="text-white/60 text-xs mt-1">말로 예약하기</p>
                                </div>
                                <div class="text-center">
                                    <div class="text-3xl mb-2">🤖</div>
                                    <p class="text-white/90 text-sm font-semibold">AI 챗봇</p>
                                    <p class="text-white/60 text-xs mt-1">24시간 상담</p>
                                </div>
                                <div class="text-center">
                                    <div class="text-3xl mb-2">📱</div>
                                    <p class="text-white/90 text-sm font-semibold">모바일 최적화</p>
                                    <p class="text-white/60 text-xs mt-1">언제 어디서나</p>
                                </div>
                                <div class="text-center">
                                    <div class="text-3xl mb-2">🔒</div>
                                    <p class="text-white/90 text-sm font-semibold">보안 인증</p>
                                    <p class="text-white/60 text-xs mt-1">안전한 보호</p>
                                </div>
                                <div class="text-center">
                                    <div class="text-3xl mb-2">⚡</div>
                                    <p class="text-white/90 text-sm font-semibold">빠른 처리</p>
                                    <p class="text-white/60 text-xs mt-1">5초 이내 응답</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Use Case Scenarios -->
                    <div class="max-w-6xl mx-auto">
                        <!-- Section Title -->
                        <div class="text-center mb-6 fade-in-delay-3" style="animation-delay: 0.8s">
                            <h2 class="text-3xl font-black text-white mb-3">
                                <i class="fas fa-lightbulb text-yellow-300 mr-2"></i>
                                실제 사용 시나리오
                            </h2>
                            <p class="text-white/80 text-lg">WeRuby AI는 이렇게 당신을 도와드립니다</p>
                        </div>
                        <!-- Main Scenarios -->
                        <div class="grid md:grid-cols-3 gap-4 mb-4">
                            <!-- Scenario 1 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3">
                                <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-comments text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">간편한 대화형 예약</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "내일 오후에 내과 예약 가능해?"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    AI가 즉시 가능한 시간과 의사를 추천해드립니다
                                </p>
                            </div>

                            <!-- Scenario 2 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 0.2s">
                                <div class="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-notes-medical text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">스마트 증상 분석</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "머리가 아프고 열이 나요"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    AI가 증상을 분석하여 적합한 진료과를 추천합니다
                                </p>
                            </div>

                            <!-- Scenario 3 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 0.4s">
                                <div class="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-history text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">통합 건강 관리</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "지난 진료 기록 보여줘"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    모든 병원의 진료 기록을 한 곳에서 확인 가능
                                </p>
                            </div>
                        </div>

                        <!-- Additional Scenarios -->
                        <div class="grid md:grid-cols-3 gap-4 mb-6">
                            <!-- Scenario 4 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 0.6s">
                                <div class="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-bell text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">예약 알림 서비스</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "내일 진료 시간 알려줘"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    SMS와 앱 푸시로 예약 시간을 미리 알려드립니다
                                </p>
                            </div>

                            <!-- Scenario 5 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 0.8s">
                                <div class="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-pills text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">처방전 자동 관리</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "약 복용 시간이에요"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    처방받은 약의 복용 시간을 정확하게 알려드립니다
                                </p>
                            </div>

                            <!-- Scenario 6 -->
                            <div class="glass-card-dark p-6 rounded-2xl card-hover fade-in-delay-3" style="animation-delay: 1s">
                                <div class="w-14 h-14 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-4 mx-auto">
                                    <i class="fas fa-user-md text-white text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-bold text-white mb-3 text-center">맞춤 의사 추천</h3>
                                <div class="bg-white/10 rounded-xl p-4 mb-3">
                                    <p class="text-white/90 text-sm text-center italic">
                                        "허리 통증 전문의 찾아줘"
                                    </p>
                                </div>
                                <p class="text-white/70 text-sm text-center leading-relaxed">
                                    증상과 위치에 맞는 최적의 전문의를 찾아드립니다
                                </p>
                            </div>
                        </div>

                        <!-- Marketing Message & Stats -->
                        <div class="grid md:grid-cols-2 gap-4 mb-4">
                            <!-- Live Activity Box -->
                            <div class="glass-card-dark p-8 rounded-3xl fade-in-delay-3" style="animation-delay: 1.2s">
                                <div class="flex items-center justify-center gap-4 mb-6">
                                    <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                    <span class="text-white font-bold text-lg">지금 이 순간에도</span>
                                    <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse" style="animation-delay: 0.5s"></div>
                                </div>
                                <p class="text-3xl md:text-4xl font-black text-white mb-3 text-center">
                                    <span class="text-green-300">1,234명</span>의 사용자가
                                </p>
                                <p class="text-xl md:text-2xl font-bold text-white/90 mb-6 text-center">
                                    WeRuby AI로 병원 예약 중
                                </p>
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="bg-white/10 rounded-xl p-3 text-center">
                                        <p class="text-2xl font-black text-green-300">423</p>
                                        <p class="text-white/70 text-xs">오늘 예약 완료</p>
                                    </div>
                                    <div class="bg-white/10 rounded-xl p-3 text-center">
                                        <p class="text-2xl font-black text-blue-300">89</p>
                                        <p class="text-white/70 text-xs">현재 상담 중</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Performance Stats Box -->
                            <div class="glass-card-dark p-8 rounded-3xl fade-in-delay-3" style="animation-delay: 1.4s">
                                <h3 class="text-2xl font-black text-white mb-6 text-center">
                                    <i class="fas fa-chart-line text-yellow-300 mr-2"></i>
                                    검증된 성능
                                </h3>
                                <div class="space-y-4">
                                    <div class="flex items-center justify-between bg-white/10 rounded-xl p-4">
                                        <div class="flex items-center gap-3">
                                            <i class="fas fa-clock text-green-300 text-xl"></i>
                                            <span class="text-white font-semibold">평균 예약 시간</span>
                                        </div>
                                        <span class="text-2xl font-black text-green-300">2분 30초</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-white/10 rounded-xl p-4">
                                        <div class="flex items-center gap-3">
                                            <i class="fas fa-star text-yellow-300 text-xl"></i>
                                            <span class="text-white font-semibold">고객 만족도</span>
                                        </div>
                                        <span class="text-2xl font-black text-yellow-300">98.5%</span>
                                    </div>
                                    <div class="flex items-center justify-between bg-white/10 rounded-xl p-4">
                                        <div class="flex items-center gap-3">
                                            <i class="fas fa-shield-alt text-blue-300 text-xl"></i>
                                            <span class="text-white font-semibold">보안 등급</span>
                                        </div>
                                        <span class="text-2xl font-black text-blue-300">AAA</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Key Benefits Grid -->
                        <div class="grid md:grid-cols-4 gap-4 mb-6">
                            <div class="glass-card-dark p-6 rounded-2xl text-center fade-in-delay-3" style="animation-delay: 1.6s">
                                <div class="text-4xl font-black text-white mb-2">50K+</div>
                                <div class="text-white/70 text-sm font-semibold">누적 예약 건수</div>
                                <div class="text-green-300 text-xs mt-2">↑ 전월 대비 23%</div>
                            </div>
                            <div class="glass-card-dark p-6 rounded-2xl text-center fade-in-delay-3" style="animation-delay: 1.7s">
                                <div class="text-4xl font-black text-white mb-2">3,000+</div>
                                <div class="text-white/70 text-sm font-semibold">제휴 병원</div>
                                <div class="text-blue-300 text-xs mt-2">전국 네트워크</div>
                            </div>
                            <div class="glass-card-dark p-6 rounded-2xl text-center fade-in-delay-3" style="animation-delay: 1.8s">
                                <div class="text-4xl font-black text-white mb-2">24/7</div>
                                <div class="text-white/70 text-sm font-semibold">AI 상담 가능</div>
                                <div class="text-purple-300 text-xs mt-2">연중무휴</div>
                            </div>
                            <div class="glass-card-dark p-6 rounded-2xl text-center fade-in-delay-3" style="animation-delay: 1.9s">
                                <div class="text-4xl font-black text-white mb-2">5초</div>
                                <div class="text-white/70 text-sm font-semibold">평균 응답 시간</div>
                                <div class="text-yellow-300 text-xs mt-2">초고속 처리</div>
                            </div>
                        </div>

                        <!-- Why Choose Us -->
                        <div class="glass-card-dark p-8 rounded-3xl text-center fade-in-delay-3" style="animation-delay: 2s">
                            <h3 class="text-2xl font-black text-white mb-6">
                                <i class="fas fa-award text-yellow-300 mr-2"></i>
                                WeRuby AI를 선택해야 하는 이유
                            </h3>
                            <div class="grid md:grid-cols-3 gap-6">
                                <div class="text-left">
                                    <div class="flex items-start gap-3 mb-3">
                                        <div class="flex-shrink-0 w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                                            <i class="fas fa-check text-green-300"></i>
                                        </div>
                                        <div>
                                            <h4 class="text-white font-bold mb-1">전화 대기 없음</h4>
                                            <p class="text-white/70 text-sm">복잡한 전화 통화 없이 AI와 대화만으로 즉시 예약</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-left">
                                    <div class="flex items-start gap-3 mb-3">
                                        <div class="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                            <i class="fas fa-check text-blue-300"></i>
                                        </div>
                                        <div>
                                            <h4 class="text-white font-bold mb-1">병원 비교 자동화</h4>
                                            <p class="text-white/70 text-sm">여러 병원을 일일이 검색할 필요 없이 최적의 병원 추천</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-left">
                                    <div class="flex items-start gap-3 mb-3">
                                        <div class="flex-shrink-0 w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                            <i class="fas fa-check text-purple-300"></i>
                                        </div>
                                        <div>
                                            <h4 class="text-white font-bold mb-1">의료 기록 통합</h4>
                                            <p class="text-white/70 text-sm">흩어진 병원 기록을 한 곳에서 체계적으로 관리</p>
                                        </div>
                                    </div>
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
                        WeRuby AI의 특별함
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
                        💎 WeRuby AI의 장점
                    </span>
                    <h2 class="text-5xl font-black text-gray-900 mb-6 gradient-text">
                        왜 WeRuby AI인가?
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
                        WeRuby AI를 사용하는 고객들의 실제 후기입니다
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
                        WeRuby AI에 대해 자주 묻는 질문들을 확인해보세요
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
                                WeRuby AI는 무료인가요?
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
                            WeRuby AI는 최신 의료 데이터와 병원 정보를 기반으로 증상에 맞는 병원과 의사를 추천합니다. 
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
                            WeRuby AI 서비스를<br>
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
                        WeRuby AI와 함께<br class="md:hidden">
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
                            <span class="font-black text-2xl">WeRuby AI</span>
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
                        &copy; 2026 WeRuby AI. All rights reserved. Made with <i class="fas fa-heart text-red-500"></i> in Korea
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
        <title>사용자 관리 - WeRuby AI</title>
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
                        <span class="font-black text-2xl gradient-text">WeRuby AI</span>
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
        <title>대시보드 - WeRuby AI</title>
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
                        <span class="font-black text-2xl gradient-text">WeRuby AI</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        <button id="aiChatBtn" class="btn-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg glow hover:scale-105 transition-transform">
                            <i class="fas fa-robot mr-2"></i>AI 어시스턴트
                        </button>
                        <a href="https://weruby.co.kr" target="_blank" rel="noopener noreferrer" class="glass-card px-4 py-2 rounded-xl text-gray-700 font-semibold hover:bg-purple-50 transition">
                            <i class="fas fa-building mr-2"></i>서비스 제공업체
                            <i class="fas fa-external-link-alt text-xs ml-1"></i>
                        </a>
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
            <div class="grid md:grid-cols-5 gap-6 mb-8">
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
                            <p class="text-gray-600 text-sm font-semibold mb-2">보험 청구</p>
                            <p class="text-4xl font-black gradient-text" id="insuranceClaimsCount">0</p>
                        </div>
                        <div class="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-shield-alt text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-indigo-600 font-semibold"><i class="fas fa-hourglass-half mr-1"></i>처리 중</span>
                        <span class="text-gray-500 ml-2">건</span>
                    </div>
                </div>

                <div class="glass-card rounded-2xl p-6 card-hover border-gradient">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-gray-600 text-sm font-semibold mb-2">건강 점수</p>
                            <p class="text-4xl font-black gradient-text" id="healthScoreCount">--</p>
                        </div>
                        <div class="bg-gradient-to-br from-pink-500 to-rose-600 p-4 rounded-2xl shadow-lg">
                            <i class="fas fa-heartbeat text-white text-3xl"></i>
                        </div>
                    </div>
                    <div class="mt-4 flex items-center text-sm">
                        <span class="text-pink-600 font-semibold" id="healthLevelSummary"><i class="fas fa-check mr-1"></i>--</span>
                        <span class="text-gray-500 ml-2">상태</span>
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
                    <nav class="flex overflow-x-auto">
                        <button class="tab-btn px-8 py-5 font-bold text-purple-600 border-b-4 border-purple-600 bg-white/50" data-tab="appointments">
                            <i class="fas fa-calendar-alt mr-2"></i>예약 관리
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="health">
                            <i class="fas fa-heartbeat mr-2"></i>건강상태
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="records">
                            <i class="fas fa-file-medical-alt mr-2"></i>의료 기록
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="prescriptions">
                            <i class="fas fa-prescription mr-2"></i>처방전
                        </button>
                        <button class="tab-btn px-8 py-5 font-bold text-gray-600 hover:text-purple-600 hover:bg-white/30 transition" data-tab="insurance">
                            <i class="fas fa-shield-alt mr-2"></i>보험
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

                    <!-- Health Status Tab -->
                    <div id="tab-health" class="tab-content hidden">
                        <div class="mb-8">
                            <h2 class="text-3xl font-black gradient-text mb-2">나의 건강상태</h2>
                            <p class="text-gray-600">의료 기록을 기반으로 한 건강 분석</p>
                        </div>

                        <!-- Health Score Card -->
                        <div id="healthScoreCard" class="glass-card rounded-2xl p-8 mb-8 bg-gradient-to-br from-blue-50 to-purple-50">
                            <div class="flex items-center justify-between">
                                <div class="flex-1">
                                    <h3 class="text-xl font-bold text-gray-800 mb-2">종합 건강 점수</h3>
                                    <div class="flex items-baseline gap-4">
                                        <div class="text-6xl font-black gradient-text" id="overallScore">--</div>
                                        <div class="text-2xl text-gray-500">/100</div>
                                    </div>
                                    <div class="mt-4">
                                        <span id="healthLevelBadge" class="px-4 py-2 rounded-full text-sm font-bold"></span>
                                    </div>
                                </div>
                                <div class="w-32 h-32 relative">
                                    <svg class="transform -rotate-90 w-32 h-32">
                                        <circle cx="64" cy="64" r="56" stroke="#e5e7eb" stroke-width="8" fill="none"></circle>
                                        <circle id="scoreCircle" cx="64" cy="64" r="56" stroke="url(#gradient)" stroke-width="8" fill="none" 
                                                stroke-dasharray="351.86" stroke-dashoffset="351.86" stroke-linecap="round"></circle>
                                        <defs>
                                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
                                                <stop offset="100%" style="stop-color:#EC4899;stop-opacity:1" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <!-- Health Summary -->
                        <div id="healthSummaryCard" class="glass-card rounded-2xl p-6 mb-8"></div>

                        <!-- Vital Signs Grid -->
                        <div class="mb-8">
                            <h3 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-heartbeat text-red-500 mr-2"></i>주요 건강 지표</h3>
                            <div class="grid md:grid-cols-3 gap-6" id="vitalSignsGrid"></div>
                        </div>

                        <!-- Risk Assessment -->
                        <div class="mb-8">
                            <h3 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>건강 위험 평가</h3>
                            <div class="grid md:grid-cols-3 gap-6" id="riskAssessmentGrid"></div>
                        </div>

                        <!-- Health Alerts -->
                        <div class="mb-8" id="healthAlertsSection">
                            <h3 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-bell text-orange-500 mr-2"></i>건강 알림</h3>
                            <div id="healthAlertsList"></div>
                        </div>

                        <!-- Health Goals -->
                        <div class="mb-8">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-xl font-bold text-gray-800"><i class="fas fa-bullseye text-green-500 mr-2"></i>건강 목표</h3>
                                <button id="newGoalBtn" class="btn-primary text-white px-4 py-2 rounded-lg font-bold text-sm">
                                    <i class="fas fa-plus mr-1"></i>새 목표
                                </button>
                            </div>
                            <div id="healthGoalsList" class="space-y-4"></div>
                        </div>

                        <!-- Health Trends Chart -->
                        <div class="glass-card rounded-2xl p-6">
                            <h3 class="text-xl font-bold text-gray-800 mb-4"><i class="fas fa-chart-line text-blue-500 mr-2"></i>건강 추이</h3>
                            <div class="mb-4">
                                <select id="trendMetricSelect" class="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
                                    <option value="weight">체중</option>
                                    <option value="blood_pressure_systolic">수축기 혈압</option>
                                    <option value="heart_rate">심박수</option>
                                </select>
                            </div>
                            <div id="healthTrendsChart" class="h-64"></div>
                        </div>
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

                    <!-- Insurance Tab -->
                    <div id="tab-insurance" class="tab-content hidden">
                        <div class="mb-8">
                            <h2 class="text-3xl font-black gradient-text mb-2">보험 관리</h2>
                            <p class="text-gray-600">가입 보험과 청구 내역을 관리하세요</p>
                        </div>

                        <!-- Insurance Summary -->
                        <div class="grid md:grid-cols-4 gap-6 mb-8">
                            <div class="glass-card rounded-xl p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-gray-600 text-sm font-semibold">가입 보험</span>
                                    <i class="fas fa-shield-alt text-blue-500"></i>
                                </div>
                                <p class="text-3xl font-black text-gray-900" id="insurancePoliciesCount">0</p>
                                <p class="text-xs text-gray-500 mt-2">활성 보험</p>
                            </div>
                            <div class="glass-card rounded-xl p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-gray-600 text-sm font-semibold">총 청구액</span>
                                    <i class="fas fa-receipt text-green-500"></i>
                                </div>
                                <p class="text-3xl font-black text-gray-900" id="insuranceTotalClaimed">0원</p>
                                <p class="text-xs text-gray-500 mt-2">누적 청구</p>
                            </div>
                            <div class="glass-card rounded-xl p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-gray-600 text-sm font-semibold">지급 완료</span>
                                    <i class="fas fa-check-circle text-purple-500"></i>
                                </div>
                                <p class="text-3xl font-black text-gray-900" id="insuranceTotalPaid">0원</p>
                                <p class="text-xs text-gray-500 mt-2">받은 금액</p>
                            </div>
                            <div class="glass-card rounded-xl p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-gray-600 text-sm font-semibold">처리 중</span>
                                    <i class="fas fa-hourglass-half text-orange-500"></i>
                                </div>
                                <p class="text-3xl font-black text-gray-900" id="insurancePendingCount">0건</p>
                                <p class="text-xs text-gray-500 mt-2">심사 진행</p>
                            </div>
                        </div>

                        <!-- Insurance Tabs -->
                        <div class="mb-6">
                            <div class="flex space-x-4 border-b border-gray-200">
                                <button class="insurance-sub-tab px-6 py-3 font-bold text-purple-600 border-b-2 border-purple-600" data-insurance-tab="policies">
                                    <i class="fas fa-file-contract mr-2"></i>가입 보험
                                </button>
                                <button class="insurance-sub-tab px-6 py-3 font-semibold text-gray-600 hover:text-purple-600 transition" data-insurance-tab="claims">
                                    <i class="fas fa-file-invoice-dollar mr-2"></i>청구 내역
                                </button>
                                <button class="insurance-sub-tab px-6 py-3 font-semibold text-gray-600 hover:text-purple-600 transition" data-insurance-tab="receipts">
                                    <i class="fas fa-receipt mr-2"></i>영수증 관리
                                </button>
                            </div>
                        </div>

                        <!-- Policies Sub-tab -->
                        <div id="insurance-sub-policies" class="insurance-sub-content">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-xl font-bold text-gray-900">가입 보험 목록</h3>
                                <button id="addPolicyBtn" class="btn-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-transform">
                                    <i class="fas fa-plus mr-2"></i>보험 추가
                                </button>
                            </div>
                            <div id="insurancePoliciesList"></div>
                        </div>

                        <!-- Claims Sub-tab -->
                        <div id="insurance-sub-claims" class="insurance-sub-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-xl font-bold text-gray-900">보험 청구 내역</h3>
                                <button id="addClaimBtn" class="btn-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-transform">
                                    <i class="fas fa-plus mr-2"></i>청구 신청
                                </button>
                            </div>
                            <div id="insuranceClaimsList"></div>
                        </div>

                        <!-- Receipts Sub-tab -->
                        <div id="insurance-sub-receipts" class="insurance-sub-content hidden">
                            <div class="flex justify-between items-center mb-6">
                                <h3 class="text-xl font-bold text-gray-900">의료비 영수증</h3>
                                <button id="addReceiptBtn" class="btn-primary text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg hover:scale-105 transition-transform">
                                    <i class="fas fa-plus mr-2"></i>영수증 추가
                                </button>
                            </div>
                            <div id="insuranceReceiptsList"></div>
                        </div>
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
                                안녕하세요! 저는 WeRuby AI 어시스턴트입니다. 
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
