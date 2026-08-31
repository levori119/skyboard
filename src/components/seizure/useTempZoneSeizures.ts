/**
 * **הלאמת אזור זמני** - הגשר בין ה-API ללוגיקה הטהורה, לעמדה אחת.
 *
 * ה-hook עונה על ארבע השאלות שהעמדה שואלת, וכל אחת מהן נגזרת מאותו מקור:
 *   1. אילו הלאמות פעילות אצלי, ואיפה הן על **המפה שלי** (הקרנה מנ"צ)
 *   2. אילו אזורים שלי מוגבלים, ובאיזו דרגה (כתום/אדום)
 *   3. אילו פ"מים צריכים להבהב
 *   4. מה צריך לצוץ עכשיו: התראה חדשה · הודעת "יצאה מתוקף" · חריגת זמן ליוצר
 *
 * ההכרעות עצמן יושבות ב-`src/utils/tempZoneSeizure.ts` (טהורות, נבדקות
 * ב-vitest). כאן רק polling, הקרנה, וזיכרון של מה כבר הוצג.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePollingRegistry';
import { geoToImagePct, type MapGeoAnchor } from '../../utils/geo';
import {
  seizureCoverage, pinFlaggedForAssignment, seizureOverdue,
  type SeizureCoverage,
} from '../../utils/tempZoneSeizure';
import type { AltBand } from '../../utils/zoneRestriction';
import type { TempZoneSeizure } from '../../types';

/** אזור של העמדה, כפי שהוא כבר מחושב במסך (פוליגון באחוזי תמונה + בלוקים). */
export interface SeizureZoneInput {
  id: number;
  name: string;
  pts: { x: number; y: number }[];
  bands: AltBand[];
}

/** פ"מ שמוקצה לאזור - מה שצריך כדי להכריע אם הוא מהבהב. */
export interface SeizurePinInput {
  /** מזהה הפ"מ כפי שהמסך מכיר אותו (מחרוזת, כמו ב-`strips`). */
  key: string;
  callsign: string;
  zoneId: number | null;
  /** בלוקי הגובה שהפ"מ הוקצה להם באזור. ריק = בלי בלוק → מכריע `altFl`. */
  bands: AltBand[];
  /** הגובה שרשום בפ"מ, ברום טיסה. `null` = לא ידוע → מהבהב. */
  altFl: number | null;
  zoneName?: string;
}

interface Options {
  apiUrl: string;
  presetId: number | null;
  presetName: string;
  /** עוגני המפה הפעילה. `null` = מפה לא מעוגנת → אין הקרנה, יש התראות. */
  anchor: MapGeoAnchor | null;
  zones: SeizureZoneInput[];
  pins: SeizurePinInput[];
  /** כבוי לגמרי (למשל מסך שאינו עמדה) - חוסך פולינג. */
  enabled?: boolean;
  pollMs?: number;
}

export interface SeizureZoneImpact {
  coverage: Exclude<SeizureCoverage, 'none'>;
  /** ההלאמות שמשפיעות על האזור - לתווית ולהתראה. */
  seizures: TempZoneSeizure[];
}

const POLL_MS = 8000;

/**
 * הקרנת פוליגון ההלאמה למפה מסוימת. פונקציה חופשית ולא רק חלק מה-hook, כי
 * במפה כפולה כל פאנל מקרין בעוגנים **שלו** - אותו מרחב, שתי תמונות שונות.
 */
export function projectSeizure(s: TempZoneSeizure, anchor: MapGeoAnchor | null): { x: number; y: number }[] {
  if (!anchor) return [];
  const geo = Array.isArray(s.polygon_geo) ? s.polygon_geo : [];
  if (geo.length < 3) return [];
  return geo.map(g => geoToImagePct(Number(g.lat), Number(g.lon), anchor));
}

export function useTempZoneSeizures(opts: Options) {
  const { apiUrl, presetId, presetName, anchor, zones, pins, enabled = true, pollMs = POLL_MS } = opts;

  const [rows, setRows] = useState<TempZoneSeizure[]>([]);
  const [now, setNow] = useState(() => Date.now());
  /** חריגות זמן שהיוצר כבר דחה בסבב הזה - כדי שלא יצוצו שוב מיד. */
  const dismissedOverdue = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!enabled || presetId == null) return;
    try {
      const res = await fetch(`${apiUrl}/temp-zone-seizures?preset_id=${presetId}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch { /* נתק - נשארים על מה שיש; הסבב הבא יתקן */ }
  }, [apiUrl, presetId, enabled]);

  usePolling(`temp-zone-seizures-${presetId ?? 'none'}`, load, enabled && presetId != null ? pollMs : 0);

  // שעון גס לחריגת זמן הסיום. דקה היא הרזולוציה של השדה עצמו.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [enabled]);

  const active = useMemo(() => rows.filter(s => s.status === 'active'), [rows]);
  /** הלאמות שהסתיימו וטרם הוצגה עליהן הודעה בעמדה הזו. */
  const endedNotices = useMemo(
    () => rows.filter(s => s.status === 'ended' && s.is_target && !s.my_seen_end),
    [rows],
  );
  const myCreated = useMemo(() => active.filter(s => s.is_creator), [active]);
  /** הלאמות שהופצו אליי וטרם אישרתי - תור ההתראות המתפרצות. */
  const pendingAlerts = useMemo(
    () => active.filter(s => s.is_target && !s.my_acked),
    [active],
  );

  /** הקרנת הפוליגון למפה של העמדה הזו. `[]` כשאין עוגנים. */
  const project = useCallback((s: TempZoneSeizure) => projectSeizure(s, anchor), [anchor]);

  const projected = useMemo(() => {
    const out = new Map<number, { x: number; y: number }[]>();
    for (const s of active) out.set(s.id, project(s));
    return out;
  }, [active, project]);

  /**
   * ההשפעה על כל אזור. כשכמה הלאמות נוגעות באותו אזור - **החמורה מנצחת**:
   * הצבע אומר "כמה מהאזור אסור", ואדום שנצבע כתום בגלל הלאמה שנייה הוא הסתרה.
   */
  const zoneImpact = useMemo(() => {
    const out = new Map<number, SeizureZoneImpact>();
    if (!anchor) return out;
    for (const z of zones) {
      if (z.pts.length < 3) continue;
      for (const s of active) {
        const sp = projected.get(s.id);
        if (!sp || sp.length < 3) continue;
        const cov = seizureCoverage(z.pts, sp, z.bands, s);
        if (cov === 'none') continue;
        const prev = out.get(z.id);
        if (!prev) out.set(z.id, { coverage: cov, seizures: [s] });
        else out.set(z.id, {
          coverage: prev.coverage === 'full' || cov === 'full' ? 'full' : 'partial',
          seizures: [...prev.seizures, s],
        });
      }
    }
    return out;
  }, [zones, active, projected, anchor]);

  /** הפ"מים שצריכים להבהב - אזור מושפע **וגם** גובה בתוך ההלאמה. */
  const flaggedPins = useMemo(() => {
    const out = new Map<string, TempZoneSeizure>();
    for (const p of pins) {
      if (p.zoneId == null) continue;
      const impact = zoneImpact.get(p.zoneId);
      if (!impact) continue;
      const hit = impact.seizures.find(s => pinFlaggedForAssignment(impact.coverage, s, p.bands, p.altFl));
      if (hit) out.set(p.key, hit);
    }
    return out;
  }, [pins, zoneImpact]);

  /** הפ"מים שצריך לטפל בהם לפי הלאמה מסוימת - לרשימה שבהתראה. */
  const pinsOfSeizure = useCallback((seizureId: number): SeizurePinInput[] => {
    const s = active.find(x => x.id === seizureId);
    if (!s) return [];
    return pins.filter(p => {
      if (p.zoneId == null) return false;
      const impact = zoneImpact.get(p.zoneId);
      if (!impact || !impact.seizures.some(x => x.id === seizureId)) return false;
      return pinFlaggedForAssignment(impact.coverage, s, p.bands, p.altFl);
    });
  }, [active, pins, zoneImpact]);

  /** האזורים שלי שהלאמה מסוימת מגבילה - לרשימה שבהתראה. */
  const zonesOfSeizure = useCallback((seizureId: number): { name: string; coverage: SeizureCoverage }[] => {
    const out: { name: string; coverage: SeizureCoverage }[] = [];
    for (const z of zones) {
      const impact = zoneImpact.get(z.id);
      if (impact && impact.seizures.some(s => s.id === seizureId)) out.push({ name: z.name, coverage: impact.coverage });
    }
    return out;
  }, [zones, zoneImpact]);

  /** ההלאמה שלי שחרג לה הזמן וטרם הוכרעה - התראת "להאריך או לסיים?" (§9). */
  const overdue = useMemo(
    () => myCreated.find(s => seizureOverdue(s.eta_end, now) && !dismissedOverdue.current.has(s.id)) ?? null,
    [myCreated, now],
  );
  const dismissOverdue = useCallback((id: number) => {
    dismissedOverdue.current.add(id);
    setNow(Date.now());
  }, []);

  // ── פעולות ────────────────────────────────────────────────────────────────

  const ack = useCallback(async (seizureId: number, note: string) => {
    if (presetId == null) return;
    // עדכון אופטימי: ההתראה נסגרת מיד, גם כשה-DB איטי
    setRows(prev => prev.map(s => s.id === seizureId ? { ...s, my_acked: true, my_ack_note: note } : s));
    try {
      await fetch(`${apiUrl}/temp-zone-seizures/${seizureId}/ack`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId, preset_name: presetName, note }),
      });
    } catch { /* הפולינג יחזיר את המצב האמיתי */ }
    load();
  }, [apiUrl, presetId, presetName, load]);

  const dismissEnded = useCallback(async (seizureId: number) => {
    if (presetId == null) return;
    setRows(prev => prev.filter(s => !(s.id === seizureId && s.status === 'ended')));
    try {
      await fetch(`${apiUrl}/temp-zone-seizures/${seizureId}/seen-end`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId }),
      });
    } catch { /* ננסה שוב בסבב הבא */ }
  }, [apiUrl, presetId]);

  const endSeizure = useCallback(async (seizureId: number) => {
    setRows(prev => prev.filter(s => s.id !== seizureId));
    try {
      await fetch(`${apiUrl}/temp-zone-seizures/${seizureId}/end`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId }),
      });
    } catch { /* הפולינג יתקן */ }
    load();
  }, [apiUrl, presetId, load]);

  const extendSeizure = useCallback(async (seizureId: number, etaEnd: string) => {
    dismissedOverdue.current.delete(seizureId);
    try {
      await fetch(`${apiUrl}/temp-zone-seizures/${seizureId}/extend`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eta_end: etaEnd }),
      });
    } catch { /* הפולינג יתקן */ }
    load();
  }, [apiUrl, load]);

  /**
   * דיווח העמדה על עצמה ליוצר: כמה פ"מים אצלה עדיין בפנים ואילו אזורים.
   * נשלח רק כשהמספר **השתנה** - אחרת זו כתיבה לכל סבב פולינג בלי סיבה.
   */
  const reportedRef = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    if (!enabled || presetId == null) return;
    for (const s of active) {
      if (!s.is_target) continue;
      const zoneNames = zonesOfSeizure(s.id).map(z => z.name);
      const count = pinsOfSeizure(s.id).length;
      const sig = `${count}|${zoneNames.join(',')}`;
      if (reportedRef.current.get(s.id) === sig) continue;
      reportedRef.current.set(s.id, sig);
      fetch(`${apiUrl}/temp-zone-seizures/${s.id}/report`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: presetId, pins_in_zone: count, affected_zone_names: zoneNames }),
      }).catch(() => { reportedRef.current.delete(s.id); });
    }
  }, [active, apiUrl, presetId, enabled, pinsOfSeizure, zonesOfSeizure]);

  return {
    active, myCreated, pendingAlerts, endedNotices, overdue,
    projected, project, zoneImpact, flaggedPins,
    pinsOfSeizure, zonesOfSeizure,
    ack, dismissEnded, dismissOverdue, endSeizure, extendSeizure, refresh: load,
  };
}

export default useTempZoneSeizures;
