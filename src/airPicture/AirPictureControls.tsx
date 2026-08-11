// בקרות התמונ"א בעמדה - **רכיב משותף** לעמדת הבקר ולעמדת המגדל.
//
// כל בקרה כאן מקומית לעמדה ונשמרת בסשן (prefs.ts), לא ב-DB. הפאנל נגרר דרך
// useDragPosition ולכן עובד בעט ובאצבע, לא רק בעכבר (CLAUDE.md §גרירה).

import { useLayoutEffect, useRef, useState } from 'react';
import { useDragPosition } from '../hooks/useDragPosition';
import { windowFrame } from '../utils/windowFrame';
import { CLASSIFICATIONS, CLASSIFICATION_COLOR } from '../../shared/airTrafficApi';
import type { Classification } from '../../shared/airTrafficApi';
import type { AirPicturePrefs } from './prefs';
import type { AirPictureStatus } from './store';
import { tr } from '../i18n/tr';

interface Props {
  prefs: AirPicturePrefs;
  onChange: (next: AirPicturePrefs) => void;
  status: AirPictureStatus;
  /** גיל התמונה בשניות, מול שעון המאגר. */
  ageSec: number;
  /** כמה מטוסים בתמונה כולה (מהמאגר). */
  count: number;
  /** כמה מהם **בתצוגה הנוכחית**. `null` = השכבה עוד לא ציירה. */
  visibleCount?: number | null;
  /** פירוט הכשל האחרון (קוד HTTP / הודעת רשת). מוצג כדי שלא יידרש ניחוש. */
  errorDetail?: string | null;
  /**
   * למה התמונ"א אינה פעילה. **"כבוי" בלי סיבה הוא כישלון שקט**: המשתמש
   * הגדיר את העמדה, השרתים למעלה, והוא רואה נורה אדומה בלי שום רמז לאן ללכת.
   * `null` = פעילה.
   */
  offReason?: string | null;
  /**
   * `anchored` = הפאנל נפתח **לצד** סרגל השכבות, מהכפתור שבו. הוא אינו
   * נדחס לתוך עמודת הסרגל הצרה - שם הוא יצא מעוך ולא קריא - אלא צף לידה
   * ברוחב מלא. `floating` = חלון נגרר חופשי.
   */
  placement?: 'anchored' | 'floating';
  themeMode: 'light' | 'dark' | 'ocean';
  onClose: () => void;
}

export default function AirPictureControls({
  prefs, onChange, status, ageSec, count, visibleCount, errorDetail, offReason,
  placement = 'floating', themeMode, onClose,
}: Props) {
  const anchored = placement === 'anchored';
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);

  /**
   * מיקום הפאנל במצב מעוגן - **נמדד ולא מנוחש**.
   *
   * שלוש גרסאות CSS-בלבד נכשלו כאן ברצף: `insetInlineEnd` פתח לצד ההפוך,
   * `top:0` גלש מתחת לתחתית החלון, ו-`bottom:0` נכנס מתחת לסרגל העליון.
   * הסיבה שכולן נכשלו זהה - אף אחת מהן לא יודעת כמה מקום **באמת** יש. כאן
   * מודדים את העוגן ואת גובה הפאנל ונועלים אותו לתוך החלון.
   *
   * החלוקה ב---s: `#root` יושב תחת `zoom: var(--s)` (1.65 במסך 24"), ולכן
   * `getBoundingClientRect` מחזיר פיקסלים ויזואליים בעוד `position:fixed`
   * נמדד ביחידות שלפני ה-zoom. בלי החלוקה הפאנל קופץ פי 1.65.
   */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (placement !== 'anchored') { setPos(null); return; }
    const place = () => {
      const el = winRef.current;
      const anchor = el?.parentElement;
      if (!el || !anchor) return;
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
      const a = anchor.getBoundingClientRect();
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const vh = window.innerHeight / s;
      const vw = window.innerWidth / s;
      const M = 8;
      // בעברית (RTL) הפאנל יוצא ימינה מהעוגן; באנגלית שמאלה. נבדק לפי `dir`
      // בפועל ולא לפי הנחה, כי המערכת דו-לשונית.
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      const rawLeft = rtl ? a.right / s + M : a.left / s - w - M;
      setPos({
        top: Math.min(Math.max(a.top / s, M), Math.max(M, vh - h - M)),
        left: Math.min(Math.max(rawLeft, M), Math.max(M, vw - w - M)),
      });
    };
    place();
    // גובה הפאנל משתנה עם התוכן (הודעת שגיאה, סיבת כיבוי), ומיקומו עם גודל
    // החלון - שניהם חייבים למקם מחדש, אחרת הוא נחתך שוב.
    const ro = new ResizeObserver(place);
    if (winRef.current) ro.observe(winRef.current);
    window.addEventListener('resize', place);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); };
  }, [placement, status, offReason, errorDetail]);

  // צבעי המשטח נגזרים מהתמה ולא מקודדים קשיח. ocean היא תמה **כהה**, ולכן היא
  // נספרת עם light רק במשטחי תפריט - בדיוק כמו menuBg ב-SectorDashboard.
  const lightSurface = themeMode === 'light';
  const bg = lightSurface ? '#ffffff' : themeMode === 'ocean' ? '#05404e' : '#1e293b';
  const border = lightSurface ? '#cbd5e1' : themeMode === 'ocean' ? '#0e7490' : '#334155';
  const text = lightSurface ? '#1e293b' : themeMode === 'ocean' ? '#cffafe' : '#e2e8f0';
  const muted = lightSurface ? '#64748b' : themeMode === 'ocean' ? '#7dd3fc' : '#94a3b8';

  const set = (patch: Partial<AirPicturePrefs>) => onChange({ ...prefs, ...patch });

  const toggleClass = (c: Classification) => {
    const has = prefs.classes.includes(c);
    set({ classes: has ? prefs.classes.filter(x => x !== c) : [...prefs.classes, c] });
  };

  // מצב החיבור הוא **צבע סטטוס** ולכן קבוע ולא נגזר מהתמה (CLAUDE.md).
  const statusColor = status === 'live' ? '#22c55e' : (status === 'stale' || status === 'unauth') ? '#f59e0b' : '#ef4444';
  const statusText = status === 'live' ? tr('airPicture.statusLive')
    : status === 'stale' ? tr('airPicture.statusStale')
      : status === 'down' ? tr('airPicture.statusDown')
        : status === 'unauth' ? tr('airPicture.statusUnauth')
          // תמונ"א מסביבה אחרת - תקלת חיווט ולא תקלת רשת, ולכן הודעה משלה.
          // אדום ולא כתום: כאן לא מוצגת שום תמונה, וזה לא מצב שממתינים שיסתדר.
          : status === 'envmismatch' ? tr('airPicture.statusEnvMismatch')
            : status === 'server' ? tr('airPicture.statusServerDown') : tr('airPicture.statusOff');

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 };
  const lbl: React.CSSProperties = { color: muted, fontSize: 11, minWidth: 54 };

  return (
    <div
      ref={winRef}
      data-air-picture-controls=""
      style={{
        // מעוגן: יוצא **מהצד** של הסרגל, ולא נדחס לרוחב שלו.
        //
        // `insetInlineStart` ולא `End`: בעברית (RTL) inline-start הוא **ימין**,
        // וזה הצד שנתבקש. השימוש בתכונה הלוגית ולא ב-`right` הוא מה שמשאיר את
        // זה נכון גם באנגלית (LTR), שם הפאנל ייפתח ממול - כמצופה.
        //
        // `bottom: 0` ולא `top: 0`: הפאנל גדל **כלפי מעלה** מהכפתור. כשהכפתור
        // יושב בחלק התחתון של הסרגל, עיגון לראש היה מגליש אותו מתחת לתחתית
        // החלון - וזה בדיוק מה שקרה. ה-maxHeight הוא רשת ביטחון לסרגל נמוך
        // במיוחד או למסך קצר.
        ...(anchored
          ? {
            position: 'fixed' as const,
            // לפני המדידה הראשונה הפאנל מוסתר, כדי שלא יבזיק בפינה שגויה.
            ...(pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }),
            maxHeight: '92vh',
            overflowY: 'auto' as const,
          }
          : { position: 'fixed' as const, ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { insetInlineEnd: 12, bottom: 90 }) }),
        width: 226,
        background: bg,
        color: text,
        // מעוגן בסרגל = חלק ממנו ולכן מסגרת רגילה. צף = חלון **צפייה ותפעול**
        // ולכן מסגרת תורכיז לפי קוד הצבע (CLAUDE.md §מסגרת חלון).
        ...(anchored ? { border: `1px solid ${border}`, borderRadius: 10 } : windowFrame('view', themeMode, 10)),
        padding: '8px 10px 10px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        // הפאנל יושב תחת #root{zoom:var(--s)}, ולכן כל המידות כאן ביחידות
        // מוגדלות ומתכווצות/גדלות עם גודל המסך בלי חישוב נוסף.
        fontSize: 12,
        zIndex: 400,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!anchored && (
          <span {...drag.handleProps} style={{ ...drag.handleProps.style, color: muted, cursor: 'grab' }}>⠿</span>
        )}
        <b style={{ flex: 1 }}>{tr('airPicture.title')}</b>
        <button onClick={onClose} title={tr('airPicture.close')}
          style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ ...row, marginTop: 4, color: muted, fontSize: 11 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        <span>{statusText}</span>
        <span style={{ marginInlineStart: 'auto' }}>
          {tr('airPicture.countAndAge', { count: visibleCount ?? count, age: Math.round(ageSec) })}
        </span>
      </div>

      {errorDetail && status !== 'live' && status !== 'off' && (
        <div style={{ marginTop: 3, fontSize: 10, color: muted, fontFamily: 'monospace' }}>{errorDetail}</div>
      )}

      {/* אפס בתצוגה בזמן שיש תמונה = לא תקלה, פשוט אין תנועה מעל האזור.
          בלי המשפט הזה מסך ריק לצד "מעודכן" נראה כמו כשל. */}
      {status === 'live' && visibleCount === 0 && count > 0 && (
        <div style={{ marginTop: 4, fontSize: 11, color: muted, lineHeight: 1.35 }}>
          {tr('airPicture.noneInView', { count })}
        </div>
      )}

      {offReason && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#fca5a5', lineHeight: 1.35 }}>
          {offReason}
        </div>
      )}

      <div style={row}>
        <label style={{ ...lbl, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={prefs.on} onChange={e => set({ on: e.target.checked })} />
          {tr('airPicture.show')}
        </label>
        <label style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, color: muted, fontSize: 11, cursor: 'pointer', marginInlineStart: 'auto' }}>
          <input type="checkbox" checked={prefs.labels} onChange={e => set({ labels: e.target.checked })} />
          {tr('airPicture.labels')}
        </label>
      </div>

      <div style={row}>
        <span style={lbl}>{tr('airPicture.size')}</span>
        <input type="range" min={0.6} max={1.6} step={0.05} value={prefs.scale}
          onChange={e => set({ scale: Number(e.target.value) })} style={{ flex: 1 }} />
      </div>

      <div style={row}>
        <span style={lbl}>{tr('airPicture.brightness')}</span>
        <input type="range" min={0.15} max={1} step={0.05} value={prefs.opacity}
          onChange={e => set({ opacity: Number(e.target.value) })} style={{ flex: 1 }} />
      </div>

      <div style={{ ...row, flexWrap: 'wrap', gap: 4 }}>
        {CLASSIFICATIONS.map(c => {
          const active = prefs.classes.includes(c);
          return (
            <button key={c} onClick={() => toggleClass(c)}
              style={{
                flex: '1 1 45%', padding: '3px 4px', fontSize: 11, cursor: 'pointer',
                borderRadius: 5, border: `1px solid ${active ? CLASSIFICATION_COLOR[c] : border}`,
                background: active ? `${CLASSIFICATION_COLOR[c]}22` : 'transparent',
                color: active ? CLASSIFICATION_COLOR[c] : muted,
              }}>
              {tr(`airPicture.cls_${c}`)}
            </button>
          );
        })}
      </div>

      <div style={row}>
        <span style={lbl}>{tr('airPicture.altRange')}</span>
        <input type="number" step={1000} placeholder={tr('airPicture.from')}
          value={prefs.altMin ?? ''} onChange={e => set({ altMin: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ width: 62, background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 5, padding: '2px 4px', fontSize: 11 }} />
        <input type="number" step={1000} placeholder={tr('airPicture.to')}
          value={prefs.altMax ?? ''} onChange={e => set({ altMax: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ width: 62, background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 5, padding: '2px 4px', fontSize: 11 }} />
      </div>

      <div style={row}>
        <span style={lbl}>{tr('airPicture.resp')}</span>
        <input type="text" value={prefs.resp} onChange={e => set({ resp: e.target.value })}
          placeholder={tr('airPicture.respAll')}
          style={{ flex: 1, background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 5, padding: '2px 4px', fontSize: 11 }} />
      </div>
    </div>
  );
}
