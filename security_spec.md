# Firestore Security Specification & TDD Spec

## 1. Data Invariants
- **Schools (`/schools/{schoolId}`)**:
  - `schoolName` must be a non-empty string under 100 characters.
  - `teacherPin` must be a string of length 4 to 20 characters.
  - `studentPassword` must be a string of length 4 to 20 characters.
  - School identifiers and join codes cannot be mutated or changed once created.
  - Public listing (fetching all schools) is strictly disabled to prevent harvesting.

- **Submissions (`/submissions/{submissionId}`)**:
  - Must belong to an active school space and reference its normalized school name.
  - Content fields (`metaphorSubject`, `metaphorReason`, `organelleId`, etc.) are immutable after creation.
  - Peer evaluation updates can only access the `ratings`, `averageRating`, and `ratingCount` properties.
  - Mass queries must be explicitly filtered by school to prevent database scraping.

---

## 2. The "Dirty Dozen" Spoofing & Poisoning Payloads
Here are 12 malicious payloads designed to exploit gaps, and which must be blocked by the security rules:

1. **School Harvest Attack**: Listing all schools (`allow list`) to download passwords.
2. **PIN Hijack Update**: Setting `teacherPin = "1111"` on another school's document without knowing the previous PIN.
3. **Student Password Lockout**: Attempting to change `studentPassword` on a school document after creation to lock students out.
4. **School ID Poisoning**: Trying to create a school with a massive 1MB string or invalid characters in path or payload.
5. **Junk Submission injection**: Creating a metaphor submission with a `metaphorReason` of more than 100,000 characters.
6. **Metaphor Identity Spoof**: Submitting a metaphor representing student A, but modifying the `studentName` during submission.
7. **Submission Hijack**: Overwriting an existing peer's metaphor record (`metaphorSubject`, `metaphorReason`) with custom text.
8. **Rating Inflation**: Sending a peer review update with rating value larger than rating boundaries (`averageRating` > 5.0 or negative).
9. **Global Collection Scraping**: Querying the entire `/submissions` collection without filtering by school.
10. **School Deletion Attack**: Forcing delete requests on schools to drop database registers.
11. **Shadow Field Injection**: Injecting unauthorized schema properties (`isVerified: true`, `role: 'admin'`) into school registrations.
12. **Timestamp Fraud**: Injecting hardcoded future client dates for `createdAt` and `updatedAt` to bypass sync schedules.

---

## 3. Security Hardening Strategy & Rules Mapping (현재 구현 상태)

`firestore.rules`에서 **현재 차단되는 항목**:
- #4 School ID Poisoning / #11 Shadow Field Injection (부분) — `schools` create 시 필수 필드·문자열 길이(≤100) 검증
- #5 Junk Submission Injection — 제출 본문 길이 제한(제목 ≤200, 이유 ≤2000)
- #7 Submission Hijack (부분) / 무단 제출 — `submissions` 쓰기에 로그인(Auth) 필수
- #2 PIN Hijack Update / #3 Student Password Lockout — `schools` update에 인증 필수
- #10 School Deletion Attack — `schools` delete에 인증 필수
- #9 Global Collection Scraping (학생 데이터 쓰기) — `submissions`/`submission_checks`/`users` 쓰기 인증 필수

**아직 남은 한계 (서버리스 로그인 전환 필요)**:
- #1 School Harvest / 비밀번호 평문 노출 — 클라이언트 로그인 구조상 `schools` 읽기를 막을 수 없음.
- #6 Metaphor Identity Spoof / #8 Rating Inflation / #12 Timestamp Fraud — 본문/평점/시각의 의미적 무결성은 클라이언트 신뢰에 의존.

> 이 항목들을 완전히 닫으려면 학교 개설·로그인·평점 갱신을 **서버리스 함수(Admin SDK)** 로 옮기고, `schools` 읽기 및 모든 쓰기를 서버 검증 뒤로 숨겨야 합니다. (권장 후속 작업)
