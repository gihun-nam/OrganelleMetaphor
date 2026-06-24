/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { Organelle, MetaphorSubmission, SubmissionCheck } from './types';
import { TeacherIntro } from './components/TeacherIntro';
import { SubmissionForm } from './components/SubmissionForm';
import { MetaphorFeed } from './components/MetaphorFeed';
import { TeacherDashboard } from './components/TeacherDashboard';
import { MOCK_SUBMISSIONS } from './data/mockSubmissions';
import { ORGANELLES } from './data/organelles';
import { loginStudent, getSchoolOrClassByName, subscribeSchool, restartActivityInFirestore, FirestoreSchool } from './services/schoolService';
import { authenticateStudent, authenticateTeacher, appLogout } from './services/authService';
import {
  createSubmission,
  subscribeSubmissionsBySchool,
  subscribeSubmissionChecksBySchool,
  deleteSubmission,
  clearSubmissionsBySchool,
  deleteMockSubmissionsBySchool
} from './services/submissionService';
import { BookOpen, Award, Users, RefreshCw, GraduationCap, Lock, LogOut } from 'lucide-react';

export default function App() {
  // 1. Core Profile states
  const [studentName, setStudentName] = useState<string>(() => {
    return localStorage.getItem('cell_student_name') || '';
  });

  const [studentClass, setStudentClass] = useState<string>(() => {
    return localStorage.getItem('cell_student_class') || '1반';
  });

  const [studentSchool, setStudentSchool] = useState<string>(() => {
    return localStorage.getItem('cell_student_school') || '';
  });

  const [teacherSchool, setTeacherSchool] = useState<string>(() => {
    return localStorage.getItem('cell_teacher_school') || '';
  });
  
  const [assignedOrganelle, setAssignedOrganelle] = useState<Organelle | null>(() => {
    const saved = localStorage.getItem('cell_assigned_organelle');
    return saved ? JSON.parse(saved) : null;
  });

  // Client student login control inputs
  const [schoolInput, setSchoolInput] = useState<string>('');
  const [studentPasswordInput, setStudentPasswordInput] = useState<string>('');
  const [studentNameInput, setStudentNameInput] = useState<string>('');
  const [studentClassInput, setStudentClassInput] = useState<string>('1반');
  const [studentLoginError, setStudentLoginError] = useState<string>('');

  // 2. View Mode state for switching between Student Space and Teacher Control Center
  const [viewMode, setViewMode] = useState<'student' | 'teacher'>(() => {
    const isUnlocked = localStorage.getItem('cell_teacher_session_unlocked') === 'true' || localStorage.getItem('cell_teacher_pin') !== null;
    const teacherSchoolSaved = localStorage.getItem('cell_teacher_school');
    if (isUnlocked && teacherSchoolSaved) {
      return 'teacher';
    }
    return 'student';
  });

  // 3. Collaborative Submissions list state (synced to LocalStorage) - DEFAULT IS EMPTY [] AS REQUESTED BY USER!
  const [submissions, setSubmissions] = useState<MetaphorSubmission[]>(() => {
    const saved = localStorage.getItem('cell_metaphor_submissions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved submissions', e);
      }
    }
    return []; // 9 initial mock citizens removed! Starts completely fresh from 0.
  });

  const [submissionChecks, setSubmissionChecks] = useState<SubmissionCheck[]>([]);

  // 4. Status tracking
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(() => {
    const saved = localStorage.getItem('cell_has_submitted');
    return saved === 'true';
  });
  
  const [timerExpired, setTimerExpired] = useState<boolean>(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTeacherUnlocked, setIsTeacherUnlocked] = useState<boolean>(() => {
    return localStorage.getItem('cell_teacher_session_unlocked') === 'true' || localStorage.getItem('cell_teacher_pin') !== null;
  });
  const [activityRestartedAt, setActivityRestartedAt] = useState<string>('');
  const [schoolData, setSchoolData] = useState<FirestoreSchool | null>(null);
  const [showStudentLogoutConfirm, setShowStudentLogoutConfirm] = useState<boolean>(false);

  // Sync state changes to localStorage
  useEffect(() => {
    async function verifySavedSessions() {
      const activeStudentSchool = localStorage.getItem('cell_student_school');
      const activeTeacherSchool = localStorage.getItem('cell_teacher_school');

      const currentTeacherSchool = localStorage.getItem('cell_teacher_school');
      if (currentTeacherSchool) {
        try {
          const schoolData = await getSchoolOrClassByName(currentTeacherSchool);
          if (!schoolData || !schoolData.isActive) {
            localStorage.removeItem('cell_teacher_school');
            localStorage.removeItem('cell_teacher_pin');
            localStorage.removeItem('cell_student_login_password');
            localStorage.removeItem('cell_teacher_join_code');
            localStorage.removeItem('cell_teacher_session_unlocked');
            setTeacherSchool('');
            setIsTeacherUnlocked(false);
          } else {
            const savedTeacherPin = localStorage.getItem('cell_teacher_pin');
            if (savedTeacherPin) {
              await authenticateTeacher({
                schoolId: schoolData.normalizedSchoolName,
                schoolName: schoolData.schoolName,
                teacherPin: savedTeacherPin
              });
              console.log('[Auth Restore] Refreshed Teacher secure Firebase Auth session successfully.');
              setIsTeacherUnlocked(true);
              localStorage.setItem('cell_teacher_session_unlocked', 'true');
            }
          }
        } catch (error) {
          console.error('[Firestore Teacher Session Match Error]:', error);
        }
      }

      const currentStudentSchool = localStorage.getItem('cell_student_school');
      if (currentStudentSchool) {
        try {
          const schoolData = await getSchoolOrClassByName(currentStudentSchool);
          if (!schoolData || !schoolData.isActive) {
            localStorage.removeItem('cell_student_school');
            localStorage.removeItem('cell_student_name');
            localStorage.removeItem('cell_student_class');
            localStorage.removeItem('cell_assigned_organelle');
            localStorage.removeItem('cell_has_submitted');
            localStorage.removeItem('cell_student_personal_password');

            setStudentSchool('');
            setStudentName('');
            setStudentClass('1반');
            setAssignedOrganelle(null);
            setHasSubmitted(false);
            setTimerExpired(false);

            setSchoolInput('');
            setStudentNameInput('');
            setStudentPasswordInput('');
            setStudentLoginError('');

            alert('이전에 접속한 학생용 학교/학급 정보를 더 이상 찾을 수 없습니다. 다시 로그인해 주세요.');
          } else {
            const savedStudentName = localStorage.getItem('cell_student_name');
            const savedStudentPassword = localStorage.getItem('cell_student_personal_password');
            const savedStudentClass = localStorage.getItem('cell_student_class') || '1반';

            if (savedStudentName && savedStudentPassword) {
              await authenticateStudent({
                schoolId: schoolData.normalizedSchoolName,
                schoolName: schoolData.schoolName,
                classId: savedStudentClass,
                studentName: savedStudentName,
                personalPassword: savedStudentPassword
              });
              console.log('[Auth Restore] Refreshed Student secure Firebase Auth session successfully.');
            }
          }
        } catch (error) {
          console.error('[Firestore Student Session Match Error]:', error);
        }
      }
    }
    verifySavedSessions();
  }, []);

  useEffect(() => {
    localStorage.setItem('cell_student_name', studentName);
  }, [studentName]);

  useEffect(() => {
    localStorage.setItem('cell_student_class', studentClass);
  }, [studentClass]);

  useEffect(() => {
    localStorage.setItem('cell_student_school', studentSchool);
  }, [studentSchool]);

  useEffect(() => {
    if (assignedOrganelle) {
      localStorage.setItem('cell_assigned_organelle', JSON.stringify(assignedOrganelle));
    } else {
      localStorage.removeItem('cell_assigned_organelle');
    }
  }, [assignedOrganelle]);

  // Subscribe to real-time Firestore submissions when activeSubscribedSchool changes
  const activeSubscribedSchool = viewMode === 'teacher' ? teacherSchool : studentSchool;

  useEffect(() => {
    if (activeSubscribedSchool) {
      const unsubscribe = subscribeSubmissionsBySchool(activeSubscribedSchool, 'desc', (data) => {
        setSubmissions(data as unknown as MetaphorSubmission[]);
      }, (err) => {
        console.error('[Firestore Subscriptions Load Failed]:', err);
        alert('제출물 목록을 불러오지 못했습니다. 네트워크 접속을 확인해 주세요.');
      });
      return () => unsubscribe();
    } else {
      setSubmissions([]);
    }
  }, [activeSubscribedSchool]);

  // Subscribe to real-time Firestore submission checks when teacher view is unlocked
  useEffect(() => {
    const isTeacher = viewMode === 'teacher' && isTeacherUnlocked;
    const activeSchoolName = isTeacher ? teacherSchool : null;
    if (activeSchoolName && isTeacher) {
      const unsubscribe = subscribeSubmissionChecksBySchool(activeSchoolName, (data) => {
        setSubmissionChecks(data);
      }, (err) => {
        console.error('[Firestore Submission Checks Subscription Failed]:', err);
      });
      return () => unsubscribe();
    } else {
      setSubmissionChecks([]);
    }
  }, [viewMode, isTeacherUnlocked, teacherSchool]);

  // Subscribe to real-time Firestore school document to sync activityRestartedAt & timer configurations
  useEffect(() => {
    if (activeSubscribedSchool) {
      const unsubscribe = subscribeSchool(activeSubscribedSchool, (data) => {
        if (data) {
          setSchoolData(data);
          if (data.activityRestartedAt) {
            setActivityRestartedAt(data.activityRestartedAt);
          }
        }
      }, (err) => {
        console.error('[Firestore School Subscribe Failed]:', err);
      });
      return () => unsubscribe();
    } else {
      setSchoolData(null);
    }
  }, [activeSubscribedSchool]);

  /**
   * [중복 제출 및 제출완료 제어 가이드]
   * 학생이 다른 기기에서 새로 로그인하거나 새로고침한 경우에도, Firestore에서 동기화되는
   * 제출 데이터 전체 목록(submissions)을 탐색하여 이미 본인 학급+이름으로 작성된 제출 건이 있으면
   * hasSubmitted 및 배정받았던 소기관(assignedOrganelle)을 자동으로 감지 및 복원합니다.
   * "다른 소기관으로 한 번 더 도전하기" 작동을 원활하게 하기 위해, 현재 배정받은 소기관(assignedOrganelle)이
   * 있는 경우 이 특정 소기관의 제출 이력만 확인합니다.
   */
  useEffect(() => {
    if (studentSchool && studentName && submissions.length > 0) {
      // Filter submissions to only those made in the current round (after activityRestartedAt)
      const currentSubmissions = submissions.filter(sub => {
        if (!activityRestartedAt) return true;
        if (!sub.createdAt) return true;
        return sub.createdAt >= activityRestartedAt;
      });

      if (assignedOrganelle) {
        const existingSubForOrganelle = currentSubmissions.find(
          (sub) =>
            sub.studentName.trim().toLowerCase() === studentName.trim().toLowerCase() &&
            sub.studentClass === studentClass &&
            sub.organelleId === assignedOrganelle.id
        );
        if (existingSubForOrganelle) {
          setHasSubmitted(true);
        } else {
          setHasSubmitted(false);
        }
      } else {
        const existingSub = currentSubmissions.find(
          (sub) =>
            sub.studentName.trim().toLowerCase() === studentName.trim().toLowerCase() &&
            sub.studentClass === studentClass
        );
        if (existingSub) {
          setHasSubmitted(true);
          const matchedOrganelle = ORGANELLES.find(o => o.id === existingSub.organelleId);
          if (matchedOrganelle) {
            setAssignedOrganelle(matchedOrganelle);
          }
        }
      }
    }
  }, [studentSchool, studentName, studentClass, submissions, assignedOrganelle, activityRestartedAt]);

  useEffect(() => {
    localStorage.setItem('cell_has_submitted', String(hasSubmitted));
  }, [hasSubmitted]);

  // Student global classroom login handler
  const handleMainStudentLogin = async (e: FormEvent) => {
    e.preventDefault();
    setStudentLoginError('');

    const schoolOrCode = schoolInput.trim();
    const enteredPassword = studentPasswordInput.trim();

    // 6-digit entrance code allows login without password
    const isCodeLogin = schoolOrCode.length === 6;

    if (!schoolOrCode) {
      setStudentLoginError('소속 학교명 또는 6자리 입장 코드를 입력해 주세요.');
      return;
    }

    if (!isCodeLogin && !enteredPassword) {
      setStudentLoginError('학교명으로 입장하시려면 학생 비밀번호가 필요합니다.');
      return;
    }

    try {
      const schoolData = await loginStudent(schoolOrCode, enteredPassword);

      // Authenticate Student (Initial Portal Login - Name is empty initially)
      localStorage.setItem('cell_student_school', schoolData.schoolName);
      localStorage.setItem('cell_student_class', studentClassInput);
      localStorage.removeItem('cell_student_name');

      setStudentSchool(schoolData.schoolName);
      setStudentClass(studentClassInput);
      setStudentName('');
      setAssignedOrganelle(null);

      setHasSubmitted(false);
      setTimerExpired(false);
      
      // Clear password input and errors
      setStudentPasswordInput('');
      setStudentLoginError('');
      alert(`[${schoolData.schoolName} ${studentClassInput}] 배움터 교실에 성공적으로 입장하였습니다!\n아래 작성 공간에서 학생 이름을 입력해 비유 배정 활동을 수행해 보세요.`);
    } catch (err: any) {
      console.error(err);
      setStudentLoginError(err.message || '⚠️ 입장 과정에서 일시적인 통신 수립 장애가 발견되었습니다. Firebase 설정 또는 인터넷 연결 상태를 점검해 보세요.');
    }
  };

  // Reactive registration of active student when school, class, and name are successfully logged
  useEffect(() => {
    if (studentSchool && studentClass && studentName) {
      const driveKey = `cell_drive_${studentSchool.toLowerCase()}_active_students`;
      let activeStudents: any[] = [];
      try {
        const raw = localStorage.getItem(driveKey);
        if (raw) activeStudents = JSON.parse(raw);
      } catch (err) {}

      const alreadyExists = activeStudents.some(
        (s: any) => s.name.toLowerCase() === studentName.toLowerCase() && s.classSelected === studentClass
      );
      if (!alreadyExists) {
        activeStudents.push({ name: studentName, classSelected: studentClass, loggedInAt: new Date().toISOString() });
        localStorage.setItem(driveKey, JSON.stringify(activeStudents));
      }
    }
  }, [studentSchool, studentClass, studentName]);

  // Student global logout handler
  const handleStudentLogout = async () => {
    if (confirm('현재 배움터 및 작성 세션에서 로그아웃하시겠습니까? 작성 중인 데이터는 안전하게 분리 드라이브에 보관됩니다.')) {
      await appLogout();

      setStudentName('');
      setStudentSchool('');
      setStudentClass('1반');
      setAssignedOrganelle(null);
      setHasSubmitted(false);
      setTimerExpired(false);
      
      localStorage.removeItem('cell_student_name');
      localStorage.removeItem('cell_student_school');
      localStorage.removeItem('cell_student_class');
      localStorage.removeItem('cell_assigned_organelle');
      localStorage.removeItem('cell_has_submitted');

      setSchoolInput('');
      setStudentNameInput('');
      setStudentPasswordInput('');
      setStudentLoginError('');
      
      alert('성공적으로 로그아웃되었습니다. 다른 친구가 이 기기에서 새로 로그인할 수 있습니다!');
    }
  };

  // Handle new metaphor posting
  const handleNewSubmission = async (metaphorSubject: string, metaphorReason: string) => {
    if (!studentName) {
      throw new Error('학생 이름 정보가 없어 제출할 수 없습니다. 다시 로그인해 주세요.');
    }
    if (!assignedOrganelle) {
      throw new Error('배정된 세포소기관 정보가 없어 제출할 수 없습니다. 활동을 다시 시작해 주세요.');
    }
    if (!studentSchool) {
      throw new Error('학교 정보가 없어 제출할 수 없습니다. 다시 입장해 주세요.');
    }

    try {
      const personalPassword = localStorage.getItem('cell_student_personal_password') || '1234';
      const savedSubmission = await createSubmission({
        schoolId: studentSchool.toLowerCase(),
        schoolName: studentSchool,
        studentSchool: studentSchool,
        normalizedSchoolName: studentSchool.toLowerCase(),
        studentName: studentName,
        studentClass: studentClass,
        studentPassword: personalPassword,
        organelleId: assignedOrganelle.id,
        organelleName: assignedOrganelle.name,
        metaphorSubject,
        metaphorReason,
        ratings: {},
        averageRating: 0,
        ratingCount: 0,
      });
      if (!savedSubmission?.id) {
        throw new Error('Firestore 제출 저장 결과를 확인할 수 없습니다.');
      }
      setHasSubmitted(true);
    } catch (err: any) {
      alert(err.message || '제출물을 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
  };

  // Handle peer ratings
  const handleVote = async (submissionId: string, score: number, voterName: string) => {
    const subToVote = submissions.find((sub) => sub.id === submissionId);
    if (!subToVote) return;

    // Clone current ratings
    const updatedRatings = { ...subToVote.ratings };
    updatedRatings[voterName] = score;

    // Calculate new average
    const scores = Object.values(updatedRatings) as number[];
    const sum = scores.reduce((acc, curr) => acc + curr, 0);
    const count = scores.length;
    const average = count > 0 ? sum / count : 0;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      const docRef = submissionId.includes('/') ? doc(db, submissionId) : doc(db, 'submissions', submissionId);
      await updateDoc(docRef, {
        ratings: updatedRatings,
        averageRating: average,
        ratingCount: count,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Firestore Rating Save Failed]:', err);
      alert('평가 점수를 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }
  };

  // Callback when teacher logs in, registers, or departures a school classroom to cleanly decouple teacher and student contexts
  const handleSchoolChangeForTeacher = (schoolName: string) => {
    if (schoolName) {
      setTeacherSchool(schoolName);
      localStorage.setItem('cell_teacher_school', schoolName);
    } else {
      setTeacherSchool('');
      localStorage.removeItem('cell_teacher_school');
    }
  };

  // Seeding/Loading/Removing mock student submissions specifically for lesson demos in teacher view (Toggle Mode)
  const handleLoadMockSubmissions = async () => {
    if (!activeSubscribedSchool) {
      alert('연동된 학교가 없습니다. 교사용 관리창에서 먼저 학교 배움터를 생성하거나 로그인해 주세요.');
      return;
    }

    // Check if there are already mock submissions loaded
    const mockNames = MOCK_SUBMISSIONS.map(m => m.studentName.toLowerCase());
    const mockSubs = submissions.filter(sub => sub.isMock === true || mockNames.includes(sub.studentName.trim().toLowerCase()));
    
    if (mockSubs.length > 0) {
      try {
        setIsRefreshing(true);
        
        // Cleanly delete all matching mock/demo documents atomically from Firestore
        await deleteMockSubmissionsBySchool(activeSubscribedSchool);
        
        // Also remove them from active students in local cache
        const activeKey = `cell_drive_${activeSubscribedSchool.toLowerCase()}_active_students`;
        let activeStudents: any[] = [];
        try {
          const raw = localStorage.getItem(activeKey);
          if (raw) activeStudents = JSON.parse(raw);
        } catch (e) {}
        
        const mockNamesLower = MOCK_SUBMISSIONS.map(m => m.studentName.toLowerCase());
        activeStudents = activeStudents.filter(s => !mockNamesLower.includes(s.name.toLowerCase()));
        localStorage.setItem(activeKey, JSON.stringify(activeStudents));
        
        alert('예시 데이터가 모두 정상적으로 제거되었습니다!');
      } catch (err: any) {
        alert('예시 데이터 삭제가 부분 실패했습니다: ' + err.message);
      } finally {
        setIsRefreshing(false);
      }
      return;
    }

    try {
      const newMocks = MOCK_SUBMISSIONS.map((sub) => ({
        schoolId: activeSubscribedSchool.toLowerCase(),
        schoolName: activeSubscribedSchool,
        studentSchool: activeSubscribedSchool,
        normalizedSchoolName: activeSubscribedSchool.toLowerCase(),
        studentName: sub.studentName,
        studentClass: sub.studentClass || '1반', // Maintain individual mock class mapping!
        organelleId: sub.organelleId,
        organelleName: sub.organelleName,
        metaphorSubject: sub.metaphorSubject,
        metaphorReason: sub.metaphorReason,
        ratings: sub.ratings || {},
        averageRating: sub.averageRating || 0,
        ratingCount: sub.ratingCount || 0,
        isMock: true, // Mark as mock!
      }));

      for (const mock of newMocks) {
        await createSubmission(mock);
      }

      // Also register them as active students in driver as if typed in by student
      const activeKey = `cell_drive_${activeSubscribedSchool.toLowerCase()}_active_students`;
      let activeStudents: any[] = [];
      try {
        const raw = localStorage.getItem(activeKey);
        if (raw) activeStudents = JSON.parse(raw);
      } catch (e) {}

      newMocks.forEach((mock) => {
        const alreadyExists = activeStudents.some(
          (s: any) => s.name.toLowerCase() === mock.studentName.toLowerCase() && s.classSelected === mock.studentClass
        );
        if (!alreadyExists) {
          activeStudents.push({
            name: mock.studentName,
            classSelected: mock.studentClass,
            loggedInAt: new Date().toISOString(),
          });
        }
      });
      localStorage.setItem(activeKey, JSON.stringify(activeStudents));

      alert(`[${activeSubscribedSchool}] 4개 학급에 총 12명의 예시 학생 활동 데이터와 2인 동료평가 별점이 원격 Firestore에 일괄 취합 및 동기화되었습니다!`);
    } catch (err: any) {
      console.error('[Load Mocks Error]:', err);
      alert('예시 데이터를 불러오거나 국소 저장하지 못했습니다: ' + err.message);
    }
  };

  // Administrative action to clear all activities across all classes for this school
  const handleClearAllSubmissions = async () => {
    if (activeSubscribedSchool) {
      try {
        await clearSubmissionsBySchool(activeSubscribedSchool);
        const activeKey = `cell_drive_${activeSubscribedSchool.toLowerCase()}_active_students`;
        localStorage.setItem(activeKey, JSON.stringify([]));
        alert('모든 학급의 활동 내용(원격 제출물)이 깨끗하게 영구 삭제 및 성공적으로 초기화되었습니다.');
      } catch (err: any) {
        alert(err.message || '일괄 삭제 처리 도중 오류가 발생했습니다.');
      }
    }
  };

  // Administrative individual row deletion
  const handleDeleteSubmission = async (id: string) => {
    try {
      await deleteSubmission(id);
      alert('성공적으로 삭제 완료되었습니다!');
    } catch (err: any) {
      alert(err.message || '제출물을 삭제하지 못했습니다.');
    }
  };

  // Administrative active activity restart for the school
  const handleRestartActivity = async (durationSeconds: number = 300) => {
    if (activeSubscribedSchool) {
      try {
        const timestamp = await restartActivityInFirestore(activeSubscribedSchool, durationSeconds);
        setActivityRestartedAt(timestamp);
      } catch (err: any) {
        alert(err.message || '활동 재시작 처리 중 오류가 발생했습니다.');
      }
    }
  };

  // Reset progress ONLY for the current class (학급별 활동 상태 초기화)
  const handleResetEntireClass = async () => {
    if (activeSubscribedSchool) {
      try {
        const { query, collection, where, getDocs, doc, writeBatch } = await import('firebase/firestore');
        const { db } = await import('./lib/firebase');
        const q = query(
          collection(db, `submissions/${activeSubscribedSchool.toLowerCase()}/${studentClass}`),
          where('isDeleted', '==', false)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.forEach((docSnap) => {
            batch.update(docSnap.ref, {
              isDeleted: true,
              updatedAt: new Date().toISOString()
            });
          });
          await batch.commit();
        }

        // 2. Filter out active students belonging to currentStudentClass (studentClass)
        const activeKey = `cell_drive_${activeSubscribedSchool.toLowerCase()}_active_students`;
        const activeSaved = localStorage.getItem(activeKey);
        if (activeSaved) {
          try {
            const allStudents = JSON.parse(activeSaved);
            if (Array.isArray(allStudents)) {
              const filteredStus = allStudents.filter(stu => stu.classSelected !== studentClass);
              localStorage.setItem(activeKey, JSON.stringify(filteredStus));
            }
          } catch (e) {}
        }
      } catch (err: any) {
        alert('이전 상태 초기화 도중 권한 오류 혹은 인터넷 중단 장애 발생: ' + err.message);
        return;
      }
    }

    // Reset local browser student session so it logs out the device
    localStorage.removeItem('cell_student_name');
    localStorage.removeItem('cell_student_class');
    localStorage.removeItem('cell_student_school');
    localStorage.removeItem('cell_assigned_organelle');
    localStorage.removeItem('cell_has_submitted');

    setStudentName('');
    setStudentClass('1반');
    setStudentSchool('');
    setAssignedOrganelle(null);
    setHasSubmitted(false);
    setTimerExpired(false);
    setResetModalOpen(false);

    setSchoolInput('');
    setStudentNameInput('');
    setStudentPasswordInput('');
    setStudentLoginError('');
    alert('현재 학급 전체의 활동 상태 및 해당 디바이스의 학생 로그인 정보가 안전하게 초기화되었습니다.');
  };

  const handleRefreshData = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const getLoggedInStudentsCount = (): number => {
    if (!activeSubscribedSchool) return 0;
    const uniqueSubmitters = new Set(
      submissions.map((s) => {
        if (s.isMock || !s.ownerUid) {
          return `${s.studentClass || '1반'}_${s.studentName.trim().toLowerCase()}`;
        }
        return s.ownerUid;
      })
    );
    return uniqueSubmitters.size;
  };

  const totalStudentsCount = getLoggedInStudentsCount();
  const topSubmission = [...submissions].sort((a, b) => {
    const scoreA = Math.round(a.averageRating * 10) / 10;
    const scoreB = Math.round(b.averageRating * 10) / 10;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  })[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F2F4F5] via-[#F8F9FA] to-[#FDFDFD] text-[#3E4540] flex flex-col justify-between selection:bg-[#DDE8D6] selection:text-[#123D2A]" id="classroom-main-layout">
      
      {/* Educational Header banner */}
      <header className="bg-[#FFFCF4]/95 border-b border-[#D7D2C4]/80 sticky top-0 z-40 backdrop-blur-lg shadow-xs" id="classroom-sticky-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#123D2A] text-white font-black text-lg sm:text-xl shadow-sm ring-2 ring-[#DDE8D6] shrink-0">
              🧬
            </span>
            <div className="min-w-0">
              <h1 className="font-sans font-extrabold text-[#123D2A] text-sm md:text-base tracking-tight leading-tight truncate">
                세포소기관 탐구 배움터
              </h1>
              <p className="text-[9px] text-[#7B827B] font-bold mt-1 uppercase tracking-wider hidden md:block truncate">
                LIFE AND ENVIRONMENT ⋅ ORGANELLE METAPHOR PEER FEEDBACK
              </p>
            </div>
          </div>

          {/* Real-time View Mode Toggler (Student Space vs. Teacher Control Center) */}
          <div className="flex bg-[#FFFCF4]/80 p-1 rounded-2xl border border-[#D7D2C4] text-xs gap-1 shadow-inner shrink-0" id="mode-switcher">
            <button
              onClick={() => setViewMode('student')}
              className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'student' 
                  ? 'bg-[#123D2A] text-white shadow-md scale-[1.02]' 
                  : 'text-[#3E4540]/70 hover:text-[#123D2A]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">학생 활동모드</span>
              <span className="sm:hidden">학생</span>
            </button>
            <button
              onClick={() => setViewMode('teacher')}
              className={`px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'teacher' 
                  ? 'bg-[#123D2A] text-white shadow-md scale-[1.02]' 
                  : 'text-[#3E4540]/70 hover:text-[#123D2A]'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">교수자 관리창</span>
              <span className="sm:hidden">교수</span>
            </button>
          </div>

          {/* Real-time stats dashboard in header */}
          <div className="flex items-center gap-3 text-xs font-semibold" id="header-stats-badges">
            <div className="hidden md:flex items-center gap-1.5 bg-[#DDE8D6]/40 border border-[#D7D2C4]/60 px-3 py-1 rounded-full text-[#123D2A] shadow-xs">
              <Users className="w-3.5 h-3.5 text-[#123D2A]" />
              <span>활동 인원: <strong className="text-[#123D2A] font-extrabold">{totalStudentsCount}명</strong></span>
            </div>
            
            <div className="hidden lg:flex items-center gap-1.5 bg-[#FFFCF4] border border-[#D7D2C4]/85 px-3 py-1 rounded-full text-[#3E4540] shadow-xs animate-float">
              <Award className="w-3.5 h-3.5 text-[#D6A21E] fill-[#D6A21E]/10" />
              <span>최고인기비유: <strong className="font-extrabold">{topSubmission ? `${topSubmission.studentName}의 [${topSubmission.organelleName}]` : '작성 대기 중'}</strong></span>
            </div>

            {/* New sky blue Refresh button replacing class-wise reset */}
            {viewMode === 'teacher' && isTeacherUnlocked && (
              <button
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="p-2 bg-sky-50 border-2 border-sky-150 text-sky-500 hover:bg-sky-500 hover:text-white rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-80"
                title="새로고침"
                id="refresh-classroom-btn"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Student view login info bar (or status bar when logged in) */}
      {viewMode === 'student' && studentSchool && (
        <div className="bg-[#FFFCF4]/90 border-b-2 border-[#D7D2C4] py-3 px-4 shadow-sm" id="student-login-status-bar">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
            <div className="flex flex-wrap items-center justify-start gap-y-1.5 gap-x-2.5 text-xs text-[#3E4540] font-bold" id="student-status-info">
              <span className="flex h-2 w-2 rounded-full bg-[#123D2A] shrink-0 animate-pulse"></span>
              <span className="break-keep">📍 소속: <strong className="text-[#123D2A] text-sm font-black">{studentSchool} {studentClass}</strong></span>
              <span className="text-[#D7D2C4] hidden sm:inline">|</span>
              <span className="break-keep">학생명: <strong className="text-[#123D2A] text-sm font-black">{studentName || '(미입력)'}</strong></span>
              <span className="text-[#D7D2C4] hidden sm:inline">|</span>
              <span className="break-keep">배정 세포소기관: <strong className="text-[#D6A21E] text-sm font-black">{assignedOrganelle ? `[${assignedOrganelle.name}]` : '미배정'}</strong></span>
            </div>
            
            <button
              onClick={() => setShowStudentLogoutConfirm(true)}
              className="px-3 py-1.5 bg-warning-red hover:bg-warning-red-deep text-white transition-all text-xs font-black rounded-lg flex items-center justify-center gap-1 cursor-pointer shadow-xs whitespace-nowrap w-fit self-end sm:self-auto"
              id="student-logout-trigger-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃 및 나가기</span>
            </button>
          </div>
        </div>
      )}

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 md:space-y-8" id="classroom-dashboard-container">
        {viewMode === 'teacher' ? (
          <TeacherDashboard
            isUnlocked={isTeacherUnlocked}
            setIsUnlocked={setIsTeacherUnlocked}
            submissions={submissions}
            submissionChecks={submissionChecks}
            schoolData={schoolData}
            onLoadMockData={handleLoadMockSubmissions}
            onClearAllData={handleClearAllSubmissions}
            onDeleteSubmission={handleDeleteSubmission}
            onSchoolChange={handleSchoolChangeForTeacher}
            onRestartActivity={handleRestartActivity}
          />
        ) : studentSchool ? (
          <>
            {/* Banner Section / Title introduction */}
            <section className="space-y-3 bg-gradient-to-br from-[#0B2519] to-[#123D2A] text-white p-6 md:p-8 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl shadow-[#0B2519]/20 relative overflow-hidden" id="main-banner-title">
              <div className="absolute top-0 right-0 transform translate-x-12 -translate-y-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>
              <div className="relative z-10 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="bg-[#D6A21E] text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                    공통선택(4)-인간과과학&AI
                  </span>
                </div>
                <h2 className="font-sans font-extrabold text-[#FFFCF4] text-xl md:text-2xl tracking-tight leading-snug break-keep">
                  세포소기관 비유 작성하기 활동 배움터
                </h2>
                <p className="text-xs text-emerald-100 max-w-3xl leading-relaxed break-keep">
                  배정 받은 세포소기관의 구조와 기능을 공부한 뒤, 창의적이고 타당한 비유(Metaphor)를 만들어 작성해 보세요!<br />
                  작성 완료 시, 동료 평가(Peer Feedback) 세션에 실시간으로 여러분의 의견이 등장합니다.
                </p>
              </div>
            </section>

            {/* Interactive CELL Dictionary */}
            <section className="space-y-4" id="section-teacher-intro">
              <TeacherIntro schoolName={studentSchool} />
            </section>

            {/* Student Metaphor Submission Form */}
            <section className="space-y-4" id="section-classroom-submission">
              <SubmissionForm
                currentStudentName={studentName}
                setParentStudentName={setStudentName}
                currentStudentClass={studentClass}
                setParentStudentClass={setStudentClass}
                currentStudentSchool={studentSchool}
                setParentStudentSchool={setStudentSchool}
                assignedOrganelle={assignedOrganelle}
                setAssignedOrganelle={setAssignedOrganelle}
                onSubmit={handleNewSubmission}
                hasSubmitted={hasSubmitted}
                setHasSubmitted={setHasSubmitted}
                timerExpired={timerExpired}
                setTimerExpired={setTimerExpired}
                activityRestartedAt={activityRestartedAt}
                schoolData={schoolData}
              />
            </section>

            {/* Classroom Feed Section */}
            <section id="section-classroom-feed">
              <MetaphorFeed
                submissions={submissions}
                activeStudentName={studentName}
                activeStudentSchool={studentSchool}
                activeStudentClass={studentClass}
                onVote={handleVote}
              />
            </section>

            {/* Learning Checkpoints & Classroom rules */}
            <section className="glass-card p-6 md:p-8" id="learning-checkpoint-footer-card">
              <h3 className="font-sans font-black text-[#123D2A] text-base mb-4 flex items-center gap-2 break-keep">
                <BookOpen className="w-5 h-5 text-[#123D2A]" />
                이 단원 핵심 성취기준 체크포인트 (일반생물학 Level)
              </h3>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-[#3E4540]/95" id="checkpoint-bullets">
                <li className="bg-[#FFFCF4]/45 backdrop-blur-sm p-4 rounded-2xl shadow-xs hover:scale-[1.01] transition-all break-keep">
                  <strong className="text-[#123D2A] block mb-2 font-bold text-sm border-b pb-1.5 border-[#D7D2C4]/40 break-keep">1. 핵과 리보솜의 연계성</strong>
                  핵 속의 유전정보 설계도(DNA)의 복사본(RNA)을 전달받은 리보솜 알갱이가 이 설계도대로 완벽한 단백질 조립을 직접 수행합니다.
                </li>
                <li className="bg-[#FFFCF4]/45 backdrop-blur-sm p-4 rounded-2xl shadow-xs hover:scale-[1.01] transition-all break-keep">
                  <strong className="text-[#123D2A] block mb-2 font-bold text-sm border-b pb-1.5 border-[#D7D2C4]/40 break-keep">2. 마이토콘드리아와 엽록체</strong>
                  엽록체는 빛에너지를 이용하여 이산화탄소로부터 양분(포도당)을 만드는 유기농 공장이고, 마이토콘드리아는 이 포도당을 쪼개어 세포 전용 에너지 화폐(ATP)를 뽑는 발전소입니다.
                </li>
                <li className="bg-[#FFFCF4]/45 backdrop-blur-sm p-4 rounded-2xl shadow-xs hover:scale-[1.01] transition-all break-keep">
                  <strong className="text-[#123D2A] block mb-2 font-bold text-sm border-b pb-1.5 border-[#D7D2C4]/40 break-keep">3. 소포체와 골지체</strong>
                  소포체 고속도로가 단백질을 안쪽에서 발송해 주면, 골지체 택배 배송 터미널에서 소낭 주머니 주소지를 적어 세포 바깥쪽으로 분비합니다.
                </li>
              </ul>
            </section>
          </>
        ) : (
          /* Global School & Student Login Interface */
          <div className="max-w-md mx-auto glass-card p-6 md:p-8 space-y-6 my-8" id="global-school-login">
            <div className="text-center space-y-2 break-keep">
              <span className="text-4xl animate-bounce inline-block">🏫</span>
              <h3 className="font-sans font-black text-[#123D2A] text-[22px] break-keep">생명과환경 세포소기관 배움터 로그인</h3>
              <p className="text-xs text-[#3E4540] font-normal leading-relaxed break-keep">
                소속 학교명 또는 발급받은 6자리 입장코드를 입력하여 입장해 주십시오.<br />
                <span className="text-[#3E4540]/60 font-normal text-[11px] break-keep">(아직 배움터 공간이 없다면 우측 상단의 [교사용 관리창]에서 먼저 신규 등록을 완료해 주세요!)</span>
              </p>
            </div>

            <form onSubmit={handleMainStudentLogin} className="space-y-5" id="main-student-login-form">
              {/* School Input with label extension "(초기 설정 시 입력한 학교)" dynamically displayed */}
              <div className="space-y-1 text-left">
                <label className="block text-xs font-black text-[#123D2A]">
                  소속 학교명 또는 입장 코드 (School Name / Join Code)
                  {schoolInput.trim() !== '' && (
                    <span className="text-[#D6A21E] text-[10px] font-black font-sans ml-1.5 animate-pulse">
                      (입장코드 입력 가능)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 서울고등학교 또는 6자리 코드"
                  value={schoolInput}
                  onChange={(e) => setSchoolInput(e.target.value)}
                  className="w-full px-4 py-3 bg-[#FFFCF4]/60 border-2 border-[#D7D2C4] rounded-xl text-[#3E4540] font-normal placeholder-[#7B827B]/60 text-xs focus:outline-none focus:ring-2 focus:ring-[#123D2A] focus:bg-white transition-all shadow-inner"
                />
              </div>

              {/* Student Password - Full Width with high polish */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-black text-[#123D2A]">
                  학교 로그인 비밀번호 <span className="text-[10px] font-bold text-[#D6A21E]">{schoolInput.trim().length === 6 ? '(생략 가능)' : '(필수)'}</span>
                </label>
                <input
                  type="password"
                  required={schoolInput.trim().length !== 6}
                  placeholder={schoolInput.trim().length === 6 ? "입장 코드 로그인 시 비밀번호가 요구되지 않습니다" : "지정된 4자리 교실 로그인 비밀번호를 입력하세요"}
                  value={studentPasswordInput}
                  onChange={(e) => setStudentPasswordInput(e.target.value)}
                  className={`w-full px-4 py-3 bg-[#FFFCF4]/60 border-2 border-[#D7D2C4] rounded-xl text-[#3E4540] font-normal placeholder-[#7B827B]/60 text-xs focus:outline-none focus:ring-2 focus:ring-[#123D2A] focus:bg-white transition-all shadow-inner ${
                    studentPasswordInput
                      ? 'text-center tracking-widest font-mono'
                      : 'text-left tracking-normal font-sans'
                  }`}
                />
              </div>

              {/* Sophisticated Class Select UI */}
              <div className="space-y-2 text-left">
                <label className="block text-xs font-black text-[#123D2A]">
                  소속 학급 선택 (Class Selection)
                </label>
                <div className="grid grid-cols-4 gap-2" id="class-button-selector">
                  {['1반', '2반', '3반', '4반'].map((cls) => {
                    const isSelected = studentClassInput === cls;
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => setStudentClassInput(cls)}
                        className={`py-3.5 rounded-2xl text-sm font-black transition-all duration-200 cursor-pointer flex flex-col items-center justify-center border-2 ${
                          isSelected
                            ? 'bg-[#123D2A] border-[#123D2A] text-white shadow-md scale-[1.03]'
                            : 'bg-[#FFFCF4]/60 border-[#D7D2C4] text-[#3E4540] hover:bg-[#DDE8D6] hover:border-[#D7D2C4]'
                        }`}
                      >
                        <span className={`text-[9px] uppercase font-mono tracking-wider ${isSelected ? 'text-[#DDE8D6]' : 'text-[#7B827B]'}`}>
                          Class
                        </span>
                        <span className="text-xs sm:text-sm mt-0.5 font-bold">{cls}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {studentLoginError && (
                <div className="bg-warning-red-soft/82 backdrop-blur-md text-warning-red-deep text-xs font-black p-3.5 rounded-xl leading-relaxed text-center shadow-xs" id="main-login-error">
                  ⚠️ {studentLoginError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-[#123D2A] hover:bg-[#1B5A3A] text-white font-black rounded-xl text-sm transition-all shadow-md cursor-pointer border-b-4 border-[#0F3222] flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.99]"
              >
                <GraduationCap className="w-4 h-4" />
                배움터 로그인 및 교실 입장
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Dynamic, fully sandboxed Student Logout Confirmation Modal */}
      {showStudentLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in" id="student-logout-confirm-modal">
          <div className="bg-warning-red-soft/90 backdrop-blur-xl rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-left">
            <div className="text-center space-y-1.5">
              <Lock className="w-12 h-12 text-warning-red-deep mx-auto animate-bounce-short" />
              <h4 className="font-sans font-black text-warning-red-deep text-base break-keep">배움터 로그아웃 확인</h4>
              <p className="text-xs text-warning-red-deep/90 font-bold leading-relaxed text-center break-keep">
                현재 배움터 및 작성 세션에서 로그아웃하시겠습니까?<br />
                작성 중인 데이터는 안전하게 분리 드라이브에 보존됩니다.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowStudentLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-white/70 text-slate-750 text-xs font-black rounded-xl cursor-pointer hover:bg-white/95 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowStudentLogoutConfirm(false);
                  await appLogout();
                  
                  // Run actual logout routine
                  setStudentName('');
                  setStudentSchool('');
                  setStudentClass('1반');
                  setAssignedOrganelle(null);
                  setHasSubmitted(false);
                  setTimerExpired(false);
                  
                  localStorage.removeItem('cell_student_name');
                  localStorage.removeItem('cell_student_school');
                  localStorage.removeItem('cell_student_class');
                  localStorage.removeItem('cell_assigned_organelle');
                  localStorage.removeItem('cell_has_submitted');

                  setSchoolInput('');
                  setStudentNameInput('');
                  setStudentPasswordInput('');
                  setStudentLoginError('');
                  
                  alert('성공적으로 로그아웃되었습니다.');
                }}
                className="flex-1 py-2.5 bg-warning-red text-white text-xs font-black rounded-xl cursor-pointer hover:bg-warning-red-deep transition-colors text-center"
              >
                로그아웃 진행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classroom Footer */}
      <footer className="bg-[#1c3829] text-white py-8 text-center text-xs font-semibold border-none" id="classroom-footer break-keep">
        <p>© 2026 서강대학교 생명과환경 세포소기관 배움터. All Rights Reserved. (서강대학교 생명과학과)</p>
      </footer>
      </div>
  );
}
