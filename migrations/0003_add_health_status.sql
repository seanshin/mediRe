-- Health Status Tracking Tables
-- Stores comprehensive health status based on medical records

-- Health Status Main Table
CREATE TABLE IF NOT EXISTS health_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  status_date DATE NOT NULL,
  overall_score INTEGER NOT NULL CHECK(overall_score >= 0 AND overall_score <= 100),
  health_level TEXT NOT NULL CHECK(health_level IN ('excellent', 'good', 'fair', 'poor', 'critical')),
  
  -- Vital Signs
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  heart_rate INTEGER,
  body_temperature REAL,
  weight REAL,
  height REAL,
  bmi REAL,
  
  -- Health Metrics
  chronic_conditions_count INTEGER DEFAULT 0,
  active_medications_count INTEGER DEFAULT 0,
  recent_visits_count INTEGER DEFAULT 0,
  preventive_care_score INTEGER DEFAULT 0,
  
  -- Risk Assessment
  diabetes_risk TEXT CHECK(diabetes_risk IN ('low', 'medium', 'high', 'diagnosed')),
  hypertension_risk TEXT CHECK(hypertension_risk IN ('low', 'medium', 'high', 'diagnosed')),
  cardiovascular_risk TEXT CHECK(cardiovascular_risk IN ('low', 'medium', 'high')),
  
  -- Analysis Summary
  health_summary TEXT,
  recommendations TEXT,
  alerts TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Health Trends (for tracking changes over time)
CREATE TABLE IF NOT EXISTS health_trends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metric_unit TEXT,
  recorded_date DATE NOT NULL,
  source TEXT CHECK(source IN ('medical_record', 'self_reported', 'device', 'calculated')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Health Goals
CREATE TABLE IF NOT EXISTS health_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_type TEXT NOT NULL CHECK(goal_type IN ('weight', 'blood_pressure', 'exercise', 'medication_adherence', 'diet', 'sleep', 'custom')),
  goal_title TEXT NOT NULL,
  goal_description TEXT,
  target_value TEXT,
  current_value TEXT,
  start_date DATE NOT NULL,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'achieved', 'abandoned', 'postponed')),
  progress_percentage INTEGER DEFAULT 0 CHECK(progress_percentage >= 0 AND progress_percentage <= 100),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Health Alerts
CREATE TABLE IF NOT EXISTS health_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  alert_type TEXT NOT NULL CHECK(alert_type IN ('critical', 'warning', 'info', 'reminder')),
  alert_category TEXT NOT NULL CHECK(alert_category IN ('vital_signs', 'medication', 'appointment', 'test_result', 'risk_factor', 'goal', 'general')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_required TEXT,
  action_url TEXT,
  priority INTEGER DEFAULT 0,
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_health_status_user_id ON health_status(user_id);
CREATE INDEX IF NOT EXISTS idx_health_status_date ON health_status(status_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_trends_user_id ON health_trends(user_id);
CREATE INDEX IF NOT EXISTS idx_health_trends_date ON health_trends(recorded_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_trends_metric ON health_trends(metric_name, user_id);
CREATE INDEX IF NOT EXISTS idx_health_goals_user_id ON health_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_health_goals_status ON health_goals(status);
CREATE INDEX IF NOT EXISTS idx_health_alerts_user_id ON health_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_health_alerts_unread ON health_alerts(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_health_alerts_unresolved ON health_alerts(user_id, is_resolved) WHERE is_resolved = FALSE;
