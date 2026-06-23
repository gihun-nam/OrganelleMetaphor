/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 개발 환경 전용: 교사 대시보드 디버깅 도구 잠금 해제 비밀번호 */
  readonly VITE_DEV_ADMIN_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
