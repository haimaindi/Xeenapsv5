
import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Verbatim abstract extraction, Parenthetical Harvard citations, and metadata-aware enrichment.
 * IMPORTANT: This service acts ONLY as a Librarian. It does NOT fill Insight fields (Summary, Strength, etc.).
 */
export const extractMetadataWithAI = async (textSnippet: string, existingData: Partial<LibraryItem> = {}): Promise<Partial<LibraryItem>> => {
  try {
    const truncatedSnippet = textSnippet.substring(0, 7500);

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN (XEENAPS AI LIBRARIAN). 
    YOUR TASK IS TO ORGANIZE AND CLEAN THE METADATA FOR A LIBRARY ENTRY BASED ON THE PROVIDED TEXT.

    --- MANDATORY WORKFLOW ---
    1. LIBRARIAN ROLE: Identify Title, Authors, Publisher, Year, and technical identifiers.
    2. GAP-FILLING: Use "EXISTING_DATA" as the primary source of truth. Fill ONLY fields that are currently empty ("") or "N/A".
    3. VERBATIM ABSTRACT (CRITICAL):
       - EXTRACT the abstract exactly as written in the "TEXT SNIPPET". 
       - DO NOT SUMMARIZE OR PARAPHRASE.
       - FORMATTING: Use <b> tag for sub-headers (e.g., <b>Objective:</b>) and <br/> for line breaks.
       - EMPHASIS: Use <b><i> tags for key findings or specific important sentences.
       - CLEANING: Remove markdown like #, *, or []. Only use standard HTML tags (b, i, br).
    4. CITATION GENERATION:
       - Style: Harvard (Parenthetical).
       - IN-TEXT: (Author, Year) or (Author et al., Year).
       - BIBLIOGRAPHIC: Full Harvard Journal/Book format listing all authors.
    5. STRICT RESTRICTION: DO NOT fill "summary", "strength", "weakness", "researchMethodology", "unfamiliarTerminology", "supportingReferences", "videoRecommendation", or "quickTipsForYou". Leave these fields out of your JSON response.
    6. NO HALLUCINATION: If the information is not in the text or existing data, leave the field empty.
    --------------------------

    EXISTING_DATA:
    ${JSON.stringify(existingData)}

    TEXT SNIPPET:
    ${truncatedSnippet}

    EXPECTED JSON OUTPUT (RAW JSON ONLY):
    {
      "title": "Official Title",
      "authors": ["Author 1", "Author 2"],
      "year": "YYYY",
      "publisher": "Publisher Name",
      "doi": "DOI",
      "isbn": "ISBN",
      "issn": "ISSN",
      "pmid": "PMID",
      "arxivId": "arXiv ID",
      "journalName": "Journal Name",
      "volume": "Vol",
      "issue": "No",
      "pages": "pp-pp",
      "category": "e.g., Original Research",
      "topic": "Topic Name",
      "subTopic": "Sub Topic Name",
      "abstract": "HTML formatted verbatim abstract",
      "keywords": ["tag1", "tag2"],
      "labels": ["label1", "label2"],
      "inTextHarvard": "Generate a parenthetical Harvard in-text citation. For 1-2 authors, list all names (e.g., 'Author1 & Author2, 2024'). For 3 or more authors, use 'et al.' after the first author (e.g., 'Author1 et al., 2024'). Ensure no italics for 'et al.' unless specified.",
      "bibHarvard": "Generate a full Harvard bibliographic entry. List ALL authors regardless of the count (up to 20 authors). Format: 'Surname, Initial., Surname, Initial. and Surname, Initial. (Year) Title of article. Journal Name, Volume(Issue), pp. pages. DOI link.'"
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
      
      // Smart Merge logic to prevent AI from overwriting valid existing metadata
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
