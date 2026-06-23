/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';

/**
 * [보안 및 이전단계 안내 주석]
 * - 현재 단계는 학교/학급 registry 정보만 Firestore로 이전하는 단계입니다.
 * - teacherPin 및 studentPassword를 평문(Plain Text)으로 저장하는 방식은 개발용 임시 구조입니다.
 * - 실제 서비스 배포 및 상용화 시에는 해시 알고리즘 적용, Firebase Authentication을 통한 사용자 가입/인증 기능 도입,
 *   그리고 강력한 Firestore Security Rules(보안 규칙) 환경 설정이 반드시 수반되어야 합니다.
 */

export interface FirestoreSchool {
  schoolName: string;
  normalizedSchoolName: string;
  className?: string;
  teacherPin: string;
  studentPassword: string;
  joinCode: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  openedClasses?: string[];
  activityRestartedAt?: string;
  timerIsActive?: boolean;
  timerSecondsLeft?: number;
  timerStartAt?: string;
  timerDuration?: number;
  teacherAuthEmail?: string; // Stored unique auth email to prevent orphaned-user collisions
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
  }
}

/**
 * Helper to standardise and forward Firestore error logs
 */
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errString = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errString,
    operationType,
    path,
    authInfo: {}
  };
  console.error('[Firestore Error Details]:', JSON.stringify(errInfo));
  
  if (errString.toLowerCase().includes('permission') || errString.toLowerCase().includes('insufficient')) {
    throw new Error('Firestore 권한 설정을 확인해 주세요. (Firebase Console의 Rules가 개발/테스트용 읽기/쓰기를 허용하도록 구성되어 있는지 점검해 주십시오.)');
  }
  
  throw new Error(errString);
}

/**
 * Generates a random alphanumeric 6-digit join code
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // EXCLUDED ambiguous chars like I, O, 0, 1
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Firestore에 학교/학급 공간을 생성한다.
 * 같은 normalizedSchoolName 또는 joinCode를 가진 active 문서가 이미 있으면 중복 생성하지 않고 에러를 반환한다.
 */
export async function createSchoolOrClass(data: {
  schoolName: string;
  className?: string;
  teacherPin: string;
  studentPassword: string;
  openedClasses?: string[];
}): Promise<FirestoreSchool> {
  const collectionName = 'schools';
  const schoolName = data.schoolName.trim();
  const normalizedSchoolName = schoolName.toLowerCase();

  if (!schoolName) {
    throw new Error('학교 이름은 필수 입력 항목입니다.');
  }

  try {
    // 1. 이미 존재하는 학교명 확인 (isActive === true)
    const nameQuery = query(
      collection(db, collectionName), 
      where('normalizedSchoolName', '==', normalizedSchoolName),
      where('isActive', '==', true),
      limit(1)
    );
    const querySnapshot = await getDocs(nameQuery);
    
    let joinCode = '';

    if (!querySnapshot.empty) {
      // [자가 복구 및 자율 업데이트 제공]
      // 동일 대상을 중복 개설하더라도 충돌 오류를 내지 않고, 입력된 최신 비밀번호 및 PIN 정보로 원활하게 덮어쓰기(덮어씀으로써 동기화)를 수행합니다.
      const existingDoc = querySnapshot.docs[0].data() as FirestoreSchool;
      joinCode = existingDoc.joinCode || generateJoinCode();
      const uniqueHash = Math.random().toString(36).substring(2, 8);
      const teacherAuthEmail = existingDoc.teacherAuthEmail && data.teacherPin === existingDoc.teacherPin 
          ? existingDoc.teacherAuthEmail 
          : `teacher_${encodeURIComponent(normalizedSchoolName)}_${uniqueHash}@cell-organelle-app.com`;
      
      const schoolDocRef = doc(db, collectionName, normalizedSchoolName);
      const updatedSchool: FirestoreSchool = {
        schoolName,
        normalizedSchoolName,
        className: data.className || existingDoc.className || '',
        teacherPin: data.teacherPin,
        studentPassword: data.studentPassword,
        joinCode,
        createdAt: existingDoc.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        openedClasses: data.openedClasses || existingDoc.openedClasses || ['1반', '2반', '3반', '4반'],
        teacherAuthEmail
      };
      await setDoc(schoolDocRef, updatedSchool);
      return updatedSchool;
    }

    // 2. 유니크한 joinCode 확보
    let isCodeSubmitting = true;
    let fallbackCounter = 0;
    while (isCodeSubmitting && fallbackCounter < 10) {
      const prospectiveCode = generateJoinCode();
      const codeQuery = query(
        collection(db, collectionName),
        where('joinCode', '==', prospectiveCode),
        where('isActive', '==', true),
        limit(1)
      );
      const codeSnapshot = await getDocs(codeQuery);
      if (codeSnapshot.empty) {
        joinCode = prospectiveCode;
        isCodeSubmitting = false;
      }
      fallbackCounter++;
    }

    if (!joinCode) {
      joinCode = generateJoinCode(); // Emergency fallback
    }

    // 3. Firestore 도큐먼트 생성 (ID는 normalizedSchoolName 사용)
    const schoolDocRef = doc(db, collectionName, normalizedSchoolName);
    
    // Generate a unique auth email to decouple Auth from strict school names (fixes orphaned user PIN collisions)
    const uniqueHash = Math.random().toString(36).substring(2, 8);
    const teacherAuthEmail = `teacher_${encodeURIComponent(normalizedSchoolName)}_${uniqueHash}@cell-organelle-app.com`;

    const newSchool: FirestoreSchool = {
      schoolName,
      normalizedSchoolName,
      className: data.className || '',
      teacherPin: data.teacherPin,
      studentPassword: data.studentPassword,
      joinCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      openedClasses: data.openedClasses || ['1반', '2반', '3반', '4반'],
      teacherAuthEmail
    };

    await setDoc(schoolDocRef, newSchool);
    return newSchool;
  } catch (error: any) {
    handleFirestoreError(error, OperationType.CREATE, `${collectionName}/${normalizedSchoolName}`);
  }
}

/**
 * normalizedSchoolName 기준으로 active 문서를 조회한다.
 */
export async function getSchoolOrClassByName(schoolName: string): Promise<FirestoreSchool | null> {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const docRef = doc(db, collectionName, normalized);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as FirestoreSchool;
      if (data.isActive) {
        return data;
      }
    }
    
    // Fallback: If not found by custom ID match, query by field
    const nameQuery = query(
      collection(db, collectionName),
      where('normalizedSchoolName', '==', normalized),
      where('isActive', '==', true),
      limit(1)
    );
    const snap = await getDocs(nameQuery);
    if (!snap.empty) {
      return snap.docs[0].data() as FirestoreSchool;
    }

    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${collectionName}/${normalized}`);
  }
}

/**
 * joinCode 기준으로 active 문서를 조회한다.
 */
export async function getSchoolOrClassByJoinCode(joinCode: string): Promise<FirestoreSchool | null> {
  const collectionName = 'schools';
  const cleanCode = joinCode.trim().toUpperCase();
  if (!cleanCode) return null;

  try {
    const codeQuery = query(
      collection(db, collectionName),
      where('joinCode', '==', cleanCode),
      where('isActive', '==', true),
      limit(1)
    );
    const querySnapshot = await getDocs(codeQuery);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as FirestoreSchool;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${collectionName}/?joinCode=${cleanCode}`);
  }
}

/**
 * Firestore에서 학교/학급 공간을 찾고 teacherPin과 비교한다.
 */
export async function loginTeacher(schoolName: string, pin: string): Promise<FirestoreSchool> {
  const school = await getSchoolOrClassByName(schoolName);
  if (!school) {
    throw new Error('해당 학교/학급 공간을 찾을 수 없습니다. 학교명을 다시 한 번 확인해 주세요.');
  }
  
  if (school.teacherPin !== pin) {
    throw new Error('교사 PIN 번호가 일치하지 않습니다. 다시 입력해 주세요.');
  }
  return school;
}

/**
 * Firestore에서 학교/학급 공간을 찾고 studentPassword와 비교한다.
 * 선택된 학급이 개설(활성화)되어 있는지도 추가 점검합니다.
 */
export async function loginStudent(
  schoolNameOrJoinCode: string, 
  studentPassword: string
): Promise<FirestoreSchool> {
  const trimmedInput = schoolNameOrJoinCode.trim();
  let school: FirestoreSchool | null = null;
  let isFromJoinCode = false;

  // Try parsing by join code (6 alphanumeric characters)
  if (trimmedInput.length === 6) {
    school = await getSchoolOrClassByJoinCode(trimmedInput);
    if (school) {
      isFromJoinCode = true;
    }
  }

  // If not found, search by School Name
  if (!school) {
    school = await getSchoolOrClassByName(trimmedInput);
  }

  if (!school) {
    throw new Error('해당 학교/학급 공간을 찾을 수 없습니다. 입력값을 다시 한 번 확인해 주세요.');
  }

  // ONLY require and validate password if NOT logged in using the entrance/join code
  if (!isFromJoinCode) {
    if (!studentPassword.trim()) {
      throw new Error('학교명으로 로그인할 경우 학생 비밀번호가 필요합니다.');
    }
    if (school.studentPassword !== studentPassword) {
      throw new Error('학생 로그인 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.');
    }
  }

  return school;
}

/**
 * Updates the teacher's PIN in Firestore.
 */
export async function updateTeacherPin(schoolName: string, newPin: string): Promise<void> {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  if (!normalized) return;

  try {
    const docRef = doc(db, collectionName, normalized);
    await setDoc(docRef, { 
      teacherPin: newPin, 
      updatedAt: new Date().toISOString() 
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${normalized}`);
  }
}

/**
 * Subscribes to real-time changes of the school's doc in Firestore.
 */
export function subscribeSchool(
  schoolName: string, 
  onUpdate: (school: FirestoreSchool) => void, 
  onError?: (err: any) => void
) {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  const docRef = doc(db, collectionName, normalized);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      onUpdate(docSnap.data() as FirestoreSchool);
    }
  }, (err) => {
    if (onError) onError(err);
  });
}

/**
 * Triggers activity restart in Firestore.
 */
export async function restartActivityInFirestore(schoolName: string, durationSeconds: number = 300): Promise<string> {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  const newTimestamp = new Date().toISOString();
  if (!normalized) return newTimestamp;

  try {
    const docRef = doc(db, collectionName, normalized);
    await setDoc(docRef, { 
      activityRestartedAt: newTimestamp,
      timerIsActive: false,
      timerSecondsLeft: durationSeconds,
      timerStartAt: '',
      timerDuration: durationSeconds,
      updatedAt: newTimestamp 
    }, { merge: true });
    return newTimestamp;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${normalized}`);
    return newTimestamp;
  }
}

/**
 * Updates the timer state in Firestore for a school.
 */
export async function updateSchoolTimerState(
  schoolName: string, 
  timerIsActive: boolean, 
  timerSecondsLeft: number, 
  timerStartAt: string, 
  timerDuration: number
): Promise<void> {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  if (!normalized) return;

  try {
    const docRef = doc(db, collectionName, normalized);
    await setDoc(docRef, { 
      timerIsActive,
      timerSecondsLeft,
      timerStartAt,
      timerDuration,
      updatedAt: new Date().toISOString() 
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${normalized}`);
  }
}

/**
 * Subscribes to all active school spaces in real-time.
 */
export function subscribeAllSchools(
  onUpdate: (schools: FirestoreSchool[]) => void,
  onError?: (err: any) => void
) {
  const q = query(
    collection(db, 'schools'),
    where('isActive', '==', true)
  );
  return onSnapshot(q, (snapshot) => {
    const list: FirestoreSchool[] = [];
    snapshot.forEach((docSnap) => {
      list.push(docSnap.data() as FirestoreSchool);
    });
    onUpdate(list);
  }, (err) => {
    if (onError) onError(err);
  });
}

/**
 * Deletes a school/class space completely from Firestore.
 */
export async function deleteSchoolRecord(schoolName: string): Promise<void> {
  const collectionName = 'schools';
  const normalized = schoolName.trim().toLowerCase();
  if (!normalized) return;

  try {
    const schoolDocRef = doc(db, collectionName, normalized);
    const schoolSnap = await getDoc(schoolDocRef);
    
    let openedClasses: string[] = ['1반', '2반', '3반', '4반'];
    if (schoolSnap.exists()) {
      const data = schoolSnap.data() as FirestoreSchool;
      if (data.openedClasses && Array.isArray(data.openedClasses)) {
        openedClasses = data.openedClasses;
      }
    }

    const batch = writeBatch(db);

    // Delete subdocuments under submissions and submission_checks for all openedClasses
    for (const className of openedClasses) {
      const submissionsSnap = await getDocs(collection(db, `submissions/${normalized}/${className}`));
      submissionsSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      const checksSnap = await getDocs(collection(db, `submission_checks/${normalized}/${className}`));
      checksSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
    }

    // Delete users for [...openedClasses, '_teachers']
    const userClasses = [...openedClasses, '_teachers'];
    for (const className of userClasses) {
      const usersSnap = await getDocs(collection(db, `users/${normalized}/${className}`));
      usersSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
    }

    // Delete parent documents to prevent orphan/phantom documents
    const submissionsParentRef = doc(db, 'submissions', normalized);
    const checksParentRef = doc(db, 'submission_checks', normalized);
    const usersParentRef = doc(db, 'users', normalized);

    batch.delete(submissionsParentRef);
    batch.delete(checksParentRef);
    batch.delete(usersParentRef);

    // Delete the final root school document
    batch.delete(schoolDocRef);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${normalized}`);
  }
}

