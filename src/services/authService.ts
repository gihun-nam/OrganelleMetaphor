/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth, db } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  role: 'student' | 'teacher';
  schoolId: string;
  schoolName: string;
  classId?: string; // Option for student
  className?: string; // Option for student
  displayName: string;
  createdAt: string;
}

/**
 * Encodes string safely to be used in standard email address (handles Korean / UTF-8)
 */
function encodeStringToSafeId(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str.trim().toLowerCase());
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates deterministic student sign-in email (including password to correctly support homonyms in the same class)
 */
export function getStudentEmail(schoolId: string, classId: string, studentName: string, personalPassword?: string): string {
  const sub = personalPassword ? `#${personalPassword.trim()}` : '';
  const encoded = encodeStringToSafeId(`${schoolId.trim()}#${classId.trim()}#${studentName.trim()}${sub}`);
  return `std_${encoded}@cellmetaphor.app`;
}

/**
 * Generates deterministic teacher sign-in email
 */
export function getTeacherEmail(schoolId: string): string {
  const encoded = encodeStringToSafeId(schoolId);
  return `tch_${encoded}@cellmetaphor.app`;
}

/**
 * Pads password to bypass Firebase Auth 6-character limit safely
 */
export function getSecuredPassword(rawPin: string, isTeacher: boolean): string {
  const trimmed = rawPin.trim();
  if (isTeacher) {
    return trimmed.length >= 6 ? trimmed : `tch_pin_${trimmed}`;
  } else {
    return trimmed.length >= 6 ? trimmed : `std_pswd_${trimmed}`;
  }
}

/**
 * Authenticates/registers a student deterministically
 */
export async function authenticateStudent(params: {
  schoolId: string;
  schoolName: string;
  classId: string;
  studentName: string;
  personalPassword: string;
}): Promise<{ user: User; profile: UserProfile }> {
  const email = getStudentEmail(params.schoolId, params.classId, params.studentName, params.personalPassword);
  const password = getSecuredPassword(params.personalPassword, false);

  let user: User;

  try {
    // 1. Try to register first (highly deterministic student account)
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    user = userCredential.user;
  } catch (error: any) {
    // 2. If already registered, perform sign-in verification
    if (error.code === 'auth/email-already-in-use') {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
      } catch (signInError: any) {
        console.error('Student sign-in failure with existing email:', signInError);
        throw new Error('비밀번호가 기존 정보와 일치하지 않습니다.');
      }
    } else {
      console.error('Student account provision error:', error);
      throw new Error('접속 오류가 발생했습니다.');
    }
  }

  const schoolId = params.schoolId.toLowerCase().trim();
  const classId = params.classId.trim();

  // Ensure phantom parent doesn't occur (create parent user-school document)
  try {
    await setDoc(doc(db, 'users', schoolId), {
      schoolId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('[Parent User School Doc Created/Updated]', `users/${schoolId}`);
  } catch (parentError) {
    console.warn('[Parent User School Doc Warning]: Failed to set parent user school document:', parentError);
  }

  const profileRef = doc(db, 'users', schoolId, classId, user.uid);
  
  // 3. Ensure role and context is written to roles/users doc
  const profile: UserProfile = {
    uid: user.uid,
    role: 'student',
    schoolId: schoolId,
    schoolName: params.schoolName,
    classId: classId,
    className: classId,
    displayName: params.studentName.trim(),
    createdAt: new Date().toISOString()
  };

  await setDoc(profileRef, profile, { merge: true });
  return { user, profile };
}

/**
 * Authenticates/registers a teacher deterministically
 */
export async function authenticateTeacher(params: {
  schoolId: string;
  schoolName: string;
  teacherPin: string;
}): Promise<{ user: User; profile: UserProfile }> {
  // First, retrieve the exact teacherAuthEmail assigned to this session context by schoolService
  let email = getTeacherEmail(params.schoolId);
  try {
    const schoolDoc = await getDoc(doc(db, 'schools', params.schoolId.toLowerCase()));
    if (schoolDoc.exists() && schoolDoc.data()?.teacherAuthEmail) {
      email = schoolDoc.data().teacherAuthEmail;
    }
  } catch (err) {
    console.error('Failed to retrieve precise auth email, falling back to deterministic email.', err);
  }

  const password = getSecuredPassword(params.teacherPin, true);

  let user: User;

  try {
    // 1. Try to register teacher classroom account first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    user = userCredential.user;
  } catch (error: any) {
    // 2. If classroom already has a teacher account, sign in
    if (error.code === 'auth/email-already-in-use') {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
      } catch (signInError: any) {
        console.error('Teacher sign-in failure with existing email:', signInError);
        throw new Error(
          '해당 학교/교실의 대표자가 이미 설정되어 있으나 입력하신 PIN(비밀번호)이 기존에 등록된 PIN과 일치하지 않습니다. 올바른 PIN을 확인 후 다시 시도해 주세요.'
        );
      }
    } else {
      console.error('Teacher account provision error:', error);
      throw new Error(`교사 배움터 처리 실패 (${error.message || '네트워크 연결을 확인해 주세요'})`);
    }
  }

  const schoolId = params.schoolId.toLowerCase().trim();

  // Ensure phantom parent doesn't occur (create parent user-school document)
  try {
    await setDoc(doc(db, 'users', schoolId), {
      schoolId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('[Parent User School Doc Created/Updated]', `users/${schoolId}`);
  } catch (parentError) {
    console.warn('[Parent User School Doc Warning]: Failed to set parent user school document:', parentError);
  }

  const profileRef = doc(db, 'users', schoolId, '_teachers', user.uid);

  const profile: UserProfile = {
    uid: user.uid,
    role: 'teacher',
    schoolId: schoolId,
    schoolName: params.schoolName,
    displayName: '담당 교수자',
    createdAt: new Date().toISOString()
  };

  await setDoc(profileRef, profile, { merge: true });
  return { user, profile };
}

/**
 * Logs out the current user session
 */
export async function appLogout(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
  }
}
