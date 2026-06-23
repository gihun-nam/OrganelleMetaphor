/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, auth } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  writeBatch,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { SubmissionCheck } from '../types';

/**
 * Simple deterministic hash to avoid duplicate API calls
 */
function generateMD5LikeHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

interface SafetyCheckResult {
  needsReview: boolean;
  categories: string[];
  flaggedSpans: {
    field: 'title' | 'content';
    text: string;
    reason: string;
  }[];
  summary: string;
}

/**
 * Calls Gemini API via backend proxy to verify the metaphor subject (title) and reason (content) safety.
 */
export async function checkAnalogySafety(title: string, content: string): Promise<SafetyCheckResult> {
  const response = await fetch('/api/check-safety', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, content }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return await response.json() as SafetyCheckResult;
}


/**
 * Run automated safety check and save to submission_checks collection parallel to submissions
 */
export async function runAutomatedSafetyCheck(submission: FirestoreSubmission): Promise<void> {
  const sourceHash = generateMD5LikeHash(submission.metaphorSubject + '|||' + submission.metaphorReason);
  
  // Replace leading "submissions/" with "submission_checks/" to create parallel structure
  const checkPath = submission.id.replace(/^submissions\//, 'submission_checks/');
  const checkDocRef = doc(db, checkPath);

  // 부모 검사 학교 문서 명시적 생성 (phantom document 방지)
  try {
    const segments = checkPath.split('/');
    const schoolIdFromPath = segments[1] || submission.schoolId;
    const parentCheckPath = `submission_checks/${schoolIdFromPath}`;
    const parentCheckDocRef = doc(db, parentCheckPath);
    await setDoc(parentCheckDocRef, {
      schoolId: schoolIdFromPath,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('[Parent Check Doc Created/Updated]', parentCheckPath);
  } catch (parentCheckError) {
    console.warn('[Parent Check Doc Warning]: Failed to set parent check document:', parentCheckError);
  }

  try {
    // Check if check already exists with the same signature to avoid double API calls
    const existingCheckSnap = await getDoc(checkDocRef);
    if (existingCheckSnap.exists()) {
      const existingData = existingCheckSnap.data();
      if (existingData.sourceHash === sourceHash && existingData.checked === true) {
        console.log('[Safety Check Info]: Skipped duplicated safety check. sourceHash matches.');
        return;
      }
    }
  } catch (readError) {
    console.warn('[Safety Check Warning]: Failed to read existing check document:', readError);
  }

  // Perform Gemini safety check
  try {
    const result = await checkAnalogySafety(submission.metaphorSubject, submission.metaphorReason);
    
    const checkDoc = {
      submissionId: submission.id,
      schoolId: submission.schoolId,
      classId: submission.studentClass,
      schoolName: submission.schoolName,
      className: submission.studentClass,
      checked: true,
      needsReview: result.needsReview,
      categories: result.categories,
      flaggedSpans: result.flaggedSpans,
      summary: result.summary,
      checkedAt: serverTimestamp(),
      model: 'gemini-3.1-flash-lite',
      sourceHash,
    };

    await setDoc(checkDocRef, checkDoc);
    const checkConfirmSnap = await getDoc(checkDocRef);
    if (!checkConfirmSnap.exists()) {
      throw new Error(`Firestore safety check 저장 검증 실패: ${checkPath}`);
    }
    console.log('[Safety Check Success]: Saved check result to Firestore path:', checkPath);
    localStorage.setItem('last_safety_check_error', '없음 (최근 일련의 검사가 완벽하게 성공 완료됨)');
  } catch (checkError: any) {
    console.error('[Safety Check Error]: API Call failed', checkError);
    const errText = checkError instanceof Error ? checkError.message : String(checkError);
    localStorage.setItem('last_safety_check_error', `자동 검사 실패: ${errText}`);
    
    // Check if it's a Gemini API quota / rate limit / 429 error
    const lowerErr = errText.toLowerCase();
    const isQuota = lowerErr.includes('quota') || 
                    lowerErr.includes('429') || 
                    lowerErr.includes('limit') || 
                    lowerErr.includes('exhausted') || 
                    lowerErr.includes('rate-limit') || 
                    lowerErr.includes('rate limit');

    // Write failure/quota check document
    try {
      const errorDoc = {
        submissionId: submission.id,
        schoolId: submission.schoolId,
        classId: submission.studentClass,
        schoolName: submission.schoolName,
        className: submission.studentClass,
        checked: false,
        needsReview: isQuota ? false : true, // If it's a quota issue, do NOT alert for safety human review
        categories: isQuota ? ['quota_exceeded'] : ['check_failed'],
        flaggedSpans: [],
        summary: isQuota ? 'API 호출한도 초과' : '자동검사 실패로 확인이 필요합니다.',
        checkedAt: serverTimestamp(),
        model: 'gemini-3.1-flash-lite',
        sourceHash,
        error: !isQuota, // Quota is a system rate state, not a critical content safety validation failure
        errorMessage: errText,
        isQuotaExceeded: isQuota
      };
      await setDoc(checkDocRef, errorDoc);
      const checkErrorConfirmSnap = await getDoc(checkDocRef);
      if (!checkErrorConfirmSnap.exists()) {
        throw new Error(`Firestore safety check error document 저장 검증 실패: ${checkPath}`);
      }
      console.log(`[Safety Check Logged]: Logged check state (isQuota=${isQuota}) to path:`, checkPath);
    } catch (saveError) {
      console.error('[Safety Check Error]: Failed to write error log to Firestore', saveError);
    }
  }
}

export interface FirestoreSubmission {
  id: string;
  schoolId: string;
  schoolName: string;
  studentSchool?: string;
  normalizedSchoolName: string;
  studentName: string;
  studentClass: string;
  organelleId: string;
  organelleName: string;
  metaphorSubject: string;
  metaphorReason: string;
  ratings: { [voterName: string]: number };
  averageRating: number;
  ratingCount: number;
  customImage?: string; // 학생이 직접 업로드한 그림 (Base64)
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  isMock?: boolean;
  ownerUid?: string | null;
  ownerRole?: string | null;
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
 * Helper to translate raw Firestore error to a descriptive custom message
 */
export function getReadableFirestoreError(error: any): string {
  const code = error?.code || '';
  const message = error?.message || String(error);
  
  if (code === 'permission-denied' || message.toLowerCase().includes('permission') || message.toLowerCase().includes('insufficient')) {
    return `Firestore 권한 오류입니다. 저장 경로와 firestore.rules를 확인해 주세요. (오류 코드: ${code || message})`;
  }
  if (code === 'unavailable') {
    return `Firestore 서버 연결 오류입니다. 네트워크 상태 또는 Firebase 점검 여부를 확인해 주세요. (오류 코드: ${code})`;
  }
  if (
    message.toLowerCase().includes('firebase') ||
    message.toLowerCase().includes('api key') ||
    message.toLowerCase().includes('project') ||
    message.toLowerCase().includes('database')
  ) {
    return `Firebase 설정 오류입니다. customFirebaseConfig.ts와 database ID를 확인해 주세요. (메시지: ${message})`;
  }
  return `Firestore 오류: ${message} (코드: ${code})`;
}

/**
 * Helper to log detailed Firestore errors and throw simplified user-friendly messages
 */
function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
  userMessage: string
): never {
  const errString = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errString,
    operationType,
    path,
    authInfo: {}
  };
  console.error('[Firestore Submission Error Details]:', JSON.stringify(errInfo));
  
  // Throw descriptive, custom error message instead of general mask
  const readableMsg = getReadableFirestoreError(error);
  throw new Error(readableMsg);
}

const COLLECTION_NAME = 'submissions';

/**
 * 새 제출물을 Firestore에 저장한다. (학생 1명 + 세포소기관 1개당 1개 문서로 저장)
 * 경로: submissions/학교명/학급/학교명_학급_학생이름_개인비밀번호_소기관ID
 */
export async function createSubmission(
  submissionData: Omit<FirestoreSubmission, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'> & { id?: string; studentSchool?: string; studentPassword?: string }
): Promise<FirestoreSubmission> {
  const cleanSchool = submissionData.normalizedSchoolName.trim().toLowerCase();
  const rawClass = submissionData.studentClass || '1반';
  const cleanClass = rawClass.trim();
  const cleanName = submissionData.studentName.trim();
  const personalPassword = submissionData.studentPassword || '1234';
  const organelleId = (submissionData.organelleId || '').trim();
  
  // Create a unique flat document name to prevent namespace conflict while preserving standard format
  const individualFolderDocId = `${cleanSchool}_${cleanClass}_${cleanName}_${personalPassword}_${organelleId}`;
  
  const fullPath = `${COLLECTION_NAME}/${cleanSchool}/${cleanClass}/${individualFolderDocId}`;
  
  // Omit password and temporary IDs from saved Firestore properties for security and constraints matching
  const { studentPassword, id: discardedId, ...cleanSubmissionData } = submissionData;

  const docRef = doc(db, fullPath);
  const now = new Date().toISOString();

  try {
    // 부모 학교 문서 명시적 생성 (phantom document 방지)
    try {
      const parentSchoolPath = `submissions/${cleanSchool}`;
      const parentSchoolDocRef = doc(db, parentSchoolPath);
      await setDoc(parentSchoolDocRef, {
        schoolId: cleanSchool,
        schoolName: submissionData.schoolName || '',
        normalizedSchoolName: cleanSchool,
        updatedAt: now
      }, { merge: true });
      console.log('[Parent School Doc Created/Updated]', parentSchoolPath);
    } catch (parentError) {
      console.warn('[Parent School Doc Warning]: Failed to set parent school document:', parentError);
    }

    const existingSnap = await getDoc(docRef);
    let finalSubmission: FirestoreSubmission;

    if (existingSnap.exists()) {
      const existing = existingSnap.data() as FirestoreSubmission;
      
      // OPTION A: Preserve original ratings, index states, and createdAt while updating metaphors/customImage/organelles
      finalSubmission = {
        ...existing,
        ...cleanSubmissionData,
        id: fullPath,
        studentSchool: cleanSubmissionData.studentSchool || cleanSubmissionData.schoolName,
        createdAt: existing.createdAt || now,
        updatedAt: now,
        isDeleted: false,
        isMock: cleanSubmissionData.isMock || existing.isMock || false,
        ownerUid: (cleanSubmissionData.isMock || existing.isMock) ? null : (auth.currentUser?.uid || existing.ownerUid || null),
        ownerRole: auth.currentUser ? (existing.ownerRole || 'student') : 'student',
        
        // Strictly preserve peer fields for Case C matches, but allow mock updates to overwrite if mock
        ratings: (cleanSubmissionData.isMock || existing.isMock) ? (cleanSubmissionData.ratings || existing.ratings || {}) : (existing.ratings || {}),
        averageRating: (cleanSubmissionData.isMock || existing.isMock)
          ? (typeof cleanSubmissionData.averageRating === 'number' ? cleanSubmissionData.averageRating : (typeof existing.averageRating === 'number' ? existing.averageRating : 0))
          : (typeof existing.averageRating === 'number' ? existing.averageRating : 0),
        ratingCount: (cleanSubmissionData.isMock || existing.isMock)
          ? (typeof cleanSubmissionData.ratingCount === 'number' ? cleanSubmissionData.ratingCount : (typeof existing.ratingCount === 'number' ? existing.ratingCount : 0))
          : (typeof existing.ratingCount === 'number' ? existing.ratingCount : 0),
      };
      
      await setDoc(docRef, finalSubmission);
      console.log('[Submission Update Success]', fullPath);
      localStorage.setItem('last_submission_error', '없음 (최근에 성공적으로 업데이트 완료)');
    } else {
      // Create new document
      finalSubmission = {
        ...cleanSubmissionData,
        id: fullPath,
        studentSchool: cleanSubmissionData.studentSchool || cleanSubmissionData.schoolName,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        isMock: cleanSubmissionData.isMock || false,
        ratings: cleanSubmissionData.isMock ? (cleanSubmissionData.ratings || {}) : {},
        averageRating: cleanSubmissionData.isMock ? (typeof cleanSubmissionData.averageRating === 'number' ? cleanSubmissionData.averageRating : 0) : 0,
        ratingCount: cleanSubmissionData.isMock ? (typeof cleanSubmissionData.ratingCount === 'number' ? cleanSubmissionData.ratingCount : 0) : 0,
        ownerUid: cleanSubmissionData.isMock ? null : (auth.currentUser?.uid || null),
        ownerRole: 'student',
      };
      
      await setDoc(docRef, finalSubmission);
      console.log('[Submission Save Success]', fullPath);
      localStorage.setItem('last_submission_error', '없음 (최근에 성공적으로 최초 저장 완료)');
    }

    const confirmSnap = await getDoc(docRef);
    if (!confirmSnap.exists()) {
      throw new Error(`Firestore 저장 검증 실패: ${fullPath}`);
    }

    // Run automated Gemini safety check
    try {
      await runAutomatedSafetyCheck(finalSubmission);
    } catch (checkError) {
      console.warn('[Safety Check Failed - Submission Still Saved]: Swallowed check error to prevent core submission failure', checkError);
    }

    return finalSubmission;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      fullPath,
      '제출물을 저장하지 못했습니다. 인터넷 연결 상태를 확인해 주세요.'
    );
  }
}

/**
 * 실시간 제출물 컬렉션 구독 (단일 쿼리로 반응형 전송 보장)
 */
export function subscribeSubmissionsBySchool(
  schoolIdentifier: string,
  sortOrder: 'asc' | 'desc' = 'desc',
  callback: (submissions: FirestoreSubmission[]) => void,
  onError?: (err: Error) => void
): () => void {
  const cleanSchoolName = schoolIdentifier.trim().toLowerCase();
  
  let unsubscribes: (() => void)[] = [];
  let isUnsubscribed = false;
  const submissionsMap = new Map<string, FirestoreSubmission>();

  getDoc(doc(db, 'schools', cleanSchoolName)).then(snap => {
    if (isUnsubscribed) return;
    const openedClasses: string[] = snap.exists() ? (snap.data()?.openedClasses || ['1반', '2반', '3반', '4반']) : ['1반', '2반', '3반', '4반', '5반', '6반', '7반', '8반', '9반', '10반'];
    
    unsubscribes = openedClasses.map(className => {
      const q = query(
        collection(db, `${COLLECTION_NAME}/${cleanSchoolName}/${className}`),
        where('isDeleted', '==', false)
      );

      return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            submissionsMap.delete(change.doc.ref.path);
          } else {
            const data = change.doc.data() as FirestoreSubmission;
            submissionsMap.set(change.doc.ref.path, { 
              ...data, 
              id: change.doc.ref.path,
              timestamp: data.createdAt || data.updatedAt || new Date().toISOString()
            } as any);
          }
        });

        const submissionsList = Array.from(submissionsMap.values());
        submissionsList.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        callback(submissionsList);
      }, (error) => {
        console.error(`[Load Failed for ${className}]:`, error);
        if (onError) onError(error);
      });
    });
  }).catch(err => {
    console.error('[Failed to fetch school classes]:', err);
    if (onError) onError(err);
  });

  return () => {
    isUnsubscribed = true;
    unsubscribes.forEach(u => u());
  };
}

/**
 * 실제 영구 삭제 처리
 */
export async function deleteSubmission(submissionId: string): Promise<void> {
  try {
    const docRef = submissionId.includes('/') 
      ? doc(db, submissionId) 
      : doc(db, COLLECTION_NAME, submissionId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      submissionId,
      '제출물을 삭제하지 못했습니다.'
    );
  }
}

/**
 * 해당 학교/학급 전체 제출물을 Firestore에서 완전히 영구 삭제합니다.
 */
export async function clearSubmissionsBySchool(schoolIdentifier: string): Promise<void> {
  const cleanSchoolName = schoolIdentifier.trim().toLowerCase();
  
  try {
    const schoolDoc = await getDoc(doc(db, 'schools', cleanSchoolName));
    const openedClasses: string[] = schoolDoc.exists() ? (schoolDoc.data()?.openedClasses || ['1반', '2반', '3반', '4반']) : ['1반', '2반', '3반', '4반', '5반', '6반', '7반', '8반', '9반', '10반'];
    
    const queries = openedClasses.map(className => 
      getDocs(query(
        collection(db, `${COLLECTION_NAME}/${cleanSchoolName}/${className}`)
      ))
    );
    
    const querySnapshots = await Promise.all(queries);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshots.forEach(snapshot => {
      snapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
        count++;
      });
    });

    if (count > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `${COLLECTION_NAME}/${cleanSchoolName}`,
      '제출물 일괄 삭제 처리에 실패했습니다.'
    );
  }
}

/**
 * 특정 학교의 예시 학생 데이터(MOCK 제출 목록)를 서브컬렉션에서 즉시 일괄 하드-삭제합니다.
 */
export async function deleteMockSubmissionsBySchool(schoolIdentifier: string): Promise<number> {
  const cleanSchoolName = schoolIdentifier.trim().toLowerCase();
  const mockNames = ['김지민', '이은우', '최서연', '정예은', '박수연', '강민호', '윤지우', '한다인', '최민우', '정지훈', '한아름', '서태웅'].map(n => n.trim().toLowerCase());
  
  try {
    const schoolDoc = await getDoc(doc(db, 'schools', cleanSchoolName));
    const openedClasses: string[] = schoolDoc.exists() ? (schoolDoc.data()?.openedClasses || ['1반', '2반', '3반', '4반']) : ['1반', '2반', '3반', '4반', '5반', '6반', '7반', '8반', '9반', '10반'];
    
    const queries = openedClasses.map(className => 
      getDocs(query(
        collection(db, `${COLLECTION_NAME}/${cleanSchoolName}/${className}`)
      ))
    );
    
    const querySnapshots = await Promise.all(queries);
    const batch = writeBatch(db);
    let deletedCount = 0;

    querySnapshots.forEach(snapshot => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as FirestoreSubmission;
        const isMock = data.isMock === true || 
                       (data.studentName && mockNames.includes(data.studentName.trim().toLowerCase()));
        
        if (isMock) {
          batch.delete(docSnap.ref);
          deletedCount++;
        }
      });
    });

    if (deletedCount > 0) {
      await batch.commit();
    }
    return deletedCount;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      COLLECTION_NAME,
      '예시 데이터를 삭제하는 동안 오류가 발생했습니다.'
    );
    return 0;
  }
}

/**
 * 특정 학교의 모든 학급별 submission_checks 컬렉션을 모니터링하여 실시간 목록으로 배포합니다.
 */
export function subscribeSubmissionChecksBySchool(
  schoolIdentifier: string,
  callback: (checks: SubmissionCheck[]) => void,
  onError?: (err: Error) => void
): () => void {
  const cleanSchoolName = schoolIdentifier.trim().toLowerCase();
  
  let unsubscribes: (() => void)[] = [];
  let isUnsubscribed = false;
  const checksMap = new Map<string, SubmissionCheck>();

  getDoc(doc(db, 'schools', cleanSchoolName)).then(snap => {
    if (isUnsubscribed) return;
    const openedClasses: string[] = snap.exists() ? (snap.data()?.openedClasses || ['1반', '2반', '3반', '4반']) : ['1반', '2반', '3반', '4반', '5반', '6반', '7반', '8반', '9반', '10반'];
    
    unsubscribes = openedClasses.map(className => {
      const q = query(
        collection(db, `submission_checks/${cleanSchoolName}/${className}`)
      );

      return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'removed') {
            checksMap.delete(change.doc.ref.path);
          } else {
            const data = change.doc.data();
            checksMap.set(change.doc.ref.path, {
              ...data,
              id: change.doc.ref.path,
              submissionId: data.submissionId || change.doc.ref.path.replace(/^submission_checks\//, 'submissions/')
            } as any);
          }
        });

        const checksList = Array.from(checksMap.values());
        callback(checksList);
      }, (error) => {
        console.error(`[Load Checks Failed for ${className}]:`, error);
        if (onError) onError(error);
      });
    });
  }).catch(err => {
    console.error('[Failed to fetch school classes for checks]:', err);
    if (onError) onError(err);
  });

  return () => {
    isUnsubscribed = true;
    unsubscribes.forEach(u => u());
  };
}

