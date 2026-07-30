// GAPI — מתאם טהור: מיפוי דו-כיווני בין payload של GAPI לעמודות DB של SKYKING.
// טהור (בלי DB) → נבדק ביחידה. resolve של שדות תעופה ו-aircraft nesting
// דורשים DB ולכן מטופלים ב-sync.js.
import { getEntityDef } from './entities.js';

// ממיר payload של GAPI (data) → מפת עמודות DB לכתיבה.
// כולל **רק** שדות תפעוליים מוגדרים → שדות פנימיים ל-SKYKING לעולם לא נכתבים.
// שדות שלא הופיעו ב-data מדולגים (partial update). JSONB → מחרוזת JSON.
export function toColumns(entity, data) {
  const def = getEntityDef(entity);
  if (!def) throw new Error(`unknown entity: ${entity}`);
  const cols = {};
  for (const f of def.fields) {
    if (!data || !(f.gapi in data)) continue;
    let v = data[f.gapi];
    if (f.json) v = JSON.stringify(v == null ? [] : v);
    else if (v === undefined) v = null;
    cols[f.col] = v;
  }
  return cols;
}

// ממיר שורת DB → payload של GAPI (data) לשליחה החוצה.
// כולל **רק** שדות תפעוליים → שדות פנימיים לא נשלחים. JSONB → ערך מפוענח.
export function toGapiData(entity, row) {
  const def = getEntityDef(entity);
  if (!def) throw new Error(`unknown entity: ${entity}`);
  const data = {};
  for (const f of def.fields) {
    let v = row ? row[f.col] : undefined;
    if (f.json && typeof v === 'string') {
      try { v = JSON.parse(v); } catch { /* משאירים כמות שהוא */ }
    }
    data[f.gapi] = v === undefined ? null : v;
  }
  return data;
}

// שמות עמודות תפעוליות של ישות (לשימוש ב-SELECT/דיפ).
export function operationalColumns(entity) {
  const def = getEntityDef(entity);
  if (!def) throw new Error(`unknown entity: ${entity}`);
  return def.fields.map(f => f.col);
}

// אילו שדות פנימיים (החרגה) — לצורכי תיעוד/בדיקה: כל עמודה שאינה תפעולית/מיפוי.
export function isOperationalColumn(entity, col) {
  const def = getEntityDef(entity);
  if (!def) return false;
  if (def.fields.some(f => f.col === col)) return true;
  if ((def.airfields || []).some(a => a.col === col)) return true;
  return false;
}
