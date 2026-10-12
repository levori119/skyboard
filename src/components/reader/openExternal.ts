// פתיחת עזר קריאה **באפליקציה החיצונית** (PowerPoint / Word / קורא PDF של המחשב).
//
// משותף לכפתור ↗ שבחלון הקריאה ולקישור עמדה שמוגדר "באפליקציה חיצונית" -
// אותה פתיחה בדיוק, לא שתיים.
//
// קובץ שהועלה **אינו** נפתח בלשונית: הנתיב שלו מוגן באסימון, ולשונית חדשה
// אינה נושאת אותו - היא קיבלה דף HTML (2026-10-11). לכן הבתים נמשכים כאן עם
// האסימון, ואז:
//   • בעמדה (Electron) - נפתחים באפליקציה של מערכת ההפעלה (`openDocExternal`)
//   • בדפדפן - יורדים כקובץ בשמו, והדפדפן מציע לפתוח אותו באפליקציה
// קישור לכתובת נפתח בכתובת המקורית, כמו תמיד.
import { API_URL } from '../../config';
import type { ReaderDoc } from '../../utils/reader';

/** שם הקובץ לפתיחה חיצונית - עם סיומת, אחרת מערכת ההפעלה לא יודעת במה לפתוח. */
export function externalFileName(doc: Pick<ReaderDoc, 'id' | 'name' | 'file_name' | 'ext'>): string {
  if (doc.file_name && /\.[A-Za-z0-9]+$/.test(doc.file_name)) return doc.file_name;
  const base = (doc.name || `doc-${doc.id}`).replace(/[\\/:*?"<>|]/g, '_');
  return doc.ext ? `${base}.${doc.ext}` : base;
}

/** true = נפתח (או ירד). false = נכשל - הקורא מציג הודעה. */
export async function openReaderDocExternally(doc: ReaderDoc): Promise<boolean> {
  if (!doc.hasFile) {
    if (!doc.url) return false;
    window.open(doc.url, '_blank', 'noopener');
    return true;
  }
  try {
    const r = await fetch(`${API_URL}/reader/docs/${doc.id}/file`);
    if (!r.ok) return false;
    const buf = new Uint8Array(await r.arrayBuffer());
    const name = externalFileName(doc);
    const bridge = (window as any).skyking;
    if (bridge?.openDocExternal) {
      const out = await bridge.openDocExternal(name, buf);
      return !!out?.ok;
    }
    const url = URL.createObjectURL(new Blob([buf], { type: doc.mime || 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    return false;
  }
}
