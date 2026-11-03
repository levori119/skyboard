/**
 * שדה גובה כטווח - שני שדות (מ / עד) מול ערך אחד בפ"מ (`"100-140"`).
 *
 * הפ"מ שומר גובה כמחרוזת אחת: ערך בודד (`"120"`) או טווח (`"100-140"`). לוח
 * הגובה מפרק אותה לשני שדות ומרכיב חזרה - כך הפקח לא מקליד מקף, ולא צריך
 * לזכור את הפורמט.
 */

/** `"100-140"` → `{from:"100", to:"140"}`; ערך בודד → הוא ב"מ" */
export function splitAltRange(alt: string | null | undefined): { from: string; to: string } {
  const v = String(alt ?? '').trim();
  const m = v.match(/^(.*?)\s*[-–]\s*(.*)$/);
  if (m && m[1] && m[2]) return { from: m[1].trim(), to: m[2].trim() };
  return { from: v, to: '' };
}

/**
 * שני השדות → הערך שנשמר. שדה אחד ריק → הערך הבודד. "מ" גבוה מ"עד" - מוחלף,
 * כדי שטווח לא יישמר הפוך. "מ" שווה ל"עד" - ערך בודד.
 */
export function joinAltRange(from: string, to: string): string {
  const a = String(from ?? '').trim(), b = String(to ?? '').trim();
  if (!a || !b) return a || b;
  if (a === b) return a;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na > nb) return `${b}-${a}`;
  return `${a}-${b}`;
}
