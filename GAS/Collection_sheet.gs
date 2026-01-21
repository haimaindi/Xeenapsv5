
/**
 * XEENAPS PKM - COLLECTION DATA LAYER (PRO SCALABLE VERSION)
 */

function setupDatabase() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
    let sheet = ss.getSheetByName("Collections");
    if (!sheet) {
      sheet = ss.insertSheet("Collections");
      const headers = CONFIG.SCHEMAS.LIBRARY;
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
    }
    return { status: 'success', message: 'Database initialized.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function getLibraryPaged(params) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEETS.LIBRARY);
    const sheet = ss.getSheetByName("Collections");
    if (!sheet) return { items: [], totalCount: 0 };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { items: [], totalCount: 0 };

    const headers = data[0];
    let items = data.slice(1).map(row => {
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

    // 1. FILTERING
    if (params.search) {
      const query = params.search.toLowerCase();
      items = items.filter(item => 
        (item.title && item.title.toLowerCase().includes(query)) ||
        (item.author && item.author.toLowerCase().includes(query)) ||
        (item.topic && item.topic.toLowerCase().includes(query)) ||
        (item.category && item.category.toLowerCase().includes(query))
      );
    }

    if (params.type) items = items.filter(item => item.type === params.type);
    if (params.isFavorite === 'true') items = items.filter(item => item.isFavorite === true);
    if (params.isBookmarked === 'true') items = items.filter(item => item.isBookmarked === true);

    // 2. SORTING (Default CreatedAt Desc)
    const sortBy = params.sortBy || 'createdAt';
    const sortOrder = params.sortOrder || 'desc';
    
    items.sort((a, b) => {
      let valA = a[sortBy] || '';
      let valB = b[sortBy] || '';
      
      if (sortBy === 'createdAt') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // 3. PAGINATION
    const totalCount = items.length;
    const page = parseInt(params.page || 1);
    const limit = parseInt(params.limit || 25);
    const startIndex = (page - 1) * limit;
    const paginatedItems = items.slice(startIndex, startIndex + limit);

    return { items: paginatedItems, totalCount: totalCount };
  } catch(e) { 
    return { items: [], totalCount: 0 }; 
  }
}

function saveToSheet(ssId, sheetName, item) {
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) { setupDatabase(); sheet = ss.getSheetByName(sheetName); }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Update or Insert logic
  const data = sheet.getDataRange().getValues();
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === item.id) { existingRow = i + 1; break; }
  }

  const rowData = headers.map(h => {
    const val = item[h];
    return (Array.isArray(val) || (typeof val === 'object' && val !== null)) ? JSON.stringify(val) : (val !== undefined ? val : '');
  });

  if (existingRow !== -1) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
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
