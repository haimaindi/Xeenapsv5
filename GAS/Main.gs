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
      
      try {
        if (body.url) {
          extractedText = routerUrlExtraction(body.url);
        } else if (body.fileData) {
          extractedText = handleFileExtraction(body.fileData, body.mimeType, fileName);
        }
      } catch (err) {
        extractedText = "Extraction failed: " + err.toString();
      }

      // SMART DOI DETECTION for frontend workflow
      const doiPattern = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
      const doiMatch = extractedText.match(doiPattern);

      return createJsonResponse({ 
        status: 'success', 
        extractedText: extractedText,
        fileName: fileName,
        detectedDoi: doiMatch ? doiMatch[0] : null
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