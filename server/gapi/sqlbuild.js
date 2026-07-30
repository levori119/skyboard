// GAPI — בניית INSERT/UPDATE דינמית ממפת עמודות. טהור → נבדק.
// שמות טבלה/עמודה מגיעים אך ורק מ-entities.js (קבועים) — אין injection.

export function buildInsert(table, colsMap) {
  const cols = Object.keys(colsMap);
  const params = cols.map(c => colsMap[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;
  return { sql, params };
}

export function buildUpdate(table, colsMap, whereCol, whereVal) {
  const cols = Object.keys(colsMap);
  const set = cols.map((c, i) => `${c} = $${i + 1}`);
  const params = cols.map(c => colsMap[c]);
  params.push(whereVal);
  const sql = `UPDATE ${table} SET ${set.join(', ')} WHERE ${whereCol} = $${cols.length + 1} RETURNING id`;
  return { sql, params };
}
