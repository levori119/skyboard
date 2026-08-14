/**
 * מפות מעוגנות שמגיעות ממאגר התמונ"א (ATSIM) - **קריאה בלבד**.
 *
 * ההבדל מטבלת `maps` אינו טכני אלא הצהרתי: מפה כזו **אינה נשמרת ב-DB של
 * SKY-KING ואינה ניתנת לעריכה כאן**. המאגר הוא הבעלים, SKY-KING מושך דרך אותו
 * ריליי שמושך את התמונ"א, ואם המאגר שינה את העיגון - השינוי פשוט נראה בפעם
 * הבאה. אין עותק שיכול להתיישן, ואין נתיב שבו המאגר כותב ל-DB.
 *
 * מה שכן משותף הוא **הצריכה**: המפה נכנסת בדיוק לאותם `mapImg` + `mapGeoAnchor`
 * שכל מפה אחרת נכנסת אליהם, ולכן שכבות הציור (אזורים, נקודות העברה, תמונ"א)
 * עובדות עליה בלי שינוי. זה עקרון הרכיבים המשותפים - לא מסלול ציור שני.
 */
import { API_URL } from '../config';
import type { MapGeoAnchor } from '../utils/geo';

/** מפה כפי שהמאגר משתף אותה. הגבולות הם של **קצוות התמונה**. */
export interface AtsimMap {
  id: string;
  name: string;
  projection: 'linear' | 'mercator';
  bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  width: number;
  height: number;
  etag: string | null;
  updatedAt: string | null;
}

/** מזהה מפה של המאגר, כפי שהוא נשמר בהעדפות העמדה. */
export const atsimMapKey = (id: string) => `atsim:${id}`;
export const isAtsimMapKey = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('atsim:');
export const atsimIdOf = (key: string) => key.slice('atsim:'.length);

const finite = (v: unknown) => Number.isFinite(Number(v));

/** האם מה שחזר מהמאגר הוא מפה שאפשר להציב עליה מטוס. */
export const isUsableAtsimMap = (m: unknown): m is AtsimMap => {
  const x = m as AtsimMap | null;
  if (!x?.id || !x.bounds) return false;
  const b = x.bounds;
  return [b.latMin, b.latMax, b.lonMin, b.lonMax].every(finite)
    && b.latMin < b.latMax && b.lonMin < b.lonMax;
};

/**
 * גבולות התמונה → שתי נקודות עיגון.
 *
 * טריוויאלי ובכוונה: פינה שמאלית-עליונה היא (0%, latMax, lonMin) והימנית-
 * תחתונה היא (100%, latMin, lonMax). **ההיטל עובר איתן** - בלעדיו מפה
 * במרקטור הייתה נקראת ליניארית, וזו סטייה של קילומטרים באמצע התמונה שאינה
 * נראית על המסך (ראה `MapGeoAnchor.projection`).
 */
export const atsimAnchor = (m: AtsimMap): MapGeoAnchor => ({
  x1: 0, y1: 0, lat1: m.bounds.latMax, lon1: m.bounds.lonMin,
  x2: 100, y2: 100, lat2: m.bounds.latMin, lon2: m.bounds.lonMax,
  projection: m.projection === 'mercator' ? 'mercator' : 'linear',
});

/**
 * רשימת המפות שהמאגר משתף. **לעולם לא זורק** - מאגר שאינו זמין הוא מצב
 * רגיל בעמדה, והמסך צריך להמשיך לעבוד עם מפות ה-DB שלו.
 */
export async function listAtsimMaps(): Promise<AtsimMap[]> {
  try {
    const res = await fetch(`${API_URL}/air-picture/maps`);
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list) ? list.filter(isUsableAtsimMap) : [];
  } catch {
    return [];
  }
}

/**
 * התמונה עצמה, כ-blob URL.
 *
 * **דרך `fetch` ולא `<img src>`** - וזו אינה העדפה: הנתיב דורש הזדהות, ותגית
 * `img` אינה יכולה לשאת כותרת `Authorization`. אותה מלכודת שכבר תועדה בסמלים
 * הארגוניים (`server/middleware/auth.js`), ושם נפתרה בחשיפה מודעת. כאן אין
 * צורך בכך: `fetch` עובר דרך ה-patch של האסימון ומקבל אותו אוטומטית.
 *
 * הקורא אחראי ל-`revokeAtsimMapImage` כשהוא מחליף מפה.
 */
export async function loadAtsimMapImage(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/air-picture/maps/${encodeURIComponent(id)}/image`);
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

/** שחרור ה-blob. בלעדיו כל החלפת מפה מדליפה מגה-בייטים בעמדה שרצה ימים. */
export const revokeAtsimMapImage = (src: string | null | undefined) => {
  if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
};
