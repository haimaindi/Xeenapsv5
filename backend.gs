
/**
 * XEENAPS PKM - SECURE BACKEND V37 (FAST CONVERTER INTEGRATION)
 * Menggunakan link MP3 eksternal untuk kecepatan download maksimal.
 */

const CONFIG = {
  FOLDERS: {
    MAIN_LIBRARY: '1WG5W6KHHLhKVK-eCq1bIQYif0ZoSxh9t',
    TEMP_AUDIO: '1WG5W6KHHLhKVK-eCq1bIQYif0ZoSxh9t' 
  },
  SPREADSHEETS: {
    LIBRARY: '1NSofMlK1eENfucu2_aF-A3JRwAwTXi7QzTsuPGyFk8w',
    KEYS: '1QRzqKe42ck2HhkA-_yAGS-UHppp96go3s5oJmlrwpc0',
    AI_CONFIG: '1RVYM2-U5LRb8S8JElRSEv2ICHdlOp9pnulcAM8Nd44s'
  },
  PYTHON_API_URL: 'https://xeenaps-v1.vercel.app/api/extract',
  SCHEMAS: {
    LIBRARY: [
      'id', 'title', 'type', 'category', 'topic', 'subTopic', 'author', 'authors', 'publisher', 'year', 
      'source', 'format', 'url', 'fileId', 'tags', 'createdAt', 'updatedAt',
      'inTextAPA', 'inTextHarvard', 'inTextChicago', 'bibAPA', 'bibHarvard', 'bibChicago',
      'researchMethodology', 'abstract', 'summary', 
      'strength', 'weakness', 'unfamiliarTerminology', 'supportingReferences', 
      'videoRecommendation', 'quickTipsForYou',
      'extractedInfo1', 'extractedInfo2', 'extractedInfo3', 'extractedInfo4', 'extractedInfo5',
      'extractedInfo6', 'extractedInfo7', 'extractedInfo8', 'extractedInfo9', 'extractedInfo10'
    ]
  }
};

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getLibrary') return createJsonResponse({ status: 'success', data: getAllItems(CONFIG.SPREADSHEETS.LIBRARY, "Collections") });
    if (action === 'getAiConfig') return createJsonResponse({ status: 'success', data: getProviderModel('GEMINI') });
    return createJsonResponse({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
    console.log("Action: " + body.action);
  } catch(e) {
    return createJsonResponse({ status: 'error', message: 'Malformed JSON' });
  }
  
  const action = body.action;
  
  try {
    if (action === 'setupDatabase') return createJsonResponse(setupDatabase());
    
    if (action === 'saveItem') {
      const item = body.item;
      if (body.file && body.file.fileData) {
        const folder = DriveApp.getFolderById(CONFIG.FOLDERS.MAIN_LIBRARY);
        const blob = Utilities.newBlob(Utilities.base64Decode(body.file.fileData), body.file.mimeType, body.file.fileName);
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
      
      if (body.url) {
        extractedText = handleUrlExtraction(body.url);
      } else if (body.fileData) {
        const blob = Utilities.newBlob(Utilities.base64Decode(body.fileData), body.mimeType, fileName);
        extractedText = `FILE_NAME: ${fileName}\n\n` + extractTextContent(blob, body.mimeType);
      }

      return createJsonResponse({ 
        status: 'success', 
        extractedText: extractedText,
        fileName: fileName
      });
    }
    
    if (action === 'aiProxy') {
      return createJsonResponse(handleAiRequest(body.provider, body.prompt, body.modelOverride));
    }
    return createJsonResponse({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    console.error("Critical: " + err.toString());
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function handleUrlExtraction(url) {
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  console.log("Extracting: " + url);

  if (isYouTube) {
    let videoId = "";
    if (url.includes('youtu.be/')) videoId = url.split('/').pop().split('?')[0];
    else { const match = url.match(/v=([^&]+)/); videoId = match ? match[1] : ""; }
    
    const ytInfo = getYoutubeVideoInfo(videoId);
    let metadataStr = `YOUTUBE_METADATA:\nTitle: ${ytInfo.title}\nDescription: ${ytInfo.description}\n`;

    const officialSubs = getYoutubeOfficialCaptions(videoId);
    if (officialSubs && officialSubs.length > 300) {
      console.log("Official Subs OK.");
      return metadataStr + "\nOFFICIAL CAPTIONS:\n" + officialSubs;
    }

    console.log("Calling Vercel V37 (Fast Converter)...");
    try {
      const vResponse = UrlFetchApp.fetch(CONFIG.PYTHON_API_URL, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ url: url }),
        muteHttpExceptions: true
      });
      
      const vJson = JSON.parse(vResponse.getContentText());
      if (vJson.status === 'success' && vJson.stream_url) {
        console.log("Stream URL: " + vJson.stream_url);
        // Tambahkan timeout lebih lama untuk download audio
        const audioRes = UrlFetchApp.fetch(vJson.stream_url, { 
          followRedirects: true,
          muteHttpExceptions: true
        });
        
        if (audioRes.getResponseCode() === 200) {
          const transcript = processGroqWhisper(audioRes.getBlob());
          return metadataStr + "\nWHISPER TRANSCRIPT:\n" + transcript;
        } else {
          console.error("Failed to download audio. Code: " + audioRes.getResponseCode());
        }
      }
    } catch (e) {
      console.error("Vercel/Whisper Error: " + e.toString());
    }

    return metadataStr + "\nTRANSCRIPT_UNAVAILABLE: Analyzing via metadata only.";
  }

  // Web Scraping
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const html = response.getContentText();
    const cleanText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
                          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
                          .replace(/<[^>]*>/g, " ")
                          .replace(/\s+/g, " ")
                          .trim();
    return cleanText.substring(0, 50000);
  } catch (e) {
    return "Extraction failed: " + e.toString();
  }
}

function processGroqWhisper(audioBlob) {
  const apiKey = getKeysFromSheet('Groq', 2)[0];
  const url = "https://api.groq.com/openai/v1/audio/transcriptions";
  const boundary = "-------" + Utilities.getUuid();
  const payload = Utilities.newBlob("").getBytes()
    .concat(Utilities.newBlob("--" + boundary + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").getBytes())
    .concat(audioBlob.getBytes())
    .concat(Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes());

  const res = UrlFetchApp.fetch(url, { 
    method: "post", 
    contentType: "multipart/form-data; boundary=" + boundary, 
    payload: payload, 
    headers: { "Authorization": "Bearer " + apiKey }, 
    muteHttpExceptions: true 
  });
  return JSON.parse(res.getContentText()).text || "Whisper extraction error.";
}

function handleAiRequest(provider, prompt, modelOverride) {
  const providers = {
    'GROQ': { url: 'https://api.groq.com/openai/v1/chat/completions', sheet: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
    'GEMINI': { url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}', sheet: 'Gemini', defaultModel: 'gemini-1.5-flash' }
  };
  const config = providers[provider.toUpperCase()];
  if (!config) return { status: 'error', message: 'Unknown Provider' };
  const keys = getKeysFromSheet(config.sheet, 2);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const model = modelOverride || config.defaultModel;
  try {
    if (provider.toUpperCase() === 'GEMINI') {
      const apiUrl = config.url.replace('{model}', model).replace('{key}', key);
      const res = UrlFetchApp.fetch(apiUrl, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), muteHttpExceptions: true });
      return { status: 'success', data: JSON.parse(res.getContentText()).candidates[0].content.parts[0].text };
    } else {
      const res = UrlFetchApp.fetch(config.url, { method: 'post', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, payload: JSON.stringify({ model: model, messages: [{ role: 'user', content: prompt }], temperature: 0.1 }), muteHttpExceptions: true });
      return { status: 'success', data: JSON.parse(res.getContentText()).choices[0].message.content };
    }
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function getYoutubeVideoInfo(videoId) {
  const response = YouTube.Videos.list('snippet', { id: videoId });
  if (response.items && response.items.length > 0) {
    const snip = response.items[0].snippet;
    return { title: snip.title, description: snip.description };
  }
  return { title: "Unknown Video", description: "" };
}

function getYoutubeOfficialCaptions(videoId) {
  try {
    const response = UrlFetchApp.fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv1`, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200 && response.getContentText().length > 100) return response.getContentText().replace(/<[^>]*>/g, ' ');
  } catch (e) {}
  return null;
}

function setupDatabase() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
  let sheet = ss.getSheetByName("Collections");
  if (!sheet) {
    sheet = ss.insertSheet("Collections");
    sheet.appendRow(CONFIG.SCHEMAS.LIBRARY);
  }
  return { status: 'success', message: 'Database initialized' };
}

function extractTextContent(blob, mimeType) {
  if (mimeType === 'application/pdf') {
    const file = Drive.Files.create({ name: "temp_pdf_ocr", mimeType: "application/vnd.google-apps.document" }, blob);
    const text = DocumentApp.openById(file.id).getBody().getText();
    Drive.Files.remove(file.id);
    return text;
  }
  return blob.getDataAsString();
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getAllItems(ssId, sheetName) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return [];
  const heads = vals[0];
  return vals.slice(1).map(row => {
    let item = {};
    heads.forEach((h, i) => {
      let v = row[i];
      if (['tags', 'authors', 'keywords', 'labels'].includes(h)) { try { v = JSON.parse(v || '[]'); } catch(e) { v = []; } }
      item[h] = v;
    });
    return item;
  });
}

function saveToSheet(ssId, sheetName, item) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  const headers = CONFIG.SCHEMAS.LIBRARY;
  const row = headers.map(h => {
    const v = item[h];
    return Array.isArray(v) ? JSON.stringify(v) : (v || '');
  });
  sheet.appendRow(row);
}

function deleteFromSheet(ssId, sheetName, id) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { sheet.deleteRow(i + 1); break; }
  }
}

function getKeysFromSheet(sn, ci) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.KEYS);
    const sheet = ss.getSheetByName(sn);
    return sheet.getRange(2, ci, sheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(k => k);
  } catch (e) { return []; }
}

function getFileIdFromUrl(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}
