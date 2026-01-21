
/**
 * XEENAPS PKM - ACADEMIC IDENTIFIER MODULE (SMART ROUTER V6)
 * Exclusive OpenLibrary for Books, Crossref/OpenAlex for Journals
 * Improved "Closest Match" logic and Bibcode resolution
 */

function handleIdentifierSearch(idValue) {
  let val = idValue.trim();
  if (!val) return { status: 'error', message: 'Empty input.' };
  
  // 1. SMART DOI EXTRACTION
  const doiRegex = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
  const doiMatch = val.match(doiRegex);
  
  if (doiMatch) {
    const doi = doiMatch[0];
    
    // Sequential Flow: Call OpenAlex First
    let alexResult = fetchOpenAlexMetadata(doi);
    
    // Check if we need more technical details (Crossref is authority for metadata)
    let crossrefResult = fetchCrossrefMetadata(doi);
    
    // Compare and Merge (Smart Merge)
    return mergeMetadata(alexResult, crossrefResult);
  }

  // 2. ISBN DETECTION
  const cleanIsbn = val.replace(/[-\s]/g, '');
  if (cleanIsbn.match(/^(978|979)\d{10,11}$/) || (cleanIsbn.length === 10 && cleanIsbn.match(/^\d{9}[\dXx]$/))) {
    return fetchOpenLibraryMetadata(cleanIsbn);
  }

  // 3. PMID DETECTION
  if (val.match(/^\d{4,10}$/)) {
    return fetchPubMedMetadata(val);
  }

  // 4. arXiv ID DETECTION
  if (val.match(/^\d{4}\.\d{4,5}$/) || val.toLowerCase().includes('arxiv:')) {
    const arxivId = val.toLowerCase().replace('arxiv:', '').trim();
    return fetchArxivMetadata(arxivId);
  }

  // 5. BIBCODE DETECTION
  if (val.match(/^\d{4}[A-Za-z0-9.&]{15}$/)) {
    return fetchCrossrefMetadata(null, val); 
  }

  // 6. FALLBACK: Search by Title
  if (val.length > 5) {
    const crossrefSearch = fetchCrossrefMetadata(null, val);
    const alexSearch = searchOpenAlexByTitle(val);
    const olSearch = searchOpenLibraryByTitle(val);

    const searchResults = [crossrefSearch, alexSearch, olSearch];
    const verbatimMatch = searchResults.find(r => 
      r.status === 'success' && 
      r.data.title.toLowerCase().trim() === val.toLowerCase().trim()
    );

    if (verbatimMatch) return verbatimMatch;

    if (crossrefSearch.status === 'success') return crossrefSearch;
    if (alexSearch.status === 'success') return alexSearch;
    if (olSearch.status === 'success') return olSearch;
  }

  return { status: 'error', message: 'No Data Found, please give right identifier' };
}

/**
 * Helper to sanitize numeric fields (Volume, Issue, Pages)
 */
function sanitizeNumericValue(val) {
  if (!val || typeof val !== 'string') return val;
  return val.replace(/^(vol\.?|volume|no\.?|issue|pages?|pp\.?)\s+/i, '').trim();
}

/**
 * Standardized Date Parser for XEENAPS
 */
function standardizeFullDate(dateStr) {
  if (!dateStr) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  try {
    const s = dateStr.toString().trim();
    if (s.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
      const parts = s.split("-");
      const mIdx = parseInt(parts[1]) - 1;
      return `${parts[2].padStart(2, '0')} ${months[mIdx] || 'Jan'} ${parts[0]}`;
    }
    if (s.match(/^\d{4}$/)) return `01 Jan ${s}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
  } catch (e) {}
  return dateStr;
}

/**
 * Smart Merge Algorithm (Sequential Priority)
 * FOCUS: Technical metadata only. Abstract is handled by AI later.
 */
function mergeMetadata(sourceAlex, sourceCrossref) {
  if (sourceAlex.status !== 'success' && sourceCrossref.status !== 'success') return sourceAlex;
  if (sourceAlex.status !== 'success') return sourceCrossref;
  if (sourceCrossref.status !== 'success') return sourceAlex;

  const a = sourceAlex.data;
  const c = sourceCrossref.data;
  const merged = { ...a };

  const technicalKeys = ['publisher', 'journalName', 'volume', 'issue', 'pages', 'year', 'fullDate', 'issn', 'isbn', 'url'];
  technicalKeys.forEach(key => {
    if (c[key] && String(c[key]).length > 0) {
      merged[key] = c[key];
    }
  });

  // Ensure abstract is always empty for AI processing
  merged.abstract = "";

  const aAuthors = Array.isArray(a.authors) ? a.authors : [];
  const cAuthors = Array.isArray(c.authors) ? c.authors : [];
  if (cAuthors.length >= aAuthors.length) {
    merged.authors = cAuthors;
  }

  // Ensure canonical URL is present for scraping
  if (!merged.url && merged.doi) {
    merged.url = `https://doi.org/${merged.doi}`;
  }

  return { status: 'success', data: merged };
}

/**
 * OPENALEX SEARCH BY TITLE
 */
function searchOpenAlexByTitle(title) {
  try {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(title)}&per_page=1`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { status: 'error' };

    const data = JSON.parse(res.getContentText());
    if (!data.results || data.results.length === 0) return { status: 'error' };

    const item = data.results[0];
    const source = item.primary_location?.source;
    
    return {
      status: 'success',
      data: {
        title: item.title || "",
        authors: (item.authorships || []).map(a => a.author.display_name),
        publisher: source?.host_organization_name || source?.publisher || source?.display_name || "",
        journalName: source?.display_name || "",
        year: item.publication_year ? item.publication_year.toString() : "",
        fullDate: standardizeFullDate(item.publication_date),
        doi: item.doi ? item.doi.replace('https://doi.org/', '') : "",
        url: item.doi || "",
        abstract: "" // Delegated to AI
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * OPENALEX API
 */
function fetchOpenAlexMetadata(doi) {
  try {
    const url = `https://api.openalex.org/works/https://doi.org/${doi}`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { status: 'error' };

    const item = JSON.parse(res.getContentText());
    const source = item.primary_location?.source;

    return {
      status: 'success',
      data: {
        title: item.title || "",
        authors: (item.authorships || []).map(a => a.author.display_name),
        publisher: source?.host_organization_name || source?.publisher || source?.display_name || "",
        journalName: source?.display_name || "",
        year: item.publication_year ? item.publication_year.toString() : "",
        fullDate: standardizeFullDate(item.publication_date),
        volume: sanitizeNumericValue(item.biblio?.volume || ""),
        issue: sanitizeNumericValue(item.biblio?.issue || ""),
        pages: sanitizeNumericValue((item.biblio?.first_page && item.biblio?.last_page) ? `${item.biblio.first_page}-${item.biblio.last_page}` : (item.biblio?.first_page || "")),
        doi: doi,
        url: `https://doi.org/${doi}`,
        issn: (source?.issn && source.issn[0]) || "",
        abstract: "" // Delegated to AI
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * CROSSREF API
 */
function fetchCrossrefMetadata(doi, queryTitle) {
  try {
    let url = "https://api.crossref.org/works/";
    if (doi) {
      url += encodeURIComponent(doi);
    } else {
      url += "?query.bibliographic=" + encodeURIComponent(queryTitle) + "&rows=5";
    }

    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { status: 'error' };

    const data = JSON.parse(res.getContentText());
    if (doi) {
      return parseCrossrefItem(data.message, doi);
    }

    const items = data.message.items || [];
    if (items.length === 0) return { status: 'error' };

    let selectedItem = items.find(item => {
      const title = (item.title && item.title[0]) || "";
      return title.toLowerCase().trim() === queryTitle.toLowerCase().trim();
    });

    if (!selectedItem) {
      selectedItem = items.find(item => {
        const title = (item.title && item.title[0]) || "";
        return !title.toLowerCase().startsWith("correction to:");
      });
    }

    if (!selectedItem) selectedItem = items[0];
    return parseCrossrefItem(selectedItem, null);
  } catch (e) { return { status: 'error' }; }
}

function parseCrossrefItem(item, doi) {
  let rawDate = "";
  if (item.issued && item.issued["date-parts"] && item.issued["date-parts"][0]) {
    const p = item.issued["date-parts"][0];
    rawDate = p.length === 3 ? `${p[0]}-${p[1]}-${p[2]}` : (p.length === 2 ? `${p[0]}-${p[1]}` : `${p[0]}`);
  }

  const finalDoi = item.DOI || doi || "";

  return {
    status: 'success',
    data: {
      title: (item.title && item.title[0]) || "",
      authors: (item.author || []).map(a => (a.given ? a.given + " " : "") + (a.family || "")),
      publisher: item.publisher || "",
      journalName: (item["container-title"] && item["container-title"][0]) || "",
      year: (item.issued?.["date-parts"]?.[0]?.[0] || "").toString(),
      fullDate: standardizeFullDate(rawDate),
      volume: sanitizeNumericValue(item.volume || ""),
      issue: sanitizeNumericValue(item.issue || ""),
      pages: sanitizeNumericValue(item.page || ""),
      doi: finalDoi,
      url: finalDoi ? `https://doi.org/${finalDoi}` : (item.URL || ""),
      issn: (item.ISSN && item.ISSN[0]) || "",
      isbn: (item.ISBN && item.ISBN[0]) || "",
      abstract: "" // Delegated to AI
    }
  };
}

/**
 * OPENLIBRARY SEARCH BY TITLE
 */
function searchOpenLibraryByTitle(title) {
  try {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    
    if (!data.docs || data.docs.length === 0) return { status: 'error' };

    const doc = data.docs.find(d => !(d.title || "").toLowerCase().startsWith("correction to:")) || data.docs[0];
    
    if (doc.isbn && doc.isbn.length > 0) {
      return fetchOpenLibraryMetadata(doc.isbn[0]);
    }

    return {
      status: 'success',
      data: {
        title: doc.title || "",
        authors: doc.author_name || [],
        publisher: (doc.publisher || [])[0] || "",
        year: (doc.first_publish_year || "").toString(),
        fullDate: doc.first_publish_year ? `01 Jan ${doc.first_publish_year}` : "",
        isbn: (doc.isbn || [])[0] || "",
        url: doc.key ? `https://openlibrary.org${doc.key}` : "",
        abstract: ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * OPENLIBRARY API
 */
function fetchOpenLibraryMetadata(isbn) {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const book = data[`ISBN:${isbn}`];

    if (!book) return { status: 'error' };

    return {
      status: 'success',
      data: {
        title: book.title || "",
        authors: (book.authors || []).map(a => a.name),
        publisher: (book.publishers || []).map(p => p.name).join(", "),
        year: book.publish_date ? book.publish_date.match(/\d{4}/)?.[0] || "" : "",
        fullDate: standardizeFullDate(book.publish_date),
        isbn: isbn,
        url: book.url || `https://openlibrary.org/isbn/${isbn}`,
        pages: sanitizeNumericValue(book.number_of_pages ? book.number_of_pages.toString() : ""),
        abstract: ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * PUBMED API
 */
function fetchPubMedMetadata(pmid) {
  try {
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    const res = UrlFetchApp.fetch(summaryUrl);
    const data = JSON.parse(res.getContentText());
    const result = data.result[pmid];
    if (!result) return { status: 'error' };

    const doiFound = (result.articleids || []).find(id => id.idtype === 'doi')?.value || "";

    return {
      status: 'success',
      data: {
        title: result.title || "",
        authors: (result.authors || []).map(a => a.name),
        publisher: result.source || "",
        journalName: result.fulljournalname || result.source || "",
        year: result.pubdate ? result.pubdate.split(' ')[0] : "",
        fullDate: standardizeFullDate(result.pubdate),
        pmid: pmid,
        volume: sanitizeNumericValue(result.volume || ""),
        issue: sanitizeNumericValue(result.issue || ""),
        pages: sanitizeNumericValue(result.pages || ""),
        doi: doiFound,
        url: doiFound ? `https://doi.org/${doiFound}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        abstract: ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * arXiv API
 */
function fetchArxivMetadata(id) {
  try {
    const url = `https://export.arxiv.org/api/query?id_list=${id}`;
    const res = UrlFetchApp.fetch(url);
    const xml = res.getContentText();
    
    const title = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1].replace(/\s+/g, ' ').trim() || "";
    const authors = [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1]);
    const pubTag = xml.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "";
    const doiFound = xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] || "";

    return {
      status: 'success',
      data: {
        title: title,
        authors: authors,
        publisher: "arXiv",
        year: pubTag ? pubTag.substring(0, 4) : "",
        fullDate: standardizeFullDate(pubTag),
        arxivId: id,
        doi: doiFound,
        url: doiFound ? `https://doi.org/${doiFound}` : `https://arxiv.org/abs/${id}`,
        abstract: "" // AI will extract from snippet
      }
    };
  } catch (e) { return { status: 'error' }; }
}
