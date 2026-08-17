// ─── Unified polling engine (ממצא A מסקירת הארכיטקטורה) ──────────────────────────
// היום המערכת מריצה ~30 setInterval נפרדים (רק ב-SectorDashboard ~20), כל אחד סוקר
// את Neon באינטרוול משלו — מקור בעיית הביצועים (#114 באקסל).
//
// המנוע הזה מקבץ את כל משימות ה-poll לטיימר יחיד (base-tick), משהה כשהטאב מוסתר
// (Page Visibility) ומריץ מיד ריענון כשהוא חוזר, ומונע הצטברות של קריאות איטיות
// (skip אם הריצה הקודמת של אותה משימה עדיין באוויר). אין שינוי ב-API של השרת.
//
// שימוש (React):   usePolling('transfers', loadTransfers, 5000)
// שימוש (ישיר):    pollingRegistry.register('id', fn, 5000)

import { useEffect, useRef } from 'react';

type Task = {
  intervalMs: number;
  run: () => void | Promise<void>;
  lastRun: number;
  inFlight: boolean;
};

const BASE_TICK_MS = 1000; // כל האינטרוולים במערכת הם כפולות של ~שנייה

export class PollingRegistry {
  private tasks = new Map<string, Task>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private visibilityBound = false;

  /**
   * רישום משימת poll. אם id כבר קיים — מוחלף (idempotent).
   * @param immediate ריצה מיידית בעת הרישום (ברירת מחדל true), כמו הדפוס load()+setInterval.
   */
  register(
    id: string,
    run: () => void | Promise<void>,
    intervalMs: number,
    opts: { immediate?: boolean } = {},
  ): void {
    const { immediate = true } = opts;
    const task: Task = { intervalMs, run, lastRun: Date.now(), inFlight: false };
    this.tasks.set(id, task);
    this.bindVisibility();
    this.ensureTimer();
    if (immediate && this.isVisible()) {
      // lastRun כבר עודכן ל-now למעלה; מריצים מיד את הריענון הראשון.
      this.execute(id, task);
    }
  }

  unregister(id: string): void {
    this.tasks.delete(id);
    if (this.tasks.size === 0) this.stopTimer();
  }

  /** מס' משימות רשומות — לצורכי בדיקה/דיאגנוסטיקה. */
  taskCount(): number {
    return this.tasks.size;
  }

  /** האם קיים טיימר יחיד פעיל — לצורכי בדיקה. */
  timerActive(): boolean {
    return this.timer !== null;
  }

  private isVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private ensureTimer(): void {
    if (this.timer !== null || this.tasks.size === 0) return;
    if (!this.isVisible()) return; // מושהה כל עוד הטאב מוסתר
    this.timer = setInterval(() => this.tick(), BASE_TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!this.isVisible()) return;
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.inFlight) continue;
      if (now - task.lastRun >= task.intervalMs) {
        this.execute(id, task);
      }
    }
  }

  private execute(id: string, task: Task): void {
    task.lastRun = Date.now();
    task.inFlight = true;
    Promise.resolve()
      .then(() => task.run())
      .catch((e) => console.error('[polling] task failed:', id, e))
      .finally(() => {
        const current = this.tasks.get(id);
        if (current === task) current.inFlight = false;
      });
  }

  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  private onVisibility(): void {
    if (this.isVisible()) {
      // חזרה לטאב — ריענון מיידי של כל המשימות + הפעלת הטיימר מחדש.
      const now = Date.now();
      for (const [id, task] of this.tasks) {
        if (!task.inFlight) this.execute(id, task);
        else task.lastRun = now;
      }
      this.ensureTimer();
    } else {
      // טאב מוסתר — לעצור את הטיימר היחיד (לא סוקרים ברקע).
      this.stopTimer();
    }
  }
}

// singleton משותף לכל האפליקציה — טיימר אחד לכל המשימות.
export const pollingRegistry = new PollingRegistry();

/**
 * Hook: רישום משימת poll למנוע המאוחד למשך חיי הרכיב.
 * ה-callback נשמר ב-ref כדי שרינדורים לא ירשמו מחדש (מונע stale-closure —
 * הבעיה שתועדה ב-SectorDashboard "ref to always-fresh sync function").
 */
export function usePolling(
  id: string,
  run: () => void | Promise<void>,
  intervalMs: number,
  opts: { enabled?: boolean; immediate?: boolean } = {},
): void {
  const { enabled = true, immediate = true } = opts;
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!enabled || !intervalMs) return;
    pollingRegistry.register(id, () => runRef.current(), intervalMs, { immediate });
    return () => pollingRegistry.unregister(id);
  }, [id, intervalMs, enabled, immediate]);
}
