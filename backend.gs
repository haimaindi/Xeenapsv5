/**
 * XEENAPS PKM - SECURE BACKEND V33 (PIPED API + ENHANCED METADATA)
 * 1. Full Metadata Extraction (Description, Tags, Dates) via YouTube Data API v3.
 * 2. Graceful Degradation: Returns metadata for AI analysis even if audio extraction/whisper fails.
 * 3. Conditional Whisper: Only triggered if Python API returns a valid stream URL.
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

function checkYoutubeQuota() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
  const sheet = ss.getSheetByName("Collections");
  if (!sheet) return 0;
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
  
  let count = 0;
  const urlIdx = 12; // url
  const createdIdx = 15; // createdAt
  
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
    const snip = item.snippet;
    const durationISO = item.contentDetails.duration;
    
    const match = durationISO.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

    return {
      title: snip.title,
      channel: snip.channelTitle,
      description: snip.description,
      tags: snip.tags || [],
      publishedAt: snip.publishedAt,
      durationSec: totalSeconds
    };
  }
  throw new Error("Video not found via YouTube Data API.");
}

/**
 * GET OFFICIAL SUBTITLES VIA YOUTUBE API
 */
function getYoutubeOfficialCaptions(videoId) {
  try {
    const response = UrlFetchApp.fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv1`, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200 && response.getContentText().length > 100) {
      const xml = response.getContentText();
      const text = xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    }
    const responseId = UrlFetchApp.fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=id&fmt=srv1`, { muteHttpExceptions: true });
    if (responseId.getResponseCode() === 200 && responseId.getContentText().length > 100) {
      const xml = responseId.getContentText();
      const text = xml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      return text;
    }
  } catch (e) {}
  return null;
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
  throw new Error("Whisper failed: " + (json.error ? json.error.message : "No content"));
}

/**
 * HANDLE URL EXTRACTION (WITH GRACEFUL FALLBACK TO METADATA)
 */
function handleUrlExtraction(url) {
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  if (isYouTube) {
    const youtubeCount = checkYoutubeQuota();
    if (youtubeCount >= 3) throw new Error("YouTube hourly limit reached (Max 3/hour).");

    let videoId = "";
    if (url.includes('youtu.be/')) videoId = url.split('/').pop().split('?')[0];
    else { const match = url.match(/v=([^&]+)/); videoId = match ? match[1] : ""; }
    if (!videoId) throw new Error("Invalid YouTube URL.");

    // 1. Mandatory Full Metadata from YouTube API v3
    const ytInfo = getYoutubeVideoInfo(videoId);
    
    let metadataStr = `YOUTUBE_METADATA:
Title: ${ytInfo.title}
Channel: ${ytInfo.channel}
Published At: ${ytInfo.publishedAt}
Duration: ${Math.floor(ytInfo.durationSec/60)}m ${ytInfo.durationSec%60}s
Description: ${ytInfo.description}
Tags: ${ytInfo.tags.join(", ")}
`;

    // 2. Try Official Subtitles
    const officialSubs = getYoutubeOfficialCaptions(videoId);
    if (officialSubs) return metadataStr + "\nOFFICIAL CAPTIONS CONTENT:\n" + officialSubs;

    // 3. Fallback to Whisper via Piped/Invidious Vercel API
    if (ytInfo.durationSec <= 1800) { // Max 30 mins
      try {
        const vResponse = UrlFetchApp.fetch(CONFIG.PYTHON_API_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({ url: url }),
          muteHttpExceptions: true
        });
        
        // Safety check for Python API response to prevent 'line 1 column 1' error
        if (vResponse.getResponseCode() === 200) {
          const contentType = vResponse.getHeaders()['Content-Type'] || '';
          const responseText = vResponse.getContentText();
          
          if (contentType.includes('application/json') && responseText.trim().startsWith('{')) {
            const vJson = JSON.parse(responseText);
            if (vJson.status === 'success' && vJson.stream_url) {
              const audioRes = UrlFetchApp.fetch(vJson.stream_url);
              const audioBlob = audioRes.getBlob().setName("temp_" + videoId + ".m4a");
              const transcript = processGroqWhisper(audioBlob);
              return metadataStr + "\nWHISPER TRANSCRIPT CONTENT:\n" + transcript;
            }
          }
        }
      } catch (e) {
        console.warn("Audio extraction failed, using metadata context for AI analysis: " + e.toString());
      }
    }

    // 4. Return Full Metadata Only (Graceful Degradation)
    return metadataStr + "\nTRANSCRIPT_UNAVAILABLE: Please analyze item based on the description and metadata provided above.";
  }

  // Non-YouTube Logic (Drive/Web)
  const driveId = getFileIdFromUrl(url);
  if (driveId && (url.includes('drive.google.com') || url.includes('docs.google.com'))) {
    try {
      const fileMeta = Drive.Files.get(driveId);
      const mimeType = fileMeta.mimeType;
      const isNative = mimeType.includes('google-apps');
      if (isNative) {
        if (mimeType.includes('document')) return DocumentApp.openById(driveId).getBody().getText();
        if (mimeType.includes('spreadsheet')) return SpreadsheetApp.openById(driveId).getSheets().map(s => s.getDataRange().getValues().map(r => r.join(" ")).join("\n")).join("\n");
      }
      return extractTextContent(DriveApp.getFileById(driveId).getBlob(), mimeType);
    } catch (e) {}
  }

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const html = response.getContentText();
      if (!isBlocked(html)) return extractWebMetadata(html) + "\n\n" + cleanHtml(html);
    }
  } catch (e) {}

  throw new Error("All extraction methods failed.");
}

function extractWebMetadata(html) {
  let metaInfo = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) metaInfo += `WEBSITE_TITLE: ${titleMatch[1].trim()}\n`;
  return metaInfo;
}

function isBlocked(text) {
  if (!text) return true;
  if (text.includes('YOUTUBE_METADATA')) return false;
  const criticalBlocked = ["access denied", "cloudflare", "security check", "captcha"];
  const textLower = text.toLowerCase();
  return criticalBlocked.some(keyword => textLower.includes(keyword));
}

function cleanHtml(html) {
  return html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTextContent(blob, mimeType) {
  if (mimeType.includes('text/') || mimeType.includes('csv')) return blob.getDataAsString();
  const resource = { name: "Xeenaps_Ghost_" + Utilities.getUuid(), mimeType: 'application/vnd.google-apps.document' };
  try {
    const tempFile = Drive.Files.create(resource, blob);
    const text = DocumentApp.openById(tempFile.id).getBody().getText();
    Drive.Files.remove(tempFile.id); 
    return text;
  } catch (e) { throw new Error("Conversion failed."); }
}

function setupDatabase() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
    let sheet = ss.getSheetByName("Collections");
    if (!sheet) sheet = ss.insertSheet("Collections");
    sheet.getRange(1, 1, 1, CONFIG.SCHEMAS.LIBRARY.length).setValues([CONFIG.SCHEMAS.LIBRARY]);
    sheet.setFrozenRows(1);
    return { status: 'success', message: 'Ready.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getProviderModel(providerName) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.AI_CONFIG);
    const sheet = ss.getSheetByName('AI');
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
  return p === 'GEMINI' ? 'gemini-3-flash-preview' : 'meta-llama/llama-3.1-70b-instruct';
}

function handleAiRequest(provider, prompt, modelOverride) {
  const keys = (provider === 'groq') ? getKeysFromSheet('Groq', 2) : getKeysFromSheet('ApiKeys', 1);
  const config = getProviderModel(provider);
  const model = modelOverride || config.model;
  for (let i = 0; i < keys.length; i++) {
    try {
      let resText = (provider === 'groq') ? callGroqApi(keys[i], model, prompt) : callGeminiApi(keys[i], model, prompt);
      if (resText) return { status: 'success', data: resText };
    } catch (err) {}
  }
  return { status: 'error', message: 'AI failed.' };
}

function callGroqApi(apiKey, model, prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const payload = { model: model, messages: [{ role: "system", content: "Librarian. JSON." }, { role: "user", content: prompt }], temperature: 0.1, response_format: { type: "json_object" } };
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
    return sheet.getRange(2, colIndex, sheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(k => k);
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