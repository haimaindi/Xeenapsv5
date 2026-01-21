
import React from 'react';
import { ChevronDownIcon, PlusSmallIcon, ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Standard Form Page Layout Wrapper
 */
export const FormPageContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full bg-white rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden h-full flex flex-col relative">
    {children}
  </div>
);

/**
 * Standard Sticky Form Header
 */
export const FormStickyHeader: React.FC<{
  title: string;
  subtitle: string;
  onBack: () => void;
  rightElement?: React.ReactNode;
}> = ({ title, subtitle, onBack, rightElement }) => (
  <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-6 md:px-10 py-6 border-b border-gray-50 shrink-0">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2.5 bg-gray-50 text-gray-400 hover:text-[#004A74] hover:bg-[#FED400]/20 rounded-xl transition-all shadow-sm active:scale-90"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black text-[#004A74]">{title}</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{subtitle}</p>
        </div>
      </div>
      {rightElement}
    </div>
  </div>
);

/**
 * Standard Scrollable Form Area
 */
export const FormContentArea: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-10 py-10 pb-32">
    <div className="max-w-6xl mx-auto space-y-8">
      {children}
    </div>
  </div>
);

/**
 * Standard Field Wrapper for Labels and Validation Errors
 */
export const FormField: React.FC<{
  label: React.ReactNode;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}> = ({ label, required, error, children }) => (
  <div className="space-y-1.5 flex flex-col">
    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error && (
      <p className="text-[10px] text-red-500 font-bold mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
        Required Field
      </p>
    )}
  </div>
);

/**
 * Standard Searchable Dropdown
 */
// Fix: Added 'disabled' prop and widened types (any/unknown) to support enums and complex values
export const FormDropdown: React.FC<{
  value: string | any;
  onChange: (val: any) => void;
  options: (string | any)[];
  placeholder: string;
  isMulti?: boolean;
  onAddMulti?: (val: string) => void;
  onRemoveMulti?: (val: string) => void;
  multiValues?: string[];
  error?: boolean;
  disabled?: boolean;
  allowCustom?: boolean;
}> = ({ 
  value, onChange, options, placeholder, isMulti, onAddMulti, onRemoveMulti, multiValues = [], error, disabled, allowCustom = true 
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fix: Convert options to strings for filtering and logic to ensure compatibility with enums
  const filteredOptions = options.filter(opt => 
    String(opt).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: string) => {
    // Fix: Guard against selection when component is disabled
    if (disabled) return;
    if (isMulti && onAddMulti) {
      if (!multiValues.includes(option)) onAddMulti(option);
    } else {
      onChange(option);
    }
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Fix: Disable keyboard interactions when disabled prop is true
    if (disabled) return;
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') setIsOpen(true);
      return;
    }

    const optionStrings = options.map(o => String(o));
    const showAddOption = allowCustom && searchTerm && !optionStrings.includes(searchTerm);
    const totalCount = filteredOptions.length + (showAddOption ? 1 : 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % totalCount);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + totalCount) % totalCount);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(String(filteredOptions[highlightedIndex]));
      } else if (searchTerm && allowCustom) {
        handleSelect(searchTerm.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div 
        // Fix: Update tabIndex to prevent focusing when disabled
        tabIndex={disabled ? -1 : 0}
        // Fix: Prevent toggle when disabled
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        // Fix: Apply disabled styling (opacity, cursor)
        className={`group flex items-center justify-between w-full px-4 py-3 bg-gray-50 rounded-xl border ${error ? 'border-red-400' : 'border-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[#004A74]/40 cursor-pointer'} focus:ring-2 focus:ring-[#004A74]/10 transition-all shadow-sm outline-none`}
      >
        <div className="flex flex-wrap gap-1.5 items-center overflow-hidden">
          {isMulti && multiValues.length > 0 ? (
            multiValues.map(v => (
              <span key={v} className="px-2 py-0.5 bg-[#004A74] text-white text-[10px] font-bold rounded-md flex items-center gap-1">
                {v}
                {/* Fix: Hide or disable remove button interaction when disabled */}
                <XMarkIcon 
                  className={`w-3 h-3 ${disabled ? 'pointer-events-none opacity-50' : 'hover:text-red-300 transition-colors'}`} 
                  onClick={(e) => { 
                    if (disabled) return;
                    e.stopPropagation(); 
                    onRemoveMulti?.(v); 
                  }} 
                />
              </span>
            ))
          ) : (
            <span className={`text-sm ${value ? 'text-[#004A74] font-bold' : 'text-gray-400'}`}>
              {value ? String(value) : placeholder}
            </span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen && !disabled ? 'rotate-180' : ''}`} />
      </div>

      {/* Fix: Ensure dropdown cannot be opened if disabled */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 bg-gray-50">
            <input 
              autoFocus
              className="w-full px-3 py-2 bg-white rounded-lg text-sm outline-none border border-gray-200 focus:border-[#004A74]/30"
              placeholder={allowCustom ? "Search or type new..." : "Search..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.map((opt, idx) => (
              <button
                key={String(opt)}
                type="button"
                onClick={() => handleSelect(String(opt))}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${highlightedIndex === idx ? 'bg-[#FED400]/20 text-[#004A74]' : 'hover:bg-[#FED400]/10 hover:text-[#004A74]'}`}
              >
                {String(opt)}
              </button>
            ))}
            {allowCustom && searchTerm && !options.map(o => String(o)).includes(searchTerm) && (
              <button
                type="button"
                onClick={() => handleSelect(searchTerm)}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-bold text-[#004A74] bg-[#FED400]/10 flex items-center gap-2 ${highlightedIndex === filteredOptions.length ? 'bg-[#FED400]/20' : ''}`}
              >
                <PlusSmallIcon className="w-5 h-5" /> Add: {searchTerm}
              </button>
            )}
            {!allowCustom && searchTerm && filteredOptions.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No matching options</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
