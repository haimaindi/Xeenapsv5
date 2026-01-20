/**
 * XEENAPS PKM - COLLECTION DATA LAYER
 */

function setupDatabase() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
    let sheet = ss.getSheetByName("Collections");
    if (!sheet) sheet = ss.insertSheet("Collections");
    const headers = CONFIG.SCHEMAS.LIBRARY;
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    return { status: 'success', message: 'Database "Collections" has been successfully initialized.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getAllItems(ssId, sheetName) {
  try {
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
        if (['tags', 'authors', 'keywords', 'labels'].includes(h)) { 
          try { val = JSON.parse(row[i] || '[]'); } catch(e) { val = []; } 
        }
        item[h] = val;
      });
      return item;
    });
  } catch(e) { return []; }
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