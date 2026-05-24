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

// Hebrew keyboard rows (displayed RTL — right to left visually)
const HEB_ROWS: string[][] = [
  ['פ', 'ם', 'ן', 'ו', 'ט', 'א', 'ר', 'ק', "'", '/'],
  ['ף', 'ך', 'ל', 'ח', 'י', 'ע', 'כ', 'ג', 'ד', 'ש'],
  ['ץ', 'ת', 'צ', 'מ', 'נ', 'ה', 'ב', 'ס', 'ז'],
];
const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SYMBOLS = ['.', '-', '/', '(', ')'];

function NumericKeyboard({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  const append = (ch: string) => setValue(value + ch);
  const backspace = () => setValue(value.slice(0, -1));
  const clear = () => setValue('');

  const btnStyle: React.CSSProperties = {
    width: '64px', height: '56px', fontSize: '22px', fontWeight: 'bold',
    border: '1px solid #334155', borderRadius: '8px', cursor: 'pointer',
    background: '#1e293b', color: '#e2e8f0', display: 'flex',
    alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s',
    userSelect: 'none',
  };
  const hoverStyle: React.CSSProperties = {};

  const Btn = ({ label, onClick, wide, danger, success }: { label: React.ReactNode; onClick: () => void; wide?: boolean; danger?: boolean; success?: boolean }) => (
    <button
      onPointerDown={e => { e.preventDefault(); onClick(); }}
      style={{
        ...btnStyle,
        width: wide ? '136px' : '64px',
        background: danger ? '#7f1d1d' : success ? '#14532d' : '#1e293b',
        color: danger ? '#fca5a5' : success ? '#86efac' : '#e2e8f0',
        fontSize: wide ? '15px' : '22px',
      }}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn label="7" onClick={() => append('7')} />
        <Btn label="8" onClick={() => append('8')} />
        <Btn label="9" onClick={() => append('9')} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn label="4" onClick={() => append('4')} />
        <Btn label="5" onClick={() => append('5')} />
        <Btn label="6" onClick={() => append('6')} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn label="1" onClick={() => append('1')} />
        <Btn label="2" onClick={() => append('2')} />
        <Btn label="3" onClick={() => append('3')} />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn label="." onClick={() => append('.')} />
        <Btn label="0" onClick={() => append('0')} />
        <Btn label="⌫" onClick={backspace} danger />
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn label="נקה" onClick={clear} wide danger />
      </div>
    </div>
  );
}

function FullKeyboard({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  const [showNums, setShowNums] = useState(false);
  const append = (ch: string) => setValue(value + ch);
  const backspace = () => setValue(value.slice(0, -1));
  const clear = () => setValue('');
  const space = () => setValue(value + ' ');

  const keyStyle: React.CSSProperties = {
    minWidth: '38px', height: '44px', fontSize: '16px', fontWeight: '600',
    border: '1px solid #334155', borderRadius: '7px', cursor: 'pointer',
    background: '#1e293b', color: '#e2e8f0', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    padding: '0 6px', flex: '1',
    userSelect: 'none', transition: 'background 0.1s',
  };

  const Key = ({ ch, bg, col, onPress }: { ch: string; bg?: string; col?: string; onPress?: () => void }) => (
    <button
      onPointerDown={e => { e.preventDefault(); (onPress ?? (() => append(ch)))(); }}
      style={{ ...keyStyle, background: bg ?? '#1e293b', color: col ?? '#e2e8f0' }}
    >{ch}</button>
  );

  const rows = showNums ? [NUM_ROW] : HEB_ROWS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      {/* Numbers row always visible */}
      <div style={{ display: 'flex', gap: '4px', direction: 'ltr' }}>
        {NUM_ROW.map(ch => <Key key={ch} ch={ch} bg="#0f172a" />)}
      </div>

      {/* Hebrew rows */}
      {HEB_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '4px', direction: 'rtl' }}>
          {row.map(ch => <Key key={ch} ch={ch} />)}
          {ri === 2 && (
            <button
              onPointerDown={e => { e.preventDefault(); backspace(); }}
              style={{ ...keyStyle, flex: '1.5', background: '#7f1d1d', color: '#fca5a5', fontSize: '18px' }}
            >⌫</button>
          )}
        </div>
      ))}

      {/* Symbols + Space row */}
      <div style={{ display: 'flex', gap: '4px', direction: 'rtl' }}>
        {SYMBOLS.map(ch => <Key key={ch} ch={ch} bg="#0f172a" />)}
        <button
          onPointerDown={e => { e.preventDefault(); space(); }}
          style={{ ...keyStyle, flex: '3', background: '#1e293b', color: '#94a3b8', fontSize: '13px' }}
        >רווח</button>
        <button
          onPointerDown={e => { e.preventDefault(); clear(); }}
          style={{ ...keyStyle, flex: '1.5', background: '#7f1d1d', color: '#fca5a5', fontSize: '13px' }}
        >נקה</button>
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

  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
        background: '#0f172a', borderTop: '2px solid #3b82f6',
        padding: '12px 16px 16px',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: '10px',
        direction: 'rtl',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header: label + display + controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {config.label && (
          <span style={{ fontSize: '13px', color: '#64748b', flexShrink: 0 }}>{config.label}</span>
        )}
        {/* Value display */}
        <div style={{
          flex: 1, background: '#1e293b', border: '2px solid #3b82f6',
          borderRadius: '8px', padding: '8px 14px', fontSize: '20px', fontFamily: 'monospace',
          fontWeight: 'bold', color: '#7dd3fc', minHeight: '40px', display: 'flex',
          alignItems: 'center', letterSpacing: '0.05em', direction: 'ltr', justifyContent: 'flex-end',
        }}>
          {value || <span style={{ color: '#334155', fontSize: '16px' }}>הקלד...</span>}
          <span style={{ borderLeft: '2px solid #3b82f6', marginRight: '2px', height: '20px', animation: 'blink 1s step-end infinite' }} />
        </div>

        {/* Confirm + Cancel */}
        <button
          onPointerDown={e => { e.preventDefault(); confirm(); }}
          style={{
            padding: '10px 20px', background: '#15803d', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '16px', fontWeight: 'bold', flexShrink: 0,
          }}
        >✓ אישור</button>
        <button
          onPointerDown={e => { e.preventDefault(); cancel(); }}
          style={{
            padding: '10px 14px', background: '#374151', color: '#9ca3af',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontSize: '16px', flexShrink: 0,
          }}
        >✕</button>
      </div>

      {/* Keyboard */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {config.mode === 'numeric' ? (
          <NumericKeyboard value={value} setValue={setValue} />
        ) : (
          <FullKeyboard value={value} setValue={setValue} />
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
