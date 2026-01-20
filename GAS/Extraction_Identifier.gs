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
    const crossref = fetchCrossrefMetadata(doi);
    const openAlex = fetchOpenAlexMetadata(doi);
    return mergeMetadata(crossref, openAlex);
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

  // 5. BIBCODE DETECTION (e.g., 1974AJ.....79..819H)
  if (val.match(/^\d{4}[A-Za-z0-9.&]{15}$/)) {
    // Try resolving as a query string in Crossref which handles many Bibcodes
    return fetchCrossrefMetadata(null, val); 
  }

  // 6. FALLBACK: Search by Title (Verbatim First, then Best Effort Across APIs)
  if (val.length > 5) {
    const crossrefSearch = fetchCrossrefMetadata(null, val);
    const alexSearch = searchOpenAlexByTitle(val);
    const olSearch = searchOpenLibraryByTitle(val);

    // Identify if any is a verbatim match
    const searchResults = [crossrefSearch, alexSearch, olSearch];
    const verbatimMatch = searchResults.find(r => 
      r.status === 'success' && 
      r.data.title.toLowerCase().trim() === val.toLowerCase().trim()
    );

    if (verbatimMatch) return verbatimMatch;

    // If no verbatim match, return the "Closest Match" (Best Effort)
    // Priority for scientific works: Crossref -> OpenAlex -> OpenLibrary
    if (crossrefSearch.status === 'success') return crossrefSearch;
    if (alexSearch.status === 'success') return alexSearch;
    if (olSearch.status === 'success') return olSearch;
  }

  return { status: 'error', message: 'No Data Found, please give right identifier' };
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
 * Merges metadata from two sources.
 */
function mergeMetadata(sourceA, sourceB) {
  if (sourceA.status !== 'success' && sourceB.status !== 'success') return sourceA;
  if (sourceA.status !== 'success') return sourceB;
  if (sourceB.status !== 'success') return sourceA;

  const a = sourceA.data;
  const b = sourceB.data;
  const merged = { ...a };

  Object.keys(b).forEach(key => {
    const valA = String(merged[key] || "");
    const valB = String(b[key] || "");
    if (valA.length < valB.length) {
      merged[key] = b[key];
    }
    if (key === 'authors' && Array.isArray(b.authors) && b.authors.length > (Array.isArray(a.authors) ? a.authors.length : 0)) {
      merged.authors = b.authors;
    }
  });

  return { status: 'success', data: merged };
}

/**
 * OpenAlex Inverted Index Abstract Decoder
 */
function decodeOpenAlexAbstract(index) {
  if (!index) return "";
  try {
    const words = [];
    Object.keys(index).forEach(word => {
      index[word].forEach(pos => {
        words[pos] = word;
      });
    });
    return words.join(" ").trim();
  } catch (e) { return ""; }
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
    return {
      status: 'success',
      data: {
        title: item.title || "",
        authors: (item.authorships || []).map(a => a.author.display_name),
        publisher: item.primary_location?.source?.display_name || "",
        journalName: item.primary_location?.source?.display_name || "",
        year: item.publication_year ? item.publication_year.toString() : "",
        fullDate: standardizeFullDate(item.publication_date),
        doi: item.doi ? item.doi.replace('https://doi.org/', '') : "",
        abstract: decodeOpenAlexAbstract(item.abstract_inverted_index)
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * OPENALEX API - Fallback for Journals
 */
function fetchOpenAlexMetadata(doi) {
  try {
    const url = `https://api.openalex.org/works/https://doi.org/${doi}`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { status: 'error' };

    const item = JSON.parse(res.getContentText());
    return {
      status: 'success',
      data: {
        title: item.title || "",
        authors: (item.authorships || []).map(a => a.author.display_name),
        publisher: item.primary_location?.source?.display_name || "",
        journalName: item.primary_location?.source?.display_name || "",
        year: item.publication_year ? item.publication_year.toString() : "",
        fullDate: standardizeFullDate(item.publication_date),
        volume: item.biblio?.volume || "",
        issue: item.biblio?.issue || "",
        pages: (item.biblio?.first_page && item.biblio?.last_page) ? `${item.biblio.first_page}-${item.biblio.last_page}` : (item.biblio?.first_page || ""),
        doi: doi,
        issn: (item.primary_location?.source?.issn && item.primary_location.source.issn[0]) || "",
        abstract: decodeOpenAlexAbstract(item.abstract_inverted_index)
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * CROSSREF API - Verbatim Matcher
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

    // 1. Verbatim Match first
    let selectedItem = items.find(item => {
      const title = (item.title && item.title[0]) || "";
      return title.toLowerCase().trim() === queryTitle.toLowerCase().trim();
    });

    // 2. Filter "Correction to:"
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

  return {
    status: 'success',
    data: {
      title: (item.title && item.title[0]) || "",
      authors: (item.author || []).map(a => (a.given ? a.given + " " : "") + (a.family || "")),
      publisher: item.publisher || "",
      journalName: (item["container-title"] && item["container-title"][0]) || "",
      year: (item.issued?.["date-parts"]?.[0]?.[0] || "").toString(),
      fullDate: standardizeFullDate(rawDate),
      volume: item.volume || "",
      issue: item.issue || "",
      pages: item.page || "",
      doi: item.DOI || doi || "",
      issn: (item.ISSN && item.ISSN[0]) || "",
      isbn: (item.ISBN && item.ISBN[0]) || "",
      abstract: item.abstract ? item.abstract.replace(/<[^>]*>/g, "").trim() : ""
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
        isbn: (doc.isbn || [])[0] || ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * OPENLIBRARY API (By ISBN)
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
        pages: book.number_of_pages ? book.number_of_pages.toString() : ""
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
        volume: result.volume || "",
        issue: result.issue || "",
        pages: result.pages || "",
        doi: (result.articleids || []).find(id => id.idtype === 'doi')?.value || ""
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
    const abstract = xml.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].replace(/\s+/g, ' ').trim() || "";
    
    return {
      status: 'success',
      data: {
        title: title,
        authors: authors,
        publisher: "arXiv",
        year: pubTag ? pubTag.substring(0, 4) : "",
        fullDate: standardizeFullDate(pubTag),
        arxivId: id,
        doi: xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] || "",
        abstract: abstract
      }
    };
  } catch (e) { return { status: 'error' }; }
}