import React, { createContext, useContext, useState, useCallback } from 'react';

export type VKMode = 'numeric' | 'full';

interface VKConfig {
  value: string;
  mode: VKMode;
  label?: string;
  onConfirm: (val: string) => void;
  onClose?: () => void;
}

interface VKContextType {
  openVK: (config: VKConfig) => void;
  closeVK: () => void;
  isOpen: boolean;
}

const VKContext = createContext<VKContextType>({
  openVK: () => {},
  closeVK: () => {},
  isOpen: false,
});

export const useVK = () => useContext(VKContext);

const _vkScale = parseFloat(document.documentElement.style.getPropertyValue('--s') || '1') || 1;
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

function NumericKeyboard({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  const append = (ch: string) => setValue(value + ch);
  const backspace = () => setValue(value.slice(0, -1));
  const clear = () => setValue('');

  const btnStyle: React.CSSProperties = {
    width: `${sc(60)}px`, height: `${sc(52)}px`, fontSize: `${sc(21)}px`, fontWeight: 'bold',
    border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer',
    background: '#1e293b', color: '#e2e8f0', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s',
    userSelect: 'none',
  };

  const Btn = ({ label, onClick, wide, danger, success }: { label: React.ReactNode; onClick: () => void; wide?: boolean; danger?: boolean; success?: boolean }) => (
    <button
      onPointerDown={e => { e.preventDefault(); onClick(); }}
      style={{
        ...btnStyle,
        width: wide ? '128px' : '60px',
        background: danger ? '#7f1d1d' : success ? '#14532d' : '#1e293b',
        color: danger ? '#fca5a5' : success ? '#86efac' : '#e2e8f0',
        fontSize: wide ? '14px' : '21px',
      }}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '7px' }}>
        <Btn label="7" onClick={() => append('7')} />
        <Btn label="8" onClick={() => append('8')} />
        <Btn label="9" onClick={() => append('9')} />
      </div>
      <div style={{ display: 'flex', gap: '7px' }}>
        <Btn label="4" onClick={() => append('4')} />
        <Btn label="5" onClick={() => append('5')} />
        <Btn label="6" onClick={() => append('6')} />
      </div>
      <div style={{ display: 'flex', gap: '7px' }}>
        <Btn label="1" onClick={() => append('1')} />
        <Btn label="2" onClick={() => append('2')} />
        <Btn label="3" onClick={() => append('3')} />
      </div>
      <div style={{ display: 'flex', gap: '7px' }}>
        <Btn label="." onClick={() => append('.')} />
        <Btn label="0" onClick={() => append('0')} />
        <Btn label="⌫" onClick={backspace} danger />
      </div>
      <div style={{ display: 'flex', gap: '7px' }}>
        <Btn label="נקה" onClick={clear} wide danger />
      </div>
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
  const [value, setValue] = useState(config.value);

  const confirm = () => {
    config.onConfirm(value);
    onClose();
  };

  const cancel = () => {
    config.onClose?.();
    onClose();
  };

  const displayValue = value.replace(/\n/g, '↵ ');

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
        background: '#0f172a', borderTop: '2px solid #3b82f6',
        padding: '8px 14px 12px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: '8px',
        direction: 'rtl',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {config.label && (
          <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{config.label}</span>
        )}
        <div style={{
          flex: 1, background: '#1e293b', border: '2px solid #3b82f6',
          borderRadius: '7px', padding: '6px 12px', fontSize: '18px', fontFamily: 'monospace',
          fontWeight: 'bold', color: '#7dd3fc', minHeight: '36px', display: 'flex',
          alignItems: 'center', letterSpacing: '0.04em', direction: 'ltr', justifyContent: 'flex-end',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {displayValue || <span style={{ color: '#334155', fontSize: '14px' }}>הקלד...</span>}
          <span style={{ borderLeft: '2px solid #3b82f6', marginRight: '2px', height: '18px', animation: 'blink 1s step-end infinite' }} />
        </div>
        <button
          onPointerDown={e => { e.preventDefault(); confirm(); }}
          style={{
            padding: '8px 18px', background: '#15803d', color: 'white',
            border: 'none', borderRadius: '7px', cursor: 'pointer',
            fontSize: '15px', fontWeight: 'bold', flexShrink: 0,
          }}
        >✓ אישור</button>
        <button
          onPointerDown={e => { e.preventDefault(); cancel(); }}
          style={{
            padding: '8px 12px', background: '#374151', color: '#9ca3af',
            border: 'none', borderRadius: '7px', cursor: 'pointer',
            fontSize: '15px', flexShrink: 0,
          }}
        >✕</button>
      </div>

      {/* Keyboard */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {config.mode === 'numeric' ? (
          <NumericKeyboard value={value} setValue={setValue} />
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
    <VKContext.Provider value={{ openVK, closeVK, isOpen: vkConfig !== null }}>
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
