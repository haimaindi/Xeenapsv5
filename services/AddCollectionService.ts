import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Gap-filling, robust formatting, and protective data handling.
 */
export const extractMetadataWithAI = async (textSnippet: string, existingData: Partial<LibraryItem> = {}): Promise<Partial<LibraryItem>> => {
  try {
    const truncatedSnippet = textSnippet.substring(0, 7500);

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN (XEENAPS AI LIBRARIAN). 
    ENRICH THE PROVIDED METADATA USING THE TEXT SNIPPET BELOW.

    --- MANDATORY WORKFLOW ---
    1. GAP-FILLING ONLY: Fill ONLY fields that are empty or "N/A" in the "EXISTING_DATA" section.
    2. DATA PROTECTION: DO NOT OVERWRITE any valid metadata provided in "EXISTING_DATA". 
    3. NO HALLUCINATION: If identifiers (DOI, ISBN, ISSN, PMID, Bibcode, ArXiv) are NOT explicitly found in the text, leave them empty. DO NOT guess or hallucinate these values.
    4. ABSTRACT CLEANING & FORMATTING:
       - Keep original language (DO NOT TRANSLATE).
       - Remove all special characters like '*', '#', or double asterisks.
       - If sub-headers (e.g., Introduction, Methods, Results, Conclusion) are present, format them as: <b>Header Name:</b> followed by a line break.
       - Ensure a clean, readable flow.
    5. THEMATIC ANALYSIS: Determine Category, Topic, and SubTopic accurately.
    --------------------------

    EXISTING_DATA:
    ${JSON.stringify(existingData)}

    TEXT SNIPPET:
    ${truncatedSnippet}

    EXPECTED JSON OUTPUT (RAW JSON ONLY):
    {
      "title": "Full Official Title",
      "authors": ["Array of names"],
      "year": "YYYY",
      "publisher": "Name",
      "doi": "Only if explicit in snippet",
      "isbn": "Only if explicit in snippet",
      "issn": "Only if explicit in snippet",
      "pmid": "Only if explicit in snippet",
      "arxivId": "Only if explicit in snippet",
      "bibcode": "Only if explicit in snippet",
      "category": "e.g., Original Research",
      "topic": "Exactly 2 words",
      "subTopic": "Exactly 2 words",
      "abstract": "Cleaned and formatted abstract",
      "keywords": ["5 key terms"],
      "labels": ["3 thematic labels"],
      "inTextAPA": "Citation format",
      "bibAPA": "Full bibliographic entry"
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
      
      // Merge logic: AI only fills what is missing in existingData
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