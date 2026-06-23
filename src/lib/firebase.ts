/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './customFirebaseConfig';

/**
 * [Firestore 연결 완료 단계 안내]
 * 1. 이 단계에서는 실제 Firebase Firestore DB가 연결 및 프로비저닝 완료되었습니다.
 * 2. 학교/학급 정보인 'schools' 컬렉션이 Firebase Firestore에 실시간 저장 및 조회됩니다.
 * 3. 실제 운영 배포 및 상용화 시에는 최첨단 Firebase 보안 규칙(firestore.rules)이 요구됩니다.
 */

// Firebase 앱 및 Firestore 인스턴스 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
import { getAuth } from 'firebase/auth';
const auth = getAuth(app);

export { app, db, auth };
