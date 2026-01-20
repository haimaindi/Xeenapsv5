/**
 * XEENAPS PKM - DRIVE EXTRACTION MODULE
 */

function getFileIdFromUrl(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

function handleDriveExtraction(url, driveId) {
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
  } catch (e) { 
    console.log("Drive extraction failed: " + e.message); 
    throw e;
  }
  return "";
}