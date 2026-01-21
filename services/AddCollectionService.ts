
import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Verbatim abstract extraction, Parenthetical Harvard citations, and metadata-aware enrichment.
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
       - Style: Harvard (Parenthetical).
       - IN-TEXT FORMAT: (Author, Year). Example: (Harris, Snell, Talbot and Harden, 2010).
       - DO NOT use narrative style (e.g. Harris et al. (2010)). Use ONLY the parenthetical style.
       - NO TRUNCATION (CRITICAL): Do NOT use "et al." or "...". YOU MUST LIST ALL AUTHORS provided in the metadata context in both the in-text and bibliographic entries.
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
      "inTextHarvard": "Full parenthetical Harvard in-text citation (List ALL authors, e.g. (Author1, Author2 and Author3, 2024))",
      "bibHarvard": "Full non-truncated Harvard bibliographic entry (List ALL authors)"
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
