-- Insert sample hospitals
INSERT OR IGNORE INTO hospitals (id, name, address, phone, specialties, operating_hours, rating) VALUES 
  (1, '서울대학교병원', '서울특별시 종로구 대학로 103', '02-2072-2114', '["내과", "외과", "정형외과", "신경과", "소아과"]', '{"weekday": "08:00-18:00", "saturday": "08:00-13:00", "sunday": "closed"}', 4.8),
  (2, '삼성서울병원', '서울특별시 강남구 일원로 81', '02-3410-2114', '["내과", "심장내과", "종양내과", "외과", "정형외과"]', '{"weekday": "08:00-17:30", "saturday": "08:00-12:30", "sunday": "closed"}', 4.7),
  (3, '아산병원', '서울특별시 송파구 올림픽로43길 88', '02-3010-3114', '["내과", "외과", "신경외과", "소아과", "산부인과"]', '{"weekday": "08:00-18:00", "saturday": "08:00-13:00", "sunday": "closed"}', 4.9);

-- Insert sample doctors
INSERT OR IGNORE INTO doctors (id, hospital_id, name, specialty, experience_years, education, available_days, available_hours, rating) VALUES 
  (1, 1, '김민수', '내과', 15, '서울대학교 의과대학', '["monday", "tuesday", "wednesday", "friday"]', '{"morning": "09:00-12:00", "afternoon": "14:00-17:00"}', 4.9),
  (2, 1, '이지은', '소아과', 10, '서울대학교 의과대학', '["monday", "wednesday", "thursday", "friday"]', '{"morning": "09:00-12:00", "afternoon": "14:00-17:00"}', 4.8),
  (3, 2, '박준호', '심장내과', 20, '연세대학교 의과대학', '["tuesday", "wednesday", "thursday", "friday"]', '{"morning": "09:00-12:00", "afternoon": "14:00-16:00"}', 4.9),
  (4, 2, '최서연', '정형외과', 12, '고려대학교 의과대학', '["monday", "tuesday", "thursday", "friday"]', '{"morning": "09:00-12:00", "afternoon": "14:00-17:00"}', 4.7),
  (5, 3, '정대영', '신경외과', 18, '서울대학교 의과대학', '["monday", "wednesday", "thursday", "friday"]', '{"morning": "09:00-12:00", "afternoon": "13:00-16:00"}', 4.8);

-- Insert sample user
INSERT OR IGNORE INTO users (id, name, email, phone, birth_date, gender, blood_type, allergies) VALUES 
  (1, '홍길동', 'hong@example.com', '010-1234-5678', '1990-05-15', 'male', 'A+', '페니실린, 땅콩'),
  (2, '김영희', 'kim@example.com', '010-2345-6789', '1985-08-22', 'female', 'O+', '없음'),
  (3, '이철수', 'lee@example.com', '010-3456-7890', '1995-03-10', 'male', 'B+', '고양이 털');

-- Insert sample appointments
INSERT OR IGNORE INTO appointments (user_id, hospital_id, doctor_id, appointment_date, appointment_time, status, symptoms) VALUES 
  (1, 1, 1, '2026-01-15', '10:00', 'scheduled', '두통과 어지러움'),
  (1, 2, 3, '2026-01-20', '14:00', 'scheduled', '가슴 통증'),
  (2, 1, 2, '2026-01-12', '11:00', 'completed', '아이 감기 증상'),
  (3, 3, 5, '2026-01-18', '15:00', 'scheduled', '허리 통증');

-- Insert sample medical records
INSERT OR IGNORE INTO medical_records (user_id, appointment_id, doctor_id, hospital_id, visit_date, diagnosis, symptoms, treatment) VALUES 
  (2, 3, 2, 1, '2026-01-12', '급성 상기도 감염', '기침, 콧물, 미열', '충분한 휴식, 수분 섭취, 해열제 처방');

-- Insert sample prescriptions
INSERT OR IGNORE INTO prescriptions (user_id, medical_record_id, doctor_id, hospital_id, prescription_date, medications, dosage_instructions, duration_days, status) VALUES 
  (2, 1, 2, 1, '2026-01-12', '[{"name": "타이레놀", "dosage": "500mg"}, {"name": "콧물약", "dosage": "1정"}]', '타이레놀: 하루 3회 식후 복용\n콧물약: 하루 2회 아침/저녁 복용', 5, 'active');

-- Insert sample insurance policies
INSERT OR IGNORE INTO insurance_policies (id, user_id, insurance_company, policy_number, policy_type, policy_name, coverage_amount, premium_amount, start_date, end_date, status) VALUES 
  (1, 1, '삼성화재', 'SS-2024-001234', 'medical', '실손의료보험', 50000000, 120000, '2024-01-01', '2029-12-31', 'active'),
  (2, 1, '현대해상', 'HD-2023-005678', 'critical_illness', '암보험', 100000000, 80000, '2023-03-15', '2033-03-14', 'active'),
  (3, 2, 'KB손해보험', 'KB-2024-002345', 'medical', '실손의료보험', 30000000, 95000, '2024-06-01', '2029-05-31', 'active');

-- Insert sample insurance claims
INSERT OR IGNORE INTO insurance_claims (id, user_id, policy_id, medical_record_id, claim_number, claim_date, treatment_date, hospital_name, diagnosis, treatment_type, total_amount, claimed_amount, approved_amount, paid_amount, status, submission_date, approval_date, payment_date) VALUES 
  (1, 1, 1, NULL, 'CLM1704067200000', '2026-01-05', '2026-01-05', '서울대학교병원', '급성 장염', '외래 진료 및 약물 치료', 85000, 68000, 68000, 68000, 'paid', '2026-01-06', '2026-01-08', '2026-01-10'),
  (2, 1, 1, NULL, 'CLM1704153600000', '2026-01-12', '2026-01-11', '삼성서울병원', '급성 기관지염', '외래 진료, 흉부 X-ray', 125000, 100000, 95000, 95000, 'paid', '2026-01-12', '2026-01-14', '2026-01-16'),
  (3, 2, 3, 1, 'CLM1704326400000', '2026-01-15', '2026-01-12', '서울대학교병원', '급성 상기도 감염', '외래 진료 및 약물 치료', 55000, 44000, NULL, NULL, 'under_review', '2026-01-15', NULL, NULL);

-- Insert sample medical receipts
INSERT OR IGNORE INTO medical_receipts (id, user_id, medical_record_id, claim_id, receipt_number, receipt_date, hospital_name, treatment_type, amount, payment_method, is_claimed) VALUES 
  (1, 1, NULL, 1, 'RCP-20260105-001', '2026-01-05', '서울대학교병원', '외래 진료', 85000, 'card', 1),
  (2, 1, NULL, 2, 'RCP-20260111-002', '2026-01-11', '삼성서울병원', '외래 진료 + 검사', 125000, 'card', 1),
  (3, 2, 1, 3, 'RCP-20260112-003', '2026-01-12', '서울대학교병원', '외래 진료', 55000, 'card', 1),
  (4, 1, NULL, NULL, 'RCP-20260113-004', '2026-01-13', '강남세브란스병원', '물리치료', 35000, 'card', 0);

-- Insert sample health status
INSERT OR IGNORE INTO health_status (id, user_id, status_date, overall_score, health_level, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, body_temperature, weight, height, bmi, chronic_conditions_count, active_medications_count, recent_visits_count, preventive_care_score, diabetes_risk, hypertension_risk, cardiovascular_risk, health_summary, recommendations, alerts) VALUES 
  (1, 1, '2026-01-09', 75, 'good', 128, 82, 72, 36.5, 72.5, 175, 23.7, 0, 1, 2, 80, 'low', 'medium', 'low', '전반적으로 양호한 건강 상태입니다. 혈압이 약간 높은 편이므로 주의가 필요합니다.', '규칙적인 운동, 저염식 식단, 스트레스 관리를 권장합니다. 3개월 후 재검진을 받으시기 바랍니다.', '혈압 수치가 경계선입니다. 정기적인 모니터링이 필요합니다.'),
  (2, 2, '2026-01-12', 85, 'excellent', 118, 75, 68, 36.4, 58.0, 162, 22.1, 0, 1, 1, 90, 'low', 'low', 'low', '매우 건강한 상태입니다. 정기적인 건강검진을 통해 현재 상태를 유지하세요.', '현재의 생활 습관을 유지하고, 연 1회 종합검진을 권장합니다.', NULL),
  (3, 3, '2026-01-09', 70, 'good', 135, 88, 76, 36.6, 78.0, 172, 26.4, 1, 0, 1, 70, 'medium', 'high', 'medium', '혈압과 BMI가 정상 범위를 초과합니다. 생활습관 개선이 필요합니다.', '체중 감량(목표: 5-7kg), 유산소 운동 주 3회 이상, 저염·저지방 식단을 권장합니다. 1개월 후 재검진을 받으세요.', '고혈압 위험이 높습니다. 즉시 생활습관 개선과 정기 모니터링이 필요합니다.');

-- Insert sample health trends
INSERT OR IGNORE INTO health_trends (user_id, metric_name, metric_value, metric_unit, recorded_date, source) VALUES 
  (1, 'weight', 73.2, 'kg', '2026-01-01', 'medical_record'),
  (1, 'weight', 72.8, 'kg', '2026-01-05', 'medical_record'),
  (1, 'weight', 72.5, 'kg', '2026-01-09', 'medical_record'),
  (1, 'blood_pressure_systolic', 130, 'mmHg', '2026-01-01', 'medical_record'),
  (1, 'blood_pressure_systolic', 128, 'mmHg', '2026-01-09', 'medical_record'),
  (1, 'heart_rate', 74, 'bpm', '2026-01-01', 'medical_record'),
  (1, 'heart_rate', 72, 'bpm', '2026-01-09', 'medical_record'),
  (2, 'weight', 58.5, 'kg', '2026-01-05', 'medical_record'),
  (2, 'weight', 58.0, 'kg', '2026-01-12', 'medical_record'),
  (3, 'weight', 79.5, 'kg', '2026-01-01', 'medical_record'),
  (3, 'weight', 78.0, 'kg', '2026-01-09', 'medical_record');

-- Insert sample health goals
INSERT OR IGNORE INTO health_goals (user_id, goal_type, goal_title, goal_description, target_value, current_value, start_date, target_date, status, progress_percentage) VALUES 
  (1, 'blood_pressure', '혈압 정상화', '수축기 혈압을 120mmHg 이하로 낮추기', '120 mmHg', '128 mmHg', '2026-01-01', '2026-03-31', 'active', 60),
  (1, 'weight', '체중 감량', '건강한 체중 70kg 달성', '70 kg', '72.5 kg', '2026-01-01', '2026-06-30', 'active', 45),
  (2, 'exercise', '규칙적인 운동', '주 3회 이상 30분 이상 유산소 운동', '주 3회', '주 4회', '2026-01-01', '2026-12-31', 'active', 85),
  (3, 'weight', '체중 감량', '표준 체중 72kg 달성', '72 kg', '78 kg', '2026-01-01', '2026-07-31', 'active', 25);

-- Insert sample health alerts
INSERT OR IGNORE INTO health_alerts (user_id, alert_type, alert_category, title, message, action_required, priority, is_read, is_resolved) VALUES 
  (1, 'warning', 'vital_signs', '혈압 주의', '혈압이 경계 수치입니다. 정기적인 모니터링이 필요합니다.', '1주일 내 재측정 및 의사 상담', 2, 0, 0),
  (1, 'info', 'appointment', '다가오는 예약', '1월 15일 10:00 서울대학교병원 예약이 있습니다.', '예약 시간 확인', 1, 0, 0),
  (3, 'critical', 'risk_factor', '고혈압 위험', '혈압이 높고 BMI가 과체중 범위입니다. 즉시 조치가 필요합니다.', '생활습관 개선 및 전문의 상담', 3, 0, 0),
  (2, 'reminder', 'medication', '처방약 복용 알림', '타이레놀과 콧물약 복용 시간입니다.', '처방전에 따라 복용', 1, 1, 1);
