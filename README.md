# WeRuby AI - 스마트 병원 예약 플랫폼

## 프로젝트 개요

WeRuby AI는 AI 기술을 활용한 혁신적인 병원 예약 및 의료 관리 플랫폼입니다. 음성 또는 채팅으로 AI 어시스턴트와 대화하며 간편하게 병원 예약을 하고, 의료 기록과 처방전을 체계적으로 관리할 수 있습니다.

## 🎯 WeRuby AI 이름의 의미

**WeRuby**는 'We'와 'Ruby(루비)'의 합성어입니다:

- **We (우리)**: 환자, 의료진, AI가 함께하는 협력적인 의료 생태계를 의미합니다. 의료 서비스는 혼자가 아닌 '함께' 만들어가는 것이라는 철학을 담았습니다.

- **Ruby (루비)**: 
  - 💎 **보석처럼 소중한 건강**: 루비는 세계에서 가장 귀한 보석 중 하나로, 사용자의 건강이 그만큼 소중하다는 의미입니다.
  - ❤️ **활력과 생명**: 루비의 붉은색은 생명력, 열정, 건강한 삶을 상징합니다.
  - 🛡️ **보호와 치유**: 고대부터 루비는 치유의 보석으로 여겨져 왔으며, 건강을 지키고 회복시키는 WeRuby AI의 역할을 은유적으로 표현합니다.

WeRuby AI는 단순한 예약 플랫폼을 넘어, 사용자의 건강을 루비처럼 소중히 여기며 함께 지켜나가는 든든한 동반자입니다.

## 🚀 URL

- **운영 환경**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai
- **메인 페이지**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai
- **회원가입**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai/register
- **로그인**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai/login
- **대시보드**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai/dashboard
- **관리자 페이지**: https://3000-ijzlsqgsdkan82btk4rhl-c81df28e.sandbox.novita.ai/admin/users

## ⭐ 주요 기능

### 1. 사용자 인증 시스템
- ✅ 회원가입 (이메일, 비밀번호, 개인정보)
- ✅ 로그인 / 로그아웃
- ✅ 사용자 프로필 관리
- ✅ 건강 정보 입력 (혈액형, 알러지 등)

### 2. 관리자 기능
- ✅ 사용자 목록 조회
- ✅ 사용자 상태 관리 (활성/대기/정지)
- ✅ 사용자 통계 대시보드
- ✅ 검색 및 필터링

### 3. 스마트 예약
- ✅ AI 챗봇/음성을 통한 자연어 기반 병원 예약
- ✅ 실시간 예약 가능 시간 확인
- ✅ 증상 기반 병원/의사 추천
- ✅ 예약 관리 (조회, 취소)
- ✅ 예약 알림 및 리마인더 (계획)

### 4. 의료 기록 관리
- ✅ 진료 이력 자동 저장 및 조회
- ✅ 진단 및 치료 내용 상세 기록
- ✅ 병원별, 날짜별 필터링 기능
- ✅ 검색 및 정렬 기능

### 5. 처방전 관리
- ✅ 처방전 히스토리 관리
- ✅ 약물 정보 및 복용 방법 저장
- ✅ 활성/완료 처방전 상태 관리
- ✅ 복약 일정 알림 (계획)

### 6. AI 어시스턴트
- ✅ 24/7 챗봇 상담
- ✅ 자연어 대화 기반 서비스
- ✅ 음성 인터페이스 (웹 환경)
- ✅ 빠른 액션 버튼 제공

### 7. 병원 찾기
- ✅ 병원 목록 및 상세 정보
- ✅ 진료과목별 필터링
- ✅ 평점 및 리뷰 기반 정렬
- ✅ 병원별 의사 목록 조회

## 📊 데이터 모델

### 핵심 테이블
- **users**: 사용자 정보 (이름, 이메일, 건강정보)
- **hospitals**: 병원 정보 (이름, 주소, 진료과목, 운영시간)
- **doctors**: 의사 정보 (전문분야, 경력, 진료시간)
- **appointments**: 예약 정보 (날짜, 시간, 상태, 증상)
- **medical_records**: 의료 기록 (진단, 치료, 처방)
- **prescriptions**: 처방전 (약물, 복용법, 기간)
- **chat_sessions**: AI 채팅 세션
- **chat_messages**: 채팅 메시지 히스토리

### 스토리지
- **Cloudflare D1**: SQLite 기반 관계형 데이터베이스
- **로컬 개발**: `.wrangler/state/v3/d1` (자동 생성)

## 🛠 기술 스택

- **Backend**: Hono (Cloudflare Workers)
- **Frontend**: HTML5 + TailwindCSS + Vanilla JavaScript
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages
- **Package Manager**: npm
- **Process Manager**: PM2 (개발 환경)

## 📁 프로젝트 구조

```
webapp/
├── src/
│   └── index.tsx              # 메인 백엔드 애플리케이션
├── public/
│   └── static/
│       ├── app.js             # 메인 페이지 JS
│       ├── dashboard.js       # 대시보드 JS
│       └── styles.css         # 커스텀 CSS
├── migrations/
│   └── 0001_initial_schema.sql # 데이터베이스 스키마
├── seed.sql                   # 샘플 데이터
├── ecosystem.config.cjs       # PM2 설정
├── wrangler.jsonc             # Cloudflare 설정
├── package.json
└── README.md
```

## 🚀 로컬 개발 환경 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 데이터베이스 초기화
```bash
# 마이그레이션 적용
npm run db:migrate:local

# 샘플 데이터 삽입
npm run db:seed
```

### 3. 개발 서버 시작
```bash
# 빌드
npm run build

# PM2로 서버 시작
pm2 start ecosystem.config.cjs

# 로그 확인
pm2 logs webapp --nostream
```

### 4. 접속
- http://localhost:3000

## 📝 사용 가이드

### 일반 사용자

1. **메인 페이지 접속**: 서비스 소개 및 주요 기능 확인
2. **대시보드 이동**: "시작하기" 버튼 클릭
3. **예약 관리**: 
   - "AI 어시스턴트" 버튼 클릭
   - 챗봇과 대화하며 예약 진행
   - 예약 탭에서 예약 내역 확인
4. **의료 기록**: 진료 후 자동 저장된 기록 확인
5. **처방전 관리**: 활성 처방전 확인 및 복용 정보 조회
6. **병원 찾기**: 병원 목록 검색 및 정보 확인

### AI 어시스턴트 사용법

**빠른 액션**:
- "내과 예약하기"
- "예약 확인하기"
- "처방전 보기"

**대화 예시**:
- "다음주 화요일 오전에 내과 예약해줘"
- "서울대학교병원에 예약하고 싶어요"
- "내 예약 확인해줘"
- "활성 처방전 보여줘"

## 🎯 구현된 기능

### ✅ 완료된 기능
- [x] 프로젝트 초기 설정
- [x] 데이터베이스 스키마 설계
- [x] RESTful API 구현 (예약, 의료기록, 처방전)
- [x] 메인 랜딩 페이지
- [x] 대시보드 UI
- [x] AI 챗봇 인터페이스
- [x] 병원 찾기 기능
- [x] 예약 관리 (생성, 조회, 취소)
- [x] 의료 기록 조회
- [x] 처방전 조회
- [x] 샘플 데이터

### 🔄 진행 중
- [ ] 실제 AI 모델 통합 (현재는 규칙 기반)
- [ ] 음성 인식 구현 (Web Speech API)
- [ ] 실시간 알림 시스템

### 📋 향후 계획
- [ ] 사용자 인증 및 회원가입
- [ ] 실시간 예약 가능 시간 확인
- [ ] 이메일/SMS 알림
- [ ] 리뷰 및 평점 시스템
- [ ] 보험 정보 관리
- [ ] 가족 계정 관리
- [ ] 건강 데이터 시각화
- [ ] 약국 연계 서비스

## 🔧 개발 명령어

```bash
# 개발
npm run dev                      # Vite 개발 서버
npm run dev:sandbox              # Wrangler 개발 서버
npm run dev:d1                   # D1 포함 개발 서버

# 빌드
npm run build                    # 프로덕션 빌드

# 데이터베이스
npm run db:migrate:local         # 로컬 마이그레이션
npm run db:migrate:prod          # 프로덕션 마이그레이션
npm run db:seed                  # 시드 데이터 삽입
npm run db:reset                 # DB 리셋
npm run db:console:local         # 로컬 DB 콘솔
npm run db:console:prod          # 프로덕션 DB 콘솔

# 배포
npm run deploy                   # Cloudflare Pages 배포
npm run deploy:prod              # 프로덕션 배포

# 유틸리티
npm run clean-port               # 포트 3000 정리
npm run test                     # 서버 연결 테스트
```

## 🔒 보안 고려사항

- 사용자 인증 구현 필요 (현재는 데모용 고정 사용자)
- API 엔드포인트 보호 필요
- 의료 데이터 암호화 필요
- HIPAA/개인정보보호법 준수 필요

## 📱 반응형 디자인

- 모바일 최적화 (Tailwind CSS)
- 태블릿 지원
- 데스크톱 레이아웃

## 🎨 디자인 시스템

- **색상**: Purple/Blue/Pink 그라디언트
- **아이콘**: Font Awesome 6
- **스타일**: TailwindCSS + Custom CSS
- **글꼴**: Inter (Google Fonts)
- **애니메이션**: 
  - CSS transitions & keyframe animations
  - Fade-in, Scale-in, Float animations
  - Gradient shift, Shimmer, Glow effects
  - Particle background effects
  - Icon pulse animations
- **디자인 특징**:
  - Glass Morphism (유리 느낌 효과)
  - Glassmorphism cards with backdrop blur
  - Gradient borders and backgrounds
  - Neon text effects
  - 3D hover transformations
  - Ripple effects on clicks
  - Smooth scroll animations
  - Loading spinners
  - Badge glow effects

## 📄 라이선스

이 프로젝트는 데모 목적으로 제작되었습니다.

## 👥 데모 사용자

- **이름**: 홍길동
- **이메일**: hong@example.com
- **User ID**: 1

## 📞 지원

문의사항이나 버그 리포트는 GitHub Issues를 통해 제출해주세요.

---

**최종 업데이트**: 2026-01-09
**버전**: 1.0.0
**상태**: ✅ 활성
