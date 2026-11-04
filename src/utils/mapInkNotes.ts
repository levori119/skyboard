/**
 * **הערה בכתב יד על פ"מ במפה** - הלוגיקה הטהורה.
 *
 * הפקח/בקר כותב בעט/אצבע הערה קצרה (`StripInkPad`, דיו רסטר) והיא מוצגת ליד
 * הפ"מ בכל מפה שהוא מצויר בה - הסמן החופשי וגם הפין באזור. כמו צ'ינו על הסדק,
 * ההערה היא של **העמדה**:
 *
 * | | |
 * |---|---|
 * | **איפה נשמרת** | `localStorage` פר-עמדה (`sk.mapInkNotes.<presetId>`) - לא DB, לא מופצת |
 * | **מתי נעלמת** | כשהפ"מ עבר לעמדה אחרת (העברה שהתקבלה), או נמחק |
 * | **מחיקה ידנית** | שמירה ריקה בחלון הכתיבה |
 *
 * "עבר לעמדה אחרת" = `workstation_preset_id` של עמדה אחרת והפ"מ **אינו** בהעברה
 * (`pending_transfer` - עדיין אצלי עד שמתקבל). אותו תנאי של שכבת הפ"מים במפה.
 */
export type MapInkNotes = Record<number, string>;

/** מזהה פ"מ מספרי ('s123' / 123 / '123' → 123) */
export const stripNum = (id: unknown): number | null => {
  const n = parseInt(String(id ?? '').replace(/^s/, ''), 10);
  return Number.isFinite(n) ? n : null;
};

export function parseMapInkNotes(raw: string | null | undefined): MapInkNotes {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    const out: MapInkNotes = {};
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (Number.isFinite(Number(k)) && typeof v === 'string' && v.startsWith('data:image/')) out[Number(k)] = v;
      }
    }
    return out;
  } catch { return {}; }
}

/** ההערות אחרי עדכון/מחיקה של פ"מ אחד (ערך ריק = מחיקה) */
export function setMapInkNote(notes: MapInkNotes, stripId: unknown, dataUrl: string): MapInkNotes {
  const id = stripNum(stripId);
  if (id === null) return notes;
  const next = { ...notes };
  if (dataUrl && dataUrl.startsWith('data:image/')) next[id] = dataUrl;
  else delete next[id];
  return next;
}

/**
 * ההערות שנשארות אחרי רענון הפ"מים. מחזיר **אותו אובייקט** כשאין מה למחוק.
 *
 * `loaded` - הפ"מים נטענו בהצלחה לפחות פעם אחת. בלעדיו, רשימה ריקה בעלייה
 * הייתה נראית כמו "כל הפ"מים נמחקו" ומוחקת את כל ההערות.
 */
export function purgeMapInkNotes(notes: MapInkNotes, strips: any[], myPresetId: unknown, loaded: boolean): MapInkNotes {
  const ids = Object.keys(notes || {});
  if (!ids.length) return notes;
  const me = Number(myPresetId);
  const byId = new Map<number, any>();
  for (const s of Array.isArray(strips) ? strips : []) { const n = stripNum(s?.id); if (n !== null) byId.set(n, s); }
  let changed = false;
  const next: MapInkNotes = {};
  for (const k of ids) {
    const id = Number(k);
    const s = byId.get(id);
    if (!s) {
      if (loaded && byId.size > 0) { changed = true; continue; } // הפ"מ נמחק
      next[id] = notes[id];
      continue;
    }
    const wp = s.workstation_preset_id == null || s.workstation_preset_id === '' ? null : Number(s.workstation_preset_id);
    if (wp !== null && Number.isFinite(me) && wp !== me && s.status !== 'pending_transfer') { changed = true; continue; }
    next[id] = notes[id];
  }
  return changed ? next : notes;
}
