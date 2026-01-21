
import React, { useState, useEffect, useMemo } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface SmartSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
  phrases?: string[];
  className?: string;
}

/**
 * Standard Xeenaps Smart Search Box
 * Features:
 * 1. Continuous typing animation for placeholder
 * 2. High contrast border
 * 3. Interactive primary search button on the right
 * 4. Responsive design
 */
export const SmartSearchBox: React.FC<SmartSearchBoxProps> = ({ 
  value, 
  onChange, 
  onSearch,
  phrases: customPhrases,
  className = "w-full lg:max-w-md"
}) => {
  const [placeholderText, setPlaceholderText] = useState('');
  
  const defaultPhrases = useMemo(() => [
    "Search by Title...",
    "Search by Author(s)...",
    "Search by Publisher...",
    "Search by Topic...",
    "Search by Anything Else..."
  ], []);

  const phrases = customPhrases || defaultPhrases;

  useEffect(() => {
    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let timeoutId: number;

    const type = () => {
      const currentPhrase = phrases[phraseIndex];
      
      if (isDeleting) {
        setPlaceholderText(currentPhrase.substring(0, charIndex - 1));
        charIndex--;
      } else {
        setPlaceholderText(currentPhrase.substring(0, charIndex + 1));
        charIndex++;
      }

      let typeSpeed = isDeleting ? 25 : 50;

      if (!isDeleting && charIndex === currentPhrase.length) {
        isDeleting = true;
        typeSpeed = 500; // Pause at end of phrase
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        typeSpeed = 100; // Pause before starting new phrase
      }

      timeoutId = window.setTimeout(type, typeSpeed);
    };

    timeoutId = window.setTimeout(type, 500);
    return () => clearTimeout(timeoutId);
  }, [phrases]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  return (
    <div className={`relative group ${className}`}>
  <input 
    type="text"
    placeholder={placeholderText}
    className="w-full pl-5 pr-14 py-3 bg-white border border-gray-300 rounded-2xl focus:ring-2 focus:ring-[#004A74]/10 focus:border-[#004A74] outline-none transition-all shadow-sm text-sm"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={handleKeyDown}
  />
  <button 
    onClick={onSearch}
    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-[#004A74] hover:bg-[#003859] rounded-xl text-white transition-all active:scale-90 shadow-sm flex items-center justify-center"
    title="Search"
  >
    <MagnifyingGlassIcon className="w-5 h-5 stroke-[3]" />
  </button>
</div>
  );
};
