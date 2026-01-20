/**
 * XEENAPS PKM - ACADEMIC IDENTIFIER MODULE (SMART ROUTER V3)
 * Advanced Multi-API Cascading, Robust Google Books Parsing & Date Standardization
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
    const ol = fetchOpenLibraryMetadata(cleanIsbn);
    const gb = fetchGoogleBooksMetadata(cleanIsbn, true);
    return mergeMetadata(ol, gb);
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

  // 6. FALLBACK: Search by Title (Cascading Crossref + Google Books)
  if (val.length > 5) {
    const crossrefSearch = fetchCrossrefMetadata(null, val);
    const gbSearch = fetchGoogleBooksMetadata(val, false);
    return mergeMetadata(crossrefSearch, gbSearch);
  }

  return { status: 'error', message: 'Identifier format not recognized.' };
}

/**
 * Standardized Date Parser for XEENAPS
 * Converts YYYY-MM-DD, YYYY-MM, or space separated dates to "DD MMM YYYY"
 */
function standardizeFullDate(dateStr) {
  if (!dateStr) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  try {
    // Check for YYYY-MM-DD or YYYY-MM
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      const y = parts[0];
      const m = parseInt(parts[1]);
      const d = parts[2] ? parts[2].padStart(2, '0') : "01";
      if (m >= 1 && m <= 12) return `${d} ${months[m-1]} ${y}`;
      return y;
    }
    
    // Check for space separated (e.g. "2024 Aug 15")
    if (dateStr.includes(" ")) {
      const parts = dateStr.split(" ").filter(p => p.length > 0);
      if (parts.length >= 2) {
        // Handle "YYYY MMM DD" or "YYYY MMM"
        const y = parts[0].match(/\d{4}/) ? parts[0] : parts[parts.length-1];
        const m = parts.find(p => months.includes(p)) || months[0];
        const d = parts.find(p => p.match(/^\d{1,2}$/))?.padStart(2, '0') || "01";
        return `${d} ${m} ${y}`;
      }
    }

    // Just Year
    if (dateStr.match(/^\d{4}$/)) return `01 Jan ${dateStr}`;
  } catch (e) {}
  
  return dateStr;
}

/**
 * Merges metadata from two sources, picking the most complete fields.
 */
function mergeMetadata(sourceA, sourceB) {
  if (sourceA.status !== 'success' && sourceB.status !== 'success') return sourceA;
  if (sourceA.status !== 'success') return sourceB;
  if (sourceB.status !== 'success') return sourceA;

  const a = sourceA.data;
  const b = sourceB.data;
  const merged = { ...a };

  Object.keys(b).forEach(key => {
    // If field in A is empty/short but B has better data, use B
    const valA = String(merged[key] || "");
    const valB = String(b[key] || "");
    
    if (valA.length < valB.length) {
      merged[key] = b[key];
    }
    
    // Handle Authors specifically (prefer longer array)
    if (key === 'authors' && Array.isArray(b.authors) && b.authors.length > (Array.isArray(a.authors) ? a.authors.length : 0)) {
      merged.authors = b.authors;
    }
  });

  return { status: 'success', data: merged };
}

/**
 * OPENALEX API - Powerful Crossref alternative for DOIs
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
        issn: (item.primary_location?.source?.issn && item.primary_location.source.issn[0]) || ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * GOOGLE BOOKS API - Refined for robustness
 */
function fetchGoogleBooksMetadata(query, isIsbn) {
  try {
    const q = isIsbn ? `isbn:${query}` : `intitle:${query}`;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&printType=books`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    
    if (!data.items || data.items.length === 0) return { status: 'error' };
    const book = data.items[0].volumeInfo;

    const pubDate = book.publishedDate || "";
    const year = pubDate.split('-')[0];

    return {
      status: 'success',
      data: {
        title: book.title || "",
        authors: book.authors || [],
        publisher: book.publisher || "",
        year: year,
        fullDate: standardizeFullDate(pubDate),
        isbn: (book.industryIdentifiers || []).find(id => id.type.includes('ISBN'))?.identifier || "",
        pages: book.pageCount ? book.pageCount.toString() : ""
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
      url += "?query.bibliographic=" + encodeURIComponent(queryTitle) + "&rows=1";
    }

    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { status: 'error' };

    const data = JSON.parse(res.getContentText());
    const item = doi ? data.message : (data.message.items && data.message.items[0]);
    if (!item) return { status: 'error' };

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
        isbn: (item.ISBN && item.ISBN[0]) || ""
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
        pages: book.number_of_pages ? book.number_of_pages.toString() : ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}

/**
 * PUBMED API (NCBI)
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
    
    return {
      status: 'success',
      data: {
        title: title,
        authors: authors,
        publisher: "arXiv",
        year: pubTag ? pubTag.substring(0, 4) : "",
        fullDate: standardizeFullDate(pubTag),
        arxivId: id,
        doi: xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] || ""
      }
    };
  } catch (e) { return { status: 'error' }; }
}
