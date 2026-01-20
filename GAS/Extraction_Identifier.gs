/**
 * XEENAPS PKM - ACADEMIC IDENTIFIER MODULE (SMART ROUTER)
 */

function handleIdentifierSearch(idValue) {
  let val = idValue.trim();
  
  // 1. SMART DOI EXTRACTION (Handles URLs like https://doi.org/10.1186/...)
  const doiRegex = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
  const doiMatch = val.match(doiRegex);
  
  if (doiMatch) {
    return fetchCrossrefMetadata(doiMatch[0]);
  }

  // 2. ISBN DETECTION (Starts with 978 or 979, usually 13 digits)
  if (val.replace(/[-\s]/g, '').match(/^(978|979)\d{10,11}$/)) {
    return fetchOpenLibraryMetadata(val.replace(/[-\s]/g, ''));
  }

  // 3. PMID DETECTION (Digits only, usually 1-10 chars)
  if (val.match(/^\d{4,10}$/)) {
    return fetchPubMedMetadata(val);
  }

  // 4. arXiv ID DETECTION (Pattern: yymm.xxxxx)
  if (val.match(/^\d{4}\.\d{4,5}$/) || val.toLowerCase().includes('arxiv:')) {
    const arxivId = val.toLowerCase().replace('arxiv:', '').trim();
    return fetchArxivMetadata(arxivId);
  }

  // 5. BIBCODE DETECTION (19 characters, starting with 4 digits for year)
  if (val.match(/^\d{4}[A-Za-z0-9.&]{15}$/)) {
    // NASA ADS is the best for Bibcode, but often mirrors to Crossref or we can search it
    return fetchCrossrefMetadata(null, val); 
  }

  // 6. FALLBACK: Search by Title
  if (val.length > 5) {
    return fetchCrossrefMetadata(null, val);
  }

  return { status: 'error', message: 'Identifier format not recognized. Try a full DOI, PMID, ISBN, or Title.' };
}

/**
 * CROSSREF API - For Jurnal, DOI, and Title Search
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
    if (res.getResponseCode() !== 200) return { status: 'error', message: 'Crossref record not found.' };

    const data = JSON.parse(res.getContentText());
    const item = doi ? data.message : (data.message.items && data.message.items[0]);

    if (!item) return { status: 'error', message: 'No metadata found.' };

    const authors = (item.author || []).map(a => (a.given ? a.given + " " : "") + (a.family || ""));
    const journal = (item["container-title"] && item["container-title"][0]) || "";
    const publisher = item.publisher || "";
    const year = (item.issued && item.issued["date-parts"] && item.issued["date-parts"][0] && item.issued["date-parts"][0][0]) || "";
    
    // Format full date
    let fullDate = "";
    if (item.issued && item.issued["date-parts"] && item.issued["date-parts"][0]) {
      const parts = item.issued["date-parts"][0];
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (parts.length >= 3) {
        fullDate = `${parts[2].toString().padStart(2, '0')} ${months[parts[1]-1]} ${parts[0]}`;
      } else if (parts.length === 2) {
        fullDate = `${months[parts[1]-1]} ${parts[0]}`;
      } else if (parts.length === 1) {
        fullDate = `${parts[0]}`;
      }
    }

    return {
      status: 'success',
      data: {
        title: (item.title && item.title[0]) || "",
        authors: authors,
        publisher: publisher,
        journalName: journal,
        year: year.toString(),
        fullDate: fullDate,
        volume: item.volume || "",
        issue: item.issue || "",
        pages: item.page || "",
        doi: item.DOI || doi || "",
        issn: (item.ISSN && item.ISSN[0]) || "",
        isbn: (item.ISBN && item.ISBN[0]) || ""
      }
    };
  } catch (e) {
    return { status: 'error', message: 'Crossref Fetch Error: ' + e.message };
  }
}

/**
 * OPENLIBRARY API - For Books (ISBN)
 */
function fetchOpenLibraryMetadata(isbn) {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const book = data[`ISBN:${isbn}`];

    if (!book) return { status: 'error', message: 'Book not found in OpenLibrary.' };

    return {
      status: 'success',
      data: {
        title: book.title || "",
        authors: (book.authors || []).map(a => a.name),
        publisher: (book.publishers || []).map(p => p.name).join(", "),
        year: book.publish_date ? book.publish_date.match(/\d{4}/)?.[0] || "" : "",
        isbn: isbn,
        pages: book.number_of_pages ? book.number_of_pages.toString() : ""
      }
    };
  } catch (e) {
    return { status: 'error', message: 'OpenLibrary Error: ' + e.message };
  }
}

/**
 * PUBMED API (NCBI) - For PMID
 */
function fetchPubMedMetadata(pmid) {
  try {
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    const res = UrlFetchApp.fetch(summaryUrl);
    const data = JSON.parse(res.getContentText());
    const result = data.result[pmid];

    if (!result) return { status: 'error', message: 'PubMed record not found.' };

    return {
      status: 'success',
      data: {
        title: result.title || "",
        authors: (result.authors || []).map(a => a.name),
        publisher: result.source || "",
        journalName: result.fulljournalname || result.source || "",
        year: result.pubdate ? result.pubdate.split(' ')[0] : "",
        pmid: pmid,
        volume: result.volume || "",
        issue: result.issue || "",
        pages: result.pages || "",
        doi: (result.articleids || []).find(id => id.idtype === 'doi')?.value || ""
      }
    };
  } catch (e) {
    return { status: 'error', message: 'PubMed Error: ' + e.message };
  }
}

/**
 * arXiv API - For arXiv ID
 */
function fetchArxivMetadata(id) {
  try {
    const url = `https://export.arxiv.org/api/query?id_list=${id}`;
    const res = UrlFetchApp.fetch(url);
    const xml = res.getContentText();
    
    // Simple XML extraction since it's a small response
    const title = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1].replace(/\s+/g, ' ').trim() || "";
    const authors = [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1]);
    const year = xml.match(/<published>(\d{4})/)?.[1] || "";
    const doi = xml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] || "";

    return {
      status: 'success',
      data: {
        title: title,
        authors: authors,
        publisher: "arXiv",
        year: year,
        arxivId: id,
        doi: doi
      }
    };
  } catch (e) {
    return { status: 'error', message: 'arXiv Error: ' + e.message };
  }
}
