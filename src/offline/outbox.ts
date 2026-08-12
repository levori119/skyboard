// עמידות בנתק — תור יציאה מקומי בעמדה.
//
// אותו עיקרון של server/gapi/outbox.js, רק ברמת העמדה: פעולה **פרטית**
// (ראה policy.ts) שנעשתה בזמן נתק נשמרת מקומית ונשלחת כשהקשר חוזר, לפי סדר.
//
// פעולות **משותפות** לעולם אינן מגיעות לכאן — הן נחסמות מראש. זו החלטה
// מכוונת: שליחה מאוחרת של "קבל פ"מ" עלולה לדרוס החלטה שעמדה אחרת קיבלה
// בינתיים, וזו תקלת בטיחות ולא אי-נוחות.

import type { OfflineStore } from './store';
import { setQueuedCount } from './netStatus';

export type OutboxItem = {
  seq: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  queuedAt: number;
  attempts: number;
  /** סביבת התרגול/הטיסה שבה נרשמה הפעולה — נכפית בשידור החוזר */
  scope?: string;
};

/** מפתח מרופד כדי שמיון לקסיקוגרפי של המפתחות ישמור על סדר ה-FIFO. */
export const seqKey = (seq: number): string => String(seq).padStart(12, '0');

export class Outbox {
  private nextSeq = 0;

  constructor(private store: OfflineStore) {}

  /** נטען פעם אחת בעלייה — משחזר את המונה כדי לא לדרוס פריטים שנשמרו בסשן קודם. */
  async init(): Promise<void> {
    const keys = await this.store.keys();
    this.nextSeq = keys.reduce((max, k) => Math.max(max, Number(k) || 0), 0) + 1;
    setQueuedCount(keys.length);
  }

  async enqueue(item: Omit<OutboxItem, 'seq' | 'attempts'>): Promise<OutboxItem> {
    const full: OutboxItem = { ...item, seq: this.nextSeq++, attempts: 0 };
    await this.store.set(seqKey(full.seq), full, item.queuedAt);
    setQueuedCount((await this.store.keys()).length);
    return full;
  }

  async pending(): Promise<OutboxItem[]> {
    const keys = (await this.store.keys()).sort();
    const out: OutboxItem[] = [];
    for (const k of keys) {
      const e = await this.store.get<OutboxItem>(k);
      if (e?.value) out.push(e.value);
    }
    return out;
  }

  async count(): Promise<number> {
    return (await this.store.keys()).length;
  }

  async remove(seq: number): Promise<void> {
    await this.store.del(seqKey(seq));
    setQueuedCount((await this.store.keys()).length);
  }

  async clear(): Promise<void> {
    await this.store.clear();
    setQueuedCount(0);
  }

  /**
   * שולח את התור לפי הסדר. עוצר בפריט הראשון שנכשל ברמת הקשר — כדי לא
   * לשבור סדר ולא לשרוף ניסיונות בזמן שהרשת עדיין למטה.
   *
   * תשובת 4xx **מסירה** את הפריט: שגיאת לקוח לא תיפתר בניסיון חוזר, והשארתו
   * בתור תחסום לנצח כל מה שאחריו.
   */
  async drain(send: (item: OutboxItem) => Promise<Response>): Promise<{ sent: number; dropped: number; left: number }> {
    let sent = 0, dropped = 0;
    for (const item of await this.pending()) {
      let res: Response;
      try {
        res = await send(item);
      } catch {
        break; // הרשת עוד למטה — ננסה שוב בפעם הבאה
      }
      if (res.status >= 500) break;            // השרת למטה — לא לשרוף את התור
      if (res.ok) { await this.remove(item.seq); sent++; continue; }
      console.warn(`[offline] פריט outbox נדחה (${res.status}) ונמחק: ${item.method} ${item.url}`);
      await this.remove(item.seq);
      dropped++;
    }
    return { sent, dropped, left: await this.count() };
  }
}
