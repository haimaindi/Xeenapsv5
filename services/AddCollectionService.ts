
import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Verbatim abstract extraction, non-truncated citations, and metadata-aware enrichment.
 */
export const extractMetadataWithAI = async (textSnippet: string, existingData: Partial<LibraryItem> = {}): Promise<Partial<LibraryItem>> => {
  try {
    const truncatedSnippet = textSnippet.substring(0, 7500);

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN (XEENAPS AI LIBRARIAN). 
    ENRICH THE PROVIDED METADATA USING THE TEXT SNIPPET BELOW.

    --- MANDATORY WORKFLOW ---
    1. GAP-FILLING & ENRICHMENT: Use the provided "EXISTING_DATA" as your core facts. Fill ONLY fields that are empty or "N/A".
    2. ABSTRACT EXTRACTION (CRITICAL):
       - EXTRACT VERBATIM from the TEXT SNIPPET only. 
       - KEEP ORIGINAL LANGUAGE of the source text.
       - FORMATTING: Use <b> tag for sub-headers (e.g., <b>Introduction:</b>, <b>Methods:</b>) followed by a line break <br/>.
       - IMPORTANT POINTS: Use both <b><i> tags for key sentences or important points.
       - CLEANING: Remove all markdown symbols like *, #, or brackets.
       - EMPTY FALLBACK: If NO abstract is found in the snippet, return an empty string "". DO NOT hallucinate.
    3. CITATION GENERATION (PREMIUM ACCURACY):
       - Styles: APA, Harvard, Chicago.
       - ACCURACY: Follow the latest edition rules strictly.
       - NO TRUNCATION: Do NOT use "..." or "et al." unless the style guide specifically requires it for high counts. YOU MUST LIST ALL AUTHORS provided in the metadata context. Never cut the citation short.
    4. NO HALLUCINATION: Identifiers (DOI, ISBN, etc.) must be EXPLICIT in the snippet.
    5. DATA CLEANING: For "volume", "issue", and "pages", provide ONLY numbers/identifiers (no prefixes like "Vol.").
    --------------------------

    EXISTING_DATA (USE THESE FACTS AS PRIMARY):
    ${JSON.stringify(existingData)}

    TEXT SNIPPET (SOURCE FOR ABSTRACT):
    ${truncatedSnippet}

    EXPECTED JSON OUTPUT (RAW JSON ONLY):
    {
      "title": "Full Official Title",
      "authors": ["Array of names"],
      "year": "YYYY",
      "publisher": "Name",
      "doi": "Only if explicit",
      "isbn": "Only if explicit",
      "issn": "Only if explicit",
      "pmid": "Only if explicit",
      "arxivId": "Only if explicit",
      "category": "e.g., Original Research",
      "topic": "Exactly 2 words",
      "subTopic": "Exactly 2 words",
      "abstract": "HTML formatted verbatim abstract",
      "keywords": ["5 key terms"],
      "labels": ["3 thematic labels"],
      "volume": "14",
      "issue": "2",
      "pages": "120-135",
      "inTextAPA": "Accurate non-truncated citation",
      "inTextHarvard": "Accurate non-truncated citation",
      "inTextChicago": "Accurate non-truncated citation",
      "bibAPA": "Full Bibliographic entry",
      "bibHarvard": "Full Bibliographic entry",
      "bibChicago": "Full Bibliographic entry"
    }`;

    const response = await callAiProxy('groq', prompt);
    if (!response) return {};
    
    let cleanJson = response.trim();
    if (cleanJson.includes('{')) {
      const start = cleanJson.indexOf('{');
      const end = cleanJson.lastIndexOf('}');
      if (start !== -1 && end !== -1) cleanJson = cleanJson.substring(start, end + 1);
    }

    try {
      const parsed = JSON.parse(cleanJson);
      
      const merged = { ...parsed };
      Object.keys(existingData).forEach(key => {
        const val = (existingData as any)[key];
        if (val && val !== "" && val !== "N/A" && (!Array.isArray(val) || val.length > 0)) {
          merged[key] = val;
        }
      });

      return merged;
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return {};
    }
  } catch (error) {
    console.error('Extraction Failed:', error);
    return {};
  }
};
