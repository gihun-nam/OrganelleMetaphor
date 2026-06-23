# 배포 가이드 (Vercel)

세포소기관 비유 배움터 — Vite(React) 정적 SPA + Vercel 서버리스 함수(`/api`) + Firebase(Firestore/Auth).

## 1. 사전 준비
- **Node.js 18+** 와 npm
- **Gemini API 키** (제출물 AI 안전성 검사용) — https://aistudio.google.com/apikey
- **Firebase 프로젝트** — 이미 `src/lib/customFirebaseConfig.ts`에 `biology-5593f` / DB ID `biologyorganelle`로 연결되어 있음

## 2. 로컬 개발
```bash
npm install
npm run dev          # Vite 개발 서버 (UI 작업용, http://localhost:5173)
```
- `/api/check-safety`까지 로컬에서 테스트하려면 Vercel CLI 사용:
  ```bash
  npm i -g vercel
  cp .env.example .env   # GEMINI_API_KEY 등 채우기
  vercel dev
  ```
- 참고: `npm run dev`(순수 Vite)에서는 `/api`가 없어 안전성 검사만 실패합니다(제출 자체는 정상 동작).

## 3. Vercel 배포
1. 이 폴더를 GitHub에 푸시하거나 `vercel` CLI로 업로드합니다.
2. Vercel이 `vercel.json`을 읽어 자동 설정합니다 (Framework: Vite / Build: `vite build` / Output: `dist` / `/api/*` 서버리스 함수).
3. **환경변수 등록** — Project Settings → Environment Variables:
   - `GEMINI_API_KEY` = (발급받은 키)  ← **필수**, 서버에서만 사용되며 브라우저로 노출되지 않습니다.
4. Deploy.

> `GEMINI_API_KEY`가 없으면 빌드/배포는 되지만 제출물 자동 안전성 검사만 동작하지 않습니다(제출·평가는 정상).

## 4. Firebase 보안 규칙 배포 (중요)
강화된 규칙이 `firestore.rules`에 들어 있습니다. **반드시 배포**하세요.
- Firebase Console → Firestore Database → 데이터베이스 인스턴스를 **`biologyorganelle`** 로 선택 → 규칙 탭 → `firestore.rules` 내용 붙여넣기 → 게시
- 자세한 내용: [FIRESTORE_RULES_GUIDE.md](FIRESTORE_RULES_GUIDE.md)

## 5. 남은 보안 한계 (후속 권장)
클라이언트에서 학교명/입장코드로 로그인하는 구조라 `schools` 문서 **읽기**는 열려 있어야 합니다(비밀번호 필드 포함). 이를 완전히 가리려면 로그인·학교개설·평점갱신을 **서버리스 함수(Firebase Admin SDK)** 로 옮겨야 합니다. 자세한 매핑: [security_spec.md](security_spec.md)
