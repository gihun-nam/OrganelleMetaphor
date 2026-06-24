/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MetaphorSubmission, Organelle } from '../types';
import { ORGANELLES } from '../data/organelles';
import { OrganelleIllustration } from './OrganelleIllustration';
import { Star, MessageSquareCode, TrendingUp, Calendar, User, Filter, Award, Search, Sparkles, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface MetaphorFeedProps {
  submissions: MetaphorSubmission[];
  activeStudentName: string;
  activeStudentSchool: string;
  activeStudentClass: string;
  onVote: (submissionId: string, score: number, voterName: string) => void;
}

export const MetaphorFeed: React.FC<MetaphorFeedProps> = ({
  submissions,
  activeStudentName,
  activeStudentSchool,
  activeStudentClass,
  onVote
}) => {
  // Filters & Sorting state
  const [selectedOrganelleFilter, setSelectedOrganelleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'rating' | 'latest' | 'name'>('rating');
  const [isRubricOpen, setIsRubricOpen] = useState<boolean>(true);
  
  // Custom alerts state
  const [votedToast, setVotedToast] = useState<{ [id: string]: string }>({});

  const handleRatingClick = (submissionId: string, starRating: number) => {
    // Determine who is voting
    const voter = activeStudentName.trim();
    if (!voter) {
      alert('동료평가에 참여하려면 먼저 위에 위치한 "세포 교실 입장" 칸에서 학급과 이름을 등록해주셔야 합니다!');
      return;
    }
    
    // Call parents vote handler
    onVote(submissionId, starRating, voter);

    // Provide immediate toast feedback
    setVotedToast(prev => ({
      ...prev,
      [submissionId]: `"${voter}" 이름으로 ${starRating}점을 매겼어요!`
    }));

    // Fade away message after 3 seconds
    setTimeout(() => {
      setVotedToast(prev => {
        const copy = { ...prev };
        delete copy[submissionId];
        return copy;
      });
    }, 3000);
  };

  // Filter submissions by school and class to ensure students only see their school and class's content
  const classSubmissions = submissions.filter((sub) => {
    const isSchoolMatch = !activeStudentSchool || (sub.studentSchool || sub.schoolName)?.toLowerCase() === activeStudentSchool.toLowerCase();
    const isClassMatch = !activeStudentClass || sub.studentClass === activeStudentClass;
    return isSchoolMatch && isClassMatch;
  });

  // Get student(s) with the most submissions in each studentClass
  const mostSubmissionsByClass: { [classId: string]: { names: string[]; count: number } } = {};
  classSubmissions.forEach(sub => {
    const cls = sub.studentClass || '1반';
    if (!mostSubmissionsByClass[cls]) {
      mostSubmissionsByClass[cls] = { names: [], count: 0 };
    }
    const currentClsStats = mostSubmissionsByClass[cls];
    // count this student's submissions in this class
    const studentSubmissionsCount = classSubmissions.filter(s => (s.studentClass || '1반') === cls && s.studentName === sub.studentName).length;
    if (studentSubmissionsCount > currentClsStats.count) {
      currentClsStats.count = studentSubmissionsCount;
      currentClsStats.names = [sub.studentName];
    } else if (studentSubmissionsCount === currentClsStats.count && !currentClsStats.names.includes(sub.studentName)) {
      currentClsStats.names.push(sub.studentName);
    }
  });

  // 1. Group / Filter submissions
  const filteredSubmissions = classSubmissions.filter((sub) => {
    if (selectedOrganelleFilter === 'all') return true;
    return sub.organelleId === selectedOrganelleFilter;
  });

  // 2. Sort submissions
  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    if (sortBy === 'rating') {
      const scoreA = Math.round(a.averageRating * 10) / 10;
      const scoreB = Math.round(b.averageRating * 10) / 10;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // If rounded ratings are equal, choose earliest submission
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return b.ratingCount - a.ratingCount;
    }
    if (sortBy === 'latest') {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    if (sortBy === 'name') {
      return a.studentName.localeCompare(b.studentName, 'ko');
    }
    return 0;
  });

  // Get metadata for filter tabs: count how many students chose which relative to active school
  const getCountForOrganelle = (id: string) => {
    if (id === 'all') return classSubmissions.length;
    return classSubmissions.filter(s => s.organelleId === id).length;
  };

  return (
    <div className="glass-card p-6 md:p-8 space-y-6" id="collective-learning-feed">
      {/* Feed title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b-2 border-[#D7D2C4]/50" id="feed-header-row">
        <div>
          <h2 className="font-sans font-black text-[#123D2A] text-2xl tracking-tight flex items-center gap-2 break-keep">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#DDE8D6] text-[#123D2A] text-sm font-black">02</span>
            {activeStudentClass ? `[${activeStudentClass}]` : "우리 반"} 모두의 세포 배움터 (실시간 상호 평가 피드)
          </h2>
          <p className="text-xs text-[#7B827B] mt-1 break-keep">
            우리 반 친구들이 등록한 세포소기관 비유 글을 꼼꼼히 읽어보고, 참신함과 과학적 설득력을 따져 5점 만점의 별점을 주세요!
          </p>
        </div>

        {/* Voter identification panel */}
        <div className="bg-[#F1D88A]/80 px-4 py-2.5 rounded-xl border border-[#D6A21E] flex items-center gap-2 font-bold text-xs max-w-sm shadow-sm" id="evaluator-profile-indicator">
          <span className="text-base select-none">⭐</span>
          <div>
            <p className="text-[#3E4540] font-black text-[9px] uppercase leading-none tracking-wider font-mono">Evaluator (평가자 이름)</p>
            <div className="mt-1 font-black text-[#123D2A] flex items-center gap-1.5" id="evaluator-name-locked-badge">
              {activeStudentName ? (
                <span className="bg-[#FFFCF4]/80 text-black px-2 py-0.5 rounded-md border border-[#D7D2C4] text-xs font-sans">
                  [{activeStudentSchool}] {activeStudentName} 학생 👤
                </span>
              ) : (
                <span className="text-black font-extrabold text-[10px] animate-pulse">
                  [⚠️ 먼저 학교와 이름을 입력하고 오세요]
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sorting, Grouping & Filtering Panel */}
      <div className="space-y-4" id="filters-sorting-panel">
        {/* 5-Star Peer Rating Rubric Panel */}
        <div className="bg-[#FFFCF4]/90 border border-[#D7D2C4] rounded-2xl p-2.5 px-3.5 transition-all" id="peer-eval-rubric-box">
          <button
            onClick={() => setIsRubricOpen(!isRubricOpen)}
            className="w-full flex items-center justify-between text-left font-black text-xs text-[#123D2A] cursor-pointer"
            id="peer-rubric-trigger"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#123D2A] break-keep" />
              <span>📚 동료평가 별점 기준 (채점 루브릭)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[#7B827B]">
              <span>{isRubricOpen ? "접기" : "열기"}</span>
              {isRubricOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {isRubricOpen && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-5 gap-1.5 pt-2 border-t border-dashed border-[#D7D2C4]" id="peer-rubric-content">
              {[
                { score: 5, label: "5점 (뛰어남)", desc: "세포소기관 구조와 기능의 과학적 이해가 완벽하고 비유가 독창적임." },
                { score: 4, label: "4점 (명확함)", desc: "비유 대상의 특성이 잘 드러나며 핵심 기능이 잘 전달됨." },
                { score: 3, label: "3점 (보통)", desc: "비유의 연관성은 있으나 개념과 설명의 완성도가 보통 수준임." },
                { score: 2, label: "2점 (부족)", desc: "비유가 직관적이지 않거나 과학적 설명 근거가 부족함." },
                { score: 1, label: "1점 (아쉬움)", desc: "비유의 연결이 자연스럽지 않고 과학적 오개념이 다소 있음." }
              ].map((item) => (
                <div 
                  key={item.score} 
                  className="bg-[#DDE8D6]/35 p-2 rounded-xl border border-[#D7D2C4]/50 flex flex-col items-center text-center space-y-0.5 transition-colors hover:bg-[#DDE8D6]/50"
                  id={`rubric-star-${item.score}`}
                >
                  <div className="flex items-center gap-0.5 text-[#D6A21E]">
                    {[...Array(5)].map((_, idx) => (
                      <Star 
                        key={idx} 
                        className={`w-2.5 h-2.5 ${idx < item.score ? 'fill-[#D6A21E] text-[#D6A21E]' : 'text-slate-200'}`} 
                      />
                    ))}
                  </div>
                  <strong className="text-[10px] font-black text-[#123D2A] mt-0.5">{item.label}</strong>
                  <p className="text-[9.5px] text-[#3E4540] leading-snug break-keep mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Organelle Grouping Tab selector */}
        <div className="space-y-2">
          <label className="text-xs font-black text-[#123D2A] block flex items-center gap-1.5 font-sans">
            <Filter className="w-3.5 h-3.5 text-[#123D2A]" />
            세포소기관별 비유 모아보기
          </label>
          <div className="flex flex-wrap gap-1.5" id="feed-organelle-tabs">
            <button
              onClick={() => setSelectedOrganelleFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                selectedOrganelleFilter === 'all'
                  ? 'bg-[#123D2A] text-white shadow-md scale-[1.03]'
                  : 'bg-[#FFFCF4]/80 text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6]/50'
              }`}
              id="filter-tab-all"
            >
              전체 보기 ({getCountForOrganelle('all')})
            </button>
            {ORGANELLES.map((o) => {
              const count = getCountForOrganelle(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrganelleFilter(o.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                    selectedOrganelleFilter === o.id
                      ? 'bg-[#123D2A] text-white shadow-md scale-[1.03]'
                      : 'bg-[#FFFCF4]/80 text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6]/50'
                  }`}
                  id={`filter-tab-${o.id}`}
                >
                  <span>{o.name}</span>
                  <span className={`px-1 rounded text-[9px] font-black ${
                    selectedOrganelleFilter === o.id ? 'bg-[#FFFCF4] text-[#123D2A]' : 'bg-[#DDE8D6] text-[#123D2A]'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary controls: Order selection */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#DDE8D6]/30 p-2.5 rounded-xl border border-[#D7D2C4] gap-3 text-xs text-[#3E4540] font-medium" id="sorting-order-row">
          <div className="flex items-center gap-1 text-[11px] sm:text-xs">
            <Search className="w-3.5 h-3.5 text-[#123D2A] shrink-0" />
            <span className="break-keep">
              조건 필터링 결과: 총 <strong className="text-[#123D2A] font-extrabold">{filteredSubmissions.length}개</strong>의 비유 조회 중
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto" id="order-selectors">
            <span className="font-extrabold text-[#123D2A]/85 select-none text-[10px] sm:text-[11px] leading-tight text-center sm:text-left break-keep">
              정렬<br className="sm:hidden" />기준:
            </span>
            <button
               onClick={() => setSortBy('rating')}
              className={`flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-black cursor-pointer border px-2.5 py-1.5 rounded-xl transition-all flex-1 sm:flex-initial text-center ${
                sortBy === 'rating' ? 'text-[#123D2A] bg-[#F1D88A] border-[#D6A21E] shadow-2xs' : 'text-[#7B827B] bg-[#FFFCF4] border-[#D7D2C4] hover:bg-[#DDE8D6]/40'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span className="leading-tight break-keep">
                참신<br className="sm:hidden" />인기순
              </span>
            </button>
            <button
              onClick={() => setSortBy('latest')}
              className={`flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-black cursor-pointer border px-2.5 py-1.5 rounded-xl transition-all flex-1 sm:flex-initial text-center ${
                sortBy === 'latest' ? 'text-[#123D2A] bg-[#DDE8D6] border-[#D7D2C4] shadow-2xs' : 'text-[#7B827B] bg-[#FFFCF4] border-[#D7D2C4] hover:bg-[#DDE8D6]/40'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="leading-tight break-keep">
                최신<br className="sm:hidden" />작성순
              </span>
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-black cursor-pointer border px-2.5 py-1.5 rounded-xl transition-all flex-1 sm:flex-initial text-center ${
                sortBy === 'name' ? 'text-[#123D2A] bg-[#DDE8D6] border-[#D7D2C4] shadow-2xs' : 'text-[#7B827B] bg-[#FFFCF4] border-[#D7D2C4] hover:bg-[#DDE8D6]/40'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="leading-tight break-keep">
                이름<br className="sm:hidden" />사전순
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Student metaphor submissions */}
      {sortedSubmissions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="submissions-grid">
          {sortedSubmissions.map((sub, index) => {
            // Find organelle to render small sticker
            const organelleData = ORGANELLES.find(o => o.id === sub.organelleId);
            const isTopRated = sortBy === 'rating' && index === 0 && sub.averageRating >= 4.5;
            const cls = sub.studentClass || '1반';
            const classMax = mostSubmissionsByClass[cls];
            const isMostSubmitting = classMax && classMax.names.includes(sub.studentName) && classMax.count >= 3;
            
            return (
              <div 
                key={sub.id} 
                className={`bg-[#FFFCF4]/95 rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative transition-all duration-300 hover:shadow-md hover:border-[#123D2A] ${
                  isTopRated ? 'ring-2 ring-[#D6A21E] border-[#D6A21E] bg-[#FFFCF4]' : 'border-[#D7D2C4]'
                }`}
                id={`submission-card-${sub.id}`}
              >
                {/* Visual Highlights badge for best performer */}
                {isTopRated && (
                  <span className="absolute -top-3.5 -right-2 bg-[#D6A21E] text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm flex items-center gap-0.5 animate-float" id="best-badge">
                    <Award className="w-3.5 h-3.5" fill="currentColor" />
                    우수 참신상! 🏆
                  </span>
                )}

                {/* Visual Highlights badge for most active submitter */}
                {isMostSubmitting && (
                  <span 
                    className="absolute -top-3.5 -left-2 bg-[#DDE8D6] text-[#123D2A] border border-[#D7D2C4] text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm flex items-center gap-0.5 animate-float" 
                    id="most-submitting-badge"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#123D2A]" fill="none" />
                    학급 다작왕! ✍️
                  </span>
                )}

                <div>
                  {/* Card head: Student name + Organelle tag */}
                  <div className="flex justify-between items-start gap-3 border-b border-dashed border-[#D7D2C4] pb-3" id="sub-card-header">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-[#DDE8D6] border border-[#D7D2C4] flex items-center justify-center font-black text-[#123D2A] text-xs shadow-2xs" id="sub-avatar">
                        {sub.studentName.slice(-2)}
                      </div>
                      <div>
                        <h4 className="font-sans font-black text-[#123D2A] text-sm leading-tight flex items-center gap-1.5 flex-wrap">
                          {sub.studentClass && (
                            <span className="text-[9px] bg-[#DDE8D6] text-[#123D2A] font-black px-1.5 py-0.5 rounded border border-[#D7D2C4] uppercase">
                              {sub.studentClass}
                            </span>
                          )}
                          <span>{sub.studentName}</span>
                          {sub.isMock && <span className="text-[9px] text-[#7B827B] font-bold bg-[#DDE8D6]/30 border border-[#D7D2C4] px-1.5 py-0.5 rounded">학생</span>}
                        </h4>
                        <time className="text-[9px] text-[#7B827B] mt-0.5 block font-mono">
                          {new Date(sub.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                    </div>

                    {/* Small Organelle badge with miniature icon */}
                    <div className="flex items-center gap-1.5 bg-[#DDE8D6] border border-[#D7D2C4] px-2 py-1 rounded-xl shrink-0" id="sub-badge">
                      <div className="w-6 h-6 flex items-center justify-center p-0.5 bg-[#FFFCF4] border border-[#D7D2C4] rounded-lg shadow-2xs shrink-0 overflow-hidden">
                        <OrganelleIllustration id={sub.organelleId} className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-black text-[#123D2A] leading-none">
                        {sub.organelleName}
                      </span>
                    </div>
                  </div>

                  {/* Metaphor text in lovely chatbubble look */}
                  <div className="py-4 space-y-3.5" id="sub-content">
                    {/* Metaphor line */}
                    <div className="bg-[#DDE8D6]/45 rounded-2xl p-3.5 border border-[#D7D2C4] relative" id="metaphor-statement-box">
                      <span className="absolute -top-2.5 left-3 bg-[#FFFCF4] text-[#123D2A] border border-[#D7D2C4] text-[8px] font-black px-1.5 py-0.5 rounded">
                        나의 비유 💡
                      </span>
                      <p className="font-sans font-extrabold text-[#3E4540] text-[13px] leading-snug">
                        "{sub.organelleName}은/는 <span className="underline decoration-[#DDE8D6] decoration-2 text-[#123D2A] font-black">{sub.metaphorSubject}</span>이(가) 된다!"
                      </p>
                    </div>

                    {/* Reason text */}
                    <div className="text-[12px] text-[#3E4540] leading-relaxed bg-[#F7F1E3]/40 p-2.5 rounded-xl border-l-4 border-[#123D2A]" id="metaphor-reason-box">
                      <p className="font-bold text-[10px] text-[#123D2A]/80 uppercase tracking-widest leading-none mb-1">과학적 이유설명:</p>
                      <p className="font-medium">{sub.metaphorReason}</p>
                    </div>
                  </div>
                </div>

                {/* Rating & Evaluation row */}
                <div className="pt-3 border-t border-[#D7D2C4] space-y-2" id="card-rating-footer">
                  {/* Current Rating aggregate */}
                  <div className="flex items-center justify-between text-[11px] text-[#7B827B] font-bold" id="rating-summary-stats">
                    <span className="flex items-center gap-1 select-none">
                      <Star className="w-3.5 h-3.5 text-[#D6A21E] fill-[#D6A21E] shrink-0" />
                      <strong className="text-[#123D2A] font-black">{sub.averageRating.toFixed(1)}</strong>
                      <span className="text-[#7B827B] font-normal">/ 5.0</span>
                    </span>
                    <span className="text-[10px] text-[#7B827B]">
                      공유인원 <strong className="text-[#123D2A] font-bold">{sub.ratingCount}명</strong> 평가함
                    </span>
                  </div>

                  {/* Star interactors */}
                  <div className="flex flex-col space-y-1.5" id="star-vote-container">
                    <p className="text-[9px] font-black text-[#123D2A]/70 text-center select-none tracking-wider font-sans">꾹 눌러서 상호 평가 별점 주기</p>
                    <div className="flex justify-center gap-1" id="star-interactors">
                      {[1, 2, 3, 4, 5].map((star) => {
                        // Check if voter has already voted on this
                        const voter = activeStudentName.trim() || '익명친구';
                        const hasVotedOnThis = sub.ratings[voter] === star;
                        const isUnderCurrentRating = star <= Math.round(sub.averageRating);
                        
                        return (
                          <button
                            key={star}
                            onClick={() => handleRatingClick(sub.id, star)}
                            className="p-1 hover:scale-125 transition-all text-slate-200 select-none cursor-pointer"
                            title={`${star}점 주기`}
                            id={`sub-${sub.id}-star-${star}`}
                          >
                            <Star 
                              className={`w-6 h-6 transition-colors ${
                                hasVotedOnThis 
                                  ? 'text-[#123D2A] fill-[#123D2A]' 
                                  : isUnderCurrentRating 
                                      ? 'text-[#D6A21E] fill-[#D6A21E]' 
                                      : 'text-slate-200 hover:text-[#D6A21E]/60'
                              }`} 
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Floating Action alerts/Toasts */}
                  {votedToast[sub.id] && (
                    <div className="bg-[#DDE8D6] text-[#123D2A] border border-[#D7D2C4] rounded-xl p-1.5 text-center text-[10px] font-black animate-float" id={`toast-${sub.id}`}>
                      {votedToast[sub.id]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-[#FFFCF4]/60 rounded-3xl border-2 border-dashed border-[#D7D2C4] space-y-3" id="empty-submissions-state">
          <MessageSquareCode className="w-16 h-16 text-[#123D2A]/40 mx-auto animate-pulse" />
          <h3 className="font-sans font-black text-[#123D2A] text-lg">해당 필터에 부합하는 비유가 없습니다.</h3>
          <p className="text-xs text-[#7B827B] max-w-sm mx-auto">
            {selectedOrganelleFilter === 'all' 
              ? '아직 아무도 비유를 작성하지 않았어요! 첫 번째로 나만의 참신한 생각을 공유해 보실래요?'
              : '이 세포소기관에 대해 비유를 작성한 학급 친구가 아직 없어요. 내가 먼저 업로드해 보세요!'}
          </p>
          {selectedOrganelleFilter !== 'all' && (
            <button
              onClick={() => setSelectedOrganelleFilter('all')}
              className="mt-2 px-4 py-2 bg-[#DDE8D6] hover:bg-[#DDE8D6]/80 text-[#123D2A] border border-[#D7D2C4] text-xs font-black rounded-xl cursor-pointer"
            >
              모든 세포소기관 비유 보기
            </button>
          )}
        </div>
      )}
    </div>
  );
};
