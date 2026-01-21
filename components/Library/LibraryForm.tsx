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

const LibraryForm: React.FC<LibraryFormProps> = ({ onComplete, items = [] }) => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [extractionStage, setExtractionStage] = useState<'IDLE' | 'READING' | 'BYPASS' | 'AI_ANALYSIS' | 'FETCHING_ID'>('IDLE');
  const [file, setFile] = useState<File | null>(null);
  const lastExtractedUrl = useRef<string>("");
  const lastIdentifier = useRef<string>("");
  
  const [formData, setFormData] = useState({
    addMethod: 'FILE' as 'LINK' | 'FILE' | 'REF', 
    type: LibraryType.LITERATURE, 
    category: 'Original Research',
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
    inTextAPA: '',
    inTextHarvard: '',
    inTextChicago: '',
    bibAPA: '',
    bibHarvard: '',
    bibChicago: '',
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

  /**
   * Helper to split large text into chunks of 20,000 chars (max 10 chunks = 200,000 chars)
   */
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

  // MULTI-STAGE ANALYSIS CHAIN
  const runExtractionWorkflow = async (extractedText: string, chunks: string[], detectedDoi?: string) => {
    // Stage 1: Official Identifier Search (If DOI found in text)
    let baseData: Partial<LibraryItem> = { ...formData };
    delete (baseData as any).chunks; // Clean for AI service

    if (detectedDoi) {
      setExtractionStage('FETCHING_ID');
      try {
        const officialData = await callIdentifierSearch(detectedDoi);
        if (officialData) {
          baseData = { ...baseData, ...officialData };
          setFormData(prev => ({ ...prev, ...officialData }));
        }
      } catch (e) {}
    }

    // Stage 2: AI Enrichment (Filling the gaps - sending only first 7.5k to AI)
    setExtractionStage('AI_ANALYSIS');
    const aiEnriched = await extractMetadataWithAI(extractedText, baseData);
    setFormData(prev => ({
      ...prev,
      ...aiEnriched,
      authors: (aiEnriched.authors && aiEnriched.authors.length > 0) ? aiEnriched.authors : prev.authors,
      keywords: (aiEnriched.keywords && aiEnriched.keywords.length > 0) ? aiEnriched.keywords : prev.keywords,
      labels: (aiEnriched.labels && aiEnriched.labels.length > 0) ? aiEnriched.labels : prev.labels,
      chunks: chunks // Keep all 10 chunks in state
    }));
  };

  // Logic for LINK mode
  useEffect(() => {
    const handleUrlExtraction = async () => {
      const url = formData.url.trim();
      if (url && url.startsWith('http') && url !== lastExtractedUrl.current && formData.addMethod === 'LINK') {
        lastExtractedUrl.current = url;
        setExtractionStage('READING');
        try {
          const res = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'extractOnly', url }),
          });
          const data = await res.json();
          if (data.status === 'success' && data.extractedText) {
            await runExtractionWorkflow(data.extractedText, chunkifyText(data.extractedText), data.detectedDoi);
          }
        } catch (err: any) {
          showXeenapsAlert({ icon: 'warning', title: 'EXTRACTION FAILED', text: 'This link can not be extracted automatically.' });
        } finally {
          setExtractionStage('IDLE');
        }
      }
    };
    const tid = setTimeout(handleUrlExtraction, 1000);
    return () => clearTimeout(tid);
  }, [formData.url, formData.addMethod]);

  // Logic for REF mode (Cascading Search)
  useEffect(() => {
    const handleIdentifierSearch = async () => {
      const idVal = formData.doi.trim(); 
      if (idVal && idVal !== lastIdentifier.current && formData.addMethod === 'REF') {
        lastIdentifier.current = idVal;
        setExtractionStage('FETCHING_ID');
        try {
          const data = await callIdentifierSearch(idVal);
          if (data) {
            setFormData(prev => ({ ...prev, ...data }));
            
            if (data.url && data.url.startsWith('http')) {
              setExtractionStage('READING');
              const scrapeRes = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'extractOnly', url: data.url }),
              });
              const scrapeData = await scrapeRes.json();
              if (scrapeData.status === 'success' && scrapeData.extractedText) {
                await runExtractionWorkflow(scrapeData.extractedText, chunkifyText(scrapeData.extractedText));
              }
            } else {
              setExtractionStage('AI_ANALYSIS');
              const simpleEnrich = await extractMetadataWithAI("", data);
              setFormData(prev => ({ ...prev, ...simpleEnrich }));
            }
          }
        } catch (e: any) {
          showXeenapsAlert({ icon: 'error', title: 'SEARCH FAILED', text: 'No Data Found, please give right identifier' });
        } finally {
          setExtractionStage('IDLE');
        }
      }
    };
    const tid = setTimeout(handleIdentifierSearch, 1500);
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
          await runExtractionWorkflow(result.extractedText, chunkifyText(result.extractedText), result.detectedDoi);
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
    
    Swal.fire({
      title: 'Registering Item...',
      text: 'Ensuring data is saved accurately. Please wait.',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
      ...XEENAPS_SWAL_CONFIG
    });

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

      // Construct the newItem with separate keywords/labels and full chunk mapping
      const newItem: any = { 
        ...formData, 
        id: generatedId, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString(), 
        source: formData.addMethod === 'LINK' ? SourceType.LINK : SourceType.FILE, 
        format: formData.addMethod === 'LINK' ? FileFormat.URL : detectedFormat, 
        author: formData.authors.join(', '), 
        keywords: formData.keywords, // Separate column
        labels: formData.labels,     // Separate column
        tags: [...formData.keywords, ...formData.labels] // Combined for search
      };

      // Map all available chunks to extractedInfo1...10
      if (formData.chunks && formData.chunks.length > 0) {
        formData.chunks.forEach((chunk, index) => {
          if (index < 10) {
            newItem[`extractedInfo${index + 1}`] = chunk;
          }
        });
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
                  <input className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl focus:ring-2 border ${!formData.doi ? 'border-red-300' : 'border-gray-200'} text-sm font-mono font-bold transition-all`} placeholder="Enter DOI, ISBN, PMID, Bibcode, or Title..." value={formData.doi} onChange={(e) => setFormData({...formData, doi: e.target.value})} disabled={isFormDisabled} />
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
                  {extractionStage === 'READING' ? 'Content Extraction...' : 
                   extractionStage === 'AI_ANALYSIS' ? 'AI Analyzing Content...' : 
                   extractionStage === 'FETCHING_ID' ? 'Fetching Metadata from Global APIs...' : 'Bypassing Protection...'}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Type" required error={!formData.type}><FormDropdown value={formData.type} onChange={(v) => setFormData({...formData, type: v as LibraryType})} options={Object.values(LibraryType)} placeholder="Select type..." disabled={isFormDisabled} /></FormField>
            <FormField label="Category" required error={!formData.category}><FormDropdown value={formData.category} onChange={(v) => setFormData({...formData, category: v})} options={['Original Research', 'Review', 'Case Study', 'Technical Report', 'Other']} placeholder="Select category..." disabled={isFormDisabled} /></FormField>
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
              <FormField label="Volume"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Vol" value={formData.volume} onChange={(e) => setFormData({...formData, volume: e.target.value})} disabled={isFormDisabled} /></FormField>
              <FormField label="Issue"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Issue" value={formData.issue} onChange={(e) => setFormData({...formData, issue: e.target.value})} disabled={isFormDisabled} /></FormField>
              <FormField label="Pages"><input className="w-full px-5 py-4 bg-white rounded-2xl border border-gray-200 text-sm" placeholder="Pages" value={formData.pages} onChange={(e) => setFormData({...formData, pages: e.target.value})} disabled={isFormDisabled} /></FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Year (YYYY)"><input type="number" className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono font-bold" placeholder="YYYY" value={formData.year} onChange={(e) => setFormData({...formData, year: e.target.value.substring(0, 4)})} disabled={isFormDisabled} /></FormField>
            <FormField label="Date (Calendar Modal)"><input type="date" className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm font-mono font-bold" value={getHtmlDateValue(formData.fullDate)} onChange={handleDateChange} disabled={isFormDisabled} /></FormField>
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

          <FormField label="Abstract (Official or AI Enhanced)">
            <textarea 
              className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-gray-200 text-sm min-h-[150px] leading-relaxed custom-scrollbar font-medium" 
              placeholder="Abstract content will appear here..." 
              value={formData.abstract} 
              onChange={(e) => setFormData({...formData, abstract: e.target.value})} 
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