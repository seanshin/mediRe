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
