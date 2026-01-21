
/**
 * XEENAPS PKM - MAIN ROUTER
 */

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getLibrary') return createJsonResponse({ status: 'success', data: getAllItems(CONFIG.SPREADSHEETS.LIBRARY, "Collections") });
    if (action === 'getAiConfig') return createJsonResponse({ status: 'success', data: getProviderModel('GEMINI') });
    return createJsonResponse({ status: 'error', message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Malformed JSON request' });
  }
  
  const action = body.action;
  
  try {
    if (action === 'setupDatabase') return createJsonResponse(setupDatabase());
    
    if (action === 'saveItem') {
      const item = body.item;
      
      // 1. Handle File Upload Logic (including ImageView for Images)
      if (body.file && body.file.fileData) {
        const folder = DriveApp.getFolderById(CONFIG.FOLDERS.MAIN_LIBRARY);
        const mimeType = body.file.mimeType || 'application/octet-stream';
        const blob = Utilities.newBlob(Utilities.base64Decode(body.file.fileData), mimeType, body.file.fileName);
        const file = folder.createFile(blob);
        const fileId = file.getId();
        item.fileId = fileId;
        
        // AUTO IMAGE VIEW: If image, set the direct link
        if (mimeType.toLowerCase().includes('image/')) {
          item.imageView = 'https://lh3.googleusercontent.com/d/' + fileId;
        }
      }

      // 2. Handle YouTube ID Logic
      if (item.url && (item.url.includes('youtube.com') || item.url.includes('youtu.be'))) {
        const ytid = extractYoutubeId(item.url);
        if (ytid) {
          item.youtubeId = 'https://www.youtube.com/embed/' + ytid;
        }
      }
      
      saveToSheet(CONFIG.SPREADSHEETS.LIBRARY, "Collections", item);
      return createJsonResponse({ status: 'success' });
    }
    
    if (action === 'deleteItem') {
      deleteFromSheet(CONFIG.SPREADSHEETS.LIBRARY, "Collections", body.id);
      return createJsonResponse({ status: 'success' });
    }
    
    if (action === 'extractOnly') {
      let extractedText = "";
      let fileName = body.fileName || "Extracted Content";
      let imageView = null;
      let detectedMime = null;
      
      try {
        if (body.url) {
          const driveId = getFileIdFromUrl(body.url);
          // Check for Drive Image specifically for imageView
          if (driveId && (body.url.includes('drive.google.com') || body.url.includes('docs.google.com'))) {
            try {
              const fileMeta = Drive.Files.get(driveId);
              detectedMime = fileMeta.mimeType;
              if (detectedMime && detectedMime.toLowerCase().includes('image/')) {
                imageView = 'https://lh3.googleusercontent.com/d/' + driveId;
              }
            } catch (e) {}
          }
          extractedText = routerUrlExtraction(body.url);
        } else if (body.fileData) {
          extractedText = handleFileExtraction(body.fileData, body.mimeType, fileName);
          detectedMime = body.mimeType;
        }
      } catch (err) {
        extractedText = "Extraction failed: " + err.toString();
      }

      // LIMIT SNIPPET TO 7500 CHARS FOR IDENTIFIER DETECTION (PREVENT REF LIST POLLUTION)
      const snippet = extractedText.substring(0, 7500);

      // SMART IDENTIFIER DETECTION
      const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
      const isbnPattern = /(?:ISBN(?:-1[03])?:?\s*)?(?=[0-9X\s-]{10,17}$)(?:97[89][\s-]?)?[0-9]{1,5}[\s-]?[0-9]+[\s-]?[0-9]+[\s-]?[0-9X]/i;
      const pmidPattern = /PMID:?\s*(\d{4,10})/i;
      const arxivPattern = /arXiv:?\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i;

      const doiMatch = snippet.match(doiPattern);
      const isbnMatch = snippet.match(isbnPattern);
      const pmidMatch = snippet.match(pmidPattern);
      const arxivMatch = snippet.match(arxivPattern);

      return createJsonResponse({ 
        status: 'success', 
        extractedText: extractedText,
        fileName: fileName,
        mimeType: detectedMime,
        detectedDoi: doiMatch ? doiMatch[0] : null,
        detectedIsbn: isbnMatch ? isbnMatch[0] : null,
        detectedPmid: pmidMatch ? (pmidMatch[1] || pmidMatch[0]) : null,
        detectedArxiv: arxivMatch ? (arxivMatch[1] || arxivMatch[0]) : null,
        imageView: imageView
      });
    }

    if (action === 'searchByIdentifier') {
      return createJsonResponse(handleIdentifierSearch(body.idValue));
    }
    
    if (action === 'aiProxy') {
      const { provider, prompt, modelOverride } = body;
      const result = handleAiRequest(provider, prompt, modelOverride);
      return createJsonResponse(result);
    }
    return createJsonResponse({ status: 'error', message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function extractYoutubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function routerUrlExtraction(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return handleYoutubeExtraction(url);
  }
  const driveId = getFileIdFromUrl(url);
  if (driveId && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
    return handleDriveExtraction(url, driveId);
  }
  return handleWebExtraction(url);
}

function handleAiRequest(provider, prompt, modelOverride) {
  if (provider === 'groq') {
    return callGroqLibrarian(prompt, modelOverride);
  } else {
    return callGeminiService(prompt, modelOverride);
  }
}
