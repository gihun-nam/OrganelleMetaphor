# 🛠️ 개발 및 테스트용 Firestore Security Rules 설정 가이드

현재 통합과학 수속용 세포소기관 배움터 앱은 2단계 마이그레이션 중이며, 학교 및 학급 개설 정보를 실시간으로 **Firebase Firestore**에 업로드하고 조회합니다.

새로운 학교 개설 시 `Missing or insufficient permissions`와 같은 Firestore 쓰기 권한 오류가 발생할 경우, 다음 가이드를 참조하여 Firebase Console에서 보안 규칙을 조정해 주세요.

---

## ✅ 권장: 저장소의 강화된 규칙(`firestore.rules`)을 배포하세요

이 프로젝트의 `firestore.rules`는 이제 **인증 기반으로 강화**되어 있습니다.
- 학생 제출물(`submissions`)·검사결과(`submission_checks`)·프로필(`users`) **쓰기는 로그인(Firebase Auth) 필수**
- 학교 문서의 **수정/삭제는 인증된 사용자만** 가능 (PIN 탈취·무단 삭제 차단)
- 제출 본문 길이 제한으로 과대/junk 주입 차단

Firebase Console > Firestore(데이터베이스 ID `biologyorganelle`) > 규칙 탭에 `firestore.rules` 내용을 붙여넣고 **게시**하면 됩니다.

> ⚠️ 남은 한계: 클라이언트에서 학교명/입장코드로 로그인하는 구조라 `schools` 문서 **읽기**는 열어둘 수밖에 없습니다(비밀번호 필드 포함). 이를 완전히 가리려면 로그인 검증을 서버리스 함수(Firebase Admin SDK)로 옮겨야 합니다.

---

## 🆘 비상용 임시 전체 허용 (디버깅 전용)

아래는 **권한 오류 디버깅 시에만** 잠깐 쓰는 전체 허용 규칙입니다. 운영 중에는 절대 사용하지 마세요.

---

## 💡 해결 방법 (임시 허용 모드로 전환)

원격 데이터베이스 환경에서 누구나 읽고 쓸 수 있도록 테스트 허용 규칙으로 잠시 세팅하여 마이그레이션 동작을 검증할 수 있습니다.

### 1단계: Firebase Console 접속
1. [Firebase Console](https://console.firebase.google.com/)에 접속합니다.
2. 현재 프로젝트(예: `yielding-airlock-9sjh2` 등)를 선택합니다.

### 2단계: Firestore Database 및 대상 데이터베이스 인스턴스 선택
1. 왼쪽 사이드바 메뉴에서 **빌드(Build) ➔ Firestore Database**를 클릭합니다.
2. **[🚨 중요 - 다중 데이터베이스 인스턴스 필수 확인]** 
   - 화면 최상단 좌측의 **Firestore Database** 문구 오른쪽 옆에 있는 **데이터베이스 선택 드롭다운**을 확인합니다.
   - 기본값으로 `(default)`가 선택되어 있다면 클릭하여 custom 데이터베이스 ID인 **`biologyorganelle`** 로 전환해 주어야 합니다.
   - 이 드롭다운에서 `biologyorganelle` 인스턴스가 올바르게 선택되었는지 반드시 확인한 후 다음 3단계를 수행하세요. 그렇지 않으면 엉뚱한 기본 db에만 규칙이 실려 권한 거부 오류가 지속될 수 있습니다.
3. 상단 탭에서 **규칙(Rules)**을 클릭합니다.

### 3단계: 보안 규칙을 전체 허용 모드로 임시 수정
기존 소스코드를 지우고 아래의 **완전 테스트 허용 코드**를 복사해서 붙여넣습니다:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

또는, 아래처럼 개발 전용 기간제(예: 오늘 기준 30일간 허용) 규칙을 사용할 수 있습니다.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 12, 31);
    }
  }
}
```

### 4단계: 규칙 적용 및 게시
- 우측 상단 파란색 **게시(Publish)** 버튼을 누르면 약 10초 ~ 1분 내에 원격에 반영됩니다.
- 반영 이후에는 브라우저에서 '새 학교 개설'을 시도할 때 권한 에러 없이 즉시 개설과 동기화가 성사됩니다.

---

## 🔒 운영 배포 시 권한 보안 (참고사항)

실제 본 배포 및 상용화 시기에는 개발자 및 학생만 지정된 양식에 맞춰 문서를 영구 보존하거나 작성할 수 있도록 정교한 조건이 구현되어야 합니다.
프로젝트 루트 폴더에 준비해 둔 `firestore.rules`를 Firebase CLI나 연동 도구를 사용해 자동 배포하거나 규칙 설정을 동기화하여 보안을 한층 강화할 수도 있습니다.
