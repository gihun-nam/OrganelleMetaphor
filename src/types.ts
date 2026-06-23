/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Organelle {
  id: string;
  name: string;
  englishName: string;
  cellType: 'both' | 'plant' | 'animal';
  keywords: string[];
  description: string;
  shapeDescription: string;
  teacherTip: string;
  metaphorExample: string;
}

export interface MetaphorSubmission {
  id: string;
  studentName: string;
  studentClass?: string; // 학급 정보 (예: "1반", "2반", "3반", "4반")
  studentSchool?: string; // 학교 소속 정보 (예: "서울고등학교")
  schoolId?: string;
  schoolName?: string;
  normalizedSchoolName?: string;
  organelleId: string;
  organelleName: string;
  ownerUid?: string | null;
  metaphorSubject: string; // "미토콘드리아는 [발전소]이다"
  metaphorReason: string;  // "왜냐하면 [생명활동에 필요한 에너지(ATP)를 생산]하기 때문이다"
  ratings: { [voterName: string]: number }; // Voter Name to score map (to prevent duplicate student votes)
  averageRating: number;
  ratingCount: number;
  timestamp: string;
  customImage?: string; // 학생이 직접 업로드한 그림 (Base64)
  isMock?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegisteredSchool {
  schoolName: string;
  teacherPin: string; // 교사 관리용 비밀번호
  studentPassword: string; // 학생 로그인용 비밀번호
}

export interface SubmissionCheck {
  submissionId: string;
  schoolId?: string;
  classId?: string;
  schoolName: string;
  className: string;
  checked: boolean;
  needsReview: boolean;
  categories: string[];
  flaggedSpans: {
    field: 'title' | 'content';
    text: string;
    reason: string;
  }[];
  summary: string;
  checkedAt: any; // Firestore Timestamp or ISO String
  model: string;
  sourceHash: string;
  error?: boolean;
  errorMessage?: string;
  isQuotaExceeded?: boolean;
}

