/**
 * XEENAPS PKM - SECURE BACKEND V31 (YOUTUBE DATA API + WHISPER INTEGRATION)
 * 1. YouTube Data API v3 for official metadata & duration.
 * 2. Hourly Quota: Max 3 YouTube registrations per hour.
 * 3. Max Duration: 30 minutes for Whisper processing.
 * 4. Groq Whisper: Transcribes audio downloaded via temporary Drive buffer.
 */

const CONFIG = {
  FOLDERS: {
    MAIN_LIBRARY: '1WG5W6KHHLhKVK-eCq1bIQYif0ZoSxh9t',
    TEMP_AUDIO: '1WG5W6KHHLhKVK-eCq1bIQYif0ZoSxh9t' // Using same root or specific temp folder
  },
  SPREADSHEETS: {
    LIBRARY: '1NSofMlK1eENfucu2_aF-A3JRwAwTXi7QzTsuPGyFk8w',
    KEYS: '1QRzqKe42ck2HhkA-_yAGS-UHppp96go3s5oJmlrwpc0',
    AI_CONFIG: '1RVYM2-U5LRb8S8JElRSEv2ICHdlOp9pnulcAM8Nd44s'
  },
  PYTHON_API_URL: 'https://xeenaps-v1.vercel.app/api/extract', // Vercel returns Direct Audio URL
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
          extractedText = handleUrlExtraction(body.url);
        } else if (body.fileData) {
          const mimeType = body.mimeType || 'application/octet-stream';
          const blob = Utilities.newBlob(Utilities.base64Decode(body.fileData), mimeType, fileName);
          extractedText = `FILE_NAME: ${fileName}\n\n` + extractTextContent(blob, mimeType);
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
 * HOURLY QUOTA CHECK
 * Scans the database for YouTube entries in the last 60 minutes.
 */
function checkYoutubeQuota() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
  const sheet = ss.getSheetByName("Collections");
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
  
  let count = 0;
  // Assuming 'url' is at index 12 and 'createdAt' is at index 15 based on SCHEMAS
  const urlIdx = 12;
  const createdIdx = 15;
  
  for (let i = 1; i < data.length; i++) {
    const url = data[i][urlIdx] ? data[i][urlIdx].toString() : "";
    const createdAt = new Date(data[i][createdIdx]);
    
    if ((url.includes("youtube.com") || url.includes("youtu.be")) && createdAt > oneHourAgo) {
      count++;
    }
  }
  return count;
}

/**
 * GET YOUTUBE METADATA VIA OFFICIAL API
 */
function getYoutubeVideoInfo(videoId) {
  const response = YouTube.Videos.list('snippet,contentDetails', { id: videoId });
  if (response.items && response.items.length > 0) {
    const item = response.items[0];
    const durationISO = item.contentDetails.duration; // e.g. PT15M33S
    
    // Convert ISO 8601 duration to seconds
    const match = durationISO.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

    return {
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      durationSec: totalSeconds,
      publishedAt: item.snippet.publishedAt
    };
  }
  throw new Error("Video not found via YouTube Data API.");
}

/**
 * EXTRACT AUDIO TRANSCRIPT VIA GROQ WHISPER
 */
function processGroqWhisper(audioBlob) {
  const apiKey = getKeysFromSheet('Groq', 2)[0];
  const model = getProviderModel('Whisper').model || 'whisper-large-v3';
  if (!apiKey) throw new Error("Groq API Key missing for Whisper.");

  const url = "https://api.groq.com/openai/v1/audio/transcriptions";
  
  const boundary = "-------" + Utilities.getUuid();
  const header = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n" + model + "\r\n" +
                 "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"audio.m4a\"\r\nContent-Type: audio/mpeg\r\n\r\n";
  const footer = "\r\n--" + boundary + "--\r\n";
  
  const requestBody = Utilities.newBlob("").getBytes()
    .concat(Utilities.newBlob(header).getBytes())
    .concat(audioBlob.getBytes())
    .concat(Utilities.newBlob(footer).getBytes());

  const options = {
    method: "post",
    contentType: "multipart/form-data; boundary=" + boundary,
    payload: requestBody,
    muteHttpExceptions: true,
    headers: { "Authorization": "Bearer " + apiKey }
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());
  if (json.text) return json.text;
  throw new Error("Whisper extraction failed: " + (json.error ? json.error.message : "Unknown error"));
}

/**
 * OPTIMIZED handleUrlExtraction
 */
function handleUrlExtraction(url) {
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (isYouTube) {
    // 1. Check Hourly Quota
    const youtubeCount = checkYoutubeQuota();
    if (youtubeCount >= 3) {
      throw new Error("YouTube hourly limit reached (Max 3 registrations per hour). Please try again later.");
    }

    // 2. Extract Video ID
    let videoId = "";
    if (url.includes('youtu.be/')) {
      videoId = url.split('/').pop().split('?')[0];
    } else {
      const match = url.match(/v=([^&]+)/);
      videoId = match ? match[1] : "";
    }
    if (!videoId) throw new Error("Invalid YouTube URL.");

    // 3. Get Official Metadata & Validate Duration (30 mins = 1800s)
    const ytInfo = getYoutubeVideoInfo(videoId);
    if (ytInfo.durationSec > 1800) {
      throw new Error("Video too long (Max 30 minutes for AI processing).");
    }

    // 4. Get Direct Audio Stream URL from Vercel Python (yt-dlp)
    const vResponse = UrlFetchApp.fetch(CONFIG.PYTHON_API_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ url: url }),
      muteHttpExceptions: true
    });
    
    const vJson = JSON.parse(vResponse.getContentText());
    if (vJson.status !== 'success' || !vJson.stream_url) {
      throw new Error("Failed to extract audio stream from YouTube.");
    }

    // 5. Download Audio to Temp Buffer in Drive
    let tempFile = null;
    try {
      const audioRes = UrlFetchApp.fetch(vJson.stream_url);
      const audioBlob = audioRes.getBlob().setName("xeenaps_temp_" + videoId + ".m4a");
      
      // We don't necessarily NEED to save to drive if we have the blob,
      // but for reliability with large files we can. For Groq Whisper, blob is fine.
      
      // 6. Send to Groq Whisper
      const transcript = processGroqWhisper(audioBlob);
      
      const metadataStr = `YOUTUBE_METADATA:\nTitle: ${ytInfo.title}\nChannel: ${ytInfo.channel}\nDuration: ${Math.floor(ytInfo.durationSec/60)}m ${ytInfo.durationSec%60}s\n`;
      return metadataStr + "\nTRANSCRIPT CONTENT:\n" + transcript;
    } finally {
      // Cleanup happens automatically if we don't save to a file
    }
  }

  // LAYER 1: Google Drive / Docs (Non-YouTube)
  const driveId = getFileIdFromUrl(url);
  if (driveId && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
    try {
      const fileMeta = Drive.Files.get(driveId);
      const mimeType = fileMeta.mimeType;
      const isNative = mimeType.includes('google-apps');
      
      let rawContent = "";
      if (isNative) {
        if (mimeType.includes('document')) {
          rawContent = DocumentApp.openById(driveId).getBody().getText();
        } else if (mimeType.includes('spreadsheet')) {
          rawContent = SpreadsheetApp.openById(driveId).getSheets().map(s => s.getDataRange().getValues().map(r => r.join(" ")).join("\n")).join("\n");
        } else if (mimeType.includes('presentation')) {
          rawContent = SlidesApp.openById(driveId).getSlides().map(s => s.getShapes().map(sh => { 
            try { return sh.getText().asString(); } catch(e) { return ""; } 
          }).join(" ")).join("\n");
        }
      } else {
        const blob = DriveApp.getFileById(driveId).getBlob();
        rawContent = extractTextContent(blob, mimeType);
      }
      
      if (rawContent && rawContent.trim().length > 10) return rawContent;
    } catch (e) { console.log("Drive failed: " + e.message); }
  }

  // LAYER 2: Native Fetch (Wikipedia, etc.)
  let nativeContent = "";
  try {
    const response = UrlFetchApp.fetch(url, { 
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    });
    
    if (response.getResponseCode() === 200) {
      const html = response.getContentText();
      if (!isBlocked(html)) {
        const metadata = extractWebMetadata(html);
        const body = cleanHtml(html);
        nativeContent = metadata + "\n\n" + body;
        if (body.length > 200) return nativeContent;
      }
    }
  } catch (e) {}

  throw new Error("All extraction methods failed for this URL.");
}

function extractWebMetadata(html) {
  let metaInfo = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) metaInfo += `WEBSITE_TITLE: ${titleMatch[1].trim()}\n`;
  const authorMatch = html.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);
  if (authorMatch) metaInfo += `WEBSITE_AUTHOR: ${authorMatch[1].trim()}\n`;
  const siteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (siteMatch) metaInfo += `WEBSITE_PUBLISHER: ${siteMatch[1].trim()}\n`;
  return metaInfo;
}

function isBlocked(text) {
  if (!text) return true;
  if (text.includes('YOUTUBE_METADATA')) return false;
  if (text.length < 200) return true;
  const criticalBlocked = ["access denied", "cloudflare", "security check", "captcha", "bot detection", "robot check"];
  const textLower = text.toLowerCase();
  return criticalBlocked.some(keyword => textLower.includes(keyword));
}

function cleanHtml(html) {
  return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "")
             .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")
             .replace(/<[^>]*>/g, " ")
             .replace(/\s+/g, " ")
             .trim();
}

function extractTextContent(blob, mimeType) {
  if (mimeType.includes('text/') || mimeType.includes('csv')) return blob.getDataAsString();
  let targetMimeType = 'application/vnd.google-apps.document';
  let appType = 'doc';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    targetMimeType = 'application/vnd.google-apps.spreadsheet';
    appType = 'sheet';
  } else if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    targetMimeType = 'application/vnd.google-apps.presentation';
    appType = 'slide';
  }
  const resource = { name: "Xeenaps_Ghost_" + Utilities.getUuid(), mimeType: targetMimeType };
  let tempFileId = null;
  try {
    const tempFile = Drive.Files.create(resource, blob);
    tempFileId = tempFile.id;
    let text = "";
    if (appType === 'doc') text = DocumentApp.openById(tempFileId).getBody().getText();
    else if (appType === 'sheet') text = SpreadsheetApp.openById(tempFileId).getSheets().map(s => s.getDataRange().getValues().map(r => r.join(" ")).join("\n")).join("\n");
    else if (appType === 'slide') text = SlidesApp.openById(tempFileId).getSlides().map(s => s.getShapes().map(sh => { try { return sh.getText().asString(); } catch(e) { return ""; } }).join(" ")).join("\n");
    Drive.Files.remove(tempFileId); 
    return text;
  } catch (e) {
    if (tempFileId) try { Drive.Files.remove(tempFileId); } catch(i) {}
    throw new Error("Conversion failed: " + e.message);
  }
}

function setupDatabase() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
    let sheet = ss.getSheetByName("Collections");
    if (!sheet) sheet = ss.insertSheet("Collections");
    const headers = CONFIG.SCHEMAS.LIBRARY;
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    return { status: 'success', message: 'Database initialized.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getProviderModel(providerName) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.AI_CONFIG);
    const sheet = ss.getSheetByName('AI');
    if (!sheet) return { model: getDefaultModel(providerName) };
    const data = sheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toUpperCase() === providerName.toUpperCase()) {
        return { model: data[i][1] ? data[i][1].trim() : getDefaultModel(providerName) };
      }
    }
  } catch (e) {}
  return { model: getDefaultModel(providerName) };
}

function getDefaultModel(provider) {
  const p = provider.toUpperCase();
  if (p === 'WHISPER') return 'whisper-large-v3';
  return p === 'GEMINI' ? 'gemini-3-flash-preview' : 'meta-llama/llama-4-scout-17b-16e-instruct';
}

function handleAiRequest(provider, prompt, modelOverride) {
  const keys = (provider === 'groq') ? getKeysFromSheet('Groq', 2) : getKeysFromSheet('ApiKeys', 1);
  if (!keys || keys.length === 0) return { status: 'error', message: 'No keys.' };
  const config = getProviderModel(provider);
  const model = modelOverride || config.model;
  for (let i = 0; i < keys.length; i++) {
    try {
      let responseText = (provider === 'groq') ? callGroqApi(keys[i], model, prompt) : callGeminiApi(keys[i], model, prompt);
      if (responseText) return { status: 'success', data: responseText };
    } catch (err) {}
  }
  return { status: 'error', message: 'AI failed.' };
}

function callGroqApi(apiKey, model, prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const payload = { model: model, messages: [{ role: "system", content: "Academic librarian. JSON." }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } };
  const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", headers: { "Authorization": "Bearer " + apiKey }, payload: JSON.stringify(payload), muteHttpExceptions: true });
  return JSON.parse(res.getContentText()).choices[0].message.content;
}

function callGeminiApi(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  const res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true });
  return JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
}

function getKeysFromSheet(sheetName, colIndex) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.KEYS);
    const sheet = ss.getSheetByName(sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().map(r => r[0]).filter(k => k);
  } catch (e) { return []; }
}

function getAllItems(ssId, sheetName) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    let item = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (['tags', 'authors', 'keywords', 'labels'].includes(h)) { try { val = JSON.parse(row[i] || '[]'); } catch(e) { val = []; } }
      item[h] = val;
    });
    return item;
  });
}

function saveToSheet(ssId, sheetName, item) {
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) { setupDatabase(); sheet = ss.getSheetByName(sheetName); }
  const headers = CONFIG.SCHEMAS.LIBRARY;
  const rowData = headers.map(h => {
    const val = item[h];
    return (Array.isArray(val) || (typeof val === 'object' && val !== null)) ? JSON.stringify(val) : (val || '');
  });
  sheet.appendRow(rowData);
}

function deleteFromSheet(ssId, sheetName, id) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { sheet.deleteRow(i + 1); break; }
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getFileIdFromUrl(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}