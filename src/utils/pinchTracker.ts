import { pinchGeometry, type PinchStep, type Pt } from './pinchZoom';

/**
 * מכונת המצבים של צביטה בשתי אצבעות - בלי DOM, ולכן נבדקת ב-vitest.
 * `hooks/usePinchZoom` מזין אותה באירועי מצביע ומבצע את מה שהיא מחזירה.
 *
 *   אצבע אחת      - לא שלנו. ההתנהגות הקיימת של המפה (גרירה, סיבוב, לחיצה) נשארת.
 *   אצבע שנייה    - מתחילה צביטה: האצבע הראשונה "מבוטלת" אצל מי שכבר התחיל איתה
 *                   פעולה, ומעכשיו כל תנועה של שתיהן היא זום והזזה.
 *   הרמת אצבע     - הצביטה נגמרת. האצבע שנותרה **נבלעת** עד שהיא מורמת: אחרת
 *                   היא הייתה ממשיכה לגרור/לסובב מאמצע הצביטה, וזה מרגיש כמו קפיצה.
 */
export class PinchTracker {
  private pts = new Map<number, Pt>();
  private swallowed = new Set<number>();
  private last: { dist: number; mid: Pt } | null = null;
  /** השורש שעליו נגעה האצבע הראשונה - צביטה חוצה מפות אינה צביטה. */
  private root: unknown = null;
  pinching = false;

  /**
   * אצבע ירדה על שורש מפה (`root`). מחזיר `start` כשזו האצבע השנייה על אותו
   * שורש - ואז `cancelId` היא האצבע הראשונה, שהפעולה שלה צריכה להתבטל.
   */
  down(id: number, p: Pt, root: unknown): { start: false } | { start: true; cancelId: number } {
    if (this.pinching) return { start: false };          // אצבע שלישית - מתעלמים
    if (this.pts.size === 1 && this.root !== root) this.pts.clear(); // אצבע על מפה אחרת
    this.root = root;
    this.pts.set(id, p);
    if (this.pts.size < 2) return { start: false };
    const [a, b] = [...this.pts.values()];
    this.last = pinchGeometry(a, b);
    this.pinching = true;
    const cancelId = [...this.pts.keys()].find(k => k !== id)!;
    for (const k of this.pts.keys()) this.swallowed.add(k);
    return { start: true, cancelId };
  }

  /** האם האירוע של האצבע הזו נבלע (לא מגיע לשום מאזין אחר). */
  isSwallowed(id: number): boolean { return this.swallowed.has(id); }

  /** תנועה. מחזיר צעד צביטה, או `null` כשאין צביטה פעילה. */
  move(id: number, p: Pt): PinchStep | null {
    if (!this.pts.has(id)) return null;
    this.pts.set(id, p);
    if (!this.pinching || this.pts.size < 2 || !this.last) return null;
    const [a, b] = [...this.pts.values()];
    const g = pinchGeometry(a, b);
    const prev = this.last;
    this.last = g;
    // אצבעות שנפגשו בנקודה אחת - אין יחס, רק הזזה
    const scale = prev.dist > 0 && g.dist > 0 ? g.dist / prev.dist : 1;
    return { scale, prevMid: prev.mid, mid: g.mid };
  }

  /** אצבע הורמה. מחזיר `end` כשזה סיים צביטה פעילה. */
  up(id: number): { end: boolean } {
    this.swallowed.delete(id);
    if (!this.pts.has(id)) return { end: false };
    this.pts.delete(id);
    if (!this.pinching) {
      if (!this.pts.size) this.root = null;
      return { end: false };
    }
    this.pinching = false;
    this.last = null;
    this.pts.clear();
    this.root = null;
    return { end: true };
  }
}
