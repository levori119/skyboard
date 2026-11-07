import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { useVK } from '../../VirtualKeyboard';
import { clampMenuPos } from '../../utils/queryBuilder';
import { ensureSGBlinkStyle } from '../../utils/stripGrid';
import StripInkPad from '../shared/StripInkPad';
import type { StripControl as StripControlDef, StripControlValue, StripFieldDataType } from '../../types/stripControls';
import {
  controlDisplayText, isHandwritingValue, nextButtonValue, normalizeControlValue,
  resolveControlStyle, toggleFlagValue, toggleMultiValue,
  fieldDataType, fieldEditKind, fieldNativeInputValue, normalizeFieldInput,
} from '../../utils/stripControls';
import { handleCellEditKeyDown, editableCellUnderline, tableCellScroll, TABLE_CELL_MAX_LINES } from '../../utils/tableCellEdit';

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

/** הצורה שהפקח צריך להקליד, לכל סוג נתון שאינו טקסט (CIV_STRIP_CONTROLS.md §2.4) */
const FORMAT_HINT_KEY: Record<Exclude<StripFieldDataType, 'text'>, string> = {
  integer: 'strips.fieldFormatInteger',
  decimal: 'strips.fieldFormatDecimal',
  time: 'strips.fieldFormatTime',
  date: 'strips.fieldFormatDate',
  datetime: 'strips.fieldFormatDatetime',
};

/** כמה זמן הפקד מסומן באדום אחרי ערך שנדחה */
const INVALID_FLASH_MS = 2500;

/**
 * פקד בודד על הסטריפ. **רכיב אחד לחמשת הסוגים** - כפתור, שדה, דגל, תפריט יחיד
 * ותפריט מרובה - כי כולם אותה מהות: ערך שנשמר, לחיצה שמשנה אותו, ועיצוב שנגזר
 * ממנו. האפיון: CIV_STRIP_CONTROLS.md
 *
 * הרכיב אינו יודע **איפה** הערך נשמר (פנימי ללוח או גלובלי לפ"מ). זו החלטה של
 * הקורא, ולכן `onChange` מקבל את הערך החדש בלבד.
 */
export const StripControl = ({ control, value, onChange, lightMode, readOnly, variant = 'strip' }: {
  control: StripControlDef;
  value: StripControlValue;
  onChange: (next: StripControlValue) => void;
  lightMode?: boolean;
  readOnly?: boolean;
  /**
   * `table` = הפקד יושב בתא של מוד הטבלה. שם **שדה טקסט אינו קופסה אלא קו
   * תחתון**, כמו כל תא בר-עריכה בטבלה - קופסה בכל תא הופכת את הטבלה לרשת
   * מלבנים. כפתור, דגל ותפריט נשארים קופסה: הם נראים כפקד ולא כטקסט.
   */
  variant?: 'strip' | 'table';
}) => {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [inkOpen, setInkOpen] = useState(false);
  // ערך שנדחה בגלל סוג הנתון: הפקד מסומן באדום לרגע, עם הצורה הנדרשת.
  // דחייה שקטה הייתה נראית לפקח כמו שמירה שלא עבדה
  const [invalidHint, setInvalidHint] = useState<string | null>(null);
  const invalidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (invalidTimer.current) clearTimeout(invalidTimer.current); }, []);
  const vk = useVK();

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

  // שדה טקסט בטבלה, ורק כשאין לו צבע מותנה - שם הקופסה הצבועה **היא** המסר
  const underlineOnly = variant === 'table' && control.type === 'field' && !rule?.bg;

  // ── סוג הנתון של שדה ─────────────────────────────────────────────────────
  // טקסט (וכל שדה ותיק בלי סוג) = בדיוק ההתנהגות של היום
  const dataType = fieldDataType(control);
  const editKind = fieldEditKind(dataType, vk.available);
  const formatHint = dataType === 'text' ? '' : tr(FORMAT_HINT_KEY[dataType]);
  const invalidText = formatHint ? tr('strips.fieldInvalidValue', { format: formatHint }) : '';
  const flashInvalid = () => {
    setInvalidHint(invalidText);
    if (invalidTimer.current) clearTimeout(invalidTimer.current);
    invalidTimer.current = setTimeout(() => setInvalidHint(null), INVALID_FLASH_MS);
  };
  const typedValue = isHandwritingValue(value) ? '' : String(value ?? '');

  /** שמירת ערך מוקלד דרך סוג הנתון. `false` = נדחה, והערך הקודם נשאר */
  const commitTyped = (raw: string): boolean => {
    const res = normalizeFieldInput(dataType, raw);
    if (!res.ok) { flashInvalid(); return false; }
    onChange(res.value);
    return true;
  };

  /**
   * לוח הספרות של העמדה - כמו בשדה הגובה: בעט על Cintiq תיבת טקסט מחייבת
   * מקלדת פיזית. ערך שנדחה פותח את הלוח שוב **עם מה שהוקלד** והסבר בכותרת,
   * כדי שהפקח יתקן במקום שבו הוא כבר מסתכל ולא יקליד הכל מחדש.
   */
  const openNumpad = (initial: string, error = false) => vk.openVK({
    value: initial,
    mode: 'numeric',
    label: error ? invalidText : `${control.label || ''} (${formatHint})`.trim(),
    onConfirm: raw => { if (!commitTyped(raw)) openNumpad(raw, true); },
  });

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
    ...(invalidHint ? { outline: '2px solid #ef4444', outlineOffset: '-1px' } : {}),
    ...(underlineOnly
      ? {
          background: 'transparent', border: 'none', borderRadius: 0,
          justifyContent: 'flex-start', alignItems: 'flex-start',
          // גובה שורה אחת, ולא מתיחה לגובה השורה: בטבלה כל התאים מתחילים
          // באותו קו למעלה, וערך ארוך נגלל בתוך התא ולא דוחף את השורה
          height: 'auto', padding: '0 2px', whiteSpace: 'pre-line',
          ...tableCellScroll(),
          ...editableCellUnderline(edge, !readOnly),
        }
      : {}),
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
    if (editKind === 'numpad') return openNumpad(typedValue);
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
        title={invalidHint || control.label || undefined}
        data-strip-control-type={dataType}
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
        {editing && editKind !== 'text' ? (
          /* שדה עם סוג נתון: תאריך / תאריך ושעה - בורר הדפדפן, שעובד בעט
             ובאצבע. מספר ושעה כשאין לוח ספרות (מחוץ לעמדה) - קלט במקום עם
             `inputMode`, כך שמקלדת המגע של מערכת ההפעלה נפתחת על ספרות. */
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type={editKind === 'date' ? 'date' : editKind === 'datetime' ? 'datetime-local' : 'text'}
            inputMode={dataType === 'decimal' ? 'decimal' : editKind === 'inline' ? 'numeric' : undefined}
            placeholder={editKind === 'inline' ? formatHint : undefined}
            defaultValue={editKind === 'inline' ? typedValue : fieldNativeInputValue(dataType, typedValue)}
            // בלי preventDefault (בשונה מ-swallow): בבורר תאריך הוא חוסם את פתיחת הלוח
            onClick={e => e.stopPropagation()}
            // בורר: הלוח נפתח מיד, כדי שבעט תספיק לחיצה אחת ולא שתיים. הלחיצה על
            // הפקד היא ה-user activation ש-showPicker דורש; דפדפן שאינו תומך -
            // הקלט פשוט נשאר פתוח להקלדה
            onFocus={e => {
              if (editKind !== 'date' && editKind !== 'datetime') return;
              try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* ignore */ }
            }}
            onPointerDown={e => e.stopPropagation()}
            onBlur={e => {
              setEditing(false);
              // `badInput` = בורר שמולא חלקית. הדפדפן מחזיר אז `''`, ושמירה
              // שלו הייתה **מוחקת** את הערך הקיים בלי שהפקח ביקש
              if (e.target.validity?.badInput) { flashInvalid(); return; }
              commitTyped(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            }}
            style={{
              flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.15)', border: 'none',
              borderBottom: `1px solid ${fg}`, color: fg, font: 'inherit', outline: 'none',
              padding: 0, colorScheme: lightMode ? 'light' : 'dark',
            }}
          />
        ) : editing ? (
          /* בטבלה השדה הוא textarea ולא input: תא בטבלה מחזיק כמה שורות
             (הערה, פירוט), ו-ALT+ENTER יורד שורה. על הסטריפ המשבצת גבוהה
             שורה אחת, ושם השדה נשאר חד-שורתי. */
          React.createElement(underlineOnly ? 'textarea' : 'input', {
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus: true,
            defaultValue: isHandwritingValue(value) ? '' : String(value ?? ''),
            rows: underlineOnly ? Math.min(TABLE_CELL_MAX_LINES, Math.max(1, String(value ?? '').split('\n').length)) : undefined,
            onClick: swallow,
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { setEditing(false); onChange(e.target.value); },
            // ENTER יוצא מהשדה ושומר (ה-onBlur), ALT+ENTER יורד שורה בטבלה.
            // ESC סוגר גם הוא, כדי לא להשאיר את הפקח תקוע בשדה פתוח.
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); return; }
              handleCellEditKeyDown(e, underlineOnly);
            },
            style: {
              flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.15)', border: 'none',
              borderBottom: `1px solid ${fg}`, color: fg, font: 'inherit', outline: 'none',
              padding: 0, ...(underlineOnly ? { resize: 'vertical' as const, lineHeight: 1.3 } : {}),
            },
          })
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
