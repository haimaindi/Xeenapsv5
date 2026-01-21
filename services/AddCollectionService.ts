
import { LibraryItem } from "../types";
import { callAiProxy } from "./gasService";

/**
 * AddCollectionService - Metadata Extraction via AI Proxy (GROQ).
 * FOCUS: Verbatim abstract extraction, Parenthetical Harvard citations, and mandatory classification enrichment.
 * IMPORTANT: This service acts ONLY as a Librarian. It does NOT fill Insight fields (Summary, Strength, etc.).
 */
export const extractMetadataWithAI = async (textSnippet: string, existingData: Partial<LibraryItem> = {}): Promise<Partial<LibraryItem>> => {
  try {
    const truncatedSnippet = textSnippet.substring(0, 7500);

    const categories = [
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

    const prompt = `ACT AS AN EXPERT SENIOR ACADEMIC LIBRARIAN (XEENAPS AI LIBRARIAN). 
    YOUR TASK IS TO ORGANIZE AND CLEAN THE METADATA FOR A LIBRARY ENTRY BASED ON THE PROVIDED TEXT.

    --- MANDATORY WORKFLOW ---
    1. LIBRARIAN ROLE: Identify Title, Authors, Publisher, Year, and technical identifiers.
    2. GAP-FILLING: Use "EXISTING_DATA" as core facts. Fill ONLY fields that are empty ("") or "N/A".
    3. MANDATORY CLASSIFICATION (CRITICAL):
       - KEYWORDS: You MUST provide EXACTLY 5 relevant keywords.
       - LABELS: You MUST provide EXACTLY 3 thematic labels.
       - TOPIC & SUBTOPIC: You MUST determine a high-level Topic and a specific Sub-Topic.
       - CATEGORY: You HAVE TO choose ONLY ONE category from the APPROVED LIST provided below that BEST SUIT based on data that is given to you.
    4. YOUTUBE SPECIAL HANDLING (CRITICAL):
       - If the TEXT SNIPPET contains "YOUTUBE_METADATA:", you MUST:
         * Set "publisher" to "Youtube" verbatim.
         * Set "category" to "Video" verbatim.
         * Extract the Channel name and put it as the ONLY entry in the "authors" array.
         * Extract the upload date to fill "year" (YYYY) and "fullDate" (DD MMM YYYY).
    5. VERBATIM ABSTRACT (CRITICAL):
       - EXTRACT the abstract exactly as written in the "TEXT SNIPPET". 
       - DO NOT SUMMARIZE OR PARAPHRASE.
       - FORMATTING: Use <b> tag for sub-headers and <br/> for line breaks.
       - EMPHASIS: Use <b><i> tags for key findings.
    6. CITATION GENERATION: Accuratelu user Harvard style.
    7. STRICT RESTRICTION: DO NOT fill "summary", "strength", "weakness", "researchMethodology", "unfamiliarTerminology", "supportingReferences", "videoRecommendation", or "quickTipsForYou".
    --------------------------

    APPROVED CATEGORY LIST:
    ${categories.join(", ")}

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
      "category": "Must be from the Approved List and best suit based on data that is given to you",
      "topic": "General Topic",
      "subTopic": "Specific Sub-Topic",
      "abstract": "HTML formatted verbatim abstract",
      "keywords": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "labels": ["label1", "label2", "label3"],
      "inTextHarvard": "Generate a parenthetical Harvard in-text citation. For 1-2 authors, list all names (e.g., '(Author1 & Author2, 2024)'). For 3 or more authors, use 'et al.' after the first author (e.g., '(Author1 et al., 2024)'). Ensure no italics for 'et al.' unless specified.",
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
