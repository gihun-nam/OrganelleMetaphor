/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DEFAULT_ILLUSTRATIONS } from '../data/defaultIllustrations';

interface IllustrationProps {
  id: string;
  className?: string;
}

export const OrganelleIllustration: React.FC<IllustrationProps> = ({ id, className = "w-32 h-32" }) => {
  // Robustly handle mapping by converting Korean names or varied English casing to the correct keys
  const normalizedId = (id || '').trim().toLowerCase();

  const ORGANELLE_ID_MAP: { [key: string]: string } = {
    'nucleus': 'nucleus',
    '핵': 'nucleus',
    'mitochondria': 'mitochondria',
    '마이토콘드리아': 'mitochondria',
    '미토콘드리아': 'mitochondria',
    'chloroplast': 'chloroplast',
    '엽록체': 'chloroplast',
    'ribosome': 'ribosome',
    '리보솜': 'ribosome',
    'er': 'er',
    '소포체': 'er',
    'golgi': 'golgi',
    '골지체': 'golgi',
    'membrane': 'membrane',
    '세포막': 'membrane',
    'wall': 'wall',
    '세포벽': 'wall',
    'vacuole': 'vacuole',
    '액포': 'vacuole'
  };

  const cleanId = ORGANELLE_ID_MAP[normalizedId] || normalizedId;
  const activeImage = DEFAULT_ILLUSTRATIONS[cleanId];

  if (activeImage) {
    return (
      <img
        src={activeImage}
        alt={id}
        className={`${className} object-cover rounded-2xl border border-[#D7D2C4] bg-[#FFFCF4]/40`}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Safe fallback to prevent blank elements if a key is missing
  return (
    <div className={`${className} flex items-center justify-center rounded-2xl border border-[#D7D2C4] bg-[#F2F4F5] text-xs font-black text-[#5E6460]`}>
      {(id || 'UNKNOWN').toUpperCase()}
    </div>
  );
};
