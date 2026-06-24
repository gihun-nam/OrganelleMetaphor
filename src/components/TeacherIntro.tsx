/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ORGANELLES } from '../data/organelles';
import { OrganelleIllustration } from './OrganelleIllustration';
import { Sparkles, Info, BookOpen, Check } from 'lucide-react';

interface TeacherIntroProps {
  schoolName?: string;
}

export const TeacherIntro: React.FC<TeacherIntroProps> = ({ schoolName: propSchoolName }) => {
  const [selectedOrganelle, setSelectedOrganelle] = useState<string>('nucleus');
  const schoolName = propSchoolName || localStorage.getItem('cell_teacher_school') || localStorage.getItem('cell_student_school') || '(초기 설정 시 입력한 학교)';

  const currentOrganelle = ORGANELLES.find((o) => o.id === selectedOrganelle) || ORGANELLES[0];

  return (
    <div className="glass-card p-6 md:p-8 flex flex-col md:flex-row gap-8 items-stretch" id="teacher-intro-card">
      {/* Teacher speech bubble column */}
      <div className="md:w-5/12 flex flex-col justify-between" id="teacher-bubble-container">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-[#DDE8D6] border border-[#D7D2C4] text-2xl animate-bounce" id="teacher-avatar">
              👩‍🏫
            </span>
            <div>
              <h3 className="font-sans font-bold text-[#123D2A] text-lg">서강대학교 생명과환경 교실</h3>
              <p className="text-xs text-[#7B827B] font-normal">생명과학과 담당 교수</p>
            </div>
          </div>

          <div className="relative bg-[#DDE8D6]/40 rounded-2xl p-5 border border-[#D7D2C4] text-[#3E4540] text-sm leading-relaxed break-keep" id="teacher-speech-bubble">
            <p className="font-bold text-[#123D2A] mb-2 break-keep">
              "반가워요, {schoolName} 생명과환경 수강생 여러분! 👋"
            </p>
            <p className="space-y-2 break-keep">
              우리 몸과 식물을 구성하는 아주 작은 단위인 <strong>세포(Cell)</strong> 속에는 각자의 역할을 맡아 바쁘게 일하는 <strong>세포소기관(Organelle)</strong>들이 살고 있어요.
            </p>
            <p className="mt-2 text-[#3E4540] font-normal break-keep">
              이 친구들이 어떤 모양을 하고 있고 어떤 중요한 기능을 담당하는지, 먼저 아래 사전에서 공부해 본 뒤 <strong>나만의 창의적인 비유</strong>를 만들어 친구들과 서로 평가해 볼까요?
            </p>
            {/* Speach bubble speech tail */}
            <div className="absolute top-1/2 -right-[9px] transform -translate-y-1/2 w-4 h-4 bg-[#EAF0E6] border-t border-r border-[#D7D2C4] rotate-45 hidden md:block"></div>
          </div>
        </div>

        {/* Small Tips/Rules */}
        <div className="mt-6 pt-4 border-t border-[#D7D2C4] space-y-2 text-xs text-[#7B827B] break-keep" id="teacher-bullet-rules">
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-[#123D2A] shrink-0 mt-0.5" />
            <p className="text-[#3E4540] break-keep"><strong className="text-[#123D2A] font-semibold">동물/식물 공통 소기관</strong>과 <strong className="text-[#1B5A3A] font-semibold">식물에만 존재하는 소기관</strong>을 구분하여 공부해 보세요!</p>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-4 h-4 text-[#123D2A] shrink-0 mt-0.5" />
            <p className="text-[#3E4540] break-keep">정해진 시간 동안 집중해서 나만의 창의적인 비유를 배움터에 업로드해 주세요.</p>
          </div>
        </div>
      </div>

      {/* Interactive Micro Cell Dictionary Column */}
      <div className="md:w-7/12 glass-panel-green p-5 flex flex-col justify-between" id="micro-cell-dictionary">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#123D2A] text-[#FFFCF4] text-xs font-medium mb-4 border border-[#123D2A]/60">
            <BookOpen className="w-3.5 h-3.5 text-[#FFFCF4]" />
            생명과학 사전: 세포소기관 가이드
          </span>

          {/* Tab Selector */}
          <div className="flex flex-wrap gap-1.5 mb-5" id="organelle-dictionary-tabs">
            {ORGANELLES.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelectedOrganelle(o.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer ${
                  selectedOrganelle === o.id
                    ? 'bg-[#123D2A] text-[#FFFCF4] shadow-md scale-[1.03]'
                    : 'bg-[#FFFCF4] text-[#3E4540] border border-[#D7D2C4] hover:bg-[#DDE8D6]'
                }`}
                id={`dict-tab-${o.id}`}
              >
                {o.name}
              </button>
            ))}
          </div>

          {/* Info Details card */}
          <div className="bg-[#FFFCF4] rounded-xl p-5 border border-[#D7D2C4] flex flex-col sm:flex-row gap-5 items-center sm:items-stretch shadow-sm" id="dict-details-panel">
            {/* Left Diagram */}
            <div className="w-32 h-32 flex items-center justify-center p-2 rounded-xl bg-[#F7F1E3] border border-[#D7D2C4] shrink-0 relative">
              <OrganelleIllustration id={currentOrganelle.id} className="w-28 h-28" />
              {/* Plant tag */}
              {currentOrganelle.cellType === 'plant' && (
                <span className="absolute -top-2 -left-2 bg-[#DDE8D6] text-[#123D2A] border border-[#123D2A] text-[9px] font-semibold px-1.5 py-0.5 rounded-full shadow-md animate-pulse whitespace-nowrap">
                  식물에만 존재 🌿
                </span>
              )}
              {currentOrganelle.cellType === 'both' && (
                <span className="absolute -top-2 -left-2 bg-[#F1D88A] text-[#123D2A] border border-[#D6A21E] text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-md">
                  동식물 공통 🧬
                </span>
              )}
            </div>

            {/* Right Information Text */}
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-sans font-bold text-[#123D2A] text-lg leading-none">{currentOrganelle.name}</h4>
                  <span className="text-xs text-[#7B827B] font-mono italic font-normal">({currentOrganelle.englishName})</span>
                </div>
                {/* Keywords pill */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentOrganelle.keywords.map((kw, i) => (
                    <span key={i} className="text-[10px] bg-[#DDE8D6]/80 text-[#123D2A] border border-[#D7D2C4] px-2 py-0.5 rounded-md font-normal">
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-[#3E4540] leading-relaxed bg-[#F7F1E3]/50 p-2.5 rounded-lg border-l-4 border-[#123D2A] break-keep">
                {currentOrganelle.description}
              </p>

              <div className="text-[11px] text-[#3E4540] flex gap-1.5 items-start break-keep">
                <Info className="w-3.5 h-3.5 text-[#123D2A] shrink-0 mt-0.5" />
                <span className="break-keep">
                  <strong className="font-semibold">구조 모양 특징:</strong> <span className="text-[#3E4540] break-keep">{currentOrganelle.shapeDescription}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Suggestion block */}
        <div className="mt-4 pt-3 border-t border-[#D7D2C4] flex flex-col sm:flex-row justify-between items-center text-xs text-[#7B827B] gap-2" id="teacher-suggestion">
          <div className="flex items-center gap-1.5 text-[#123D2A] font-medium">
            <Sparkles className="w-3.5 h-3.5 text-[#D6A21E] animate-pulse" />
            <span>교수님의 비유 힌트:</span>
          </div>
          <span className="bg-[#F1D88A] text-[#123D2A] px-3 py-1 rounded-full font-medium border border-[#D6A21E] shadow-sm animate-float">
            "{currentOrganelle.metaphorExample}"... 등
          </span>
        </div>
      </div>
    </div>
  );
};
