
import { LibraryItem, GASResponse, ExtractionResult } from '../types';
import { GAS_WEB_APP_URL } from '../constants';
import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
});

export const initializeDatabase = async (): Promise<{ status: string; message: string }> => {
  try {
    if (!GAS_WEB_APP_URL) throw new Error('VITE_GAS_URL is missing.');
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'setupDatabase' }),
    });
    return await response.json();
  } catch (error: any) {
    return { status: 'error', message: error.toString() };
  }
};

export const fetchLibrary = async (): Promise<LibraryItem[]> => {
  try {
    if (!GAS_WEB_APP_URL) return [];
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getLibrary`);
    if (!response.ok) return [];
    const result: GASResponse<LibraryItem[]> = await response.json();
    return result.data || [];
  } catch (error) {
    return [];
  }
};

/**
 * Server-side Paginated Fetch with AbortSignal and Sorting Support
 */
export const fetchLibraryPaginated = async (
  page: number = 1, 
  limit: number = 25, 
  search: string = "", 
  type: string = "All",
  path: string = "",
  sortKey: string = "createdAt",
  sortDir: string = "desc",
  signal?: AbortSignal
): Promise<{ items: LibraryItem[], totalCount: number }> => {
  try {
    if (!GAS_WEB_APP_URL) return { items: [], totalCount: 0 };
    const url = `${GAS_WEB_APP_URL}?action=getLibrary&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&type=${encodeURIComponent(type)}&path=${encodeURIComponent(path)}&sortKey=${sortKey}&sortDir=${sortDir}`;
    const response = await fetch(url, { signal });
    if (!response.ok) return { items: [], totalCount: 0 };
    const result: any = await response.json();
    return { 
      items: result.data || [], 
      totalCount: result.totalCount || 0 
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('Fetch aborted');
    }
    return { items: [], totalCount: 0 };
  }
};

export const callAiProxy = async (provider: 'groq' | 'gemini', prompt: string, modelOverride?: string, signal?: AbortSignal): Promise<string> => {
  try {
    if (!GAS_WEB_APP_URL) throw new Error('GAS_WEB_APP_URL not configured');
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'aiProxy', provider, prompt, modelOverride }),
      signal
    });
    const result = await response.json();
    if (result && result.status === 'success') return result.data;
    throw new Error(result?.message || 'AI Proxy failed.');
  } catch (error: any) {
    return '';
  }
};

const processExtractedText = (extractedText: string, defaultTitle: string = ""): ExtractionResult => {
  const isYouTube = extractedText.includes("YOUTUBE_METADATA");
  const minLength = isYouTube ? 50 : 300;

  if (!extractedText || extractedText.length < minLength) {
    throw new Error("Content extraction returned insufficient data.");
  }

  const limitTotal = 200000;
  const limitedText = extractedText.substring(0, limitTotal);
  const aiSnippet = limitedText.substring(0, 7500);
  const chunkSize = 20000;
  const chunks: string[] = [];
  for (let i = 0; i < limitedText.length; i += chunkSize) {
    if (chunks.length >= 10) break;
    chunks.push(limitedText.substring(i, i + chunkSize));
  }
  return { title: defaultTitle, fullText: limitedText, aiSnippet, chunks } as ExtractionResult;
};

export const extractFromUrl = async (url: string, onStageChange?: (stage: 'READING' | 'BYPASS' | 'AI_ANALYSIS') => void, signal?: AbortSignal): Promise<ExtractionResult | null> => {
  if (!GAS_WEB_APP_URL) throw new Error('Backend GAS URL missing.');

  onStageChange?.('READING');
  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'extractOnly', url }),
      signal
    });
    
    const data = await res.json();
    if (data.status === 'success' && data.extractedText && !data.extractedText.startsWith("Extraction failed")) {
      return processExtractedText(data.extractedText, data.fileName);
    }
    throw new Error(data.message || 'Extraction failed.');
  } catch (error: any) {
    throw error;
  }
};

export const callIdentifierSearch = async (idValue: string, signal?: AbortSignal): Promise<Partial<LibraryItem> | null> => {
  if (!GAS_WEB_APP_URL) throw new Error('GAS_WEB_APP_URL missing.');
  
  // Use provided signal or create a local one with 15s timeout as fallback
  const internalSignal = signal || AbortSignal.timeout(15000);

  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'searchByIdentifier', idValue }),
      signal: internalSignal
    });
    
    const result = await res.json();
    if (result.status === 'success') return result.data;
    throw new Error(result.message || 'No data found.');
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message === 'TIMEOUT') {
      throw new Error('TIMEOUT');
    }
    throw error;
  }
};

export const uploadAndStoreFile = async (file: File, signal?: AbortSignal): Promise<ExtractionResult | null> => {
  if (!GAS_WEB_APP_URL) throw new Error('GAS_WEB_APP_URL missing.');
  
  const reader = new FileReader();
  const base64Data = await new Promise<string>((resolve) => {
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });

  const response = await fetch(GAS_WEB_APP_URL, { 
    method: 'POST', 
    body: JSON.stringify({ 
      action: 'extractOnly', 
      fileData: base64Data, 
      fileName: file.name, 
      mimeType: file.type 
    }),
    signal
  });
  
  const result = await response.json();
  if (result.status === 'success' && result.extractedText && !result.extractedText.startsWith("Extraction failed")) {
    return processExtractedText(result.extractedText, file.name);
  }
  throw new Error(result.message || 'File processing failed.');
};

export const saveLibraryItem = async (item: LibraryItem, fileContent?: any): Promise<boolean> => {
  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'saveItem', item, file: fileContent }),
    });
    const result = await res.json();
    return result.status === 'success';
  } catch (error) {
    return false;
  }
};

export const deleteLibraryItem = async (id: string): Promise<boolean> => {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'deleteItem', id }),
  });
  const result = await res.json();
  return result.status === 'success';
};
