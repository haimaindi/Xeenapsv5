import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Basic metadata, robust citations, keywords, and labels from raw text.
 */
export const extractMetadataWithAI = async (textSnippet: string): Promise<Partial<LibraryItem>> => {
  try {
    // Increased snippet slightly to 8500 to handle noisier raw HTML data better
    const truncatedSnippet = textSnippet.substring(0, 8500);

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN. 
    EXTRACT DATA FROM THE PROVIDED TEXT AND RETURN IN RAW JSON FORMAT ONLY.

    --- SPECIAL LOGIC FOR YOUTUBE VIDEOS ---
    IF the text snippet begins with "YOUTUBE_METADATA:" or contains a YouTube transcript:
    - "category": MUST be exactly "Video".
    - "publisher": MUST be exactly "YouTube".
    - "author": Use the "Channel" name identified in the metadata.
    - "year": Identify the publication year from content if available, otherwise leave empty.
    - "inTextAPA", "inTextHarvard", "inTextChicago", "bibAPA", "bibHarvard", "bibChicago": MUST BE NULL OR EMPTY STRING. Do not generate citations for YouTube videos.
    ----------------------------------------

    SCOPE LIMITATION (CRITICAL):
    - ANALYZE ONLY: title, topic, subTopic, authors, publisher, year, keywords, labels, and all 6 citation fields.
    - DO NOT analyze: researchMethodology, abstract, summary, strength, weakness, unfamiliarTerminology, supportingReferences, videoRecommendation, quickTipsForYou.

    CRITICAL INSTRUCTION FOR ROBUSTNESS:
    1. COMPLETE FIELDS (NO TRUNCATION):
       - "title": Full, official academic or video title.
       - "authors": List of all full names found. For videos, use the Channel Name as the primary author.
       - "publisher": Identify ACCURATELY. If YouTube, use "YouTube". Otherwise, identify complete Journal/Publisher.
       - "bibAPA", "bibHarvard", "bibChicago": COMPLETE bibliographic entries (ignored for videos).
    
    2. CONCISE FIELDS:
       - "topic": Exactly 2 words describing the main field.
       - "subTopic": Exactly 2 words describing the specific niche.
       - "keywords": Exactly 5 relevant academic keywords extracted from content.
       - "labels": Exactly 3 thematic labels extracted from content.
       - "year": Accurately identify the exact year of publication from the source.

    3. STYLE COMPLIANCE (NON-VIDEO): 
       - inTextAPA: (Author, Year)
       - inTextHarvard: (Author, Year)
       - inTextChicago: (Author Year)

    EXPECTED JSON SCHEMA:
    {
      "title": "Full Academic Title",
      "authors": ["Full Name 1"],
      "year": "YYYY",
      "publisher": "Full Journal/Publisher Name",
      "category": "e.g., Original Research or Video",
      "topic": "Two Words",
      "subTopic": "Two Words",
      "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
      "labels": ["label1", "label2", "label3"],
      "inTextAPA": "...",
      "inTextHarvard": "...",
      "inTextChicago": "...",
      "bibAPA": "...",
      "bibHarvard": "...",
      "bibChicago": "..."
    }

    TEXT SNIPPET TO ANALYZE (MIGHT BE RAW DATA):
    ${truncatedSnippet}`;

    // Always using GROQ as requested for this initial analysis
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