import React, { useState } from 'react';
import { tr } from '../../i18n/tr';
import { clampMenuPos } from '../../utils/queryBuilder';
import { ensureSGBlinkStyle } from '../../utils/stripGrid';
import StripInkPad from '../shared/StripInkPad';
import type { StripControl as StripControlDef, StripControlValue } from '../../types/stripControls';
import {
  controlDisplayText, isHandwritingValue, nextButtonValue, normalizeControlValue,
  resolveControlStyle, toggleFlagValue, toggleMultiValue,
} from '../../utils/stripControls';

/**
 * משוב לחיצה וריחוף. `:active`/`:hover` אינם קיימים בסגנון inline, ובלי משוב
 * הפקח לוחץ ולא יודע אם המערכת קלטה - בדיוק התלונה שהולידה את השינוי הזה.
 */
let _ctlStyleInjected = false;
const ensureControlStyle = () => {
  if (_ctlStyleInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.textContent = `
    .sk-ctl { transition: filter .08s, box-shadow .08s; }
    .sk-ctl:not(.sk-ctl-ro):hover { filter: brightness(1.18); }
    .sk-ctl:not(.sk-ctl-ro):active { filter: brightness(1.45); box-shadow: inset 0 0 0 2px rgba(255,255,255,0.45); }
  `;
  document.head.appendChild(el);
  _ctlStyleInjected = true;
};

/**
 * פקד בודד על הסטריפ. **רכיב אחד לחמשת הסוגים** - כפתור, שדה, דגל, תפריט יחיד
 * ותפריט מרובה - כי כולם אותה מהות: ערך שנשמר, לחיצה שמשנה אותו, ועיצוב שנגזר
 * ממנו. האפיון: CIV_STRIP_CONTROLS.md
 *
 * הרכיב אינו יודע **איפה** הערך נשמר (פנימי ללוח או גלובלי לפ"מ). זו החלטה של
 * הקורא, ולכן `onChange` מקבל את הערך החדש בלבד.
 */
export const StripControl = ({ control, value, onChange, lightMode, readOnly }: {
  control: StripControlDef;
  value: StripControlValue;
  onChange: (next: StripControlValue) => void;
  lightMode?: boolean;
  readOnly?: boolean;
}) => {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [inkOpen, setInkOpen] = useState(false);

  ensureControlStyle();
  const rule = resolveControlStyle(control, value);
  const isFlag = control.type === 'flag';
  const isOn = isFlag && value === true;
  const isMenu = control.type === 'select' || control.type === 'multiselect';

  // ── צבעים ─────────────────────────────────────────────────────────────────
  // מוסכמת הסטריפ האלקטרוני: **המצב נמסר בצבע של שדה תחום**, ולכן לפקד תמיד
  // יש גבול ורקע - גם כשהוא ריק. פקד בלי גבול נראה כמו קו אקראי על הכרטיס.
  const baseBg = lightMode ? '#f1f5f9' : '#1f2937';
  const baseFg = lightMode ? '#0f172a' : '#e2e8f0';
  const edge = lightMode ? '#94a3b8' : '#64748b';
  const onBg = lightMode ? '#15803d' : '#166534';
  const bg = rule?.bg || (isOn ? onBg : baseBg);
  const fg = rule?.text || (isOn ? '#ffffff' : baseFg);
  const blink = !!rule?.blink;
  if (blink) ensureSGBlinkStyle();

  const text = controlDisplayText(control, value);
  const ink = control.type === 'field' && isHandwritingValue(value) ? String(value) : '';
  const size = control.fontSize || 12;

  const boxStyle: React.CSSProperties = {
    flex: control.flex || 1,
    // 24px הוא יעד המגע המינימלי (WCAG 2.5.8), וזה גם מה שעט על Cintiq דורש
    minWidth: '24px', minHeight: '24px',
    width: '100%', height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    background: bg,
    color: fg,
    border: `1px solid ${rule?.bg ? 'rgba(0,0,0,0.25)' : edge}`,
    borderRadius: '3px',
    padding: isMenu ? '0 3px 0 14px' : '0 4px',
    fontSize: `${size}px`,
    lineHeight: 1.1,
    fontWeight: (rule?.bold ?? control.bold) ? 'bold' : 'normal',
    fontFamily: 'monospace',
    cursor: readOnly ? 'default' : 'pointer',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    position: 'relative',
    ...(blink
      ? { '--sg-bb': bg, '--sg-bt': rule?.blinkColor || '#ef4444', animation: `sg-cell-blink ${rule?.blinkRate || 0.8}s step-end infinite` }
      : {}),
  } as React.CSSProperties;

  // הלחיצה נעצרת כאן ולא מטפסת לכרטיס: הכרטיס נגרר, ולחיצה על פקד אינה גרירה
  const swallow = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); };

  const openMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuAt({ x: r.left, y: r.bottom + 2 });
  };

  const activate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    if (control.type === 'button') return onChange(nextButtonValue(control, value));
    if (control.type === 'flag') return onChange(toggleFlagValue(value));
    if (control.type === 'select' || control.type === 'multiselect') return openMenu(e);
    // שדה: מצב הקלט קובע מה נפתח. ב"גם וגם" הלחיצה היא מקלדת, והעט נפתח מהאייקון
    if (control.input === 'handwriting') return setInkOpen(true);
    setEditing(true);
  };

  const menuValues = ['', ...(control.values || [])];
  const selected = normalizeControlValue('multiselect', control.type === 'multiselect' ? value : []) as string[];

  return (
    <>
      <div
        // מזהה יציב לבדיקות קצה-לקצה: שם הפקד אינו יציב (תווית שהמנהל משנה),
        // והמפתח כן
        data-strip-control={control.key}
        data-strip-control-readonly={readOnly ? '1' : '0'}
        className={`sk-ctl${readOnly ? ' sk-ctl-ro' : ''}`}
        title={control.label || undefined}
        onClick={activate}
        onPointerDown={e => e.stopPropagation()}
        // הכרטיס עצמו נגרר ב-HTML5 drag, שמתחיל מ-`mousedown`. בלי לעצור אותו
        // כאן, לחיצה על פקד הייתה עלולה להתפרש כתחילת גרירת הכרטיס במקום
        // כלחיצה. `draggable={false}` מוציא את הפקד עצמו ממנגנון הגרירה.
        onMouseDown={e => e.stopPropagation()}
        draggable={false}
        style={boxStyle}
      >
        {/* הפקד מציג **ערך** בלבד. שם השדה, אם הודלק, יושב לצדו כפריט נפרד
            שנגרר למקומו - כך הערך תמיד נראה ולא נדחק על ידי הכותרת */}
        {editing ? (
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            defaultValue={isHandwritingValue(value) ? '' : String(value ?? '')}
            onClick={swallow}
            onPointerDown={e => e.stopPropagation()}
            onBlur={e => { setEditing(false); onChange(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
            style={{ flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.15)', border: 'none', borderBottom: `1px solid ${fg}`, color: fg, font: 'inherit', outline: 'none', padding: 0 }}
          />
        ) : ink ? (
          <img src={ink} alt={tr('shared.handwriting')} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '2px' }} />
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
        )}
        {control.type === 'field' && control.input === 'both' && !editing && (
          <button
            onClick={e => { e.stopPropagation(); if (!readOnly) setInkOpen(true); }}
            onPointerDown={e => e.stopPropagation()}
            title={tr('shared.handwriting')}
            style={{ background: 'transparent', border: 'none', color: fg, cursor: 'pointer', fontSize: 'inherit', padding: 0, opacity: 0.7, flexShrink: 0 }}
          >✎</button>
        )}
        {/* חץ התפריט יושב בפינה קבועה ואינו נדחק על ידי הערך - אחרת ערך ארוך
            היה מסתיר את הסימן שמלמד שיש כאן תפריט בכלל */}
        {isMenu && (
          <span style={{ position: 'absolute', insetInlineStart: '3px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: `${Math.max(8, size - 2)}px`, pointerEvents: 'none' }}>▾</span>
        )}
      </div>

      {menuAt && (
        <>
          <div onClick={e => { e.stopPropagation(); setMenuAt(null); }} style={{ position: 'fixed', inset: 0, zIndex: 10040 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', ...clampMenuPos(menuAt.x, menuAt.y, 160, 40 + menuValues.length * 26),
              background: lightMode ? '#ffffff' : '#1e293b',
              border: `1px solid ${lightMode ? '#cbd5e1' : '#475569'}`,
              borderRadius: '6px', padding: '3px', zIndex: 10041, minWidth: '140px',
              maxHeight: '50vh', overflowY: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            }}
          >
            {menuValues.map((v, i) => {
              const isOn = control.type === 'multiselect'
                ? selected.some(s => s.trim().toLowerCase() === v.trim().toLowerCase())
                : String(value ?? '') === v;
              return (
                <button
                  key={`${v}-${i}`}
                  onClick={e => {
                    e.stopPropagation();
                    if (control.type === 'multiselect') {
                      onChange(toggleMultiValue(control, value, v));
                      // בחירה מרובה: התפריט נשאר פתוח, אלא אם ניקו הכל
                      if (v === '') setMenuAt(null);
                    } else {
                      onChange(v);
                      setMenuAt(null);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                    background: isOn ? (lightMode ? '#dbeafe' : '#1e3a5f') : 'transparent',
                    border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer',
                    color: lightMode ? '#0f172a' : '#e2e8f0', fontSize: '12px', textAlign: 'start',
                    fontFamily: 'monospace',
                  }}
                >
                  {control.type === 'multiselect' && <span style={{ width: '12px', flexShrink: 0 }}>{isOn ? '✓' : ''}</span>}
                  <span>{v === '' ? tr('strips.controlEmptyValue') : v}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {inkOpen && (
        <StripInkPad
          existing={isHandwritingValue(value) ? String(value) : ''}
          onCancel={() => setInkOpen(false)}
          onSave={data => { setInkOpen(false); onChange(data); }}
        />
      )}
    </>
  );
};

export default StripControl;
