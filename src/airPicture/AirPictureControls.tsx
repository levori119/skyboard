// בקרות התמונ"א בעמדה - **רכיב משותף** לעמדת הבקר ולעמדת המגדל.
//
// כל בקרה כאן מקומית לעמדה ונשמרת בסשן (prefs.ts), לא ב-DB. הפאנל נגרר דרך
// useDragPosition ולכן עובד בעט ובאצבע, לא רק בעכבר (CLAUDE.md §גרירה).

import { useRef } from 'react';
import { useDragPosition } from '../hooks/useDragPosition';
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
  count: number;
  /**
   * למה התמונ"א אינה פעילה. **"כבוי" בלי סיבה הוא כישלון שקט**: המשתמש
   * הגדיר את העמדה, השרתים למעלה, והוא רואה נורה אדומה בלי שום רמז לאן ללכת.
   * `null` = פעילה.
   */
  offReason?: string | null;
  themeMode: 'light' | 'dark' | 'ocean';
  onClose: () => void;
}

export default function AirPictureControls({
  prefs, onChange, status, ageSec, count, offReason, themeMode, onClose,
}: Props) {
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);

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
  const statusColor = status === 'live' ? '#22c55e' : status === 'stale' ? '#f59e0b' : '#ef4444';
  const statusText = status === 'live' ? tr('airPicture.statusLive')
    : status === 'stale' ? tr('airPicture.statusStale')
      : status === 'down' ? tr('airPicture.statusDown') : tr('airPicture.statusOff');

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 };
  const lbl: React.CSSProperties = { color: muted, fontSize: 11, minWidth: 54 };

  return (
    <div
      ref={winRef}
      data-air-picture-controls=""
      style={{
        position: 'fixed',
        ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { insetInlineEnd: 12, bottom: 90 }),
        width: 226,
        background: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: 10,
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
        <span {...drag.handleProps} style={{ ...drag.handleProps.style, color: muted, cursor: 'grab' }}>⠿</span>
        <b style={{ flex: 1 }}>{tr('airPicture.title')}</b>
        <button onClick={onClose} title={tr('airPicture.close')}
          style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      <div style={{ ...row, marginTop: 4, color: muted, fontSize: 11 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
        <span>{statusText}</span>
        <span style={{ marginInlineStart: 'auto' }}>
          {tr('airPicture.countAndAge', { count, age: Math.round(ageSec) })}
        </span>
      </div>

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
