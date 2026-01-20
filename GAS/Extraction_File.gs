/**
 * XEENAPS PKM - FILE EXTRACTION MODULE
 */

function handleFileExtraction(base64Data, mimeType, fileName) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType || 'application/octet-stream', fileName);
  return `FILE_NAME: ${fileName}\n\n` + extractTextContent(blob, mimeType);
}

/**
 * Converts various file blobs to text via temporary Drive conversion
 */
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
    
    if (appType === 'doc') {
      text = DocumentApp.openById(tempFileId).getBody().getText();
    } else if (appType === 'sheet') {
      text = SpreadsheetApp.openById(tempFileId).getSheets().map(s => s.getDataRange().getValues().map(r => r.join(" ")).join("\n")).join("\n");
    } else if (appType === 'slide') {
      text = SlidesApp.openById(tempFileId).getSlides().map(s => s.getShapes().map(sh => { 
        try { return sh.getText().asString(); } catch(e) { return ""; } 
      }).join(" ")).join("\n");
    }
    
    Drive.Files.remove(tempFileId); 
    return text;
  } catch (e) {
    if (tempFileId) { try { Drive.Files.remove(tempFileId); } catch(i) {} }
    throw new Error("Conversion failed: " + e.message);
  }
}