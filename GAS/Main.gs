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
      if (body.file && body.file.fileData) {
        const folder = DriveApp.getFolderById(CONFIG.FOLDERS.MAIN_LIBRARY);
        const mimeType = body.file.mimeType || 'application/octet-stream';
        const blob = Utilities.newBlob(Utilities.base64Decode(body.file.fileData), mimeType, body.file.fileName);
        const file = folder.createFile(blob);
        item.fileId = file.getId();
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

      return createJsonResponse({ 
        status: 'success', 
        extractedText: extractedText,
        fileName: fileName
      });
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

/**
 * Routes URL extraction to specific modules based on URL patterns
 */
function routerUrlExtraction(url) {
  // 1. YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return handleYoutubeExtraction(url);
  }
  
  // 2. Google Drive / Docs
  const driveId = getFileIdFromUrl(url);
  if (driveId && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
    return handleDriveExtraction(url, driveId);
  }
  
  // 3. Web (Default Generic Scraper)
  return handleWebExtraction(url);
}

/**
 * Master handler for AI requests switching between providers
 */
function handleAiRequest(provider, prompt, modelOverride) {
  if (provider === 'groq') {
    return callGroqLibrarian(prompt, modelOverride);
  } else {
    return callGeminiService(prompt, modelOverride);
  }
}