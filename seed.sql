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
