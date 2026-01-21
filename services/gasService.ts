
import { LibraryItem, GASResponse, PagedLibraryData } from '../types';
import { GAS_WEB_APP_URL } from '../constants';
import { GoogleGenAI } from "@google/genai";
import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
});

/**
 * AI Proxy service for general LLM tasks using Gemini 3 Flash.
 */
export const callAiProxy = async (provider: string, prompt: string, model?: string, signal?: AbortSignal): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: model || 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || '';
  } catch (err) {
    console.error("AI Proxy Error:", err);
    return "";
  }
};

export const fetchLibrary = async (params: {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isFavorite?: boolean;
  isBookmarked?: boolean;
}): Promise<PagedLibraryData> => {
  try {
    if (!GAS_WEB_APP_URL) return { items: [], totalCount: 0 };
    
    const queryParams = new URLSearchParams({
      action: 'getLibrary',
      page: params.page.toString(),
      limit: params.limit.toString(),
      sortBy: params.sortBy || 'createdAt',
      sortOrder: params.sortOrder || 'desc'
    });
    
    if (params.search) queryParams.append('search', params.search);
    if (params.type && params.type !== 'All') queryParams.append('type', params.type);
    if (params.isFavorite) queryParams.append('isFavorite', 'true');
    if (params.isBookmarked) queryParams.append('isBookmarked', 'true');

    const response = await fetch(`${GAS_WEB_APP_URL}?${queryParams.toString()}`);
    if (!response.ok) return { items: [], totalCount: 0 };
    
    const result: GASResponse<PagedLibraryData> = await response.json();
    return result.data || { items: [], totalCount: 0 };
  } catch (error) {
    console.error("Fetch error:", error);
    return { items: [], totalCount: 0 };
  }
};

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

/**
 * Unified metadata extraction from URL.
 */
export const extractFromUrl = async (url: string, onStageChange?: (stage: 'READING' | 'BYPASS' | 'AI_ANALYSIS') => void, signal?: AbortSignal): Promise<any> => {
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'extractOnly', url }),
      signal
    });
    return await response.json();
  } catch (error) {
    console.error("URL Extraction failed:", error);
    return { status: 'error' };
  }
};

/**
 * Searches for metadata using DOI, ISBN, or other identifiers.
 */
export const callIdentifierSearch = async (idValue: string, signal?: AbortSignal): Promise<any> => {
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'identifierSearch', id: idValue }),
      signal
    });
    const result = await response.json();
    return result.status === 'success' ? result.data : null;
  } catch (error) {
    console.error("Identifier Search failed:", error);
    return null;
  }
};

/**
 * Uploads file to Google Drive via GAS and returns metadata.
 */
export const uploadAndStoreFile = async (file: File, signal?: AbortSignal): Promise<any> => {
  try {
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const response = await fetch(GAS_WEB_APP_URL, { 
      method: 'POST', 
      body: JSON.stringify({ action: 'extractOnly', fileData: base64Data, fileName: file.name, mimeType: file.type }),
      signal
    });
    return await response.json();
  } catch (error) {
    console.error("File upload/extract failed:", error);
    return { status: 'error' };
  }
};
