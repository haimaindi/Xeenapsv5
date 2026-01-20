import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Basic metadata, robust citations, keywords, and labels from raw text.
 */
export const extractMetadataWithAI = async (textSnippet: string): Promise<Partial<LibraryItem>> => {
  try {
    const truncatedSnippet = textSnippet.substring(0, 8500);

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN. 
    EXTRACT DATA FROM THE PROVIDED TEXT AND RETURN IN RAW JSON FORMAT ONLY.

    --- SPECIAL LOGIC FOR YOUTUBE VIDEOS (WHISPER TRANSCRIPTS) ---
    IF the text snippet contains "YOUTUBE_METADATA:" or appears to be a video transcript:
    - "category": MUST be exactly "Video".
    - "publisher": MUST be exactly "YouTube".
    - "authors": Use the "Channel" name as the only item in the array.
    - "title": Use the "Title" found in the metadata section.
    - "year": Guess the year from the content or transcript context if not found.
    - "inTextAPA", "inTextHarvard", "inTextChicago", "bibAPA", "bibHarvard", "bibChicago": MUST BE EMPTY STRINGS.
    - ANALYZE the first few paragraphs of the transcript to determine the precise Topic and Subtopic.
    ----------------------------------------------------------

    SCOPE LIMITATION (CRITICAL):
    - ANALYZE ONLY: title, topic, subTopic, authors, publisher, year, keywords, labels, and citation fields.
    - DO NOT analyze: researchMethodology, abstract, summary, etc.

    CRITICAL INSTRUCTION FOR ROBUSTNESS:
    1. COMPLETE FIELDS (NO TRUNCATION):
       - "title": Full official title.
       - "authors": Array of full names (For videos, this is the Channel Name).
       - "publisher": Journal name or "YouTube".
       - "bibAPA", "bibHarvard", "bibChicago": Full bibliographic entries (Keep Empty for Videos).
    
    2. CONCISE FIELDS:
       - "topic": Exactly 2 words.
       - "subTopic": Exactly 2 words.
       - "keywords": Exactly 5 relevant academic keywords.
       - "labels": Exactly 3 thematic labels.

    3. STYLE COMPLIANCE (NON-VIDEO): 
       - inTextAPA: (Author, Year)
       - inTextHarvard: (Author, Year)
       - inTextChicago: (Author Year)

    EXPECTED JSON SCHEMA:
    {
      "title": "Full Title",
      "authors": ["Name"],
      "year": "YYYY",
      "publisher": "Name",
      "category": "Video or Original Research",
      "topic": "Two Words",
      "subTopic": "Two Words",
      "keywords": ["k1", "k2", "k3", "k4", "k5"],
      "labels": ["l1", "l2", "l3"],
      "inTextAPA": "...",
      "inTextHarvard": "...",
      "inTextChicago": "...",
      "bibAPA": "...",
      "bibHarvard": "...",
      "bibChicago": "..."
    }

    TEXT SNIPPET:
    ${truncatedSnippet}`;

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
      return Object.fromEntries(Object.entries(parsed).filter(([_, v]) => v != null && v !== ""));
    } catch (e) {
      console.error('JSON Parse Error:', e);
      return {};
    }
  } catch (error) {
    console.error('Extraction Failed:', error);
    return {};
  }
};