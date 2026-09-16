// הקלטת פעולות במסך - החיבור לעמדה. אפיון: SCREEN_RECORDING_SPEC.md
//
// שני מפעילים לאותו מקליט (הכרעת אורי, 2026-09-16):
//   **קופסה שחורה** - עולה לבד כשהעמדה עולה, אם הניהול הטכני הדליק אותה
//                     לבסיס. המפעיל לא נוגע בכלום.
//   **כפתור**       - "התחל / עצור הקלטה" ו"שמור את הקטע הזה" בתפריט העמדה.
//
// החיווי חייב להיות גלוי כל זמן שההקלטה רצה: מסך עמדה שמוקלט בלי שהיושב בה
// יודע הוא בעיה, לא פיצ'ר. הנקודה האדומה בכותרת היא חלק מהפיצ'ר ולא קישוט.
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { getAuthToken } from '../utils/authToken';
import {
  IDLE_STATE, canRecordScreen, screenRecorder,
  type RecorderState, type RecorderUnavailable,
} from '../utils/screenRecording';
import { normalizeRecordingConfig, type RecordingConfig } from '../../shared/screenRecording';

/** קריאה חוזרת של התצורה: שינוי בניהול הטכני נתפס בלי לרענן את העמדה */
const CONFIG_POLL_MS = 5 * 60 * 1000;

interface Args {
  /** הבסיס / היב"א של העמדה (`workstation_presets.parent_base_id`) */
  baseId: number | null;
  presetName: string;
  /** אין טעם להקליט לפני שיש עמדה על המסך */
  ready: boolean;
}

export interface ScreenRecorderApi {
  state: RecorderState;
  config: RecordingConfig | null;
  /** למה אי-אפשר להקליט כרגע, או null */
  blocked: RecorderUnavailable;
  /** האם הכפתור הידני יכול לעשות משהו בפועל */
  canStart: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  keep: () => Promise<number>;
}

export function useScreenRecorder({ baseId, presetName, ready }: Args): ScreenRecorderApi {
  const [state, setState] = useState<RecorderState>(IDLE_STATE);
  const [config, setConfig] = useState<RecordingConfig | null>(null);
  const [pathValid, setPathValid] = useState(false);
  const autoTried = useRef(false);

  const onState = useCallback((patch: Partial<RecorderState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  // ── תצורת הבסיס ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!baseId) { setConfig(null); return; }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/screen-recording/config/${baseId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setConfig(normalizeRecordingConfig(data));
        setPathValid(Boolean(data?.pathValid));
      } catch { /* נתק - נשארים עם התצורה האחרונה שנקראה */ }
    };
    void load();
    const t = setInterval(load, CONFIG_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [baseId]);

  const startWith = useCallback(async (manual: boolean) => {
    await screenRecorder.start({
      baseId,
      presetName,
      token: getAuthToken() || '',
      manual,
      config,
      onState,
    });
    setState(screenRecorder.snapshot);
  }, [baseId, presetName, config, onState]);

  // ── קופסה שחורה: התחלה אוטומטית ────────────────────────────────────────────
  // פעם אחת לכל עליית עמדה. כשל (נתיב שאינו נגיש, אין קודק) נרשם ב-state
  // ומוצג בתפריט; ניסיון חוזר אוטומטי היה מציף דיסק רשת שלא קיים בלוגים.
  useEffect(() => {
    if (!ready || autoTried.current) return;
    if (!canRecordScreen() || !config?.enabled || !pathValid) return;
    autoTried.current = true;
    void startWith(false);
  }, [ready, config, pathValid, startWith]);

  // יציאה מהעמדה מסיימת את הקובץ מסודר, כדי שהקטע האחרון יישאר נגין
  useEffect(() => () => { void screenRecorder.stop(); }, []);

  const blocked: RecorderUnavailable = !canRecordScreen() ? 'noElectron'
    : !baseId ? 'noBase'
    : state.blocked ? state.blocked
    : !config?.path ? 'noPath'
    : !pathValid ? 'badPath'
    : null;

  return {
    state,
    config,
    blocked,
    // ידני מותר גם כשהקופסה השחורה כבויה בבסיס - מה שנדרש הוא נתיב תקין
    canStart: canRecordScreen() && Boolean(baseId) && Boolean(config?.path) && pathValid,
    start: () => startWith(true),
    stop: async () => { await screenRecorder.stop(); setState(screenRecorder.snapshot); },
    keep: () => screenRecorder.keep(),
  };
}
