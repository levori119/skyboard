// סרגל תצוגת עמדות אחרות — ריבועים חיים של עמדות אחרות בתחתית העמדה (ON TOP).
//
// כל ריבוע הוא מסגרת (iframe) של האפליקציה עצמה בכתובת ?peek=<presetId>, ולכן
// מוצג בו **המסך האמיתי** של אותה עמדה, מכל סוג (בקר/מגדל/קלאסי/דסק משימה),
// והוא מתעדכן בזמן אמת מעצמו. אין שכפול של לוגיקת רינדור, ואין instance שני
// באותו מסמך שיתנגש על הגלובלים של העמדה החיה (תמה, מסך מלא, קיצורי מקלדת).
//
// קריאה בלבד: pointer-events חסום על המסגרת, ובנוסף מצב peek חוסם כל כתיבה
// ל-API (installPeekWriteGuard) — כך צפייה לעולם לא משנה את העמדה הנצפית.
//
// הרשאה: הרשימה מוגדרת במסך הניהול, אבל מי שרשאי להיכנס לעמדה במיראז' הוא
// שרשאי לצפות בה. עמדה שאין לאיש הצוות המחובר הרשאה אליה — הריבוע לא מרונדר.
//
// רכיב משותף: אותו סרגל, אותה התנהגות, בכל סוגי העמדות (עקרון DRY).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { API_URL } from '../../config';
import StationScreenFrame from './StationScreenFrame';
import { tr } from '../../i18n/tr';
import {
  TILE_WIDTHS, DEFAULT_TILE_IDX, IS_PEEK_FRAME,
  visibleViewStations, stationLabel, stepTileIdx, tileHeight, peekUrl,
  type ViewStation,
} from '../../utils/stationPeek';

// רענון רשימת העמדות עצמה (לא התוכן — הוא מתעדכן בתוך המסגרת): שינוי הגדרה
// במסך הניהול מגיע לעמדה בלי צורך ברענון דף.
const LIST_POLL_MS = 30000;

// גובה כותרת החלון המוגדל (שם העמדה · קריאה בלבד · סגירה)
const EXPANDED_HEADER_H = 27;

type ThemeMode = 'light' | 'dark' | 'ocean';

interface Props {
  presetId: number;
  approvedWorkstations?: number[];   // הרשאות המיראז' של איש הצוות המחובר
  themeMode?: ThemeMode;
  /** מוצג/מוסתר מתפריט "תצוגה" של העמדה */
  visible: boolean;
}

// פלטה לפי התמה — אין צבעים קשיחים ברכיב (ראה /ui-adapt). `frame` הוא רקע
// שוליי המסגרת: המסך הנצפה נפרס ביחס 16:9 ומרכזי, והשוליים חייבים להיות בגוון התמה.
const peekTheme = (mode: ThemeMode) => mode === 'ocean' ? {
  surface: '#05404e', border: '#0e7490', text: '#cffafe', muted: '#22d3ee', chip: '#033240', frame: '#02242c',
} : mode === 'light' ? {
  surface: '#f1f5f9', border: '#cbd5e1', text: '#1e293b', muted: '#64748b', chip: '#e2e8f0', frame: '#e2e8f0',
} : {
  surface: '#1e293b', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', chip: '#0f172a', frame: '#0f172a',
};

// שכבות z-index במערכת: מסלולים 8900 · הודעות 9000 · דסק חופשי 9500.
// הסרגל יושב מתחתן כשהוא סרגל בלבד (הוא רצועה תחתונה ואסור שיחסום אותן),
// ועולה מעליהן בהגדלה — אז הוא החלון הפעיל של המשתמש.
const Z_BAR = 8850;
const Z_BAR_EXPANDED = 9600;

export default function StationPeekBar({ presetId, approvedWorkstations, themeMode = 'dark', visible }: Props) {
  const T = peekTheme(themeMode);
  const [stations, setStations] = useState<ViewStation[]>([]);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(`bt-peek-collapsed-${presetId}`) === '1');
  const [sizeIdx, setSizeIdx] = useState<number>(() => {
    const v = Number(localStorage.getItem(`bt-peek-size-${presetId}`));
    return Number.isInteger(v) && v >= 0 && v < TILE_WIDTHS.length ? v : DEFAULT_TILE_IDX;
  });
  // העמדה שהוגדלה לקריאה (2/3 מסך). המסגרת שלה אינה נטענת מחדש — רק ממוקמת אחרת.
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/preset-view-stations/${presetId}`);
      if (r.ok) {
        const data = await r.json();
        setStations(Array.isArray(data) ? data : []);
      }
    } catch { /* מנותק — נשארים עם הרשימה הקיימת */ }
  }, [presetId]);

  useEffect(() => {
    if (IS_PEEK_FRAME || !presetId) return;   // גארד נגד קינון: מסגרת לא מציגה סרגל משלה
    load();
    const iv = setInterval(load, LIST_POLL_MS);
    return () => clearInterval(iv);
  }, [presetId, load]);

  useEffect(() => { localStorage.setItem(`bt-peek-collapsed-${presetId}`, collapsed ? '1' : '0'); }, [collapsed, presetId]);
  useEffect(() => { localStorage.setItem(`bt-peek-size-${presetId}`, String(sizeIdx)); }, [sizeIdx, presetId]);

  // Esc סוגר את ההגדלה — הבקר לא צריך לחפש את הכפתור
  useEffect(() => {
    if (expandedId == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedId]);

  if (IS_PEEK_FRAME || !visible) return null;

  const shown = visibleViewStations(stations, approvedWorkstations);
  if (shown.length === 0) return null;   // אין למה מורשה להציג — אין סרגל

  const width = TILE_WIDTHS[sizeIdx];
  const height = tileHeight(width);
  const HEADER_H = 18;

  const btn = (label: string, title: string, onClick: () => void, disabled = false) => (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title}
      style={{
        background: T.chip, color: disabled ? T.border : T.muted, border: `1px solid ${T.border}`,
        borderRadius: '4px', width: '22px', height: '18px', fontSize: '11px', lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer', padding: 0, flexShrink: 0,
      }}>{label}</button>
  );

  return (
      <div
        ref={barRef}
        style={{
          position: 'fixed', insetInlineStart: 0, insetInlineEnd: 0, bottom: 0,
          zIndex: expandedId != null ? Z_BAR_EXPANDED : Z_BAR,
          display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none',
        }}>
        {/* רקע מעומעם מאחורי ההגדלה — מבהיר שזו צפייה בעמדה אחרת ולא העמדה שלי.
            נמצא *בתוך* הסרגל בכוונה: הסרגל הוא הקשר ערימה (z-index), ורקע שיושב
            מחוצה לו היה מכסה גם את החלון המוגדל. */}
        {expandedId != null && (
          <div
            onClick={() => setExpandedId(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'rgba(0,0,0,0.55)', pointerEvents: 'auto' }}
          />
        )}
        {/* לשונית הכיווץ — משולש למעלה/למטה */}
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? tr('ctrl.peekShow') : tr('ctrl.peekHide')}
          style={{
            pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
            background: T.surface, color: T.muted, border: `1px solid ${T.border}`, borderBottom: 'none',
            borderStartStartRadius: '6px', borderStartEndRadius: '6px', padding: '1px 14px',
            fontSize: '11px', cursor: 'pointer', lineHeight: 1.6,
          }}>
          <span>{collapsed ? '▲' : '▼'}</span>
          <span>{tr('ctrl.peekBarTitle')} ({shown.length})</span>
        </button>

        {!collapsed && (
          <div style={{
            pointerEvents: 'auto', width: '100%', background: T.surface, borderTop: `1px solid ${T.border}`,
            padding: '5px 8px', display: 'flex', alignItems: 'flex-end', gap: '8px', overflowX: 'auto',
          }}>
            {/* הקטנה/הגדלה של הריבועים */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              {btn('+', tr('ctrl.peekBigger'), () => setSizeIdx(i => stepTileIdx(i, +1)), sizeIdx === TILE_WIDTHS.length - 1)}
              {btn('−', tr('ctrl.peekSmaller'), () => setSizeIdx(i => stepTileIdx(i, -1)), sizeIdx === 0)}
            </div>

            {shown.map(s => {
              const isExpanded = expandedId === s.target_preset_id;
              return (
                <div key={s.id} style={{ flexShrink: 0, width, position: 'relative' }}>
                  <div style={{
                    height: HEADER_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '4px', padding: '0 5px', background: T.chip, color: T.text,
                    border: `1px solid ${T.border}`, borderBottom: 'none',
                    borderStartStartRadius: '4px', borderStartEndRadius: '4px',
                    fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{stationLabel(s)}</span>
                    <span style={{ color: T.muted, fontWeight: 'normal', flexShrink: 0 }}>⤢</span>
                  </div>

                  {/* תיבת החיתוך של הריבוע. כשהעמדה מוגדלת, אותה מסגרת עצמה עוברת
                      למצב fixed בגודל 2/3 מסך — בלי טעינה מחדש ובלי מסך טעינה שני. */}
                  <div
                    data-testid={`peek-tile-${s.target_preset_id}`}
                    onClick={() => setExpandedId(isExpanded ? null : s.target_preset_id)}
                    title={isExpanded ? tr('ctrl.peekClose') : tr('ctrl.peekOpen')}
                    style={{
                      width, height, border: `1px solid ${T.border}`, background: T.frame,
                      cursor: 'pointer', position: 'relative',
                      // בהגדלה החלון יוצא מגבולות הריבוע (fixed) — חיתוך היה מסתיר אותו
                      overflow: isExpanded ? 'visible' : 'hidden',
                      borderEndStartRadius: '4px', borderEndEndRadius: '4px',
                      // גיאומטריה פיזית: המסגרת ממוקמת ומוקטנת מהפינה השמאלית-עליונה,
                      // ולכן התיבה חייבת להיות LTR גם כשהעמדה בעברית (אין בה טקסט משלה).
                      direction: 'ltr',
                    }}>
                    <PeekTile
                      presetId={s.target_preset_id}
                      tileW={width} tileH={height}
                      expanded={isExpanded}
                      onClose={() => setExpandedId(null)}
                      label={stationLabel(s)}
                      theme={T}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
  );
}

// ריבוע בודד. המסגרת נטענת פעם אחת ונשארת חיה; ההגדלה משנה רק מיקום וקנה מידה.
function PeekTile({ presetId, tileW, tileH, expanded, onClose, label, theme }: {
  presetId: number; tileW: number; tileH: number; expanded: boolean;
  onClose: () => void; label: string; theme: ReturnType<typeof peekTheme>;
}) {
  // בהגדלה — 2/3 מהמסך. המידות באחוזים של שכבה שפרושה על כל החלון, כדי שהחישוב
  // יישאר נכון תחת ה-zoom הגלובלי של גודל המסך (--s).
  const wrapStyle: CSSProperties = expanded
    ? { position: 'fixed', inset: 0, zIndex: 9600, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }
    : { position: 'absolute', inset: 0 };

  return (
    <div style={wrapStyle}>
      <div
        // החלון המוגדל יושב בתוך הריבוע (כדי לא לטעון מסגרת שנייה), ולכן קליק
        // בתוכו חייב לעצור — אחרת הוא היה מתקפל בחזרה דרך ה-onClick של הריבוע
        onClick={expanded ? (e => e.stopPropagation()) : undefined}
        style={{
        position: 'relative', overflow: 'hidden', pointerEvents: expanded ? 'auto' : 'none',
        ...(expanded
          ? { width: '66%', height: '66%', border: `2px solid ${theme.border}`, borderRadius: '8px', background: theme.frame, boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }
          : { width: '100%', height: '100%' }),
      }}>
        {expanded && (
          <div style={{
            position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: 0, zIndex: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            padding: '4px 10px', background: theme.chip, color: theme.text,
            borderBottom: `1px solid ${theme.border}`, fontSize: '13px', fontWeight: 'bold',
          }}>
            <span>{label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: theme.muted, fontWeight: 'normal', fontSize: '11px' }}>{tr('ctrl.peekReadOnly')}</span>
              <button
                type="button" onClick={onClose} title={tr('ctrl.peekClose')} aria-label={tr('ctrl.peekClose')}
                style={{ background: 'transparent', color: theme.muted, border: 'none', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </span>
          </div>
        )}
        {/* בהגדלה הכותרת יושבת מעל — המסגרת מתחילה מתחתיה כדי שלא תסתיר את
            השורה העליונה של העמדה הנצפית */}
        <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, bottom: 0, top: expanded ? EXPANDED_HEADER_H : 0 }}>
          <StationScreenFrame presetId={presetId} boxW={expanded ? null : tileW} boxH={expanded ? null : tileH} />
        </div>
      </div>
    </div>
  );
}
