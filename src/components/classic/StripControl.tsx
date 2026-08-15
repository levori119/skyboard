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

  const rule = resolveControlStyle(control, value);
  const baseBg = lightMode ? '#e2e8f0' : '#334155';
  const baseFg = lightMode ? '#0f172a' : '#e2e8f0';
  const bg = rule?.bg || baseBg;
  const fg = rule?.text || baseFg;
  const blink = !!rule?.blink;
  if (blink) ensureSGBlinkStyle();

  const text = controlDisplayText(control, value);
  const ink = control.type === 'field' && isHandwritingValue(value) ? String(value) : '';

  const boxStyle: React.CSSProperties = {
    flex: control.flex || 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    background: bg,
    color: fg,
    border: 'none',
    borderRadius: '3px',
    padding: '1px 5px',
    fontSize: `${control.fontSize || 11}px`,
    fontWeight: (rule?.bold ?? control.bold) ? 'bold' : 'normal',
    fontFamily: 'monospace',
    cursor: readOnly ? 'default' : 'pointer',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
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
        title={control.label && control.type !== 'flag' ? control.label : undefined}
        onClick={activate}
        onPointerDown={e => e.stopPropagation()}
        style={boxStyle}
      >
        {control.label && control.type !== 'flag' && (
          <span style={{ opacity: 0.65, flexShrink: 0 }}>{control.label}</span>
        )}
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
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text || '·'}</span>
        )}
        {control.type === 'field' && control.input === 'both' && !editing && (
          <button
            onClick={e => { e.stopPropagation(); if (!readOnly) setInkOpen(true); }}
            onPointerDown={e => e.stopPropagation()}
            title={tr('shared.handwriting')}
            style={{ background: 'transparent', border: 'none', color: fg, cursor: 'pointer', fontSize: 'inherit', padding: 0, opacity: 0.7, flexShrink: 0 }}
          >✎</button>
        )}
        {(control.type === 'select' || control.type === 'multiselect') && (
          <span style={{ opacity: 0.55, flexShrink: 0 }}>▾</span>
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
