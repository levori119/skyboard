import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useDragPosition } from './hooks/useDragPosition';
import { joinAltRange, splitAltRange } from './utils/altRangeInput';
import { tr } from './i18n/tr';

export type VKMode = 'numeric' | 'full';

interface VKConfig {
  value: string;
  mode: VKMode;
  label?: string;
  /**
   * מספרים בלבד: **טווח** - שני שדות, מ / עד. הערך נכנס ויוצא כ-`"100-140"`
   * (ובלי "עד" - ערך בודד), אותו פורמט של שדה הגובה בפ"מ.
   */
  range?: boolean;
  onConfirm: (val: string) => void;
  onClose?: () => void;
}

interface VKContextType {
  openVK: (config: VKConfig) => void;
  closeVK: () => void;
  isOpen: boolean;
  /**
   * האם יש מקלדת וירטואלית בעץ הזה. מחוץ ל-`VirtualKeyboardProvider` (תצוגה
   * מקדימה בניהול, בדיקות) `openVK` אינו עושה דבר - ורכיב שפותח מקלדת בלחיצה
   * חייב לדעת את זה, אחרת הלחיצה "נדלקת" בלי שקורה כלום.
   */
  available: boolean;
}

const VKContext = createContext<VKContextType>({
  openVK: () => {},
  closeVK: () => {},
  isOpen: false,
  available: false,
});

export const useVK = () => useContext(VKContext);

// בלי `document` (רינדור בצד שרת בבדיקות) הסקייל הוא 1 - אחרת כל רכיב שמייבא
// את `useVK` (כמו `StripControl`) היה נופל כבר בייבוא
const _vkScale = typeof document === 'undefined' ? 1
  : parseFloat(document.documentElement.style.getPropertyValue('--s') || '1') || 1;
const sc = (n: number): number => Math.round(n * _vkScale);

const HEB_ROWS: string[][] = [
  ['פ', 'ם', 'ן', 'ו', 'ט', 'א', 'ר', 'ק', "'", '/'],
  ['ף', 'ך', 'ל', 'ח', 'י', 'ע', 'כ', 'ג', 'ד', 'ש'],
  ['ץ', 'ת', 'צ', 'מ', 'נ', 'ה', 'ב', 'ס', 'ז'],
];
const ENG_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SYMBOLS = ['.', '-', '(', ')', ':', '"', ',', '!', '?'];

/**
 * לוח מספרים קומפקטי: ארבע עמודות, ו**האישור צמוד למחק** - שתי הלחיצות
 * האחרונות של כל הקלדה, אחת ליד השנייה ולא בקצה השני של המסך.
 *
 *   7 8 9 ⌫
 *   4 5 6 ✓
 *   1 2 3 ✓
 *   . 0 C ✓
 *
 * הסדר תמיד LTR (כמו כל מקלדת נומרית), גם כשהממשק בעברית.
 */
function NumericKeyboard({ value, setValue, onConfirm }: { value: string; setValue: (v: string) => void; onConfirm: () => void }) {
  const append = (ch: string) => setValue(value + ch);
  const backspace = () => setValue(value.slice(0, -1));
  const clear = () => setValue('');
  const cell = sc(48);

  const Btn = ({ label, onClick, tone, area, title }: {
    label: React.ReactNode; onClick: () => void; tone?: 'danger' | 'success' | 'muted'; area?: string; title?: string;
  }) => (
    <button
      title={title}
      aria-label={title}
      onPointerDown={e => { e.preventDefault(); onClick(); }}
      style={{
        gridArea: area, minWidth: cell, minHeight: cell, fontSize: `${sc(tone === 'success' ? 15 : 19)}px`, fontWeight: 'bold',
        border: `1px solid ${tone === 'success' ? '#16a34a' : '#334155'}`, borderRadius: '7px', cursor: 'pointer',
        background: tone === 'danger' ? '#7f1d1d' : tone === 'success' ? '#15803d' : tone === 'muted' ? '#334155' : '#1e293b',
        color: tone === 'danger' ? '#fca5a5' : tone === 'success' ? 'white' : '#e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', touchAction: 'manipulation',
      }}
    >{label}</button>
  );

  return (
    <div data-testid="vk-numpad" style={{
      display: 'grid', gap: '6px', direction: 'ltr',
      gridTemplateColumns: `repeat(4, ${cell}px)`, gridAutoRows: `${cell}px`,
      gridTemplateAreas: '"k7 k8 k9 bs" "k4 k5 k6 ok" "k1 k2 k3 ok" "dot k0 clr ok"',
    }}>
      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map(d => <Btn key={d} label={d} area={`k${d}`} onClick={() => append(d)} />)}
      <Btn label="." area="dot" onClick={() => append('.')} />
      <Btn label="C" area="clr" tone="muted" title={tr('shared.clear3')} onClick={clear} />
      <Btn label="⌫" area="bs" tone="danger" title={tr('shared.backspace')} onClick={backspace} />
      <Btn label={<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>✓<span>{tr('shared.confirmShort')}</span></span>}
        area="ok" tone="success" title={tr('shared.confirmShort')} onClick={onConfirm} />
    </div>
  );
}

function FullKeyboard({ value, setValue, onEnter }: { value: string; setValue: (v: string) => void; onEnter?: () => void }) {
  const [lang, setLang] = useState<'heb' | 'eng'>('heb');
  const [capsLock, setCapsLock] = useState(false);
  const append = (ch: string) => setValue(value + ch);
  const backspace = () => setValue(value.slice(0, -1));
  const clear = () => setValue('');
  const space = () => setValue(value + ' ');
  const newline = () => setValue(value + '\n');

  const keyH = 38;

  const keyStyle: React.CSSProperties = {
    minWidth: `${sc(32)}px`, height: `${sc(keyH)}px`, fontSize: `${sc(15)}px`, fontWeight: '600',
    border: '1px solid #334155', borderRadius: '6px', cursor: 'pointer',
    background: '#1e293b', color: '#e2e8f0', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    padding: '0 4px', flex: '1',
    userSelect: 'none', transition: 'background 0.1s',
  };

  const numKeyStyle: React.CSSProperties = {
    ...keyStyle, background: '#0f172a', fontSize: '14px',
  };

  const rows = lang === 'heb' ? HEB_ROWS : ENG_ROWS;
  const isRtl = lang === 'heb';

  const processChar = (ch: string) => {
    if (lang === 'eng' && /^[a-z]$/.test(ch)) {
      return capsLock ? ch.toUpperCase() : ch;
    }
    return ch;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {/* Numbers row */}
      <div style={{ display: 'flex', gap: '3px', direction: 'ltr' }}>
        {NUM_ROW.map(ch => (
          <button key={ch} onPointerDown={e => { e.preventDefault(); append(ch); }}
            style={numKeyStyle}>{ch}</button>
        ))}
      </div>

      {/* Letter rows */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '3px', direction: isRtl ? 'rtl' : 'ltr' }}>
          {row.map(ch => (
            <button key={ch} onPointerDown={e => { e.preventDefault(); append(processChar(ch)); }}
              style={keyStyle}>{processChar(ch)}</button>
          ))}
          {ri === 2 && (
            <button
              onPointerDown={e => { e.preventDefault(); backspace(); }}
              style={{ ...keyStyle, flex: '1.6', background: '#7f1d1d', color: '#fca5a5', fontSize: '16px' }}
            >⌫</button>
          )}
        </div>
      ))}

      {/* Symbols row */}
      <div style={{ display: 'flex', gap: '3px', direction: 'ltr' }}>
        {SYMBOLS.map(ch => (
          <button key={ch} onPointerDown={e => { e.preventDefault(); append(ch); }}
            style={{ ...numKeyStyle, minWidth: '28px' }}>{ch}</button>
        ))}
      </div>

      {/* Bottom row: lang toggle / caps / clear / space / enter */}
      <div style={{ display: 'flex', gap: '3px', direction: 'rtl' }}>
        {/* Lang toggle */}
        <button
          onPointerDown={e => { e.preventDefault(); setLang(l => l === 'heb' ? 'eng' : 'heb'); }}
          style={{ ...keyStyle, flex: '1.4', background: lang === 'eng' ? '#1e3a5f' : '#1e293b', color: lang === 'eng' ? '#7dd3fc' : '#94a3b8', fontSize: '13px', fontWeight: 'bold' }}
        >{lang === 'heb' ? 'EN' : 'עב'}</button>

        {/* Caps lock (English only) */}
        {lang === 'eng' && (
          <button
            onPointerDown={e => { e.preventDefault(); setCapsLock(c => !c); }}
            style={{ ...keyStyle, flex: '1.4', background: capsLock ? '#1c3a12' : '#1e293b', color: capsLock ? '#86efac' : '#94a3b8', fontSize: '12px' }}
          >⇪ Aa</button>
        )}

        {/* Clear */}
        <button
          onPointerDown={e => { e.preventDefault(); clear(); }}
          style={{ ...keyStyle, flex: '1.4', background: '#7f1d1d', color: '#fca5a5', fontSize: '13px' }}
        >נקה</button>

        {/* Space */}
        <button
          onPointerDown={e => { e.preventDefault(); space(); }}
          style={{ ...keyStyle, flex: '3.5', background: '#1e293b', color: '#94a3b8', fontSize: '13px' }}
        >רווח</button>

        {/* Enter */}
        <button
          onPointerDown={e => { e.preventDefault(); onEnter ? onEnter() : newline(); }}
          style={{ ...keyStyle, flex: '2', background: '#1c3a12', color: '#86efac', fontSize: '13px', fontWeight: 'bold', border: '1px solid #16a34a' }}
        >↵ Enter</button>
      </div>
    </div>
  );
}

function VirtualKeyboardPanel({ config, onClose }: { config: VKConfig; onClose: () => void }) {
  // מספרים: כרטיס קטן במרכז התחתית, לא פס לכל רוחב המסך - ונגרר מהכותרת
  const numeric = config.mode === 'numeric';
  const range = numeric && config.range === true;
  const initial = range ? splitAltRange(config.value) : { from: config.value, to: '' };
  const [value, setValue] = useState(initial.from);
  const [toValue, setToValue] = useState(initial.to);
  const [field, setField] = useState<'from' | 'to'>('from');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(panelRef);

  const confirm = () => {
    config.onConfirm(range ? joinAltRange(value, toValue) : value);
    onClose();
  };

  const cancel = () => {
    config.onClose?.();
    onClose();
  };

  const displayValue = value.replace(/\n/g, '↵ ');
  const activeValue = range && field === 'to' ? toValue : value;
  const setActive = range && field === 'to' ? setToValue : setValue;

  const displayBox = (text: string, active: boolean, placeholder: string): React.CSSProperties => ({
    flex: 1, minWidth: 0, background: '#1e293b', border: `2px solid ${active ? '#3b82f6' : '#334155'}`,
    borderRadius: '7px', padding: '6px 12px', fontSize: '18px', fontFamily: 'monospace',
    fontWeight: 'bold', color: text ? '#7dd3fc' : '#334155', minHeight: '36px', display: 'flex',
    alignItems: 'center', letterSpacing: '0.04em', direction: 'ltr', justifyContent: 'flex-end',
    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', cursor: 'pointer',
    ...(placeholder ? {} : {}),
  });
  const caret = <span style={{ borderLeft: '2px solid #3b82f6', marginRight: '2px', height: '18px', animation: 'blink 1s step-end infinite' }} />;

  return (
    <div
      ref={panelRef}
      // מזהה יציב לבדיקות קצה-לקצה - המקלדת מרונדרת בשורש ואין לה כותרת קבועה
      data-testid="virtual-keyboard"
      data-vk-mode={config.mode}
      style={{
        position: 'fixed', zIndex: 99999,
        ...(numeric
          ? {
            ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { bottom: 12, left: '50%', transform: 'translateX(-50%)' }),
            border: '2px solid #3b82f6', borderRadius: '10px', padding: '8px', width: 'max-content',
          }
          : { bottom: 0, left: 0, right: 0, borderTop: '2px solid #3b82f6', padding: '8px 14px 12px' }),
        background: '#0f172a',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: '8px',
        direction: 'rtl',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header - במספרים זו גם ידית הגרירה */}
      {numeric && (
        <div data-testid="vk-drag-handle" {...drag.handleProps} title={tr('shared.dragToMove')}
          style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
          <span aria-hidden style={{ letterSpacing: '-2px' }}>⠿</span>
          <span style={{ flex: 1 }}>{config.label}</span>
          <button
            onPointerDown={e => { e.stopPropagation(); e.preventDefault(); cancel(); }}
            title={tr('shared.cancel')}
            style={{ padding: '2px 8px', background: '#374151', color: '#9ca3af', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >✕</button>
        </div>
      )}
      {range ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {(['from', 'to'] as const).map(f => {
            const v = f === 'from' ? value : toValue;
            return (
              <div key={f} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '11px', color: field === f ? '#93c5fd' : '#64748b' }}>{tr(f === 'from' ? 'shared.rangeFrom' : 'shared.rangeTo')}</span>
                <div data-testid={`vk-range-${f}`} data-active={field === f || undefined}
                  onPointerDown={e => { e.preventDefault(); setField(f); }}
                  style={{ ...displayBox(v, field === f, ''), width: 92 }}>
                  {v || <span style={{ fontSize: '13px' }}>-</span>}
                  {field === f && caret}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!numeric && config.label && (
            <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{config.label}</span>
          )}
          <div style={displayBox(displayValue, true, '')}>
            {displayValue || <span style={{ color: '#334155', fontSize: '14px' }}>{tr('shared.typeHere')}</span>}
            {caret}
          </div>
          {!numeric && (
            <button
              onPointerDown={e => { e.preventDefault(); confirm(); }}
              style={{
                padding: '8px 18px', background: '#15803d', color: 'white',
                border: 'none', borderRadius: '7px', cursor: 'pointer',
                fontSize: '15px', fontWeight: 'bold', flexShrink: 0,
              }}
            >✓ {tr('shared.confirmShort')}</button>
          )}
          {!numeric && (
            <button
              onPointerDown={e => { e.preventDefault(); cancel(); }}
              style={{
                padding: '8px 12px', background: '#374151', color: '#9ca3af',
                border: 'none', borderRadius: '7px', cursor: 'pointer',
                fontSize: '15px', flexShrink: 0,
              }}
            >✕</button>
          )}
        </div>
      )}

      {/* Keyboard */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {config.mode === 'numeric' ? (
          <NumericKeyboard value={activeValue} setValue={setActive} onConfirm={confirm} />
        ) : (
          <FullKeyboard value={value} setValue={setValue} onEnter={confirm} />
        )}
      </div>
    </div>
  );
}

export function VirtualKeyboardProvider({ children }: { children: React.ReactNode }) {
  const [vkConfig, setVkConfig] = useState<VKConfig | null>(null);

  const openVK = useCallback((config: VKConfig) => {
    setVkConfig(config);
  }, []);

  const closeVK = useCallback(() => {
    setVkConfig(null);
  }, []);

  return (
    <VKContext.Provider value={{ openVK, closeVK, isOpen: vkConfig !== null, available: true }}>
      {children}
      {vkConfig && (
        <VirtualKeyboardPanel config={vkConfig} onClose={closeVK} />
      )}
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </VKContext.Provider>
  );
}

/** Small ⌨ button to place next to any input field */
export function VKTrigger({
  value,
  onChange,
  mode,
  label,
  size = 16,
  style: extraStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: VKMode;
  label?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const { openVK } = useVK();
  return (
    <button
      type="button"
      title="פתח מקלדת וירטואלית"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        openVK({ value, mode, label, onConfirm: onChange });
      }}
      style={{
        background: 'transparent',
        border: '1px solid #334155',
        borderRadius: '4px',
        cursor: 'pointer',
        padding: '1px 4px',
        color: '#60a5fa',
        fontSize: size,
        lineHeight: 1,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.75,
        ...extraStyle,
      }}
    >⌨</button>
  );
}
