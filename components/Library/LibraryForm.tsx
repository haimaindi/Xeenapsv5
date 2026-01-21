
import React, { useState, useMemo, useEffect, useRef } from 'react';
// @ts-ignore
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { SourceType, FileFormat, LibraryItem, LibraryType, ExtractionResult } from '../../types';
import { saveLibraryItem, uploadAndStoreFile, extractFromUrl, callIdentifierSearch } from '../../services/gasService';
import { extractMetadataWithAI } from '../../services/AddCollectionService';
import { GAS_WEB_APP_URL } from '../../constants';
import { 
  CheckIcon, 
  LinkIcon, 
  DocumentIcon, 
  CloudArrowUpIcon, 
  ArrowPathIcon,
  SparklesIcon,
  FingerPrintIcon
} from '@heroicons/react/24/outline';
import { Bold, Italic } from 'lucide-react';
import { showXeenapsAlert, XEENAPS_SWAL_CONFIG } from '../../utils/swalUtils';
import { 
  FormPageContainer, 
  FormStickyHeader, 
  FormContentArea, 
  FormField, 
  FormDropdown 
} from '../Common/FormComponents';

interface LibraryFormProps {
  onComplete: () => void;
  items: LibraryItem[];
}

/**
 * Rich Text Abstract Editor Component
 */
const AbstractEditor: React.FC<{ 
  value: string; 
  onChange: (val: string) => void; 
  disabled?: boolean 
}> = ({ value, onChange, disabled }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const updateActiveStates = () => {
    setIsBold(document.queryCommandState('bold'));
    setIsItalic(document.queryCommandState('italic'));
  };

  const execCommand = (command: string) => {
    document.execCommand(command, false);
    updateActiveStates();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  return (
    <div className={`flex flex-col rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#004A74]/10 focus-within:border-[#004A74]/40 ${disabled ? 'opacity-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-100">
        <button 
          type="button" 
          onClick={() => execCommand('bold')} 
          disabled={disabled}
          className={`p-1.5 rounded-lg transition-all ${isBold ? 'bg-[#004A74] text-white shadow-inner' : 'hover:bg-white text-[#004A74]'}`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button 
          type="button" 
          onClick={() => execCommand('italic')} 
          disabled={disabled}
          className={`p-1.5 rounded-lg transition-all ${isItalic ? 'bg-[#004A74] text-white shadow-inner' : 'hover:bg-white text-[#004A74]'}`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
      </div>
      {/* Content Area */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={(e) => {
          onChange(e.currentTarget.innerHTML);
          updateActiveStates();
        }}
        onKeyUp={updateActiveStates}
        onMouseUp={updateActiveStates}
        className="p-5 text-sm min-h-[180px] outline-none leading-relaxed custom-scrollbar font-medium text-gray-700"
        {...({ "data-placeholder": "Abstract content will appear here..." } as any)}
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9CA3AF;
          pointer-events: none;
          display: block;
        }
      `}</style>
    </div>
  );
};

const LibraryForm: React.FC<LibraryFormProps> = ({ onComplete, items = [] }) => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractionStage, setExtractionStage] = useState<'IDLE' | 'READING' | 'BYPASS' | 'AI_ANALYSIS' | 'FETCHING_ID'>('IDLE');
  const [file, setFile] = useState<File | null>(null);
  const lastExtractedUrl = useRef<string>("");
  const lastIdentifier = useRef<string>("");

  const CATEGORY_OPTIONS = [
    "Algorithm", "Blog Post", "Book", "Book Chapter", "Business Report", "Case Report", "Case Series", 
    "Checklist", "Checklist Model", "Clinical Guideline", "Conference Paper", "Course Module", "Dataset", 
    "Dissertation", "Exam Bank", "Form", "Framework", "Guideline (Non-Clinical)", "Idea Draft", "Image", 
    "Infographic", "Journal Entry", "Lecture Note", "Magazine Article", "Manual", "Meeting Note", "Memo", 
    "Meta-analysis", "Mindmap", "Model", "Newspaper Article", "Original Research", "Podcast", "Policy Brief", 
    "Preprint", "Presentation Slide", "Proceedings", "Project Document", "Proposal", "Protocol", "Rapid Review", 
    "Reflection", "Review Article", "Scoping Review", "Standard Operating Procedure (SOP)", "Study Guide", 
    "Syllabus", "Summary", "Systematic Review", "Teaching Material", "Technical Report", "Template", "Thesis", 
    "Toolkit", "Video", "Web Article", "Webpage Snapshot", "White Paper", "Working Paper", "Other"
  ];
  
  const [formData, setFormData] = useState({
    addMethod: 'FILE' as 'LINK' | 'FILE' | 'REF', 
    type: LibraryType.LITERATURE, 
    category: '',
    topic: '',
    subTopic: '',
    title: '',
    authors: [] as string[],
    publisher: '',
    journalName: '',
    volume: '',
    issue: '',
    pages: '',
    year: '',
    fullDate: '',
    doi: '',
    issn: '',
    isbn: '',
    pmid: '',
    arxivId: '',
    bibcode: '',
    abstract: '',
    keywords: [] as string[],
    labels: [] as string[],
    url: '',
    fileId: '',
    imageView: '',
    inTextHarvard: '',
    bibHarvard: '',
    chunks: [] as string[]
  });

  const existingValues = useMemo(() => ({
    topics: Array.from(new Set(items.map(i => i.topic).filter(Boolean))),
    subTopics: Array.from(new Set(items.map(i => i.subTopic).filter(Boolean))),
    publishers: Array.from(new Set(items.map(i => i.publisher).filter(Boolean))),
    allAuthors: Array.from(new Set(items.flatMap(i => i.authors || []).filter(Boolean))),
    allKeywords: Array.from(new Set(items.flatMap(i => i.keywords || []).filter(Boolean))),
    allLabels: Array.from(new Set(items.flatMap(i => i.labels || []).filter(Boolean))),
  }), [items]);

  const setMode = (mode: 'FILE' | 'LINK' | 'REF') => {
    setFormData(prev => ({ ...prev, addMethod: mode }));
  };

  const chunkifyText = (text: string): string[] => {
    if (!text) return [];
    const limitTotal = 200000;
    const limitedText = text.substring(0, limitTotal);
    const chunkSize = 20000;
    const chunks: string[] = [];
    for (let i = 0; i < limitedText.length; i += chunkSize) {
      if (chunks.length >= 10) break;
      chunks.push(limitedText.substring(i, i + chunkSize));
    }
    return chunks;
  };

  /**
   * Unified workflow for enrichment
   */
  const runExtractionWorkflow = async (
    extractedText: string, 
    chunks: string[], 
    identifiers: { doi?: string, isbn?: string, pmid?: string, arxivId?: string, imageView?: string } = {},
    initialMetadata: Partial<LibraryItem> = {}
  ) => {
    let baseData: Partial<LibraryItem> = { ...formData, ...initialMetadata };
    delete (baseData as any).chunks;

    if (!initialMetadata.title && (identifiers.doi || identifiers.isbn || identifiers.pmid || identifiers.arxivId)) {
      const mainId = identifiers.doi || identifiers.isbn || identifiers.pmid || identifiers.arxivId;
      setExtractionStage('FETCHING_ID');
      try {
        const officialData = await callIdentifierSearch(mainId!);
        if (officialData) {
          baseData = { ...baseData, ...officialData };
          setFormData(prev => ({ ...prev, ...officialData }));
        }
      } catch (e) {}
    }

    if (identifiers.imageView) {
      setFormData(prev => ({ ...prev, imageView: identifiers.imageView }));
      baseData.imageView = identifiers.imageView;
    }

    setExtractionStage('AI_ANALYSIS');
    const aiEnriched = await extractMetadataWithAI(extractedText, baseData);
    
    // YouTube Specific Logic Overrides
    const isYouTube = extractedText.includes("YOUTUBE_METADATA") || (baseData.url && (baseData.url.includes('youtube.com') || baseData.url.includes('youtu.be')));
    if (isYouTube) {
      aiEnriched.publisher = "Youtube";
      aiEnriched.category = "Video";
    }

    setFormData(prev => ({
      ...prev,
      ...aiEnriched,
      authors: (aiEnriched.authors && aiEnriched.authors.length > 0) ? aiEnriched.authors : prev.authors,
      keywords: (aiEnriched.keywords && aiEnriched.keywords.length > 0) ? aiEnriched.keywords : prev.keywords,
      labels: (aiEnriched.labels && aiEnriched.labels.length > 0) ? aiEnriched.labels : prev.labels,
      category: (aiEnriched.category && aiEnriched.category !== "" && CATEGORY_OPTIONS.includes(aiEnriched.category)) ? aiEnriched.category : prev.category,
      topic: (aiEnriched.topic && aiEnriched.topic !== "") ? aiEnriched.topic : prev.topic,
      subTopic: (aiEnriched.subTopic && aiEnriched.subTopic !== "") ? aiEnriched.subTopic : prev.subTopic,
      chunks: chunks
    }));
  };

  const isSocialMediaBlocked = (url: string) => {
    const blockedDomains = [/instagram\.com/i, /tiktok\.com/i, /facebook\.com/i, /linkedin\.com/i, /twitter\.com/i, /x\.com/i];
    return blockedDomains.some(pattern => pattern.test(url));
  };

  // URL Extraction Effect
  useEffect(() => {
    const handleUrlExtraction = async () => {
      const url = formData.url.trim();
      if (!url || !url.startsWith('http') || url === lastExtractedUrl.current || formData.addMethod !== 'LINK') return;

      if (isSocialMediaBlocked(url) && !url.includes('youtube.com') && !url.includes('youtu.be')) {
        showXeenapsAlert({ icon: 'error', title: 'LINK NON SUPPORTED', text: 'Social media links (except YouTube) are not allowed.' });
        setFormData(prev => ({ ...prev, url: '' }));
        return;
      }

      lastExtractedUrl.current = url;
      setExtractionStage('READING');
      try {
        const res = await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'extractOnly', url }),
        });
        const data = await res.json();

        if (data.status === 'success' && data.extractedText) {
          const ids = { 
            doi: data.detectedDoi, 
            isbn: data.detectedIsbn, 
            pmid: data.detectedPmid, 
            arxivId: data.detectedArxiv,
            imageView: data.imageView 
          };
          await runExtractionWorkflow(data.extractedText, chunkifyText(data.extractedText), ids);
        }
      } catch (err: any) {
        showXeenapsAlert({ icon: 'warning', title: 'EXTRACTION FAILED', text: 'This link can not be extracted automatically.' });
      } finally {
        setExtractionStage('IDLE');
      }
    };
    const tid = setTimeout(handleUrlExtraction, 1000);
    return () => clearTimeout(tid);
  }, [formData.url, formData.addMethod]);

  // REF Workflow Effect
  useEffect(() => {
    const handleIdentifierSearchLogic = async () => {
      const idVal = formData.doi.trim(); 
      if (idVal && idVal !== lastIdentifier.current && formData.addMethod === 'REF') {
        lastIdentifier.current = idVal;
        setExtractionStage('FETCHING_ID');
        try {
          const data = await callIdentifierSearch(idVal);
          if (data) {
            setFormData(prev => ({ ...prev, ...data }));
            const targetUrl = data.url || (data.doi ? `https://doi.org/${data.doi}` : null);
            if (targetUrl && targetUrl.startsWith('http')) {
              setExtractionStage('READING');
              const scrapeRes = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'extractOnly', url: targetUrl }),
              });
              const scrapeData = await scrapeRes.json();
              if (scrapeData.status === 'success' && scrapeData.extractedText) {
                await runExtractionWorkflow(scrapeData.extractedText, chunkifyText(scrapeData.extractedText), {}, data);
              } else {
                setExtractionStage('AI_ANALYSIS');
                const aiEnriched = await extractMetadataWithAI("", data);
                setFormData(prev => ({ ...prev, ...aiEnriched }));
              }
            } else {
              setExtractionStage('AI_ANALYSIS');
              const aiEnriched = await extractMetadataWithAI("", data);
              setFormData(prev => ({ ...prev, ...aiEnriched }));
            }
          }
        } catch (e: any) {
          showXeenapsAlert({ icon: 'error', title: 'SEARCH FAILED', text: 'No Data Found, please provide a valid identifier.' });
        } finally {
          setExtractionStage('IDLE');
        }
      }
    };
    const tid = setTimeout(handleIdentifierSearchLogic, 1500);
    return () => clearTimeout(tid);
  }, [formData.doi, formData.addMethod]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractionStage('READING');
      try {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(selectedFile);
        });
        const response = await fetch(GAS_WEB_APP_URL, { 
          method: 'POST', 
          body: JSON.stringify({ action: 'extractOnly', fileData: base64Data, fileName: selectedFile.name, mimeType: selectedFile.type }) 
        });
        const result = await response.json();
        if (result.status === 'success' && result.extractedText) {
          const ids = { doi: result.detectedDoi, isbn: result.detectedIsbn, pmid: result.detectedPmid, arxivId: result.detectedArxiv };
          await runExtractionWorkflow(result.extractedText, chunkifyText(result.extractedText), ids);
        }
      } catch (err: any) {
        showXeenapsAlert({ icon: 'warning', title: 'File Error', text: err.message || 'Extraction failed.' });
      } finally {
        setExtractionStage('IDLE');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    Swal.fire({ title: 'Registering Item...', text: 'Larger files may take a moment longer to process.', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...XEENAPS_SWAL_CONFIG });
    try {
      let detectedFormat = FileFormat.PDF;
      let fileUploadData = undefined;
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const formatMap: any = { 'pptx': FileFormat.PPTX, 'docx': FileFormat.DOCX, 'xlsx': FileFormat.XLSX, 'png': FileFormat.URL, 'jpg': FileFormat.URL, 'jpeg': FileFormat.URL };
        detectedFormat = formatMap[ext || ''] || FileFormat.PDF;
        const reader = new FileReader();
        const b64 = await new Promise<string>(r => { reader.onload = () => r((reader.result as string).split(',')[1]); reader.readAsDataURL(file); });
        fileUploadData = { fileName: file.name, mimeType: file.type, fileData: b64 };
      }
      const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      const newItem: any = { 
        ...formData, 
        id: generatedId, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString(), 
        source: formData.addMethod === 'LINK' ? SourceType.LINK : SourceType.FILE, 
        format: formData.addMethod === 'LINK' ? FileFormat.URL : detectedFormat, 
        author: formData.authors.join(', '), 
        keywords: formData.keywords, 
        labels: formData.labels,     
        tags: [...formData.keywords, ...formData.labels] 
      };
      if (formData.chunks && formData.chunks.length > 0) {
        formData.chunks.forEach((chunk, index) => { if (index < 10) newItem[`extractedInfo${index + 1}`] = chunk; });
      }
      const success = await saveLibraryItem(newItem, fileUploadData);
      Swal.close();
      if (success) { onComplete(); navigate('/'); }
    } catch (err) {
      Swal.close();
      showXeenapsAlert({ icon: 'error', title: 'Save Failed', text: 'Could not register item.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; 
    if (!val) { setFormData(prev => ({ ...prev, fullDate: '' })); return; }
    const d = new Date(val);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formatted = `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    setFormData(prev => ({ ...prev, fullDate: formatted }));
  };

  const getHtmlDateValue = (fullDate: string) => {
    if (!fullDate) return "";
    try {
      const parts = fullDate.split(' ');
      if (parts.length === 3) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const m = months.indexOf(parts[1]);
        if (m === -1) return "";
        const d = new Date(parseInt(parts[2]), m, parseInt(parts[0]));
        const offset = d.getTimezoneOffset();
        const adjustedDate = new Date(d.getTime() - (offset * 60 * 1000));
        return adjustedDate.toISOString().split('T')[0];
      }
    } catch(e) {}
    return "";
  };

  const isExtracting = extractionStage !== 'IDLE';
  const isFormDisabled = isExtracting || isSubmitting;

  return (
    <FormPageContainer>
      <FormStickyHeader title="Add Collection" subtitle="Expand your digital library" onBack={() => navigate('/')} rightElement={
        <div className="flex bg-gray-100/50 p-1.5 rounded-2xl gap-1 w-full md:w-auto">
          <button type="button" onClick={() => setMode('FILE')} disabled={isFormDisabled} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${formData.addMethod === 'FILE' ? 'bg-[#004A74] text-white shadow-lg' : 'text-gray-400 hover:text-[#004A74]'}`}><DocumentIcon className="w-4 h-4" /> FILE</button>
          <button type="button" onClick={() => setMode('LINK')} disabled={isFormDisabled} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${formData.addMethod === 'LINK' ? 'bg-[#004A74] text-white shadow-lg' : 'text-gray-400 hover:text-[#004A74]'}`}><LinkIcon className="w-4 h-4" /> LINK</button>
          <button type="button" onClick={() => setMode('REF')} disabled={isFormDisabled} className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black transition-all ${formData.addMethod === 'REF' ? 'bg-[#004A74] text-white shadow-lg' : 'text-gray-400 hover:text-[#004A74]'}`}><FingerPrintIcon className="w-4 h-4" /> REF</button>
        </div>
      } />
      <FormContentArea>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            {formData.addMethod === 'LINK' ? (
              <FormField label="Reference URL" required error={!formData.url}>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
                    {isExtracting ? <ArrowPathIcon className="w-5 h-5 text-[#004A74] animate-spin" /> : <LinkIcon className="w-5 h-5 text-gray-300 group-focus-within:text-[#004A74]" />}
                  </div>
                  <input className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl focus:ring-2 border ${!formData.url ? 'border-red-300' : 'border-gray-200'} text-sm font-medium transition-all`} placeholder="Paste research link..." value={formData.url} onChange={(e) => setFormData({...formData, url: e.target.value})} disabled={isFormDisabled} />
                </div>
              </FormField>
            ) : formData.addMethod === 'REF' ? (
              <FormField label="Identifier (DOI, ISBN, PMID, etc.)" required error={!formData.doi}>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
                    {isExtracting ? <ArrowPathIcon className="w-5 h-5 text-[#004A74] animate-spin" /> : <FingerPrintIcon className="w-5 h-5 text-gray-300 group-focus-within:text-[#004A74]" />}
                  </div>
                  <input className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl focus:ring-2 border ${!formData.doi ? 'border-red-300' : 'border-gray-200'} text-sm font-mono font-bold transition-all`} placeholder="Enter DOI, ISBN, PMID, Arxiv, or Title..." value={formData.doi} onChange={(e) => setFormData({...formData, doi: e.target.value})} disabled={isFormDisabled} />
                </div>
              </FormField>
            ) : (
              <FormField label="File Attachment" required error={!file}>
                <label className={`relative flex flex-col items-center justify-center w-full h-40 bg-gray-50 border-2 border-dashed ${!file ? 'border-red-300' : 'border-gray-200'} rounded-[2rem] cursor-pointer group ${isFormDisabled ? 'opacity-70 pointer-events-none' : ''}`}>
                  {isExtracting ? (
                    <div className="flex flex-col items-center px-4 text-center">
                      <ArrowPathIcon className="w-8 h-8 text-[#004A74] animate-spin mb-3" />
                      <p className="text-[10px] font-black text-[#004A74] uppercase tracking-widest">Processing Content...</p>
                    </div>
                  ) : (
                    <>
                      <CloudArrowUpIcon className="w-8 h-8 text-gray-300 group-hover:text-[#004A74] mb-2" />
                      <p className="text-sm text-gray-500 text-center px-6">{file ? <span className="font-bold text-[#004A74]">{file.name}</span> : "Drop academic files here (Max 25Mb)"}</p>
                    </>
                  )}
                  <input type="file" className="hidden" onChange={handleFileChange} disabled={isFormDisabled} />
                </label>
              </FormField>
            )}
            {isExtracting && (
              <div className="flex items-center gap-2 px-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <SparklesIcon className="w-4 h-4 text-[#FED400] animate-pulse" />
                <span className="text-[10px] font-black text-[#004A74] uppercase tracking-tighter">
                  {extractionStage === 'FETCHING_ID' ? 'Searching for metadata...' : 
                   extractionStage === 'READING' ? 'Accessing Content...' : 
                   extractionStage === 'AI_ANALYSIS' ? 'Analyzing Content...' : 
                   extractionStage === 'BYPASS' ? 'Bypassing Protection...' : 'Processing...'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Type" required error={!formData.type}><FormDropdown value={formData.type} onChange={(v) => setFormData({...formData, type: v as LibraryType})} options={Object.values(LibraryType)} placeholder="Select type..." disabled={isFormDisabled} /></FormField>
            <FormField label="Category" required error={!formData.category}><FormDropdown value={formData.category} onChange={(v) => setFormData({...formData, category: v})} options={CATEGORY_OPTIONS} placeholder="Select category..." disabled={isFormDisabled} /></FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Topic" required error={!formData.topic}><FormDropdown value={formData.topic} onChange={(v) => setFormData({...formData, topic: v})} options={existingValues.topics} placeholder="Scientific topic..." disabled={isFormDisabled} /></FormField>
            <FormField label="Sub Topic"><FormDropdown value={formData.subTopic} onChange={(v) => setFormData({...formData, subTopic: v})} options={existingValues.subTopics} placeholder="Specific area..." disabled={isFormDisabled} /></FormField>
          </div>

          <FormField label="Title"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-bold text-[#004A74]" placeholder="Enter title..." value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} disabled={isFormDisabled} /></FormField>
          <FormField label="Author(s)"><FormDropdown isMulti multiValues={formData.authors} onAddMulti={(v) => setFormData({...formData, authors: [...formData.authors, v]})} onRemoveMulti={(v) => setFormData({...formData, authors: formData.authors.filter(a => a !== v)})} options={existingValues.allAuthors} placeholder="Identify authors..." value="" onChange={() => {}} disabled={isFormDisabled} /></FormField>

          <div className="space-y-6 bg-gray-50/30 p-6 rounded-[2rem] border border-gray-100">
            <FormField label="Publisher"><FormDropdown value={formData.publisher} onChange={(v) => setFormData({...formData, publisher: v})} options={existingValues.publishers} placeholder="Publisher name..." disabled={isFormDisabled} /></FormField>
            <FormField label="Journal"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm font-medium" placeholder="Journal name..." value={formData.journalName} onChange={(e) => setFormData({...formData, journalName: e.target.value})} disabled={isFormDisabled} /></FormField>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Volume"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Volume" value={formData.volume} onChange={(e) => setFormData({...formData, volume: e.target.value})} disabled={isFormDisabled} /></FormField>
              <FormField label="Issue"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Issue" value={formData.issue} onChange={(e) => setFormData({...formData, issue: e.target.value})} disabled={isFormDisabled} /></FormField>
              <FormField label="Pages"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Pages" value={formData.pages} onChange={(e) => setFormData({...formData, pages: e.target.value})} disabled={isFormDisabled} /></FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Year"><input type="number" className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono font-bold" placeholder="YYYY" value={formData.year} onChange={(e) => setFormData({...formData, year: e.target.value.substring(0, 4)})} disabled={isFormDisabled} /></FormField>
            <FormField label="Date"><input type="date" className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono font-bold" value={getHtmlDateValue(formData.fullDate)} onChange={handleDateChange} disabled={isFormDisabled} /></FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
            <FormField label="DOI"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono" placeholder="10.xxxx/..." value={formData.doi} onChange={(e) => setFormData({...formData, doi: e.target.value})} disabled={isFormDisabled} /></FormField>
            <FormField label="PMID"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono" placeholder="PMID" value={formData.pmid} onChange={(e) => setFormData({...formData, pmid: e.target.value})} disabled={isFormDisabled} /></FormField>
            <FormField label="arXiv ID"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono" placeholder="arXiv ID" value={formData.arxivId} onChange={(e) => setFormData({...formData, arxivId: e.target.value})} disabled={isFormDisabled} /></FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="ISSN"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono" placeholder="XXXX-XXXX" value={formData.issn} onChange={(e) => setFormData({...formData, issn: e.target.value})} disabled={isFormDisabled} /></FormField>
            <FormField label="ISBN"><input className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono" placeholder="978-x-xxx" value={formData.isbn} onChange={(e) => setFormData({...formData, isbn: e.target.value})} disabled={isFormDisabled} /></FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Keywords"><FormDropdown isMulti multiValues={formData.keywords} onAddMulti={(v) => setFormData({...formData, keywords: [...formData.keywords, v]})} onRemoveMulti={(v) => setFormData({...formData, keywords: formData.keywords.filter(a => a !== v)})} options={existingValues.allKeywords} placeholder="Keywords..." value="" onChange={() => {}} disabled={isFormDisabled} /></FormField>
            <FormField label="Labels"><FormDropdown isMulti multiValues={formData.labels} onAddMulti={(v) => setFormData({...formData, labels: [...formData.labels, v]})} onRemoveMulti={(v) => setFormData({...formData, labels: formData.labels.filter(a => a !== v)})} options={existingValues.allLabels} placeholder="Thematic labels..." value="" onChange={() => {}} disabled={isFormDisabled} /></FormField>
          </div>

          <FormField label="Abstract">
            <AbstractEditor 
              value={formData.abstract} 
              onChange={(val) => setFormData({...formData, abstract: val})} 
              disabled={isFormDisabled} 
            />
          </FormField>

          <div className="pt-10 flex flex-col md:flex-row gap-4">
            <button type="button" onClick={() => navigate('/')} disabled={isFormDisabled} className="w-full md:px-10 py-5 bg-gray-100 text-gray-400 rounded-[1.5rem] font-black text-sm uppercase">Cancel</button>
            <button type="submit" disabled={isFormDisabled} className="w-full py-5 bg-[#004A74] text-white rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-3 uppercase">{isSubmitting ? 'REGISTERING...' : isExtracting ? 'ANALYZING...' : <><CheckIcon className="w-5 h-5" /> Register Item</>}</button>
          </div>
        </form>
      </FormContentArea>
    </FormPageContainer>
  );
};

export default LibraryForm;
