/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MetaphorSubmission, SubmissionCheck } from '../types';
import { OrganelleIllustration } from './OrganelleIllustration';
import { createSchoolOrClass, loginTeacher, getSchoolOrClassByName, updateTeacherPin, updateSchoolTimerState, FirestoreSchool, subscribeAllSchools, deleteSchoolRecord } from '../services/schoolService';
import {
  School,
  Users,
  Star,
  Search,
  Trash2,
  Download,
  RefreshCw,
  Eye,
  Layers,
  Lock,
  Unlock,
  ShieldAlert,
  Settings,
  ShieldCheck,
  UserCheck,
  BarChart3,
  Play,
  Pause,
  RotateCcw,
  Timer,
  Square,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import firebaseConfig from '../lib/customFirebaseConfig';

import { authenticateTeacher } from '../services/authService';
import { auth } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';

const categoryLabels: { [key: string]: string } = {
  personal_info: '개인정보 포함',
  identifiable_person: '특정인 식별가능',
  insult: '비하/욕설/모욕',
  hate_or_discrimination: '혐오/차별',
  sexual_content: '성적 표현',
  violent_content: '폭력성',
  self_harm: '자해 관련',
  inappropriate_classroom_content: '부적절한 교실 콘텐츠',
  other: '기타 부적절 표현',
  check_failed: '자동검사 실패',
  quota_exceeded: 'API 호출한도 초과'
};

function renderHighlightedText(
  text: string,
  flaggedSpans: { field: 'title' | 'content'; text: string; reason: string }[] | undefined,
  field: 'title' | 'content'
): React.ReactNode {
  if (!text) return '';
  if (!flaggedSpans || flaggedSpans.length === 0) return text;

  // Filter and get target texts that are inside the text
  const fieldSpans = flaggedSpans.filter((s) => s.field === field && s.text && s.text.trim() !== '');
  if (fieldSpans.length === 0) return text;

  // Sort by text length descending so longer matches are processed before shorter subsegments
  const sortedSpans = [...fieldSpans].sort((a, b) => b.text.length - a.text.length);
  const targets = sortedSpans.map((s) => s.text);

  // Escape targets for regex
  const escapedTargets = targets.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (escapedTargets.length === 0) return text;

  try {
    const regex = new RegExp(`(${escapedTargets.join('|')})`, 'g');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // Find matching span to fetch its specific review reason
      const matchedSpan = fieldSpans.find((s) => s.text.trim().toLowerCase() === part.trim().toLowerCase());
      if (matchedSpan) {
        return (
          <span
            key={index}
            className="text-[#962A2A] font-bold bg-[#FAEBEB] rounded px-1.5 py-0.5 mx-0.5 border border-[#E1B1B1] inline-block"
            title={matchedSpan.reason}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  } catch (err) {
    console.error('[Highlight rendering failed, falling back to raw text]:', err);
    return text;
  }
}

interface TeacherDashboardProps {
  submissions: MetaphorSubmission[];
  submissionChecks?: SubmissionCheck[];
  schoolData?: FirestoreSchool | null;
  onLoadMockData: () => void;
  onClearAllData: () => void;
  onDeleteSubmission: (id: string) => void;
  isUnlocked: boolean;
  setIsUnlocked: (val: boolean) => void;
  onSchoolChange?: (schoolName: string) => void;
  onRestartActivity?: (durationSeconds: number) => Promise<void>;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  submissions,
  submissionChecks = [],
  schoolData,
  onLoadMockData,
  onClearAllData,
  onDeleteSubmission,
  isUnlocked,
  setIsUnlocked,
  onSchoolChange,
  onRestartActivity
}) => {
  // --- Security Credentials & Setup States ---
  const [schoolName, setSchoolName] = useState<string>(() => localStorage.getItem('cell_teacher_school') || '');
  const [pinCode, setPinCode] = useState<string>(() => localStorage.getItem('cell_teacher_pin') || '');
  const [studentPassword, setStudentPassword] = useState<string>(() => localStorage.getItem('cell_student_login_password') || '');
  const [joinCode, setJoinCode] = useState<string>(() => localStorage.getItem('cell_teacher_join_code') || '');

  useEffect(() => {
    if (schoolName) {
      getSchoolOrClassByName(schoolName).then((school) => {
        if (school && school.joinCode) {
          setJoinCode(school.joinCode);
          localStorage.setItem('cell_teacher_join_code', school.joinCode);
        }
      }).catch(console.error);
    }
  }, [schoolName]);

  // Real-time synchronization of active logged-in students for this school
  const [activeStudents, setActiveStudents] = useState<any[]>([]);

  useEffect(() => {
    const fetchActiveStudents = () => {
      if (!schoolName) {
        setActiveStudents([]);
        return;
      }
      try {
        const key = `cell_drive_${schoolName.toLowerCase()}_active_students`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setActiveStudents(parsed);
            return;
          }
        }
      } catch (e) {
        console.error('Error fetching active students in dashboard:', e);
      }
      setActiveStudents([]);
    };

    fetchActiveStudents();

    // Poll every 2 seconds to check for new student logins in real-time
    const interval = setInterval(fetchActiveStudents, 2000);
    return () => clearInterval(interval);
  }, [schoolName, submissions]);

  // Gate mode switcher: 'signup' (create new school) vs 'login' (sign in as teacher of existing school)
  const [gateMode, setGateMode] = useState<'signup' | 'login'>('signup');

  // Setup/Signup inputs
  const [setupSchoolInput, setSetupSchoolInput] = useState('');
  const [setupPinInput, setSetupPinInput] = useState('');
  const [setupPinConfirmInput, setSetupPinConfirmInput] = useState('');
  const [setupStudentPasswordInput, setSetupStudentPasswordInput] = useState('');
  const [setupError, setSetupError] = useState('');

  // Login inputs (sign in of existing school)
  const [loginSchoolInput, setLoginSchoolInput] = useState('');
  const [loginPinInput, setLoginPinInput] = useState('');

  // Lock & Unlock status (Session based + State)
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [loginError, setLoginError] = useState('');

  // Change Teacher PIN states
  const [changePinModalOpen, setChangePinModalOpen] = useState(false);
  const [changePinCurrentInput, setChangePinCurrentInput] = useState('');
  const [changePinNewInput, setChangePinNewInput] = useState('');
  const [changePinConfirmInput, setChangePinConfirmInput] = useState('');
  const [changePinError, setChangePinError] = useState('');

  // Credentials Reset states (Prompting passcode before clearing)
  const [resetCredentialsModalOpen, setResetCredentialsModalOpen] = useState(false);
  const [resetCredentialsPinInput, setResetCredentialsPinInput] = useState('');
  const [resetCredentialsError, setResetCredentialsError] = useState('');

  // Submission DB Reset states (PIN confirm before clear)
  const [resetDbModalOpen, setResetDbModalOpen] = useState(false);
  const [resetDbPinInput, setResetDbPinInput] = useState('');
  const [resetDbError, setResetDbError] = useState('');

  // --- Admin Dev Tool States ---
  const [isDevToolCollapsed, setIsDevToolCollapsed] = useState<boolean>(true);
  const [devPasswordInput, setDevPasswordInput] = useState<string>('');
  const [isDevAdminUnlocked, setIsDevAdminUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('cell_dev_admin_unlocked') === 'true';
  });
  const [allSchoolsList, setAllSchoolsList] = useState<FirestoreSchool[]>([]);
  const [devPassError, setDevPassError] = useState<string>('');

  useEffect(() => {
    if (!isDevAdminUnlocked || isDevToolCollapsed) {
      setAllSchoolsList([]);
      return;
    }

    const unsubscribe = subscribeAllSchools((schools) => {
      setAllSchoolsList(schools);
    }, (err) => {
      console.error('[subscribeAllSchools Error]:', err);
    });
    return () => unsubscribe();
  }, [isDevAdminUnlocked, isDevToolCollapsed]);

  const handleDevUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setDevPassError('');
    // 하드코딩 제거: 개발 환경에서 .env의 VITE_DEV_ADMIN_PASSWORD로만 잠금 해제.
    const devAdminPassword = import.meta.env.VITE_DEV_ADMIN_PASSWORD;
    if (devAdminPassword && devPasswordInput === devAdminPassword) {
      setIsDevAdminUnlocked(true);
      sessionStorage.setItem('cell_dev_admin_unlocked', 'true');
      setDevPasswordInput('');
    } else {
      setDevPassError('❌ 관리자 비밀번호가 일치하지 않습니다.');
    }
  };

  const handleDeleteSchool = async (school: FirestoreSchool) => {
    if (confirm(`⚠️ [경고] 정말로 '${school.schoolName}' 배움터(학교) 공간을 삭제하시겠습니까?\n이 작업은 복구할 수 없으며 학생들의 모든 제출 데이터도 삭제될 수 있습니다.`)) {
      try {
        await deleteSchoolRecord(school.schoolName);
        alert(`🎉 '${school.schoolName}' 배움터 삭제가 정상적으로 완료되었습니다.`);
      } catch (err: any) {
        alert('삭제 오류 발생: ' + err.message);
      }
    }
  };

  const renderDevTools = () => {
    // 보안: 디버깅 도구(Firebase 설정 노출·배움터 삭제 기능)는 개발 환경에서만 렌더한다.
    // 프로덕션 빌드에서는 절대 노출되지 않는다.
    if (!import.meta.env.DEV) return null;

    // 1. 접혔을 때 폭: w-full max-w-xl mx-auto
    // 2. 펼쳤을 때 최상의 가독성: w-full max-w-5xl mx-auto, 넉넉한 padding 적용
    const containerClasses = isDevToolCollapsed
      ? "mt-4 bg-slate-50/55 py-2 px-4 rounded-xl border border-slate-200 shadow-2xs w-full max-w-xl mx-auto transition-all duration-200"
      : "mt-8 bg-slate-50/55 p-6 rounded-2xl border-2 border-slate-200 shadow-sm w-full max-w-5xl mx-auto text-left transition-all duration-200";

    return (
      <div className={containerClasses} id="admin-dev-tools-panel">
        <div className="flex items-center justify-between gap-3 w-full" id="dev-header-dock">
          <button
            type="button"
            onClick={() => setIsDevToolCollapsed(!isDevToolCollapsed)}
            className="flex-1 flex items-center justify-between font-sans font-black text-slate-700 text-[11px] sm:text-xs tracking-tight uppercase cursor-pointer py-1 hover:text-slate-900 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-left">
              🛠️ 디버깅 및 실시간 동기화 진단 도구
              {isDevToolCollapsed ? (
                <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold font-sans">
                  접힘
                </span>
              ) : (
                <span className="bg-[#DDE8D6] text-[#123D2A] px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold font-sans">
                  열림
                </span>
              )}
            </span>
            {isDevToolCollapsed ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronUp className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          
          {isDevAdminUnlocked && !isDevToolCollapsed && (
            <button
              type="button"
              onClick={() => {
                setIsDevAdminUnlocked(false);
                sessionStorage.removeItem('cell_dev_admin_unlocked');
                setDevPasswordInput('');
                alert('🔒 관리자 도구가 안전하게 잠겼습니다.');
              }}
              className="shrink-0 text-[9px] sm:text-[10px] font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
              title="관리자 도구 즉시 잠금"
            >
              잠금 🔒
            </button>
          )}
        </div>

        {!isDevToolCollapsed && (
          <div className="mt-4 space-y-6 text-left animate-fade-in" id="admin-dev-content">
            {/* If not unlocked, show password input */}
            {!isDevAdminUnlocked ? (
              <form onSubmit={handleDevUnlock} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-inner max-w-sm mx-auto text-center" id="dev-lock-form">
                <p className="text-xs text-slate-600 font-extrabold flex items-center justify-center gap-1">
                  🔒 관리자 권한 접근을 위해 비밀번호를 입력하세요.
                </p>
                <div className="flex gap-2 justify-center">
                  <input
                    type="password"
                    placeholder="비밀번호 입력"
                    value={devPasswordInput}
                    onChange={(e) => setDevPasswordInput(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-[#123D2A]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#123D2A] hover:bg-[#1B5A3A] text-white rounded-lg text-xs font-black transition-colors cursor-pointer"
                  >
                    확인
                  </button>
                </div>
                {devPassError && (
                  <p className="text-rose-600 text-[10px] font-bold">{devPassError}</p>
                )}
              </form>
            ) : (
              /* If unlocked, show full tools */
              <div className="space-y-6 animate-fade-in" id="dev-unlocked-tools">
                
                {/* 1. Real-time Firebase Config Overview: grid-cols-1 lg:grid-cols-2 반응형 2열 배치 */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-black text-slate-700 flex items-center gap-1">
                      📡 Firebase 프로젝트 및 연결 속성
                    </h4>
                    <span className="text-[9px] text-[#123D2A] font-extrabold bg-[#DDE8D6] px-1.5 py-0.5 rounded">biologyorganelle 활성</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 block uppercase">🔗 참조 프로젝트 (Project ID)</span>
                      <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 break-all select-all min-w-0 overflow-x-auto">
                        {firebaseConfig?.projectId || 'projectId 미설정'}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 block">🗄️ 참조 데이터베이스 ID (Database ID)</span>
                      <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-[#123D2A] break-all select-all min-w-0 overflow-x-auto">
                        {firebaseConfig?.firestoreDatabaseId || '(default)'}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 block">🔑 API Key 존재 여부</span>
                      <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800">
                        {firebaseConfig?.apiKey ? '설정됨 (보안 표기)' : '미설정 ⚠️'}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 block">📜 권한 검증 Rules 파일</span>
                      <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-[#1D4ED8]">
                        firestore.rules (DRAFT_firestore.rules는 미매칭 경고)
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Real-time Path Examples & Errors: 2열 반응형 배치 */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-black text-slate-700">
                      📂 Firestore 실제 저장 경로 및 최신 호출 오류 로그
                    </h4>
                  </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400">💾 원본 제출(submissions) 경로 예시</span>
                        <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-[11px] font-mono font-bold text-slate-600 break-all overflow-x-auto">
                          submissions/&#123;schoolId&#125;/&#123;classId&#125;/이름_비밀번호_소기관ID
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-slate-400">🤖 AI 안전성 검증(checks) 경로 예시</span>
                        <div className="bg-slate-50 border border-slate-150 rounded-lg px-2.5 py-1.5 text-[11px] font-mono font-bold text-slate-600 break-all overflow-x-auto">
                          submission_checks/&#123;schoolId&#125;/&#123;classId&#125;/이름_비밀번호_소기관ID
                        </div>
                      </div>

                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-[10px] font-black text-amber-700 font-sans block">❌ 최신 원본 제출(submissions) 에러 로그 (실시간)</span>
                      <div className="bg-amber-50/50 border border-amber-100 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-900 break-words max-h-24 overflow-y-auto">
                        {localStorage.getItem('last_submission_error') || '정상 적재 완료 (최근 오류 없음)'}
                      </div>
                    </div>

                    <div className="space-y-1 lg:col-span-2">
                      <span className="text-[10px] font-black text-sky-700 font-sans block">🛡️ 최신 AI 안전성(submission_checks) 에러 로그 (실시간)</span>
                      <div className="bg-sky-50/50 border border-sky-100 rounded-lg px-2.5 py-2 text-xs font-medium text-sky-900 break-words max-h-24 overflow-y-auto">
                        {localStorage.getItem('last_safety_check_error') || '정상 검증 완료 (최근 오류 없음)'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Real-time Created School/Classes list */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <h4 className="text-xs font-black text-slate-700 flex items-center gap-1">
                      🏫 실시간 배움터 목록 ({allSchoolsList.length}개)
                    </h4>
                    <span className="text-[9px] text-[#123D2A] font-bold shrink-0">Firestore 실시간 수집됨</span>
                  </div>

                  {allSchoolsList.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold text-center py-2 font-sans">개설된 배움터가 없거나 잠재 데이터를 로드하는 중입니다.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto pr-1" id="dev-schools-list">
                      {allSchoolsList.map((sch) => (
                        <div key={sch.normalizedSchoolName} className="py-2.5 flex items-start sm:items-center justify-between gap-3 text-xs font-medium text-slate-800 hover:bg-slate-50 px-2 rounded-lg transition-colors flex-col sm:flex-row">
                          <div className="space-y-1 min-w-0 flex-1">
                            <span className="font-extrabold text-[#123D2A] text-sm block truncate">{sch.schoolName}</span>
                            <div className="flex gap-1.5 flex-wrap text-[9px] text-slate-500 font-black">
                              <span className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded border border-sky-100">입장: <strong className="font-sans select-all">{sch.joinCode}</strong></span>
                              {sch.openedClasses && sch.openedClasses.length > 0 && (
                                <span className="bg-[#DDE8D6] text-[#123D2A] px-1.5 py-0.5 rounded border border-[#D7D2C4]/50 text-[8px]">학급: {sch.openedClasses.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => handleDeleteSchool(sch)}
                            className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded text-rose-500 hover:text-rose-600 transition-colors cursor-pointer flex items-center justify-center self-end sm:self-center shrink-0"
                            title="배움터 영구 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // --- Teacher Synchronized Timer Control States ---
  const [teacherSecondsLeft, setTeacherSecondsLeft] = useState(300);
  const [teacherTimerIsActive, setTeacherTimerIsActive] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(5);

  useEffect(() => {
    if (!schoolData) return;

    const { timerIsActive, timerSecondsLeft = 300, timerStartAt, timerDuration = 300 } = schoolData;

    // Synchronize initial chosen minutes for spinner
    if (timerDuration && timerDuration > 0) {
      setSelectedMinutes(Math.ceil(timerDuration / 60));
    }

    if (timerIsActive) {
      setTeacherTimerIsActive(true);

      const calculate = () => {
        if (!timerStartAt) return timerSecondsLeft;
        const elapsed = Math.floor((Date.now() - new Date(timerStartAt).getTime()) / 1000);
        const remaining = timerDuration - elapsed;
        return remaining > 0 ? remaining : 0;
      };

      const remainingVal = calculate();
      setTeacherSecondsLeft(remainingVal > 0 ? remainingVal : 0);

      const interval = setInterval(() => {
        const remaining = calculate();
        if (remaining <= 0) {
          setTeacherSecondsLeft(0);
          setTeacherTimerIsActive(false);
          clearInterval(interval);
        } else {
          setTeacherSecondsLeft(remaining);
        }
      }, 500);

      return () => clearInterval(interval);
    } else {
      setTeacherTimerIsActive(false);
      if (timerSecondsLeft <= 0) {
        setTeacherSecondsLeft(0);
      } else {
        setTeacherSecondsLeft(timerSecondsLeft);
      }
    }
  }, [schoolData]);

  // Handler for scrolling/spinning slot machine values
  const handleSpinnerChange = async (newVal: number) => {
    setSelectedMinutes(newVal);
    if (!teacherTimerIsActive) {
      setTeacherSecondsLeft(newVal * 60);
      const scName = schoolName || localStorage.getItem('cell_teacher_school');
      if (scName && schoolData) {
        try {
          await updateSchoolTimerState(
            scName,
            false, // timerIsActive
            newVal * 60, // timerSecondsLeft
            '', // timerStartAt
            newVal * 60 // timerDuration
          );
        } catch (err) {
          console.error('Failed to sync idle spinner value:', err);
        }
      }
    }
  };

  // Handler for Pausing the Timer
  // Handler for Pausing the Timer
  const handleTeacherPauseTimer = async () => {
    const scName = schoolName || localStorage.getItem('cell_teacher_school');
    if (!scName) return;
    try {
      await updateSchoolTimerState(
        scName,
        false, // timerIsActive
        teacherSecondsLeft, // timerSecondsLeft
        schoolData?.timerStartAt || '', // timerStartAt
        schoolData?.timerDuration || 300 // timerDuration
      );
    } catch (err: any) {
      console.error('Pause error:', err);
    }
  };

  // Handler for Playing/Resuming the Timer
  const handleTeacherPlayTimer = async () => {
    const scName = schoolName || localStorage.getItem('cell_teacher_school');
    if (!scName) return;
    if (teacherSecondsLeft <= 0) {
      alert(`시간이 종료되었습니다. 우측의 '이전 설정 시간으로 초기화(회전화살표)' 단추를 눌러 타이머를 초기화한 후에 시작해 주세요.`);
      return;
    }
    try {
      await updateSchoolTimerState(
        scName,
        true, // timerIsActive
        teacherSecondsLeft, // timerSecondsLeft
        new Date().toISOString(), // timerStartAt
        teacherSecondsLeft // timerDuration (남은 시간이 이 시점의 카운트다운 시작점이 되도록 반영)
      );
    } catch (err: any) {
      console.error('Play error:', err);
    }
  };

  // Handler for Stop/Ending the Timer immediately (학생 창도 함께 닫아 완수 권한 종료시킴)
  const handleTeacherStopTimer = async () => {
    const scName = schoolName || localStorage.getItem('cell_teacher_school');
    if (!scName) return;
    if (confirm("활동을 즉시 마감하여 학생들의 비유 작성을 종료하시겠습니까?\n(학생 화면에 제한시간 마감 알림이 표시되며 작성 중인 입력란이 닫히게 됩니다.)")) {
      try {
        await updateSchoolTimerState(
          scName,
          false, // timerIsActive: false
          0, // timerSecondsLeft: 0 (forces times up layout for students)
          '', // timerStartAt
          schoolData?.timerDuration || (selectedMinutes * 60) // timerDuration
        );
        alert("원격 일괄 마감 처리가 완료되었습니다.\n학생들 화면에 제한시간 마감 안내 팝업이 표출되며 교정용 작성란이 닫히고, 친구들 비유 별점 평가 모드로 즉시 자동 전환됩니다!");
      } catch (err: any) {
        console.error('Stop error:', err);
      }
    }
  };

  // Handler for Re-initializing the activity to previously set minutes
  const handleTeacherResetTimer = async () => {
    if (teacherTimerIsActive || teacherSecondsLeft > 0) {
      alert("타이머가 아직 작동 중이거나 일시정지 상태입니다. 빨간 네모(정지) 버튼으로 완전히 활동을 마감하거나 제한시간이 다 된 후에만 초기화할 수 있습니다.");
      return;
    }
    const scName = schoolName || localStorage.getItem('cell_teacher_school');
    if (!scName || !onRestartActivity) return;
    if (confirm(`전체 학생들의 비유 작성 타이머를 활동 시간(${selectedMinutes}분)으로 다시 초기화하시겠습니까?\n\n- 학생들 화면이 "활동 시작 대기" 화면으로 초기화됩니다.\n- 새로운 세포소기관이 랜덤으로 배정되며, 시작 버튼을 학생 활동이 시작됩니다.`)) {
      try {
        await onRestartActivity(selectedMinutes * 60);
      } catch (err: any) {
        alert('초기화 중 오류 발생: ' + err.message);
      }
    }
  };

  // Up/Down Arrows action inside Teacher timer widget to adjust starting/selected duration
  const handleAdjustMinutes = async (delta: number) => {
    const nextMinutes = Math.min(15, Math.max(1, selectedMinutes + delta));
    if (nextMinutes === selectedMinutes) return;

    setSelectedMinutes(nextMinutes);

    if (!teacherTimerIsActive) {
      setTeacherSecondsLeft(nextMinutes * 60);
      const scName = schoolName || localStorage.getItem('cell_teacher_school');
      if (scName && schoolData) {
        try {
          await updateSchoolTimerState(
            scName,
            false, // timerIsActive
            nextMinutes * 60, // timerSecondsLeft
            '', // timerStartAt
            nextMinutes * 60 // timerDuration
          );
        } catch (err) {
          console.error('Failed to sync adjusted minutes:', err);
        }
      }
    }
  };

  const formatTeacherTime = (timeInSecs: number) => {
    const mins = Math.floor(timeInSecs / 60);
    const secs = timeInSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Delete Entire School Account states
  const [deleteSchoolModalOpen, setDeleteSchoolModalOpen] = useState(false);
  const [deleteSchoolPinInput, setDeleteSchoolPinInput] = useState('');
  const [deleteSchoolError, setDeleteSchoolError] = useState('');

  // --- Core UI States ---
  const [activeTab, setActiveTab] = useState<'submissions' | 'peer_evaluation'>('submissions');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  // Peer Evaluation Student View States
  const [selectedStudentForAudit, setSelectedStudentForAudit] = useState<string | null>(null);

  const isCredentialsSetup = schoolName !== '' && pinCode !== '';

  // 1. Handle Setup Submission (Create/Register New School)
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    const trimmedSchool = setupSchoolInput.trim();
    const pin = setupPinInput.trim();
    const pinConfirm = setupPinConfirmInput.trim();
    const studentPass = setupStudentPasswordInput.trim();

    if (!trimmedSchool) {
      setSetupError('학교 이름을 명확하게 써주세요.');
      return;
    }
    if (pin.length !== 4 || isNaN(Number(pin))) {
      setSetupError('교사 전용 PIN 번호는 반드시 네 자리의 숫자로 구성되어야 합니다.');
      return;
    }
    if (pin !== pinConfirm) {
      setSetupError('교사 전용 PIN 번호 확인 입력값이 일치하지 않습니다.');
      return;
    }
    if (!studentPass) {
      setSetupError('학생들 전용 로그인 비밀번호를 입력해 주세요.');
      return;
    }

    try {
      const created = await createSchoolOrClass({
        schoolName: trimmedSchool,
        teacherPin: pin,
        studentPassword: studentPass
      });

      // Firebase Auth authentication for Teacher role
      await authenticateTeacher({
        schoolId: created.normalizedSchoolName,
        schoolName: created.schoolName,
        teacherPin: pin
      });

      // Authenticate / Set currently active
      localStorage.setItem('cell_teacher_school', trimmedSchool);
      localStorage.setItem('cell_teacher_pin', pin);
      localStorage.setItem('cell_student_login_password', studentPass);
      localStorage.setItem('cell_teacher_join_code', created.joinCode);
      localStorage.setItem('cell_teacher_session_unlocked', 'true');

      setSchoolName(trimmedSchool);
      setPinCode(pin);
      setStudentPassword(studentPass);
      setJoinCode(created.joinCode);
      setIsUnlocked(true);

      if (onSchoolChange) {
        onSchoolChange(trimmedSchool);
      }

      // Reset inputs
      setSetupSchoolInput('');
      setSetupPinInput('');
      setSetupPinConfirmInput('');
      setSetupStudentPasswordInput('');
      alert(`[${trimmedSchool}] 생명과환경 배움터가 성공적으로 개설(Firestore)되었습니다!\n\n🔑 교사 PIN: ${pin}\n🔒 학생 로그인 비밀번호: ${studentPass}\n🎫 학생 입장 코드 (Join Code): ${created.joinCode}`);
    } catch (err: any) {
      console.error(err);
      setSetupError(err.message || '학교/학급 정보를 저장하지 못했습니다. Firebase 설정 또는 인터넷 연결을 확인해 주세요.');
    }
  };

  // 1b. Handle Existing Teacher Login
  const handleTeacherLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    const trimmedSchool = loginSchoolInput.trim();
    const pin = loginPinInput.trim();

    if (!trimmedSchool) {
      setSetupError('학교 이름을 입력해 주세요.');
      return;
    }

    try {
      const schoolData = await loginTeacher(trimmedSchool, pin);

      // Firebase Auth authentication for Teacher role
      await authenticateTeacher({
        schoolId: schoolData.normalizedSchoolName,
        schoolName: schoolData.schoolName,
        teacherPin: pin
      });

      // Authenticate / Set currently active
      localStorage.setItem('cell_teacher_school', schoolData.schoolName);
      localStorage.setItem('cell_teacher_pin', schoolData.teacherPin);
      localStorage.setItem('cell_student_login_password', schoolData.studentPassword);
      if (schoolData.joinCode) {
        localStorage.setItem('cell_teacher_join_code', schoolData.joinCode);
      }
      localStorage.setItem('cell_teacher_session_unlocked', 'true');

      setSchoolName(schoolData.schoolName);
      setPinCode(schoolData.teacherPin);
      setStudentPassword(schoolData.studentPassword);
      if (schoolData.joinCode) {
        setJoinCode(schoolData.joinCode);
      }
      setIsUnlocked(true);

      if (onSchoolChange) {
        onSchoolChange(schoolData.schoolName);
      }

      // Reset inputs
      setLoginSchoolInput('');
      setLoginPinInput('');
      alert(`[${schoolData.schoolName}] 교수자용 관리 화면 로그인 성공!`);
    } catch (err: any) {
      console.error(err);
      setSetupError(err.message || '해당 학교/학급 공간을 찾을 수 없습니다.');
    }
  };

  // 2. Handle Unlock Submission (Re-unlock session)
  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (unlockPinInput.trim() === pinCode) {
      localStorage.setItem('cell_teacher_session_unlocked', 'true');
      setIsUnlocked(true);
      setUnlockPinInput('');
    } else {
      setLoginError('교수자용 비밀번호 4자리가 일치하지 않습니다. 다시 입력해 주세요.');
    }
  };

  // 3. Handle Credentials/Setup Reset Action (Log out / Release active session)
  const handleResetCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetCredentialsError('');

    if (resetCredentialsPinInput.trim() === pinCode) {
      localStorage.removeItem('cell_teacher_school');
      localStorage.removeItem('cell_teacher_pin');
      localStorage.removeItem('cell_student_login_password');
      localStorage.removeItem('cell_teacher_join_code');
      localStorage.removeItem('cell_teacher_session_unlocked');

      setSchoolName('');
      setPinCode('');
      setStudentPassword('');
      setJoinCode('');
      setIsUnlocked(false);
      setResetCredentialsModalOpen(false);
      setResetCredentialsPinInput('');
      setResetCredentialsError('');
      alert('교수자용 화면 로그아웃 완료! 다른 학교로 전환하거나 신규 개설을 하실 수 있습니다.');
    } else {
      setResetCredentialsError('교수자용 PIN 번호가 일치하지 않아 로그아웃에 실패했습니다.');
    }
  };

  // 4. Handle Submissions Database Reset Action with password protection
  const handleResetDbSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResetDbError('');

    if (resetDbPinInput.trim() === pinCode) {
      onClearAllData();
      setResetDbModalOpen(false);
      setResetDbPinInput('');
      setResetDbError('');
      alert('모든 학생의 비유 제출 내역과 상호 평가 데이터가 완전히 초기화되었습니다.');
    } else {
      setResetDbError('교수자용 비밀번호가 일치하지 않아 초기화 진행에 실패했습니다.');
    }
  };

  // 4_new. Handle Change Teacher PIN
  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError('');

    if (changePinCurrentInput.trim() !== pinCode) {
      setChangePinError('현재 사용 중인 비밀번호 PIN이 일치하지 않습니다.');
      return;
    }

    const newPin = changePinNewInput.trim();
    const confirmPin = changePinConfirmInput.trim();

    if (newPin.length !== 4 || isNaN(Number(newPin))) {
      setChangePinError('새 비밀번호 PIN은 반드시 네 자리의 숫자로 구성되어야 합니다.');
      return;
    }

    if (newPin !== confirmPin) {
      setChangePinError('새 비밀번호 PIN 확인 입력값이 일치하지 않습니다.');
      return;
    }

    try {
      await updateTeacherPin(schoolName, newPin);
      localStorage.setItem('cell_teacher_pin', newPin);
      setPinCode(newPin);
      
      // Clean states
      setChangePinModalOpen(false);
      setChangePinCurrentInput('');
      setChangePinNewInput('');
      setChangePinConfirmInput('');
      setChangePinError('');

      alert('교수자용 비밀번호 PIN이 성공적으로 변경되었습니다!');
    } catch (err: any) {
      setChangePinError('비밀번호 변경 중 데이터베이스 오류가 발생했습니다: ' + (err.message || err));
    }
  };

  // 4a. Handle General Logout (Simply locking the screen)
  const handleGeneralLogout = () => {
    localStorage.removeItem('cell_teacher_session_unlocked');
    setIsUnlocked(false);
    alert('교수자용 관리창이 안전하게 잠겼습니다(일반 로그아웃 완료).');
  };

  // 4b. Handle Leaving School Classroom (Log out of active school name context)
  const handleLeaveSchool = () => {
    if (confirm('현재 배움터 교실(학교)에서 로그아웃하시겠습니까?\n등록된 정보는 별도 데이터베이스에 저장됩니다.')) {
      localStorage.removeItem('cell_teacher_school');
      localStorage.removeItem('cell_teacher_pin');
      localStorage.removeItem('cell_student_login_password');
      localStorage.removeItem('cell_teacher_join_code');
      localStorage.removeItem('cell_teacher_session_unlocked');

      setSchoolName('');
      setPinCode('');
      setStudentPassword('');
      setJoinCode('');
      setIsUnlocked(false);

      if (onSchoolChange) {
        onSchoolChange('');
      }
      alert('배움터 교실 로그아웃 완료! 다른 학교로 로그인하거나 새로운 배움터 공간을 개설할 수 있습니다.');
    }
  };

  // 4c. Handle Deleting Entire School Account completely
  const handleDeleteSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteSchoolError('');

    if (deleteSchoolPinInput.trim() === pinCode) {
      try {
        await deleteSchoolRecord(schoolName);

        if (auth.currentUser) {
          try {
            await deleteUser(auth.currentUser);
          } catch (e) {
            console.warn("Could not delete Firebase Auth user:", e);
          }
        }

        // 1. Remove separate drive database records for this school to completely clear disk space
        const subKey = `cell_drive_${schoolName.toLowerCase()}_submissions`;
        const stuKey = `cell_drive_${schoolName.toLowerCase()}_active_students`;
        localStorage.removeItem(subKey);
        localStorage.removeItem(stuKey);

        // 2. Clear active states
        localStorage.removeItem('cell_teacher_school');
        localStorage.removeItem('cell_teacher_pin');
        localStorage.removeItem('cell_student_login_password');
        localStorage.removeItem('cell_teacher_join_code');
        localStorage.removeItem('cell_teacher_session_unlocked');

        const deletedSchoolName = schoolName;
        setSchoolName('');
        setPinCode('');
        setStudentPassword('');
        setJoinCode('');
        setIsUnlocked(false);
        setDeleteSchoolModalOpen(false);
        setDeleteSchoolPinInput('');

        if (onSchoolChange) {
          onSchoolChange('');
        }
        onClearAllData();

        alert(`[${deletedSchoolName}] 배움터의 모든 데이터, 계정 정보 및 분리 드라이브 저장소가 완전히 삭제되었습니다.`);
      } catch (err: any) {
        console.error(err);
        setDeleteSchoolError('계정을 완전히 삭제하는 데 실패했습니다. 다시 시도해 주세요.');
      }
    } else {
      setDeleteSchoolError('교수자용 비밀번호 4자리가 일치하지 않아 계정 삭제 처리가 거부되었습니다.');
    }
  };

  // Filter submissions by school to isolate schools in Teacher View
  const schoolSubmissions = submissions.filter((sub) => {
    if (!schoolName) return true;
    return (sub.studentSchool || sub.schoolName)?.toLowerCase() === schoolName.toLowerCase();
  });

  // --- Filtering & Calculations for standard submissions tab ---
  const classes = ['1반', '2반', '3반', '4반'];

  const filteredSubmissionsByClass = schoolSubmissions.filter((sub) => {
    if (selectedClassFilter === 'all') return true;
    return sub.studentClass === selectedClassFilter;
  });

  const finalFilteredSubmissions = filteredSubmissionsByClass.filter((sub) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      sub.studentName.toLowerCase().includes(term) ||
      sub.organelleName.toLowerCase().includes(term) ||
      sub.metaphorSubject.toLowerCase().includes(term) ||
      sub.metaphorReason.toLowerCase().includes(term)
    );
  });

  const totalSubmissions = filteredSubmissionsByClass.length;
  
  const averageRating = totalSubmissions > 0
    ? Number((filteredSubmissionsByClass.reduce((sum, s) => sum + s.averageRating, 0) / totalSubmissions).toFixed(2))
    : 0.0;

  const totalEvaluationsCount = filteredSubmissionsByClass.reduce((sum, s) => sum + s.ratingCount, 0);

  // Most active organelle metaphor in class
  const organelleCounts: { [name: string]: number } = {};
  filteredSubmissionsByClass.forEach(s => {
    organelleCounts[s.organelleName] = (organelleCounts[s.organelleName] || 0) + 1;
  });
  let mostPopularOrganelle = '없음';
  let maxCount = 0;
  Object.entries(organelleCounts).forEach(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostPopularOrganelle = name;
    }
  });

  // Best metaphor submission (베스트 참신상! 🏆)
  let bestMetaphorStudent = '없음';
  let bestRating = 0;
  let bestCreatedAt = '';
  filteredSubmissionsByClass.forEach(s => {
    if (s.averageRating >= 3.0) {
      if (bestMetaphorStudent === '없음') {
        bestRating = s.averageRating;
        bestCreatedAt = s.createdAt || '';
        bestMetaphorStudent = `${s.studentName} (${s.organelleName})`;
      } else {
        const sScore = Math.round(s.averageRating * 10) / 10;
        const bestScore = Math.round(bestRating * 10) / 10;
        if (sScore > bestScore) {
          bestRating = s.averageRating;
          bestCreatedAt = s.createdAt || '';
          bestMetaphorStudent = `${s.studentName} (${s.organelleName})`;
        } else if (sScore === bestScore) {
          const sTime = s.createdAt ? new Date(s.createdAt).getTime() : 0;
          const bestTime = bestCreatedAt ? new Date(bestCreatedAt).getTime() : 0;
          if (sTime < bestTime) {
            bestRating = s.averageRating;
            bestCreatedAt = s.createdAt || '';
            bestMetaphorStudent = `${s.studentName} (${s.organelleName})`;
          }
        }
      }
    }
  });

  // Most submissions by a student (학급 다작왕! ✍️)
  const studentCounts: { [name: string]: number } = {};
  filteredSubmissionsByClass.forEach(s => {
    studentCounts[s.studentName] = (studentCounts[s.studentName] || 0) + 1;
  });
  let mostSubmissionsStudent = '없음';
  let maxStudentSubmissions = 0;
  const mostSubmittingStudentList: string[] = [];
  Object.entries(studentCounts).forEach(([name, count]) => {
    if (count > maxStudentSubmissions) {
      maxStudentSubmissions = count;
      mostSubmittingStudentList.length = 0;
      mostSubmittingStudentList.push(name);
    } else if (count === maxStudentSubmissions) {
      mostSubmittingStudentList.push(name);
    }
  });
  if (maxStudentSubmissions > 0) {
    mostSubmissionsStudent = `${mostSubmittingStudentList.join(', ')} (${maxStudentSubmissions}개)`;
  }

  // Export to CSV helper
  const exportToCSV = () => {
    if (filteredSubmissionsByClass.length === 0) {
      alert('내보낼 활동 자료가 없습니다.');
      return;
    }
    const headers = ['학급', '학생 이름', '배정 세포소기관', '일상 비유 대상', '과학적 비유 이유', '평균 별점', '평가 참여수', '제출 시각'];
    const rows = filteredSubmissionsByClass.map((sub) => [
      sub.studentClass || '1반',
      sub.studentName,
      sub.organelleName,
      `"${sub.metaphorSubject.replace(/"/g, '""')}"`,
      `"${sub.metaphorReason.replace(/"/g, '""')}"`,
      sub.averageRating.toFixed(2),
      sub.ratingCount,
      new Date(sub.timestamp).toLocaleString('ko-KR')
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `[${schoolName}]세포소기관비유활동_${selectedClassFilter === 'all' ? '전체학급' : selectedClassFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedSubDetail = finalFilteredSubmissions.find(s => s.id === selectedSubmissionId);
  const selectedSubCheckResult = submissionChecks?.find((check) => check.submissionId === selectedSubDetail?.id) || null;

  // --- Dynamic calculations for Peer Evaluation Tab ---
  // Get all unique student names who either submitted metaphors or rated others in this school
  const profileMap = new Map<string, { name: string; class: string }>();
  schoolSubmissions.forEach(s => {
    // Treat mock items or items without ownerUid as unique based on name + class rather than collapsing under teacher's ownerUid
    const key = (s.isMock || !s.ownerUid) ? `${s.studentName}_${s.studentClass || '1반'}` : s.ownerUid;
    if (!profileMap.has(key)) {
      profileMap.set(key, { name: s.studentName, class: s.studentClass || '1반' });
    }
  });
  const uniqueStudentProfiles = Array.from(profileMap.values())
    .sort((a, b) => {
      if (a.class !== b.class) return a.class.localeCompare(b.class);
      return a.name.localeCompare(b.name, 'ko');
    });

  // Calculate peer evaluation details for a selected student: What evaluations they MADE
  const getEvaluationsMadeByStudent = (studentName: string) => {
    const list: Array<{
      targetId: string;
      targetStudentName: string;
      targetClass: string;
      targetOrganelle: string;
      metaphorSubject: string;
      scoreGiven: number;
      timestamp: string;
    }> = [];

    schoolSubmissions.forEach(sub => {
      if (sub.ratings[studentName] !== undefined) {
        list.push({
          targetId: sub.id,
          targetStudentName: sub.studentName,
          targetClass: sub.studentClass || '1반',
          targetOrganelle: sub.organelleName,
          metaphorSubject: sub.metaphorSubject,
          scoreGiven: sub.ratings[studentName],
          timestamp: sub.timestamp
        });
      }
    });
    return list;
  };

  // Calculations of statistics for profiles
  const selectedStudentAuditList = selectedStudentForAudit ? getEvaluationsMadeByStudent(selectedStudentForAudit) : [];

  // -------------------------------------------------------------
  // VIEW RENDERER: 1. Setup Form Screen (First Time Entry)
  // -------------------------------------------------------------
  if (!isCredentialsSetup) {
    return (
      <div className="glass-card p-4 sm:p-6 md:p-10 max-w-xl mx-auto space-y-6 animate-fade-in" id="teacher-setup-gate">
        <div className="text-center space-y-3">
          <span className="text-4xl animate-bounce inline-block mb-1">🧑‍🏫</span>
          <h2 className="font-sans font-black text-[#123D2A] text-lg sm:text-[22px] tracking-tight leading-snug break-keep">
            생명과환경 교수자용 관리창 로그인
          </h2>
          <p className="text-[11px] sm:text-xs text-[#7B827B] font-normal max-w-md mx-auto leading-relaxed break-keep">
            학교와 학급을 개설 및 관리하고, 개별 학생들이 제출한 비유와 동료평가 내역을 실시간으로 확인할 수 있습니다.
          </p>
        </div>

        {/* Gate View Changer Tabs */}
        <div className="grid grid-cols-2 gap-1.5 bg-[#DDE8D6]/30 p-1.5 rounded-2xl border border-[#D7D2C4] text-[11px] sm:text-xs">
          <button
            type="button"
            onClick={() => {
              setGateMode('signup');
              setSetupError('');
            }}
            className={`py-2 px-1 sm:px-3 rounded-xl font-black transition-all cursor-pointer text-center flex items-center justify-center gap-1 break-keep leading-snug ${
              gateMode === 'signup'
                ? 'bg-[#123D2A] text-white shadow-sm'
                : 'text-[#3E4540] hover:text-[#123D2A]'
            }`}
          >
            🏫 신규 학교 개설
          </button>
          <button
            type="button"
            onClick={() => {
              setGateMode('login');
              setSetupError('');
            }}
            className={`py-2 px-1 sm:px-3 rounded-xl font-black transition-all cursor-pointer text-center flex items-center justify-center gap-1 break-keep leading-snug ${
              gateMode === 'login'
                ? 'bg-[#123D2A] text-white shadow-sm'
                : 'text-[#3E4540] hover:text-[#123D2A]'
            }`}
          >
            🔑 기존 교수자 로그인
          </button>
        </div>

        {gateMode === 'signup' ? (
          /* signup / Create new school */
          <form onSubmit={handleSetupSubmit} className="space-y-4 text-left" id="teacher-setup-form">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#123D2A] break-keep">🏫 개설할 학교명 입력</label>
              <input
                type="text"
                required
                placeholder="예: 서강대학교, 서울고등학교"
                value={setupSchoolInput}
                onChange={(e) => setSetupSchoolInput(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#123D2A] break-keep">🔑 교수자 비밀번호<span className="hidden sm:inline"> (숫자 4자리)</span></label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="비밀번호 4자리"
                  value={setupPinInput}
                  onChange={(e) => setSetupPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal text-center placeholder-[#7B827B]/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#123D2A] break-keep">🔄 비밀번호 확인</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="한 번 더 입력"
                  value={setupPinConfirmInput}
                  onChange={(e) => setSetupPinConfirmInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal text-center placeholder-[#7B827B]/60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#123D2A] break-keep">🎓 학생용 로그인 비밀번호</label>
              <input
                type="text"
                required
                placeholder="예: 1234 (학생들이 로그인할 때 사용할 비밀번호)"
                value={setupStudentPasswordInput}
                onChange={(e) => setSetupStudentPasswordInput(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal"
              />
              <span className="text-[10px] text-[#123D2A]/80 block mt-1 break-keep">학생들이 입장할 때 본 비밀번호를 공유해 주셔야 합니다.</span>
            </div>

            {setupError && (
              <div className="bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-200 text-xs font-bold leading-relaxed break-keep">
                ⚠️ {setupError}
              </div>
            )}

            <button
               type="submit"
              className="w-full py-3 bg-[#123D2A] hover:bg-[#1B5A3A] text-white rounded-xl text-xs font-black shadow-md border border-[#D7D2C4] cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform break-keep"
            >
              <ShieldCheck className="w-4 h-4" />
              배움터 신규 개설 및 교수자 등록
            </button>
          </form>
        ) : (
          /* Login to existing school */
          <form onSubmit={handleTeacherLoginSubmit} className="space-y-4 text-left" id="teacher-login-form">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#123D2A] break-keep">🏫 소속 학교명 입력</label>
              <input
                type="text"
                required
                placeholder="예: 서강대학교, 서울고등학교"
                value={loginSchoolInput}
                onChange={(e) => setLoginSchoolInput(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-bold text-[#123D2A] break-keep">🔑 교수자 관리용 비밀번호 PIN</label>
              <input
                type="password"
                required
                maxLength={4}
                placeholder="비밀번호 4자리"
                value={loginPinInput}
                onChange={(e) => setLoginPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2.5 text-xs bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5A3A] font-normal text-center placeholder-[#7B827B]/60"
              />
            </div>

            {setupError && (
              <div className="bg-rose-50 text-rose-700 p-3 rounded-xl border border-rose-200 text-xs font-bold leading-relaxed break-keep">
                ⚠️ {setupError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-[#123D2A] hover:bg-[#1B5A3A] text-white rounded-xl text-xs font-black shadow-md border border-[#D7D2C4] cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform break-keep"
            >
              <ShieldCheck className="w-4 h-4" />
              교수자용 활동 관리창 로그인
            </button>
          </form>
        )}

        {/* Collapsible & Password-Protected Developer Test Mode */}
        {renderDevTools()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW RENDERER: 2. Lock Screen (If is Setup but Locked)
  // -------------------------------------------------------------
  if (!isUnlocked) {
    return (
      <div className="glass-card p-4 sm:p-6 md:p-10 max-w-sm sm:max-w-md mx-auto space-y-6" id="teacher-lock-gate">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#F1D88A]/40 text-[#D6A21E] border border-[#D6A21E]/30 mb-0.5">
            <Lock className="w-6 h-6 sm:w-7 sm:h-7 animate-pulse" />
          </div>
          <span className="bg-[#DDE8D6] text-[#123D2A] border border-[#D7D2C4] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider block mx-auto w-max max-w-full truncate shadow-2xs">
            {schoolName} 생명과환경 관리창
          </span>
          <h3 className="font-sans font-black text-[#123D2A] text-base sm:text-lg break-keep leading-snug">
            교수자용 학급별 비유 활동 관리창 잠금
          </h3>
          <p className="text-[11px] sm:text-xs text-[#7B827B] font-medium max-w-xs mx-auto break-keep leading-relaxed text-center">
            본 화면은 교수자용 관리창입니다. 설정하신 4자리 보안 비밀번호를 입력해 해제하십시오.
          </p>
        </div>

        <form onSubmit={handleUnlockSubmit} className="space-y-4 text-left" id="teacher-unlock-form">
          <div className="space-y-1.5">
            <input
              type="password"
              required
              maxLength={4}
              autoFocus
              placeholder="••••"
              value={unlockPinInput}
              onChange={(e) => setUnlockPinInput(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-white/85 border border-[#D7D2C4] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#123D2A] font-mono tracking-widest text-center text-xs font-normal text-[#3E4540] shadow-inner"
              style={{ fontSize: '12px', fontWeight: 'normal' }}
            />
          </div>

          {loginError && (
            <p className="text-red-600 text-[10.5px] sm:text-[11px] font-bold text-center leading-relaxed break-keep">
              ❌ {loginError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 bg-[#123D2A] hover:bg-[#1B5A3A] text-white text-xs font-black rounded-xl shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 border border-[#D7D2C4] whitespace-nowrap"
            >
              <Unlock className="w-3.5 h-3.5" />
              잠금 해제
            </button>

            <button
              type="button"
              onClick={() => setResetCredentialsModalOpen(true)}
              className="px-3 py-2.5 bg-white/80 hover:bg-[#DDE8D6] text-[#7B827B] hover:text-[#123D2A] text-xs font-bold rounded-xl border border-[#D7D2C4] cursor-pointer whitespace-nowrap"
              title="설정이 잠겼을때 학교명과 비밀번호 초기화 가능"
            >
              초기화 🔑
            </button>
          </div>
        </form>

        {/* Password Setup/Credentials reset popover from lockscreen */}
        {resetCredentialsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[#FFFCF4] rounded-3xl p-5 sm:p-6 max-w-sm w-full border border-[#D7D2C4] shadow-2xl space-y-4">
              <div className="text-center space-y-1.5">
                <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
                <h4 className="font-sans font-black text-rose-950 text-sm sm:text-base break-keep">교수자용 관리창 로그인 초기화</h4>
                <p className="text-[11px] text-rose-700 font-bold leading-relaxed break-keep">
                  본 기기에 등록되어 있는 학교 이름('{schoolName}') 및 4자리 교수자용 비밀번호를 변경하거나 완전히 초기화합니다.
                </p>
              </div>

              <form onSubmit={handleResetCredentialsSubmit} className="space-y-3">
                <div className="space-y-1 text-left">
                  <label className="block text-[10px] font-black text-rose-900">현재 연동된 4자리 비유 PIN 번호 입력</label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={resetCredentialsPinInput}
                    onChange={(e) => setResetCredentialsPinInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center py-2 bg-rose-50 border border-rose-200 text-lg font-mono font-black text-rose-950 rounded-lg focus:outline-none"
                  />
                </div>

                {resetCredentialsError && (
                  <p className="text-[10px] text-red-650 font-black text-center">{resetCredentialsError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetCredentialsModalOpen(false);
                      setResetCredentialsPinInput('');
                      setResetCredentialsError('');
                    }}
                    className="flex-1 py-2 bg-slate-100 text-[#7B827B] text-[11px] font-black rounded-lg cursor-pointer hover:bg-slate-200"
                  >
                    리셋 취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-[#123D2A] text-white text-[11px] font-black rounded-lg cursor-pointer hover:bg-[#1B5A3A]"
                  >
                    예, 권한 리셋
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {renderDevTools()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW RENDERER: 3. Core Authenticated Dashboard Workspace
  // -------------------------------------------------------------
  const isResetDisabled = teacherTimerIsActive || teacherSecondsLeft > 0;

  return (
    <div className="glass-card p-6 md:p-8 space-y-8" id="teacher-dashboard">
      
      {/* Dashboard authenticated header banner */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 pb-6 border-b-2 border-[#D7D2C4]/50" id="teacher-dash-header">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="bg-[#123D2A] text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-2xs">
              🔒 AUTHENTICATED ACCESS
            </span>
            <span className="bg-[#DDE8D6] text-[#123D2A] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#D7D2C4] flex items-center gap-1 shadow-2xs">
              <School className="w-3.5 h-3.5 text-[#123D2A] animate-pulse" />
              학교명: <strong className="text-[#123D2A] font-black">{schoolName}</strong>
            </span>
            {joinCode && (
              <span className="bg-[#F1D88A]/40 text-[#D6A21E] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#D6A21E]/30 flex items-center gap-1 shadow-2xs animate-pulse">
                🎫 학생 입장 코드: <strong className="text-[#123D2A] text-xs font-black">{joinCode}</strong>
              </span>
            )}
            {studentPassword && (
              <span className="bg-[#FFFCF4]/90 text-[#3E4540] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#D7D2C4] flex items-center gap-1 shadow-2xs">
                🔒 학생 비밀번호: <strong className="text-[#123D2A] text-xs font-black">{studentPassword}</strong>
              </span>
            )}
          </div>
          
          <h2 className="font-sans font-black text-[#123D2A] text-2xl tracking-tight flex items-center gap-2 mt-1.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#DDE8D6] text-[#123D2A] text-sm font-black">⚙️</span>
            교사용 학급별 비유 활동 관리창
          </h2>
          <p className="text-xs text-[#7B827B] mt-1 font-medium break-keep">
            각 학급 학생들의 실시간 생명 시스템 비유 활동 내역을 상세 조회하고, CSV파일로 다운로드하여 활동 평가 자료로 활용하세요.
          </p>
        </div>

        {/* Console action buttons & Cloud Synchronized Timer Controls */}
        <div className="flex flex-col md:flex-row flex-wrap md:items-center justify-between gap-4 py-2 bg-transparent border-none" id="teacher-action-group">
          
          {/* Left action item group */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportToCSV}
              className="px-3 py-1.5 bg-[#123D2A] hover:bg-[#1B5A3A] text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1 text-[11px]"
              title="CSV 파일로 활동 자료 저장하기"
            >
              <Download className="w-3.5 h-3.5" />
              CSV 다운로드
            </button>

            {submissions.some(sub => sub.isMock === true || ['김지민', '이은우', '최서연', '정예은', '박수연', '강민호', '윤지우', '한다인', '최민우', '정지훈', '한아름', '서태웅'].includes(sub.studentName.trim())) ? (
              <button
                onClick={onLoadMockData}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1 text-[11px]"
                title="등록된 데모 예시 학생 데이터를 일괄 삭제합니다"
              >
                <Trash2 className="w-3.5 h-3.5 fill-white" />
                예시 세트 제거
              </button>
            ) : (
              <button
                onClick={onLoadMockData}
                className="px-3 py-1.5 bg-[#D6A21E] hover:bg-[#D6A21E]/80 text-white text-xs font-black rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1 text-[11px]"
                title="실제 학생들과 수업하기 전 모의 테스트용 데이터를 채웁니다 (재클릭 시 일괄 제거)"
              >
                <Layers className="w-3.5 h-3.5" />
                예시 세트 추가
              </button>
            )}
          </div>

          {/* Right Live Synchronized Timer Dashboard widget with embedded Arrows */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap" id="teacher-timer-control-wrapper">
            <div className="flex items-center gap-3 bg-[#FFFCF4]/60 px-3.5 py-1.5 rounded-2xl border border-[#D7D2C4] shadow-sm" id="live-classroom-timer-widget">
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-[#7B827B] font-extrabold tracking-wider leading-tight">시간 설정 (1~15분)</span>
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#123D2A] mt-0.5">
                  <Timer className="w-3.5 h-3.5 text-[#123D2A] animate-pulse" />
                  <span>배움터 시계</span>
                </div>
              </div>

              {/* Vertical Time display with arrows above and below */}
              <div className="flex flex-col items-center select-none" id="vertical-timer-adjuster">
                {/* UP ARROW button */}
                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(1)}
                  disabled={selectedMinutes >= 15}
                  className={`p-0.5 rounded transition-all cursor-pointer flex items-center justify-center ${
                    selectedMinutes >= 15
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-[#123D2A] hover:bg-[#DDE8D6] active:bg-[#DDE8D6]/80'
                  }`}
                  title="시간 1분 증가"
                >
                  <ChevronUp className="w-4 h-4 stroke-[3]" />
                </button>

                {/* DIGITS DISPLAY */}
                <span className={`font-mono text-sm font-black px-2 py-0.5 rounded-md border border-[#D7D2C4] shadow-inner transition-all ${
                  teacherSecondsLeft <= 60 && teacherTimerIsActive 
                    ? 'bg-rose-50 text-rose-600 border-rose-250 animate-pulse scale-105' 
                    : 'bg-[#DDE8D6]/40 text-[#123D2A]'
                }`}>
                  {formatTeacherTime(teacherSecondsLeft)}
                </span>

                {/* DOWN ARROW button */}
                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(-1)}
                  disabled={selectedMinutes <= 1}
                  className={`p-0.5 rounded transition-all cursor-pointer flex items-center justify-center ${
                    selectedMinutes <= 1
                      ? 'text-slate-300 cursor-not-allowed'
                      : 'text-[#123D2A] hover:bg-[#DDE8D6] active:bg-[#DDE8D6]/80'
                  }`}
                  title="시간 1분 감소"
                >
                  <ChevronDown className="w-4 h-4 stroke-[3]" />
                </button>
              </div>

              {/* ACTION CONTROL BUTTON CONTAINER */}
              <div className="flex items-center gap-1.5 border-l border-[#D7D2C4] pl-2">
                {teacherTimerIsActive ? (
                  <button
                    onClick={handleTeacherPauseTimer}
                    className="p-1 hover:bg-[#DDE8D6] rounded text-amber-600 transition-colors cursor-pointer flex items-center justify-center border border-[#D7D2C4]"
                    title="타이머 일시정지 (학생들 화면에서도 적용)"
                  >
                    <Pause className="w-4 h-4 fill-[#D6A21E] stroke-[#D6A21E]" />
                  </button>
                ) : (
                  <button
                    onClick={handleTeacherPlayTimer}
                    className="p-1 hover:bg-[#DDE8D6] rounded text-[#123D2A] transition-colors cursor-pointer flex items-center justify-center border border-[#D7D2C4] scale-105"
                    title="타이머 시작/재개 (학생들 화면도 즉시 재개)"
                  >
                    <Play className="w-4 h-4 fill-[#123D2A] stroke-[#123D2A]" />
                  </button>
                )}

                {/* Square stop button: 빨간 네모 종료 단추 */}
                <button
                  onClick={handleTeacherStopTimer}
                  className="p-1 hover:bg-rose-50 rounded text-rose-600 border border-rose-200/50 transition-colors cursor-pointer flex items-center justify-center"
                  title="활동 즉시 마감 (학생 창을 닫고 마감화면으로 전환)"
                >
                  <Square className="w-4 h-4 fill-rose-600 stroke-rose-600" />
                </button>

                {/* Reset button: 이전에 설정한 시간으로 초기화 */}
                <button
                  onClick={handleTeacherResetTimer}
                  disabled={isResetDisabled}
                  className={`p-1 rounded border transition-colors flex items-center justify-center ${
                    isResetDisabled 
                      ? 'opacity-30 bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed' 
                      : 'hover:bg-[#DDE8D6] text-[#123D2A] border-[#D7D2C4] cursor-pointer'
                  }`}
                  title={
                    isResetDisabled 
                      ? '타이머 작동 중이거나 일시정지 상태에서는 새로고침을 할 수 없습니다. (활동을 완전히 마감하거나 제한시간이 다 된 후에만 초기화 가능)' 
                      : `이전 설정 시간(${selectedMinutes}분)으로 전체 초기화 (학생 대기 스크린으로 전환)`
                  }
                >
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Console supplementary buttons */}
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-1 xl:translate-y-6 transition-all" id="teacher-supp-action-group">

          <button
            onClick={() => setResetDbModalOpen(true)}
            className="px-3 py-1.5 bg-[#FFFCF4]/60 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1 text-[11px]"
            title="학급의 모든 비유 제출 데이터를 완전 초기화합니다"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            전체 초기화
          </button>

          {/* New: General Logout (Locks teacher view requiring PIN code) */}
          <button
            onClick={handleGeneralLogout}
            className="px-3 py-1.5 bg-[#FFFCF4]/60 hover:bg-[#DDE8D6] text-[#3E4540] hover:text-[#123D2A] text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1 text-[11px] border border-[#D7D2C4]"
            title="소속 학교 설정을 유지하되 교수자용 관리창을 즉시 잠급니다"
          >
            <Lock className="w-3.5 h-3.5" />
            일반 로그아웃
          </button>

          {/* New: Classroom Logout (Deregisters current school name, back to setup) */}
          <button
            onClick={handleLeaveSchool}
            className="px-3 py-1.5 bg-[#F1D88A]/20 hover:bg-[#F1D88A]/50 text-[#D6A21E] hover:text-[#123D2A] text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1 text-[11px] border border-[#D7D2C4]"
            title="현재 연동된 학교 및 교실 권한에서 로그아웃합니다 (등록 데이터는 데이터베이스에 유지됩니다)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            교실 로그아웃
          </button>

          {/* New: Delete Entire School Account (Purges registry, drive storage and data) */}
          <button
            onClick={() => setDeleteSchoolModalOpen(true)}
            className="px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1 text-[11px]"
            title="본 기기에서 이 학급의 모든 개설 정보와 분리 디바이스 저장소 데이터를 완전히 초기화합니다"
          >
            <Trash2 className="w-3.5 h-3.5" />
            전체 삭제
          </button>

          {/* Secure Settings Change Pin Inside Dashboard */}
          <button
            onClick={() => setChangePinModalOpen(true)}
            className="p-1.5 bg-[#FFFCF4]/60 text-[#7B827B] hover:text-[#123D2A] border border-[#D7D2C4] rounded-xl cursor-pointer hover:bg-[#DDE8D6]"
            title="교사용 비밀번호(PIN) 변경"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* --- TASK TWO TAB BAR: Switch between Submissions and Peer Evaluation list --- */}
      <div className="flex border-b border-[#D7D2C4] gap-1 mt-6" id="teacher-dashboard-tabs">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-5 py-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border-b-2 rounded-t-xl ${
            activeTab === 'submissions'
              ? 'border-b-[#123D2A] text-[#123D2A] bg-[#DDE8D6]/35 font-extrabold'
              : 'border-b-transparent text-[#7B827B] hover:text-[#123D2A]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          제출 비유 및 통계표 (Submissions Table)
        </button>
        <button
          onClick={() => {
            setActiveTab('peer_evaluation');
            let initialFilter = selectedClassFilter;
            if (selectedClassFilter === 'all') {
              initialFilter = '1반';
              setSelectedClassFilter('1반');
            }
            // Select first student automatically for convenience if list is loaded
            const filteredProfiles = uniqueStudentProfiles.filter(p => p.class === initialFilter);
            if (filteredProfiles.length > 0 && !selectedStudentForAudit) {
              setSelectedStudentForAudit(filteredProfiles[0].name);
            }
          }}
          className={`px-5 py-3 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border-b-2 rounded-t-xl ${
            activeTab === 'peer_evaluation'
              ? 'border-b-[#123D2A] text-[#123D2A] bg-[#DDE8D6]/35 font-extrabold'
              : 'border-b-transparent text-[#7B827B] hover:text-[#123D2A]'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          학생별 상호 평가 내역 조회 (Peer Evaluation Audit)
        </button>
      </div>

      {/* -------------------------------------------------------------
       * SUBMISSIONS TAB CONTENT
       * ------------------------------------------------------------- */}
      {activeTab === 'submissions' && (
        <div className="space-y-6" id="teacher-submissions-tab-view">
          {/* Class Selector Tabs & Statistics widgets */}
          <div className="space-y-4" id="class-stats-filters">
            <label className="text-xs font-black text-[#123D2A] block flex items-center gap-1.5 justify-center md:justify-start">
              <School className="w-4 h-4 text-[#123D2A]" />
              학급별 모아보기 (반별 선택 조회)
            </label>
            
            <div className="flex flex-wrap gap-2" id="class-specific-tabs">
              <button
                onClick={() => setSelectedClassFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  selectedClassFilter === 'all'
                    ? 'bg-[#123D2A] text-white shadow-sm scale-[1.03]'
                    : 'bg-[#FFFCF4]/60 text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6] hover:text-[#123D2A]'
                }`}
              >
                전체 학급 ({uniqueStudentProfiles.length}명)
              </button>
              {classes.map((cls) => {
                const count = uniqueStudentProfiles.filter(s => s.class === cls).length;
                return (
                  <button
                    key={cls}
                    onClick={() => setSelectedClassFilter(cls)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      selectedClassFilter === cls
                        ? 'bg-[#123D2A] text-white shadow-sm scale-[1.03]'
                        : 'bg-[#FFFCF4]/60 text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6] hover:text-[#123D2A]'
                    }`}
                  >
                    {cls} ({count}명)
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time stats widgets on selected Class */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4" id="class-stats-counters">
            <div className="bg-[#FFFCF4]/60 p-4 rounded-2xl border border-[#D7D2C4] shadow-xs text-center border-l-4 border-l-[#123D2A]">
              <p className="text-[10px] text-[#7B827B] font-semibold leading-none uppercase tracking-wider">선택 학급 제출 수</p>
              <p className="text-2xl font-bold text-[#123D2A] mt-1.5">{totalSubmissions}건</p>
            </div>
            <div className="bg-[#DDE8D6]/35 p-4 rounded-2xl border border-[#D7D2C4]/80 shadow-xs text-center border-l-4 border-l-[#D6A21E]">
              <p className="text-[10px] text-[#1B5A3A] font-semibold leading-none uppercase tracking-wider">세포 비유 평균점</p>
              <p className="text-2xl font-bold text-[#123D2A] mt-1.5 flex items-center justify-center gap-1">
                <Star className="w-5 h-5 text-[#D6A21E] fill-[#D6A21E]" />
                {averageRating.toFixed(1)} <span className="text-[#7B827B] text-xs font-normal">/ 5.0</span>
              </p>
            </div>
            <div className="bg-[#FFFCF4]/60 p-4 rounded-2xl border border-[#D7D2C4] shadow-xs text-center border-l-4 border-l-[#123D2A]">
              <p className="text-[10px] text-[#7B827B] font-semibold leading-none uppercase tracking-wider">누적 동료 피드백 수</p>
              <p className="text-2xl font-bold text-[#123D2A] mt-1.5">{totalEvaluationsCount}회</p>
            </div>
            <div className="bg-[#FFFCF4]/60 p-4 rounded-2xl border border-[#D7D2C4] shadow-xs text-center border-l-4 border-l-[#123D2A]">
              <p className="text-[10px] text-[#7B827B] font-semibold leading-none uppercase tracking-wider">최다 비유 소기관</p>
              <p className="text-2xl font-bold text-[#123D2A] mt-1.5 truncate px-1">{mostPopularOrganelle}</p>
            </div>
            <div className="bg-[#F1D88A]/20 p-4 rounded-2xl border border-[#D7D2C4] shadow-xs text-center flex flex-col justify-center items-center border-l-4 border-l-[#D6A21E]">
              <p className="text-[10px] text-[#D6A21E] font-semibold leading-none uppercase tracking-wider flex items-center gap-1">
                베스트 참신상 🏆
              </p>
              <p className="text-xs font-bold text-[#123D2A] mt-2 truncate w-full" title={bestMetaphorStudent}>{bestMetaphorStudent}</p>
            </div>
            <div className="bg-[#eeeeee] p-4 rounded-2xl border border-[#D7D2C4] shadow-xs text-center flex flex-col justify-center items-center border-l-4 border-l-[#7B827B]">
              <p className="text-[10px] text-[#7B827B] font-semibold leading-none uppercase tracking-wider flex items-center gap-1">
                학급 다작왕 ✍️
              </p>
              <p className="text-xs font-bold text-[#3E4540] mt-2 truncate w-full" title={mostSubmissionsStudent}>{mostSubmissionsStudent}</p>
            </div>
          </div>

          {/* Real-time Search input */}
          <div className="flex gap-2 items-center bg-[#FFFCF4]/80 border border-[#D7D2C4] p-2 rounded-2xl shadow-inner max-w-sm" id="search-input-box">
            <Search className="w-4 h-4 text-[#123D2A] shrink-0" />
            <input
              type="text"
              placeholder="학생 이름, 소기관, 키워드로 비유 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-xs font-normal text-[#3E4540] placeholder-[#7B827B] focus:outline-none w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[10px] text-[#123D2A] hover:underline font-extrabold cursor-pointer shrink-0"
              >
                초기화
              </button>
            )}
          </div>

          {/* Submissions data table for Teacher */}
          <div className="bg-[#FFFCF4]/85 border border-[#D7D2C4] rounded-2xl shadow-sm overflow-hidden" id="teacher-table-view">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#D7D2C4]/60 text-left text-xs text-[#3E4540] font-medium table-fixed">
                <thead className="bg-[#DDE8D6]/40 text-[#123D2A] font-bold border-b border-[#D7D2C4]">
                  <tr>
                    <th className="px-4 py-3 text-center w-20 whitespace-nowrap">학급</th>
                    <th className="px-4 py-3 w-24 whitespace-nowrap">학생 이름</th>
                    <th className="px-4 py-3 w-28 whitespace-nowrap">소기관</th>
                    <th className="px-4 py-3 w-36 whitespace-nowrap">비유 대상</th>
                    <th className="px-4 py-3 w-48 max-w-[190px] truncate">과학적 이유 (미리보기)</th>
                    <th className="px-4 py-3 text-center w-24 whitespace-nowrap">평균 별점</th>
                    <th className="px-4 py-3 text-center w-16 whitespace-nowrap">평가수</th>
                    <th className="px-4 py-3 w-32 whitespace-nowrap">AI 안전성</th>
                    <th className="px-4 py-3 text-center w-24 whitespace-nowrap">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D7D2C4]/40">
                  {finalFilteredSubmissions.length > 0 ? (
                    finalFilteredSubmissions.map((sub) => {
                      const checkResult = submissionChecks?.find((check) => check.submissionId === sub.id) || null;
                      return (
                        <tr 
                          key={sub.id} 
                          className="hover:bg-[#DDE8D6]/15 transition-colors animate-fade-in"
                          style={checkResult?.needsReview && !checkResult?.isQuotaExceeded ? { backgroundColor: 'rgba(239, 68, 68, 0.08)' } : undefined}
                        >
                          <td className="px-4 py-3 text-center font-black whitespace-nowrap w-20">
                            <span className="bg-[#DDE8D6]/80 text-[#123D2A] px-2.5 py-1 rounded-md text-[10px] border border-[#D7D2C4] whitespace-nowrap inline-block">
                              {sub.studentClass || '1반'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-[#3E4540] whitespace-nowrap w-24 truncate" title={sub.studentName}>
                            {sub.studentName}
                          </td>
                          <td className="px-4 py-3 text-[#123D2A] font-bold whitespace-nowrap w-28 truncate">
                            <div className="inline-flex items-center gap-1.5 max-w-full">
                              <div className="w-5 h-5 flex items-center justify-center bg-white border border-[#D7D2C4]/80 rounded p-0.5 shrink-0">
                                <OrganelleIllustration id={sub.organelleId} className="w-4 h-4" />
                              </div>
                              <span className="truncate">{sub.organelleName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-[#1B5A3A] whitespace-nowrap w-36 truncate" title={sub.metaphorSubject}>
                            "{sub.metaphorSubject}"
                          </td>
                          <td className="px-4 py-3 max-w-[170px] truncate text-[11px] text-[#7B827B]" title={sub.metaphorReason}>
                            {sub.metaphorReason}
                          </td>
                          <td className="px-4 py-3 text-center font-bold w-24 whitespace-nowrap">
                            <span className="inline-flex items-center gap-0.5 text-[#D6A21E] bg-[#F1D88A]/20 px-2 py-0.5 rounded-full border border-[#F1D88A]/50 font-black">
                              ★ {sub.averageRating.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-[#7B827B] w-16 whitespace-nowrap">{sub.ratingCount}명</td>
                          
                          {/* AI 안전성 검 상태 열 */}
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-bold w-32">
                            {checkResult ? (
                              checkResult.isQuotaExceeded || checkResult.summary === 'API 호출한도 초과' || checkResult.categories?.includes('quota_exceeded') ? (
                                <div className="flex flex-col gap-0.5 max-w-[120px]">
                                  <span className="inline-flex items-center gap-1 text-[#5E6660] bg-[#5E6660]/10 px-2 py-0.5 rounded-full border border-[#5E6660]/20 max-w-max">
                                    <ShieldAlert className="w-3 h-3 text-[#5E6660]" />
                                    <span className="text-[10px]">API 호출한도 초과</span>
                                  </span>
                                </div>
                              ) : checkResult.error ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span className="text-[10px]">인증실패</span>
                                </span>
                              ) : checkResult.needsReview ? (
                                <div className="flex flex-col gap-0.5 max-w-[120px]">
                                  <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200 max-w-max">
                                    <ShieldAlert className="w-3 h-3 text-red-600" />
                                    <span className="text-[10px]">검토필요</span>
                                  </span>
                                  {checkResult.summary && (
                                    <span className="text-[9px] text-red-700/80 max-w-[110px] break-words line-clamp-1 block leading-tight" title={checkResult.summary}>
                                      {checkResult.summary}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5 max-w-[120px]">
                                  <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 max-w-max">
                                    <ShieldCheck className="w-3 h-3" />
                                    <span className="text-[10px]">정상</span>
                                  </span>
                                </div>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200 text-[10px]">
                                <span>대기중</span>
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center space-x-1 w-24 whitespace-nowrap">
                            <button
                              onClick={() => setSelectedSubmissionId(sub.id)}
                              className="px-2 py-1 hover:bg-[#DDE8D6] rounded-lg text-[#123D2A] transition-colors cursor-pointer inline-flex items-center gap-1 font-bold text-[11px] border border-[#D7D2C4]/40"
                              title="자세히 읽어보기"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              열람
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`정말로 ${sub.studentName} 학생의 비유 제출물을 개별 삭제하시겠습니까?`)) {
                                  onDeleteSubmission(sub.id);
                                }
                              }}
                              className="p-1 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                              title="제출 개별 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-[#7B827B] font-medium">
                        조회 조건에 부합하는 학급의 활동 내역이 없습니다. 학생으로 입장해 첫 비유를 제출해 보시거나, "예시 세트 추가" 버튼을 클릭하여 테스트 데이터를 채워 넣으세요!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * PEER EVALUATION TAB CONTENT (New Feature requested by User)
       * ------------------------------------------------------------- */}
      {activeTab === 'peer_evaluation' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="teacher-peer-evaluation-view">
          
          {/* Left Column: Student List with counts of votes cast */}
          <div className="lg:col-span-4 space-y-3.5">
            <div className="space-y-4" id="peer-eval-class-stats-filters">
              <label className="text-xs font-black text-[#123D2A] block flex items-center gap-1.5 justify-center md:justify-start">
                <School className="w-4 h-4 text-[#123D2A]" />
                학급별 모아보기 (반별 선택 조회)
              </label>
              
              <div className="flex flex-wrap gap-2" id="peer-eval-class-specific-tabs">
                {classes.map((cls) => {
                  const count = uniqueStudentProfiles.filter(s => s.class === cls).length;
                  return (
                    <button
                      key={cls}
                      onClick={() => setSelectedClassFilter(cls)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                        selectedClassFilter === cls
                          ? 'bg-[#123D2A] text-white shadow-sm scale-[1.03]'
                          : 'bg-[#FFFCF4]/60 text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6] hover:text-[#123D2A]'
                      }`}
                    >
                      {cls} ({count}명)
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#DDE8D6]/25 p-4 rounded-2xl border border-[#D7D2C4]">
              <h3 className="text-xs font-black text-[#123D2A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                학급 참여 학생 명단 ({(selectedClassFilter === 'all' ? uniqueStudentProfiles : uniqueStudentProfiles.filter(p => p.class === selectedClassFilter)).length}명)
              </h3>
              <p className="text-[10px] text-[#7B827B] leading-normal font-bold">
                학생 이름을 선택하여 해당 학생이 동료들의 비유 글에 매긴 별점을 확인할 수 있습니다.
              </p>
            </div>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 bg-[#FFFCF4]/40 border border-[#D7D2C4]/40 rounded-xl" id="peer-audit-student-selector">
              {(selectedClassFilter === 'all' ? uniqueStudentProfiles : uniqueStudentProfiles.filter(p => p.class === selectedClassFilter)).length > 0 ? (
                (selectedClassFilter === 'all' ? uniqueStudentProfiles : uniqueStudentProfiles.filter(p => p.class === selectedClassFilter)).map(p => {
                  const evalsMade = getEvaluationsMadeByStudent(p.name);
                  const isSelected = selectedStudentForAudit === p.name;
                  
                  return (
                    <button
                      key={p.name}
                      onClick={() => setSelectedStudentForAudit(p.name)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-xs font-medium ${
                        isSelected 
                          ? 'bg-[#DDE8D6]/50 border-[#123D2A] text-[#123D2A] font-extrabold ring-1 ring-[#123D2A]/10' 
                          : 'bg-[#FFFCF4]/70 hover:bg-[#DDE8D6]/10 border-[#D7D2C4]/40 text-[#3E4540]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                          isSelected ? 'bg-[#123D2A] text-white' : 'bg-[#DDE8D6]/65 text-[#123D2A]'
                        }`}>
                          {p.class}
                        </span>
                        <span className="font-bold">{p.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#7B827B]">
                        <span>평가 제출</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                          evalsMade.length > 0 ? 'bg-[#F1D88A]/55 text-[#D6A21E]' : 'bg-rose-50 text-rose-500'
                        }`}>
                          {evalsMade.length}건
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="text-center py-10 text-[#7B827B] text-xs font-medium border border-dashed border-[#D7D2C4] rounded-xl">
                  등록되거나 활동 중인 학생 정보가 존재하지 않습니다.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: List of Peer Evaluations by chosen student */}
          <div className="lg:col-span-8 bg-[#FFFCF4]/60 rounded-2xl p-5 border border-[#D7D2C4] space-y-4">
            {selectedStudentForAudit ? (
              <div className="space-y-4" id="peer-audit-results-panel">
                {/* Profile detail */}
                <div className="bg-white p-4 rounded-xl border border-[#D7D2C4]/60 shadow-3xs flex justify-between items-center flex-wrap gap-2 text-left">
                  <div>
                    <h3 className="font-sans font-black text-[#123D2A] text-sm flex items-center gap-1.5">
                      <span className="w-1.5 h-4 rounded bg-[#123D2A] block"></span>
                      {selectedStudentForAudit} 학생이 동료들에게 준 별점 내역
                    </h3>
                    <p className="text-[10px] text-[#1B5A3A] font-bold mt-1">
                      이 지표는 학생들의 비유 작성 활동 참여도, 동료평가 참여도 및 신뢰도를 보여줍니다. (학생 평가 보조 자료)
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] text-[#7B827B] uppercase tracking-widest leading-none font-bold">비유 평가 총 실행수</p>
                    <p className="text-lg font-black text-[#123D2A] mt-1.5">{selectedStudentAuditList.length}건 완료</p>
                  </div>
                </div>

                {/* Audit Grid */}
                <div className="space-y-3 text-left" id="peer-audit-table-grid">
                  {selectedStudentAuditList.length > 0 ? (
                    selectedStudentAuditList.map(auditObj => (
                      <div 
                        key={auditObj.targetId} 
                        className="bg-white/90 p-4 rounded-xl border border-[#D7D2C4]/50 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-2xs transition-shadow"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-[#DDE8D6]/50 text-[#123D2A] text-[9px] font-black px-1.5 py-0.5 rounded border border-[#D7D2C4]/40 uppercase">
                              {auditObj.targetClass}
                            </span>
                            <span className="font-bold text-xs text-[#3E4540]">
                              평가 대상자: <strong className="text-[#123D2A] font-black">{auditObj.targetStudentName}</strong>
                            </span>
                            <span className="text-[10px] bg-[#DDE8D6]/20 border border-[#D7D2C4]/40 px-1.5 py-0.5 rounded text-[#1B5A3A] font-bold">
                              {auditObj.targetOrganelle} 비유
                            </span>
                          </div>
                          
                          <p className="text-xs text-[#3E4540] font-bold italic bg-[#F7F1E3]/20 px-3 py-2 rounded-lg border border-[#D7D2C4]/40">
                            "{auditObj.targetOrganelle}은/는 <span className="underline decoration-[#D6A21E] text-[#1B5A3A] font-black">{auditObj.metaphorSubject}</span>이(가) 된다!"
                          </p>
                        </div>

                        {/* Given rating block */}
                        <div className="flex items-center gap-3 bg-[#F1D88A]/10 p-2.5 rounded-xl border border-[#F1D88A]/40 justify-center shrink-0">
                          <div>
                            <p className="text-[8px] font-black text-[#D6A21E] text-center uppercase leading-none">부여 별점</p>
                            <p className="text-center font-black text-[#123D2A] text-sm flex items-center justify-center gap-0.5 mt-1">
                              ★ {auditObj.scoreGiven}점
                            </p>
                          </div>
                          
                          {/* Highlight based on rating */}
                          <div className="flex gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star 
                                key={i} 
                                className={`w-3 h-3 ${
                                  i < auditObj.scoreGiven ? 'text-[#D6A21E] fill-[#D6A21E]' : 'text-slate-200'
                                }`} 
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-white/80 p-12 text-center text-[#7B827B] font-medium rounded-xl border border-dashed border-[#D7D2C4] text-xs space-y-2">
                      <p className="font-bold text-[#123D2A]">아직 별점 평가 내역이 없습니다!</p>
                      <p className="text-[10px] text-[#7B827B]">학생들이 '모두의 세포 배움터' 피드의 비유들에 별점 점수를 부여하면 실시간 연동되어 표시됩니다.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-[#7B827B] font-medium text-xs space-y-2">
                <Users className="w-12 h-12 mx-auto text-[#D7D2C4] animate-pulse" />
                <h4 className="font-black text-[#123D2A]">학생을 선택하여 동료평가 활동을 확인하세요.</h4>
                <p className="text-[10px] text-[#7B827B] max-w-sm mx-auto font-normal">왼쪽의 학생 명단에서 확인하려는 학생을 클릭하면 개별 피드백 참여 내역을 확인할 수 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Detail inspect dialog overlay (submissions table detailed viewer) */}
      {selectedSubDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-info-blue-soft/90 backdrop-blur-xl rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5 animate-scale-up text-left">
            <div className="flex justify-between items-start border-b pb-3 border-info-blue/40">
              <div className="flex items-center gap-2">
                <span className="bg-info-blue text-info-blue-deep px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap inline-block">
                  {selectedSubDetail.studentClass || '1반'}
                </span>
                <h3 className="font-sans font-black text-info-blue-deep text-sm">
                  {selectedSubDetail.studentName} 학생의 세포소기관 비유 제출물
                </h3>
              </div>
              
            </div>

            <div className="space-y-4">
              {/* AI Safety Check Banner */}
              {selectedSubCheckResult && (
                selectedSubCheckResult.isQuotaExceeded || selectedSubCheckResult.summary === 'API 호출한도 초과' || selectedSubCheckResult.categories?.includes('quota_exceeded') ? (
                  <div className="bg-slate-500/10 border border-slate-500/20 p-3.5 rounded-2xl space-y-1.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="text-xs font-black text-slate-700">
                        AI 분석 제한 안내 (API 호출한도 초과)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-normal font-medium">
                      일시적인 API 호출한도 초과로 실시간 AI 안전성 확인이 생략되었습니다. 학생의 제출물은 정상 등록되어 조회 가능합니다.
                    </p>
                  </div>
                ) : (selectedSubCheckResult.needsReview || selectedSubCheckResult.error) ? (
                  <div className="bg-[#FAEBEB] border border-[#E1B1B1] p-3.5 rounded-2xl space-y-1.5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#962A2A] shrink-0" />
                      <span className="text-xs font-black text-[#962A2A]">
                        {selectedSubCheckResult.error ? '자동검사 실패로 확인이 필요합니다.' : '교수자 검토 필요'}
                      </span>
                    </div>
                    
                    {selectedSubCheckResult.summary && (
                      <p className="text-[11px] text-[#962A2A]/90 font-bold leading-normal">
                        {selectedSubCheckResult.summary}
                      </p>
                    )}

                    {selectedSubCheckResult.categories && selectedSubCheckResult.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedSubCheckResult.categories.map((cat) => (
                          <span key={cat} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[9px] font-black border border-red-200">
                            {categoryLabels[cat] || cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null
              )}

              {/* Metaphor representation */}
              <div className="bg-info-blue/35 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-info-blue-deep uppercase tracking-widest leading-none mb-2">제출 세포소기관 및 비유</p>
                <p className="font-sans font-black text-info-blue-deep text-sm leading-snug">
                  "{selectedSubDetail.organelleName}은/는 <span className="underline decoration-info-blue decoration-4 text-info-blue-deep font-black">{renderHighlightedText(selectedSubDetail.metaphorSubject, selectedSubCheckResult?.flaggedSpans, 'title')}</span>이(가) 된다!"
                </p>
              </div>

              <div className="bg-white/80 p-4 rounded-2xl">
                <p className="text-[10px] font-bold text-info-blue-deep/80 uppercase tracking-widest leading-none mb-2">과학적 비유 세부 원리 설명 (생명과학적 타당성)</p>
                <p className="text-xs text-info-blue-deep leading-relaxed font-bold">
                  {renderHighlightedText(selectedSubDetail.metaphorReason, selectedSubCheckResult?.flaggedSpans, 'content')}
                </p>
              </div>

              {/* Organelle mini information */}
              <div className="flex items-center gap-3 bg-white/60 p-3 rounded-2xl">
                <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg shadow-xs shrink-0 p-1">
                  <OrganelleIllustration id={selectedSubDetail.organelleId} className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-sans font-black text-info-blue-deep text-xs leading-none">
                    참고용 세포소기관 정보 (생물 도감)
                  </h4>
                  <p className="text-[10px] text-info-blue-deep/90 font-bold mt-1 leading-normal">
                    이 소기관은 세포 내에서 호흡, 유전 데이터 저장, 단백질 가공/이송 등 필수 기여를 전담합니다.
                  </p>
                </div>
              </div>

              {/* Peer evaluations detail */}
              <div className="space-y-2">
                <p className="text-[10px] font-black text-info-blue-deep uppercase tracking-widest leading-none">동료 상호 평가 참여 내역 ({selectedSubDetail.ratingCount}명 참여)</p>
                <div className="bg-white/50 p-3 rounded-xl max-h-24 overflow-y-auto text-[11px] font-bold text-info-blue-deep space-y-1">
                  {Object.keys(selectedSubDetail.ratings).length > 0 ? (
                    Object.entries(selectedSubDetail.ratings).map(([voterName, rating]) => (
                      <div key={voterName} className="flex justify-between items-center bg-white px-2.5 py-1 rounded">
                        <span>👤 {voterName} 학생</span>
                        <span className="text-[#D6A21E] font-black">★ {rating}점</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-info-blue-deep/75 text-center text-xs py-2 font-bold">아직 아무도 별점 평가에 평가 참여하지 않았습니다.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSubmissionId(null)}
                className="px-5 py-2.5 bg-info-blue-deep hover:bg-info-blue text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all animate-none"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Credentials Reset Modal (Re-prompt Pin code) */}
      {resetCredentialsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-warning-red-soft/90 backdrop-blur-xl rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-left">
            <div className="text-center space-y-1.5">
              <ShieldAlert className="w-10 h-10 text-warning-red-deep mx-auto" />
              <h4 className="font-sans font-black text-warning-red-deep text-base">교사용 보안 자격 완전 초기화</h4>
              <p className="text-[11px] text-warning-red-deep/90 font-bold leading-relaxed text-center">
                기기에 등록되어 있는 학교 이름('{schoolName}') 및 4자리 교수자용 비밀번호를 변경하거나 완전히 리셋합니다. 진행을 위해서 비밀번호를 다시 확인합니다.
              </p>
            </div>

            <form onSubmit={handleResetCredentialsSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text:[10px] font-black text-warning-red-deep/95">현재 연동된 4자리 비유 PIN 번호 입력</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  autoFocus
                  value={resetCredentialsPinInput}
                  onChange={(e) => setResetCredentialsPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white/80 text-lg font-mono font-black text-warning-red-deep rounded-lg focus:outline-none"
                />
              </div>

              {resetCredentialsError && (
                <p className="text-[10px] text-warning-red-deep font-black text-center">{resetCredentialsError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetCredentialsModalOpen(false);
                    setResetCredentialsPinInput('');
                    setResetCredentialsError('');
                  }}
                  className="flex-1 py-2 bg-white/70 text-slate-700 text-[11px] font-black rounded-lg cursor-pointer hover:bg-white/95"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-warning-red text-white text-[11px] font-black rounded-lg cursor-pointer hover:bg-warning-red-deep"
                >
                  예, 권한 리셋
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Submissions Database Clear Modal (Re-prompt Pin code) */}
      {resetDbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-warning-red-soft/90 backdrop-blur-xl rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-left">
            <div className="text-center space-y-1.5">
              <ShieldAlert className="w-10 h-10 text-warning-red-deep mx-auto" />
              <h4 className="font-sans font-black text-warning-red-deep text-base">전체 제출물 데이터 완전 초기화</h4>
              <p className="text-[11px] text-warning-red-deep/90 font-bold leading-relaxed text-center">
                학급의 모든 세포 비유 제출물과 별점 참여 기록을 일괄 삭제합니다. 진행하시려면 교사용 비밀번호 4자리가 필요합니다.
              </p>
            </div>

            <form onSubmit={handleResetDbSubmit} className="space-y-3">
              <div className="space-y-1 col-span-2">
                <label className="block text-[10px] font-black text-warning-red-deep/95">교사용 비밀번호 입력</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  autoFocus
                  value={resetDbPinInput}
                  onChange={(e) => setResetDbPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white/80 text-lg font-mono font-black text-warning-red-deep rounded-lg focus:outline-none"
                />
              </div>

              {resetDbError && (
                <p className="text-[10px] text-warning-red-deep font-black text-center">{resetDbError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetDbModalOpen(false);
                    setResetDbPinInput('');
                    setResetDbError('');
                  }}
                  className="flex-1 py-2 bg-white/70 text-slate-700 text-[11px] font-black rounded-lg cursor-pointer hover:bg-white/95"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-warning-red text-white text-[11px] font-black rounded-lg cursor-pointer hover:bg-warning-red-deep"
                >
                  예, 데이터 완전 삭제
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Delete School Account Modal (Re-prompt Pin code before complete wipe) */}
      {deleteSchoolModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-warning-red-soft/90 backdrop-blur-xl rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-left animate-fade-in">
            <div className="text-center space-y-1.5">
              <ShieldAlert className="w-10 h-10 text-warning-red-deep mx-auto" />
              <h4 className="font-sans font-black text-warning-red-deep text-base">배움터 학교 계정 및 보관소 영구 삭제</h4>
              <p className="text-[11px] text-warning-red-deep/90 font-bold leading-relaxed text-center">
                개설된 학교('{schoolName}')와 비밀번호 자격, 분리 디바이스 저장소(드라이브) 및 모든 학생 제출 목록이 영구 삭제됩니다. 이 작업은 즉시 취소할 수 없습니다.
              </p>
            </div>

            <form onSubmit={handleDeleteSchoolSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-warning-red-deep/95">교수자용 비밀번호 4자리 입력</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  autoFocus
                  value={deleteSchoolPinInput}
                  onChange={(e) => setDeleteSchoolPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white/80 text-lg font-mono font-black text-warning-red-deep rounded-lg focus:outline-none"
                />
              </div>

              {deleteSchoolError && (
                <p className="text-[10px] text-warning-red-deep font-black text-center">{deleteSchoolError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteSchoolModalOpen(false);
                    setDeleteSchoolPinInput('');
                    setDeleteSchoolError('');
                  }}
                  className="flex-1 py-2 bg-white/70 text-slate-700 text-[11px] font-black rounded-lg cursor-pointer hover:bg-white/95"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-warning-red text-white text-[11px] font-black rounded-lg cursor-pointer hover:bg-warning-red-deep"
                >
                  예, 전체 삭제
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Change Teacher PIN Modal */}
      {changePinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#FFFCF4]/90 backdrop-blur-md rounded-3xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto border border-[#D7D2C4]/80 shadow-2xl space-y-4 text-left">
            <div className="text-center space-y-1.5">
              <Settings className="w-10 h-10 text-[#123D2A] mx-auto" />
              <h4 className="font-sans font-black text-[#123D2A] text-base">교사용 관리 비밀번호 PIN 변경</h4>
              <p className="text-[11px] text-[#7B827B] font-bold leading-relaxed text-center">
                현재 연동 중인 배움터의 교수자용 비밀번호 PIN(4자리 숫자)을 변경합니다.
              </p>
            </div>

            <form onSubmit={handleChangePinSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#123D2A]">1. 현재 비밀번호 PIN (4자리)</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={changePinCurrentInput}
                  onChange={(e) => setChangePinCurrentInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white border border-[#D7D2C4] text-lg font-mono font-black text-[#123D2A] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#123D2A]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#123D2A]">2. 새 비밀번호 PIN (4자리)</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={changePinNewInput}
                  onChange={(e) => setChangePinNewInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white border border-[#D7D2C4] text-lg font-mono font-black text-[#123D2A] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#123D2A]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-[#123D2A]">3. 새 비밀번호 확인 (Confirm)</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={changePinConfirmInput}
                  onChange={(e) => setChangePinConfirmInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center py-2 bg-white border border-[#D7D2C4] text-lg font-mono font-black text-[#123D2A] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#123D2A]"
                />
              </div>

              {changePinError && (
                <p className="text-[10px] text-red-650 font-black text-center">{changePinError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChangePinModalOpen(false);
                    setChangePinCurrentInput('');
                    setChangePinNewInput('');
                    setChangePinConfirmInput('');
                    setChangePinError('');
                  }}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 text-[11px] font-black rounded-lg cursor-pointer hover:bg-slate-200"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[#123D2A] hover:bg-[#1B5A3A] text-white text-[11px] font-black rounded-lg cursor-pointer transition-colors"
                >
                  변경 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renderDevTools()}
    </div>
  );
};
