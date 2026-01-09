-- Insurance policies table (사용자의 보험 정보)
CREATE TABLE IF NOT EXISTS insurance_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  insurance_company TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  policy_type TEXT CHECK(policy_type IN ('medical', 'dental', 'vision', 'long_term_care', 'critical_illness', 'accident')) NOT NULL,
  policy_name TEXT NOT NULL,
  coverage_amount INTEGER, -- 보장 금액
  premium_amount INTEGER, -- 보험료
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT CHECK(status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Insurance claims table (실손보험 청구)
CREATE TABLE IF NOT EXISTS insurance_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  policy_id INTEGER NOT NULL,
  medical_record_id INTEGER,
  claim_number TEXT UNIQUE NOT NULL,
  claim_date TEXT NOT NULL,
  treatment_date TEXT NOT NULL,
  hospital_name TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment_type TEXT NOT NULL,
  total_amount INTEGER NOT NULL, -- 총 진료비
  claimed_amount INTEGER NOT NULL, -- 청구 금액
  approved_amount INTEGER, -- 승인 금액
  paid_amount INTEGER, -- 지급 금액
  status TEXT CHECK(status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'paid')) DEFAULT 'pending',
  submission_date TEXT, -- 제출 일자
  approval_date TEXT, -- 승인 일자
  payment_date TEXT, -- 지급 일자
  rejection_reason TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (policy_id) REFERENCES insurance_policies(id),
  FOREIGN KEY (medical_record_id) REFERENCES medical_records(id)
);

-- Medical receipts table (영수증 관리)
CREATE TABLE IF NOT EXISTS medical_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  medical_record_id INTEGER,
  claim_id INTEGER,
  receipt_number TEXT NOT NULL,
  receipt_date TEXT NOT NULL,
  hospital_name TEXT NOT NULL,
  treatment_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('card', 'cash', 'transfer', 'insurance')),
  receipt_image_url TEXT, -- 영수증 이미지 URL
  is_claimed BOOLEAN DEFAULT 0, -- 보험 청구 여부
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
  FOREIGN KEY (claim_id) REFERENCES insurance_claims(id)
);

-- Insurance claim documents table (청구 서류)
CREATE TABLE IF NOT EXISTS insurance_claim_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL,
  document_type TEXT CHECK(document_type IN ('receipt', 'diagnosis', 'prescription', 'medical_certificate', 'other')) NOT NULL,
  document_name TEXT NOT NULL,
  document_url TEXT NOT NULL,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES insurance_claims(id)
);

-- Users table already has address, password, status columns from previous migrations

-- Create indexes for insurance tables
CREATE INDEX IF NOT EXISTS idx_insurance_policies_user_id ON insurance_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_status ON insurance_policies(status);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_user_id ON insurance_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy_id ON insurance_claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_medical_receipts_user_id ON medical_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_receipts_claim_id ON medical_receipts(claim_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_documents_claim_id ON insurance_claim_documents(claim_id);
