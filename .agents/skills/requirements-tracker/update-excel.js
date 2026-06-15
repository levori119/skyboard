// Helper module — import and call addRows() from within code_execution
// Usage: see SKILL.md

const FILE = '/home/runner/workspace/project-requirements.xlsx';
const HEADERS = ['תאריך ושעה', 'קטגוריה', 'תיאור', 'בוצע?', 'הערות'];

async function addRows(rows) {
  const XLSX = (await import('/home/runner/workspace/node_modules/xlsx/xlsx.js')).default;
  const fs = await import('fs');

  let wb, ws;
  if (fs.existsSync(FILE)) {
    wb = XLSX.readFile(FILE);
    ws = wb.Sheets['דרישות'] || wb.Sheets[wb.SheetNames[0]];
  } else {
    wb = XLSX.utils.book_new();
    ws = XLSX.utils.aoa_to_sheet([HEADERS]);
    ws['!cols'] = [{ wch: 16 }, { wch: 26 }, { wch: 72 }, { wch: 10 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, 'דרישות');
  }

  const now = new Date();
  const ts = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const existing = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let nextRow = existing.length;

  for (const row of rows) {
    XLSX.utils.sheet_add_aoa(ws, [[ts, row.category, row.description, '', '']], { origin: nextRow });
    nextRow++;
  }

  XLSX.writeFile(wb, FILE);
  return `✅ נוספו ${rows.length} שורות`;
}

module.exports = { addRows };
