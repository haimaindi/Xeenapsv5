
/**
 * XEENAPS PKM - COLLECTION DATA LAYER
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
    } else {
      // AUTO-UPDATE COLUMNS: Detect and append missing headers from schema
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const targetHeaders = CONFIG.SCHEMAS.LIBRARY;
      const missingHeaders = targetHeaders.filter(h => !currentHeaders.includes(h));
      
      if (missingHeaders.length > 0) {
        const startCol = currentHeaders.length + 1;
        sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
        sheet.getRange(1, startCol, 1, missingHeaders.length).setFontWeight("bold").setBackground("#f3f3f3");
      }
    }
    return { status: 'success', message: 'Database "Collections" has been successfully initialized/updated.' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

/**
 * Optimized for 100,000+ rows with Server-Side Global Sorting
 * @param {number} page
 * @param {number} limit
 * @param {string} search
 * @param {string} typeFilter
 * @param {string} pathFilter (favorite/bookmark)
 * @param {string} sortKey
 * @param {string} sortDir
 */
function getPaginatedItems(ssId, sheetName, page = 1, limit = 25, search = "", typeFilter = "All", pathFilter = "", sortKey = "createdAt", sortDir = "desc") {
  try {
    const ss = SpreadsheetApp.openById(ssId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { items: [], totalCount: 0 };
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { items: [], totalCount: 0 };
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const sortIdx = headers.indexOf(sortKey);
    const createdAtIdx = headers.indexOf('createdAt');
    
    let items = [];
    let totalFilteredCount = 0;

    // Jika tidak ada filter, tidak ada search, dan urutan Newest-First (Optimasi Cepat)
    if (!search && typeFilter === "All" && !pathFilter && sortKey === "createdAt" && sortDir === "desc") {
      totalFilteredCount = lastRow - 1;
      const startRow = Math.max(2, lastRow - (page * limit) + 1);
      const numRows = Math.min(limit, (lastRow - ((page - 1) * limit)) - 1);
      
      if (numRows > 0) {
        const values = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
        items = values.reverse().map(row => {
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
      }
    } else {
      // Logic Pencarian & Global Sorting
      const allValues = sheet.getDataRange().getValues();
      const rawData = allValues.slice(1);
      
      let filtered = rawData.filter(row => {
        const itemObj = {};
        headers.forEach((h, i) => itemObj[h] = row[i]);
        
        // Search across all specified columns (including extraction info 1-10)
        const matchesSearch = !search || headers.some((h, i) => String(row[i]).toLowerCase().includes(search.toLowerCase()));
        
        const matchesType = typeFilter === "All" || itemObj.type === typeFilter;
        const matchesPath = (!pathFilter) || 
                          (pathFilter === "favorite" && itemObj.isFavorite === true) || 
                          (pathFilter === "bookmark" && itemObj.isBookmarked === true) ||
                          (pathFilter === "research" && (itemObj.type === "Literature" || itemObj.type === "Task"));
        
        return matchesSearch && matchesType && matchesPath;
      });
      
      totalFilteredCount = filtered.length;
      
      // Global Server-Side Sort
      if (sortIdx !== -1) {
        filtered.sort((a, b) => {
          let valA = a[sortIdx];
          let valB = b[sortIdx];
          
          // Improved Date Handling for CreatedAt with numeric stability
          if (sortKey === 'createdAt') {
            const timeA = valA ? new Date(valA).getTime() : 0;
            const timeB = valB ? new Date(valB).getTime() : 0;
            const dA = isNaN(timeA) ? 0 : timeA;
            const dB = isNaN(timeB) ? 0 : timeB;
            return sortDir === 'asc' ? dA - dB : dB - dA;
          }
          
          // Case-insensitive string sort
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
          
          if (valA < valB) return sortDir === 'asc' ? -1 : 1;
          if (valA > valB) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
      }
      
      const startIdx = (page - 1) * limit;
      const paginated = filtered.slice(startIdx, startIdx + limit);
      
      items = paginated.map(row => {
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
    }

    return { items, totalCount: totalFilteredCount };
  } catch(e) { 
    return { items: [], totalCount: 0, error: e.toString() }; 
  }
}

function saveToSheet(ssId, sheetName, item) {
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) { setupDatabase(); sheet = ss.getSheetByName(sheetName); }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
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
