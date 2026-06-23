/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Organelle } from '../types';
import { ORGANELLES } from '../data/organelles';
import { OrganelleIllustration } from './OrganelleIllustration';
import { Timer, AlertTriangle, CheckCircle2, ChevronRight, Lock } from 'lucide-react';
import { FirestoreSchool } from '../services/schoolService';
import { authenticateStudent } from '../services/authService';

interface SubmissionFormProps {
  currentStudentName: string;
  setParentStudentName: (name: string) => void;
  currentStudentClass: string;
  setParentStudentClass: (className: string) => void;
  currentStudentSchool: string;
  setParentStudentSchool: (schoolName: string) => void;
  assignedOrganelle: Organelle | null;
  setAssignedOrganelle: (organelle: Organelle | null) => void;
  onSubmit: (metaphorSubject: string, metaphorReason: string) => Promise<void>;
  hasSubmitted: boolean;
  setHasSubmitted: (val: boolean) => void;
  timerExpired: boolean;
  setTimerExpired: (expired: boolean) => void;
  activityRestartedAt?: string;
  schoolData?: FirestoreSchool | null;
}

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  currentStudentName,
  setParentStudentName,
  currentStudentClass,
  setParentStudentClass,
  currentStudentSchool,
  setParentStudentSchool,
  assignedOrganelle,
  setAssignedOrganelle,
  onSubmit,
  hasSubmitted,
  setHasSubmitted,
  timerExpired,
  setTimerExpired,
  activityRestartedAt,
  schoolData
}) => {
  const [schoolInput, setSchoolInput] = useState(currentStudentSchool);
  const [nameInput, setNameInput] = useState(currentStudentName);
  const [classSelected, setClassSelected] = useState(currentStudentClass || '1반');
  const [personalPasswordInput, setPersonalPasswordInput] = useState(() => localStorage.getItem('cell_student_personal_password') || '');
  const [loginError, setLoginError] = useState('');
  const [isNameConfirmed, setIsNameConfirmed] = useState(currentStudentName !== '' && currentStudentSchool !== '');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  
  // Metaphor fields
  const [metaphorTarget, setMetaphorTarget] = useState('');
  const [metaphorReason, setMetaphorReason] = useState('');
  
  // Timer States (5 minutes = 300 seconds)
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [timerActive, setTimerActive] = useState(false);

  // Encouraging speech based on remaining time
  const [teacherTimerMessage, setTeacherTimerMessage] = useState('"이름을 쓰고 여러분만의 세포소기관을 랜덤으로 배정받아 보세요!"');

  // Synchronized cloud-based timer logic & fallback offline timer logic
  useEffect(() => {
    // Phase 1: Fallback if no schoolData subscription exists (e.g. offline/initial)
    if (!schoolData) {
      if (!isNameConfirmed) {
        setTimerActive(false);
        return;
      }
      
      const savedStart = localStorage.getItem('cell_timer_start_time');
      let initialRemaining = 300;
      if (savedStart) {
        const elapsed = Math.floor((Date.now() - new Date(savedStart).getTime()) / 1000);
        initialRemaining = 300 - elapsed;
      } else {
        localStorage.setItem('cell_timer_start_time', new Date().toISOString());
      }

      if (initialRemaining <= 0) {
        setSecondsLeft(0);
        setTimerActive(false);
        setTimerExpired(true);
        setHasSubmitted(true);
        return;
      }

      setSecondsLeft(initialRemaining);
      setTimerActive(true);
      setTimerExpired(false);

      const interval = setInterval(() => {
        setSecondsLeft((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            setTimerActive(false);
            setTimerExpired(true);
            setHasSubmitted(true);
            clearInterval(interval);
            alert("⏰ 제한 시간이 종료되었습니다! 친구들의 비유를 읽어보고 서로 격려하는 별점 평가에 참여해 보세요.");
            return 0;
          }
          return next;
        });
      }, 1000);

      return () => clearInterval(interval);
    }

    // Phase 2: Complete Realtime Cloud Sync!
    if (!isNameConfirmed) {
      setTimerActive(false);
      return;
    }

    const { timerIsActive, timerSecondsLeft = 300, timerStartAt, timerDuration = 300 } = schoolData;

    if (timerIsActive) {
      setTimerActive(true);
      
      const calculateRemainingCloud = () => {
        if (!timerStartAt) return timerSecondsLeft;
        const elapsed = Math.floor((Date.now() - new Date(timerStartAt).getTime()) / 1000);
        const remaining = timerDuration - elapsed;
        return remaining > 0 ? remaining : 0;
      };

      const remainingCloudVal = calculateRemainingCloud();
      setSecondsLeft(remainingCloudVal > 0 ? remainingCloudVal : 0);
      
      if (remainingCloudVal <= 0) {
        setTimerActive(false);
        setTimerExpired(true);
        setHasSubmitted(true);
      } else {
        setTimerExpired(false);
      }

      const cloudTicker = setInterval(() => {
        const remaining = calculateRemainingCloud();
        if (remaining <= 0) {
          setSecondsLeft(0);
          setTimerActive(false);
          setTimerExpired(true);
          setHasSubmitted(true);
          clearInterval(cloudTicker);
          const minutes = Math.ceil(timerDuration / 60);
          alert(`⏰ ${minutes}분 제한 시간이 종료되었습니다! 친구들의 비유를 읽어보고 서로 격려하는 별점 평가에 참여해 보세요.`);
        } else {
          setSecondsLeft(remaining);
          setTimerExpired(false);
        }
      }, 500);

      return () => clearInterval(cloudTicker);
    } else {
      // Paused or Finished/Stopped state
      setTimerActive(false);
      if (timerSecondsLeft <= 0) {
        setSecondsLeft(0);
        setTimerExpired(true);
        setHasSubmitted(true);
      } else {
        setSecondsLeft(timerSecondsLeft);
        setTimerExpired(false);
      }
    }
  }, [schoolData, isNameConfirmed, setTimerExpired, setHasSubmitted]);

  // Auto-assign organelle when teacher starts the timer or on entry
  useEffect(() => {
    if (isNameConfirmed && timerActive && !assignedOrganelle) {
      const randomIndex = Math.floor(Math.random() * ORGANELLES.length);
      setAssignedOrganelle(ORGANELLES[randomIndex]);
    }
  }, [isNameConfirmed, timerActive, assignedOrganelle, setAssignedOrganelle]);

  // Listen to Activity Restart from Teacher Dashboard
  useEffect(() => {
    if (activityRestartedAt) {
      const lastLocalRestart = localStorage.getItem('cell_local_last_restart');
      if (lastLocalRestart !== activityRestartedAt) {
        localStorage.setItem('cell_local_last_restart', activityRestartedAt);
        localStorage.setItem('cell_timer_start_time', activityRestartedAt);
        
        const duration = schoolData?.timerDuration || 300;
        setSecondsLeft(duration);
        setTimerExpired(false);
        const isActive = schoolData?.timerIsActive ?? false;
        setTimerActive(isActive);

        setMetaphorTarget('');
        setMetaphorReason('');

        setHasSubmitted(false);

        const minutes = Math.round(duration / 60);
        if (isActive) {
          const randomIndex = Math.floor(Math.random() * ORGANELLES.length);
          setAssignedOrganelle(ORGANELLES[randomIndex]);
          alert(`🔔 교수님께서 세포 탐구 활동을 새롭게 시작하셨습니다!\n타이머(${minutes}분)가 시작되며, 시스템에서 무작위로 자동 배정된 세포소기관에 대해 제한 시간 동안 비유를 작성할 수 있습니다.`);
        } else {
          setAssignedOrganelle(null);
          alert(`🔔 교수님께서 세포 탐구 활동을 초기화하셨습니다!\n화면이 대기 상태로 전환되며, 선생님께서 타이머를 시작하시면 다시 활동에 참여하실 수 있습니다.`);
        }
      }
    }
  }, [activityRestartedAt, setAssignedOrganelle, setHasSubmitted, setTimerExpired, schoolData]);

  // Sync external current student name, class and school
  useEffect(() => {
    if (currentStudentName && currentStudentSchool) {
      setNameInput(currentStudentName);
      setSchoolInput(currentStudentSchool);
      setIsNameConfirmed(true);
    } else {
      setIsNameConfirmed(false);
    }
  }, [currentStudentName, currentStudentSchool]);

  useEffect(() => {
    if (currentStudentClass) {
      setClassSelected(currentStudentClass);
    }
  }, [currentStudentClass]);

  // Update teacher message depending on timer
  useEffect(() => {
    if (!assignedOrganelle) {
      setTeacherTimerMessage('"이름을 입력하고 대기해 주세요. 선생님이 세포 탐구를 시작하시면 나만의 세포소기관이 랜덤으로 자동 배정됩니다! 🧬"');
      return;
    }
    if (hasSubmitted) {
      setTeacherTimerMessage('"참 잘했어요! 여러분의 비유가 세포 배움터에 게시되었어요. 이제 친구들의 작성을 기다리며 상호 평가에 참여해 보세요!"');
      return;
    }
    if (timerExpired) {
      setTeacherTimerMessage('"제한 시간이 완료되었네요! 작성하기 어렵다면 교과서를 보거나 힌트를 참고하세요. 어서 마저 적고 제출해 주세요~"');
      return;
    }
    
    if (secondsLeft > 240) {
      setTeacherTimerMessage(`"배정받은 [${assignedOrganelle.name}]에 대해 천천히 읽어보고, 일상 속 어떤 대상과 가장 비슷한 기능을 하는지 고민해 보세요! 👍"`);
    } else if (secondsLeft > 180) {
      setTeacherTimerMessage(`"시간은 충분해요! 교수님이 제공한 힌트('${assignedOrganelle.metaphorExample}')도 확인해 보면서 영감을 얻어봐요! 😉"`);
    } else if (secondsLeft > 120) {
      setTeacherTimerMessage('"생각한 대상을 바탕으로 멋진 한 문장을 적어볼 차례예요. 친구들과 겹치지 않는 독창적인 아이디어라면 더욱 좋겠죠?"');
    } else if (secondsLeft > 60) {
      setTeacherTimerMessage('"남은 시간 1분! 거의 다 왔어요. 비유한 이유에 해당 소기관의 핵심 과학적 기능을 한 번 더 체크해서 작성하기!"');
    } else {
      setTeacherTimerMessage('"마감 시간이 1분 미만으로 남았어요! 오타는 없는지 확인하고 바로 [제출하기] 단추를 클릭해 주세요! ⏰"');
    }
  }, [secondsLeft, assignedOrganelle, hasSubmitted, timerExpired]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthenticating) return;
    setLoginError('');

    const studentName = nameInput.trim();
    const personalPassword = personalPasswordInput.trim();

    if (!studentName) {
      setLoginError('학생 이름을 입력해 주세요.');
      return;
    }

    if (!personalPassword || personalPassword.length < 4) {
      setLoginError('본인 확인 및 동명이인 오류 방지를 위한 숫자 4자리 비밀번호를 설정해 주세요.');
      return;
    }

    setIsAuthenticating(true);
    try {
      // Authenticating student via deterministic email credentials
      await authenticateStudent({
        schoolId: schoolData?.normalizedSchoolName || currentStudentSchool,
        schoolName: schoolData?.schoolName || currentStudentSchool,
        classId: classSelected,
        studentName: studentName,
        personalPassword: personalPassword
      });

      localStorage.setItem('cell_student_personal_password', personalPassword);

      // Success
      setParentStudentName(studentName);
      setParentStudentClass(classSelected);
      setIsNameConfirmed(true);
      
      // Validate school state timer and sync names accordingly
      if (schoolData) {
        const { timerIsActive, timerSecondsLeft = 300, timerStartAt, timerDuration = 300 } = schoolData;
        if (timerIsActive) {
          setTimerActive(true);
          const elapsed = timerStartAt ? Math.floor((Date.now() - new Date(timerStartAt).getTime()) / 1000) : 0;
          const remaining = timerDuration - elapsed;
          if (remaining <= 0) {
            setSecondsLeft(0);
            setTimerExpired(true);
            setTimerActive(false);
            setHasSubmitted(true);
          } else {
            setSecondsLeft(remaining);
            setTimerExpired(false);
            if (!assignedOrganelle) {
              const randomIndex = Math.floor(Math.random() * ORGANELLES.length);
              setAssignedOrganelle(ORGANELLES[randomIndex]);
            }
          }
        } else {
          setTimerActive(false);
          setSecondsLeft(timerSecondsLeft);
          if (timerSecondsLeft <= 0) {
            setTimerExpired(true);
            setHasSubmitted(true);
          } else {
            setTimerExpired(false);
          }
        }
      } else {
        // Offline fallback
        if (!assignedOrganelle) {
          const randomIndex = Math.floor(Math.random() * ORGANELLES.length);
          setAssignedOrganelle(ORGANELLES[randomIndex]);
        }
      }
    } catch (err: any) {
      console.error('[Student Registration Auth Error]:', err);
      setLoginError(err.message || '학생 본인 확인 및 로그인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Safe submission check helper - random organelle is already prepared and assigned upon student login and activity start.

  const handleSubmitMetaphor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    if (!assignedOrganelle) return;
    if (!metaphorTarget.trim() || !metaphorReason.trim()) return;
    
    if (timerExpired || secondsLeft <= 0) {
      alert("⚠️ 활동 시간이 종료되어 제출이 불가능합니다. 교수님께 활동 재시작을 요청해 주세요.");
      return;
    }

    try {
      await onSubmit(metaphorTarget.trim(), metaphorReason.trim());
    } catch (err: any) {
      alert("제출에 실패하였습니다: " + err.message);
    }
  };

  // Human readable time format
  const formatTime = (timeInSecs: number) => {
    const mins = Math.floor(timeInSecs / 60);
    const secs = timeInSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="glass-card p-6 md:p-8 space-y-8" id="student-writing-studio">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-4 border-b-2 border-[#D7D2C4]/50" id="studio-heading-row">
        <div>
          <h2 className="font-sans font-bold text-[#123D2A] text-2xl tracking-tight flex items-center gap-2 break-keep">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#DDE8D6] text-[#123D2A] text-sm font-semibold">01</span>
            나만의 소기관 배정 및 비유 작성 공간
          </h2>
          <p className="text-xs text-[#7B827B] mt-1 break-keep">이름을 적고 랜덤으로 세포소기관을 배정받아 정해진 시간 동안 나만의 비유와 이유를 작성해 봅니다.</p>
        </div>

        {/* Dynamic Timer Badge */}
        {isNameConfirmed && (
          <div className="flex items-center gap-2.5 bg-[#F1D88A]/80 border border-[#D6A21E] px-4 py-2 rounded-2xl shrink-0 shadow-sm animate-float" id="timer-ui-box">
            <Timer className={`w-5 h-5 ${timerActive ? 'text-[#D6A21E] animate-spin' : 'text-[#7B827B]'}`} style={{ animationDuration: timerActive ? '4s' : '0s' }} />
            <div className="text-right pr-2">
              <p className="text-[10px] text-[#3E4540] font-semibold leading-none uppercase tracking-wide">
                남은시간 ({Math.ceil((schoolData?.timerDuration || 300) / 60)}분)
              </p>
              <p className="font-mono text-xl font-bold text-[#123D2A] leading-none mt-1">
                {formatTime(secondsLeft)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Step 1: Input Student Name and Get Organelle */}
      {!isNameConfirmed ? (
        <form onSubmit={handleNameSubmit} className="max-w-md mx-auto space-y-5 py-6 glass-card p-6" id="name-form">
          <div className="text-center space-y-2 break-keep">
            <span className="text-4xl animate-bounce inline-block">👋</span>
            <h3 className="font-sans font-bold text-[#123D2A] text-xl break-keep">나만의 소기관 배정 및 비유 작성 공간</h3>
            <p className="text-xs text-[#7B827B] font-normal break-keep">독창적인 소기관 비유를 작성하기 위해 이름을 입력해 주세요.</p>
          </div>
          
          {/* Prefilled School & Class Information Badge */}
          <div className="bg-[#DDE8D6]/50 p-3 rounded-xl flex items-center justify-between text-xs font-normal text-[#123D2A]">
            <div className="flex-1 text-center flex flex-col justify-center items-center">
              <span className="text-[#7B827B] block text-[10px] uppercase font-medium">접속 학교</span>
              <span className="text-sm text-[#123D2A] text-center truncate max-w-[130px] sm:max-w-none font-medium">{currentStudentSchool || schoolInput}</span>
            </div>
            <div className="h-8 w-[2px] bg-[#D7D2C4] shrink-0 mx-2"></div>
            <div className="flex-1 text-center flex flex-col justify-center items-center">
              <span className="text-[#7B827B] block text-[10px] uppercase font-medium">접속 학급</span>
              <span className="text-sm text-[#123D2A] text-center font-medium">{classSelected}</span>
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <label className="block text-xs font-normal font-sans text-[#123D2A]">활동 이름 (Student Name)</label>
            <input
              type="text"
              required
              maxLength={10}
              placeholder="예: 홍길동, 김지수"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={isAuthenticating}
              className="w-full px-4 py-3 bg-[#FFFCF4] border border-[#D7D2C4] rounded-xl text-[#3E4540] font-sans font-normal placeholder:font-sans placeholder:font-normal placeholder-[#7B827B] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#123D2A] focus:border-[#123D2A] transition-all shadow-inner text-center disabled:opacity-50"
              style={{ fontSize: '12px' }}
              id="student-name-input"
            />
          </div>

          {/* Personal Password input */}
          <div className="space-y-2">
            <label className="block text-xs font-normal font-sans text-[#123D2A] flex justify-between">
              <span>개인 비밀번호 (Personal Password)</span>
              <span className="text-[10px] text-[#7B827B] font-normal font-sans">동명이인 구분 및 본인 확인용</span>
            </label>
            <input
              type="password"
              required
              maxLength={4}
              placeholder="숫자 4자리 지정 (예: 1234)"
              value={personalPasswordInput}
              onChange={(e) => setPersonalPasswordInput(e.target.value)}
              disabled={isAuthenticating}
              className="w-full px-4 py-3 bg-[#FFFCF4] border border-[#D7D2C4] rounded-xl text-[#3E4540] text-center font-sans font-normal placeholder:font-sans placeholder:font-normal placeholder-[#7B827B] text-[12px] tracking-widest focus:outline-none focus:ring-1 focus:ring-[#123D2A] focus:border-[#123D2A] transition-all shadow-inner disabled:opacity-50"
              style={{ fontSize: '12px' }}
              id="student-personal-password-input"
            />
          </div>

          {loginError && (
            <div className="bg-warning-red-soft/82 backdrop-blur-md text-warning-red-deep text-xs font-normal p-3 rounded-xl leading-relaxed text-center shadow-xs" id="student-login-error">
              ❌ {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-3.5 bg-[#123D2A] hover:bg-[#1B5A3A] text-white font-semibold rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 hover:scale-[1.01] disabled:opacity-50"
            id="name-submit-btn"
          >
            {isAuthenticating ? (
              <>
                <span className="animate-spin inline-block mr-1">⌛</span>
                인증 중... 잠시만 기다려 주세요
              </>
            ) : (
              <>
                소기관 임의 배정받기 🎲
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      ) : (!timerActive && secondsLeft > 0 && !schoolData?.timerStartAt) ? (
        /* BEFORE START LOCK CARD */
        <div className="bg-info-blue-soft/82 backdrop-blur-md p-8 text-center max-w-xl mx-auto space-y-4 shadow-lg rounded-3xl" id="timer-not-started-card">
          <div className="w-16 h-16 bg-white/80 text-info-blue-deep rounded-full flex items-center justify-center mx-auto animate-pulse shadow-xs">
            <Timer className="w-8 h-8" />
          </div>
          <div className="break-keep">
            <h3 className="font-sans font-bold text-info-blue-deep text-base md:text-lg break-keep">⏰ 아직 교과 시간에 활동 타이머가 시작되지 않았습니다!</h3>
            <p className="text-xs md:text-sm font-normal text-info-blue-deep/90 mt-2 break-keep">
              교수님께서 타이머를 시작하시면 나만을 위한 세포소기관을 랜덤으로 배부받고, 세포소기관 비유 작성 활동을 시작할 수 있습니다.
            </p>
            <p className="text-[11px] text-info-blue-deep/80 mt-1.5 leading-relaxed break-keep">
              잠시 교과서를 읽어 보며 교수님의 시작 신호를 설레는 마음으로 기다려 보세요!
            </p>
          </div>
          
          <div className="bg-white/85 text-xs text-info-blue-deep font-normal px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm break-keep">
            <span className="w-2 h-2 rounded-full bg-info-blue"></span>
            <span>참여자: {currentStudentSchool} - {classSelected} - <span className="text-info-blue-deep font-semibold">{currentStudentName || nameInput}</span> 학생 (연결 상태 정상 ●)</span>
          </div>
          
          <div className="pt-2">
            <button 
              onClick={() => {
                setParentStudentName('');
                setParentStudentSchool('');
                setAssignedOrganelle(null);
                setPersonalPasswordInput('');
                localStorage.removeItem('cell_student_personal_password');
                setLoginError('');
                setIsNameConfirmed(false);
              }}
              className="text-xs text-info-blue-deep hover:text-info-blue font-normal underline cursor-pointer transition-colors"
              id="change-profile-btn"
            >
              이름 변경 / 뒤로 가기 👤
            </button>
          </div>
        </div>
      ) : (secondsLeft <= 0 || timerExpired) ? (
        /* TIME OVER LOCK CARD */
        <div className="bg-warning-red-soft/82 backdrop-blur-md rounded-3xl p-8 text-center max-w-xl mx-auto space-y-4 shadow-lg mt-6 shadow-[#EA580C]/5" id="timer-expired-student-card">
          <div className="w-16 h-16 bg-white/70 text-warning-red-deep rounded-full flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="break-keep">
            <h3 className="font-sans font-bold text-warning-red-deep text-base md:text-lg break-keep">⌛ 세포 비유 작성 활동 시간이 종료되었습니다!</h3>
            <p className="text-xs md:text-sm font-normal text-warning-red-deep/90 mt-2 break-keep">
              아쉽게도 활동 시간이 마감되어, 새로운 비유를 작성하거나 기존 비유를 수정할 수 없습니다.
            </p>
            {hasSubmitted ? (
              <div className="text-xs text-info-blue-deep font-normal bg-info-blue-soft/80 rounded-xl p-2.5 mt-2 shadow-xs break-keep">
                ✔️ 여러분의 세포소기관 비유를 저장해 두었습니다! 고생 많았습니다! 🎉
              </div>
            ) : null}
            <div className="text-xs text-warning-red-deep leading-relaxed bg-white/80 p-3 rounded-xl mt-3 inline-block max-w-md break-keep">
              <p className="font-bold text-warning-red-deep break-keep">💡 [지금 할 수 있는 일]</p>
              <p className="mt-1 font-normal text-warning-red-deep/90 break-keep">화면을 아래로 스크롤하여 반 친구들이 게시한 창의적인 세포 소기관 비유들을 확인하고, 격려와 공감의 별점(동료 평가)을 매겨주세요! ⭐</p>
            </div>
          </div>

          <div className="bg-white/80 text-xs text-warning-red-deep font-normal px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm break-keep">
            <span className="w-2 h-2 rounded-full bg-warning-red"></span>
            <span>참여자: {currentStudentSchool} - {classSelected} - <span className="text-warning-red-deep font-semibold">{currentStudentName || nameInput}</span> 학생</span>
          </div>

          <div className="pt-2">
            <button 
              onClick={() => {
                setParentStudentName('');
                setParentStudentSchool('');
                setAssignedOrganelle(null);
                setPersonalPasswordInput('');
                localStorage.removeItem('cell_student_personal_password');
                setLoginError('');
                setIsNameConfirmed(false);
              }}
              className="text-xs text-warning-red-deep hover:text-warning-red font-normal underline cursor-pointer transition-colors"
              id="change-profile-btn"
            >
              이름 변경 / 뒤로 가기 👤
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="active-writing-workspace">
          {/* Left panel: Selected Organelle specs */}
          <div className="lg:col-span-5 space-y-5" id="assigned-organelle-col">
            <div className="bg-[#DDE8D6]/40 rounded-2xl p-4 flex justify-between items-center shadow-sm" id="profile-strip">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-[#123D2A] animate-pulse"></div>
                <p className="text-xs text-[#3E4540] font-normal">
                  참여자: <span className="bg-[#DDE8D6] text-[#123D2A] px-1.5 py-0.5 rounded text-[10px] mr-1 font-medium">{currentStudentSchool}</span><span className="bg-[#DDE8D6] text-[#123D2A] px-1.5 py-0.5 rounded text-[10px] mr-1.5 font-medium">{currentStudentClass}</span><span className="text-[#123D2A] font-bold text-sm">{currentStudentName}</span> 학생
                </p>
              </div>
              <button 
                onClick={() => {
                  setParentStudentName('');
                  setParentStudentSchool('');
                  setAssignedOrganelle(null);
                  setPersonalPasswordInput('');
                  localStorage.removeItem('cell_student_personal_password');
                  setLoginError('');
                  setIsNameConfirmed(false);
                }}
                className="text-[10px] text-[#123D2A] hover:text-[#1B5A3A] font-medium underline cursor-pointer"
                id="change-profile-btn"
              >
                이름 변경/로그아웃 👤
              </button>
            </div>

            {assignedOrganelle ? (
              <div className="glass-panel-green p-5 relative overflow-hidden flex flex-col items-center text-center space-y-4 shadow-md" id="active-organelle-card">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-medium tracking-wider text-[#123D2A] bg-[#FFFCF4]/80 border border-[#D7D2C4] px-3 py-1 rounded-full uppercase">
                    My Chosen Organelle
                  </span>
                  <div className="flex items-baseline justify-center gap-2 mt-2">
                    <h3 className="font-sans font-bold text-2xl text-[#123D2A]">{assignedOrganelle.name}</h3>
                    <p className="text-xs text-[#7B827B] italic font-mono font-normal">({assignedOrganelle.englishName})</p>
                  </div>
                  <span className={`inline-block text-[10px] px-2.5 py-1 rounded-full font-normal mt-1 shadow-xs ${
                    assignedOrganelle.cellType === 'plant' 
                      ? 'bg-[#DDE8D6] text-[#123D2A]' 
                      : 'bg-[#FFFCF4] text-[#123D2A]'
                  }`}>
                    {assignedOrganelle.cellType === 'plant' ? '🌿 오직 식물세포에만' : '🧬 동물·식물 세포 공통'}
                  </span>
                </div>

                {hasSubmitted && (
                   <div className="bg-[#DDE8D6]/30 rounded-2xl p-6 text-center space-y-4 w-full" id="feedback-encouraged-card">
                     <p className="text-xs text-[#123D2A] font-bold break-keep">✔️ 이미 비유 작성을 완료했습니다!</p>
                   </div>
                )}
                {/* SVG Visual illustration */}
                <div className="w-28 h-28 flex items-center justify-center bg-[#FFFCF4]/90 rounded-2xl shadow-md relative group select-none animate-fade-in animate-once">
                  <OrganelleIllustration id={assignedOrganelle.id} className="w-24 h-24" />
                </div>

                <div className="w-full text-left space-y-3 bg-[#FFFCF4]/95 p-4 rounded-xl shadow-xs">
                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-[#123D2A] flex items-center gap-1 break-keep">
                      <span className="text-[#123D2A]">🎯</span> 핵심 기능:
                    </p>
                    <p className="text-[#3E4540] leading-relaxed text-[11px] bg-[#F7F1E3]/50 p-2.5 rounded-lg border-l-4 border-[#123D2A] font-normal break-keep">
                      {assignedOrganelle.description}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {assignedOrganelle.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] bg-[#DDE8D6] text-[#123D2A] font-normal px-2 py-0.5 rounded-md">
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#FFFCF4] border-2 border-dashed border-[#D7D2C4] rounded-3xl p-8 text-center break-keep" id="empty-organelle-card">
                <span className="text-4xl animate-pulse inline-block">⏳</span>
                <p className="text-sm font-semibold text-[#123D2A] mt-3 break-keep">교수자 제어 센터에서 세포 탐구가 시작되는 중입니다.</p>
                <p className="text-xs text-[#7B827B] mt-1 break-keep font-medium leading-relaxed">
                  오늘 탐구할 나만의 세포소기관은 시스템에서 무작위로 자동 배정됩니다. 선생님께서 타이머를 시작하시면 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>

          {/* Right panel: Form input or submitted status */}
          <div className="lg:col-span-7" id="writing-form-col">
            {/* Teacher's encouraging message bubble */}
            <div className="bg-[#DDE8D6]/60 border border-[#D7D2C4] p-4 rounded-2xl text-xs text-[#3E4540] leading-relaxed mb-6 flex gap-3 items-start shadow-sm" id="teacher-interactive-bubble">
              <span className="text-2xl shrink-0">👩‍🏫</span>
              <div>
                <p className="font-bold text-[#123D2A] mb-0.5">교수님의 실시간 지도:</p>
                <p className="italic text-[#3E4540]/90 font-normal">{teacherTimerMessage}</p>
              </div>
            </div>

            {hasSubmitted ? (
              <div className="bg-info-blue-soft/82 backdrop-blur-md rounded-2xl p-8 text-center flex flex-col items-center space-y-4 shadow-lg" id="success-submitted-card">
                <CheckCircle2 className="w-16 h-16 text-info-blue-deep animate-bounce" />
                <div>
                  <h3 className="font-sans font-black text-info-blue-deep text-xl">완벽해요! 비유 제출 완료 🥳</h3>
                  <p className="text-xs text-info-blue-deep/80 mt-1">친구들이 이미 참신하고 과학적인 내용의 배움 소감을 활발히 공유했어요!</p>
                  <p className="text-xs font-black mt-4 text-info-blue-deep bg-white/80 py-2.5 px-4 rounded-xl inline-block shadow-xs">
                    스크롤을 아래로 내려 친구들의 비유를 읽어보고 서로 격려하는 별점을 매겨주세요.
                  </p>
                </div>
                
                {!timerExpired && secondsLeft > 0 ? (
                  <button
                    onClick={() => {
                      setMetaphorTarget('');
                      setMetaphorReason('');
                      setHasSubmitted(false);
                      
                      // Assign a different random organelle immediately to prevent the restoration effect
                      const currentId = assignedOrganelle?.id;
                      const candidates = currentId 
                        ? ORGANELLES.filter(o => o.id !== currentId)
                        : ORGANELLES;
                      const randomIndex = Math.floor(Math.random() * candidates.length);
                      const nextOrganelle = candidates[randomIndex] || ORGANELLES[0];
                      setAssignedOrganelle(nextOrganelle);
                    }}
                    className="px-5 py-2.5 bg-info-blue-deep hover:bg-info-blue text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer hover:scale-[1.02] flex items-center gap-1.5 animate-pulse"
                    id="write-another-btn"
                  >
                    다른 소기관으로 한 번 더 도전하기 ➔ (남은 시간: {formatTime(secondsLeft)})
                  </button>
                ) : (
                  <div className="text-xs text-warning-red-deep font-black bg-warning-red-soft/82 backdrop-blur-md py-3.5 px-5 rounded-2xl text-center max-w-md w-full shadow-xs" id="time-over-limit-msg">
                    ⏰ 제한 시간이 마감되어 추가적인 소기관 비유 작성은 할 수 없습니다. 아래에서 친구들의 비유를 구경하고 5점 별점을 매겨 보세요!
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmitMetaphor} className="space-y-5" id="metaphor-draft-form">
                {/* Metaphor fill-in blanks card */}
                <div className="bg-[#DDE8D6]/30 p-6 rounded-3xl shadow-sm space-y-5" id="fill-in-box">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-[#123D2A] flex items-center justify-between">
                      <span>비유할 단어 (일상 속 대상)</span>
                      <span className="text-[10px] text-[#7B827B] font-bold">짧고 구체적인 일상 사물이나 사람으로 적어보세요</span>
                    </label>
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap" id="blank-sentence-1">
                      <span className="font-sans font-black text-[#123D2A] text-sm shrink-0">
                        {assignedOrganelle ? assignedOrganelle.name : '세포소기관'}은/는
                      </span>
                      <input
                        type="text"
                        required
                        disabled={!assignedOrganelle}
                        placeholder={assignedOrganelle ? `예: ${assignedOrganelle.metaphorExample.split(' / ')[0]}` : '소기관 배정 후 적어주세요'}
                        value={metaphorTarget}
                        onChange={(e) => setMetaphorTarget(e.target.value)}
                        className="flex-1 w-full px-4 py-2 bg-[#FFFCF4] border border-[#D7D2C4] rounded-xl text-[#3E4540] font-black placeholder-[#7B827B] text-sm focus:outline-none focus:ring-1 focus:ring-[#123D2A] focus:border-[#123D2A] transition-all text-center shadow-sm"
                        id="metaphor-target-input"
                      />
                      <span className="font-sans font-black text-[#123D2A] text-xs shrink-0">이(가) 된다.</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-[#123D2A] flex items-center justify-between">
                      <span>그렇게 비유한 과학적인 이유</span>
                      <span className="text-[10px] text-[#7B827B] font-bold">배운 내용을 바탕으로 핵심적인 구조와 생물학적 기능을 비유에 담아야 해요!</span>
                    </label>
                    <div className="flex flex-col gap-1.5 bg-[#FFFCF4]/60 p-3.5 rounded-xl border border-[#D7D2C4]" id="blank-sentence-2">
                      <span className="font-sans font-bold text-[#3E4540] text-sm" id="reason-prefix">
                        왜냐하면, <span className="text-[#123D2A] font-extrabold">{assignedOrganelle ? assignedOrganelle.name : '세포소기관'}</span> 은/는
                      </span>
                      <textarea
                        required
                        disabled={!assignedOrganelle}
                        rows={3}
                        placeholder={assignedOrganelle ? `(예시) (마이토콘드리아) 세포 호흡을 담당하고 유기물을 분해하여 세포의 실질적인 에너지 화폐(ATP)를 열심히 생산하는 독특한 기능과 구조가 존재하기` : '소기관 배정 후 작성해 주세요'}
                        value={metaphorReason}
                        onChange={(e) => setMetaphorReason(e.target.value)}
                        className="w-full px-4 py-3 bg-[#FFFCF4] border border-[#D7D2C4] rounded-xl text-[#3E4540] text-xs leading-relaxed placeholder-[#7B827B] focus:outline-none focus:ring-1 focus:ring-[#123D2A] focus:border-[#123D2A] transition-all shadow-sm font-medium my-1"
                        id="metaphor-reason-textarea"
                      />
                      <span className="font-sans font-bold text-[#3E4540] text-sm text-right block" id="reason-suffix">
                        때문이다.
                      </span>
                    </div>
                  </div>

              </div>

                {/* Submit button bar */}
                <div className="flex flex-col gap-3" id="submit-bar">
                  <button
                    type="submit"
                    disabled={!assignedOrganelle || !metaphorTarget.trim() || !metaphorReason.trim()}
                    className="w-full py-3.5 bg-[#123D2A] hover:bg-[#1B5A3A] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black rounded-2xl text-sm transition-all duration-300 shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5"
                    id="metaphor-submit-btn"
                  >
                    🚀 배움터 피드로 제출하기
                  </button>

                  <div className="text-[10.5px] sm:text-xs text-[#3E4540] font-bold leading-relaxed flex items-center gap-2 bg-[#DDE8D6]/60 p-3 rounded-xl border border-[#D7D2C4]" id="submit-rubric-alert">
                    <AlertTriangle className="w-4 h-4 text-[#D6A21E] shrink-0" />
                    <span className="break-keep">동료 평가에서는 루브릭에 따라 비유의 창의성과 과학적 타당성에 주목하여 평가해 주세요!</span>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
