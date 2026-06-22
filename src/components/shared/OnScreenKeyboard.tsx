import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

const OSK_LAYOUTS: Record<string, string[][]> = {
  he: [
    ['1','2','3','4','5','6','7','8','9','0','-','='],
    ['/','\'','א','ר','ט','ו','ן','ם','פ','[',']'],
    ['ש','ד','ג','כ','ע','י','ח','ל','ך','ף',';'],
    ['ז','ס','ב','ה','נ','מ','צ','ת','ץ','.'],
  ],
  en: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['z','x','c','v','b','n','m',',','.'],
  ],
  EN: [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['Z','X','C','V','B','N','M','<','>'],
  ],
  sym: [
    ['!','@','#','$','%','^','&','*','(',')'],
    ['+','=','_','-','|','\\',':',';','"','\''],
    ['<','>','?','/','~','`','{','}','[',']'],
    ['°','±','×','÷','€','£','¥','©','®','™'],
  ],
};

interface OnScreenKeyboardProps {
  onType: (c: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onClose: () => void;
}

const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({ onType, onBackspace, onEnter, onClose }) => {
  const [lang, setLang] = useState<'he' | 'en' | 'EN' | 'sym'>('he');
  const [pos, setPos] = useState({ x: Math.max(0, (window.innerWidth - 560) / 2), y: window.innerHeight - 280 });
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const rows = OSK_LAYOUTS[lang];

  const key: React.CSSProperties = {
    minWidth: 34, height: 38, background: '#334155', color: 'white',
    border: '1px solid #475569', borderRadius: '5px', cursor: 'pointer',
    fontSize: '14px', fontFamily: 'inherit', padding: '0 4px', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    WebkitUserSelect: 'none', userSelect: 'none',
  };

  const langBtn = (l: typeof lang, label: string) => (
    <button key={l} onPointerDown={e => { e.preventDefault(); setLang(l); }}
      style={{ ...key as React.CSSProperties, minWidth: 50, background: lang === l ? '#2563eb' : '#1e3a5f', border: lang === l ? '1px solid #3b82f6' : '1px solid #1e40af', fontSize: '12px', fontWeight: 'bold' }}
    >{label}</button>
  );

  const onDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    const onMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.ox + me.clientX - dragRef.current.sx, y: dragRef.current.oy + me.clientY - dragRef.current.sy });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return createPortal(
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 99999, background: '#0f172a', border: '2px solid #3b82f6', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', userSelect: 'none', direction: 'ltr', display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px' }}>
      <div onPointerDown={onDragStart} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', background: '#1e293b', borderRadius: '6px', padding: '4px 8px', marginBottom: '2px' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px' }}>⌨ מקלדת וירטואלית — גרור להזזה</span>
        <button onPointerDown={e => { e.stopPropagation(); onClose(); }} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '13px', fontWeight: 'bold' }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        {langBtn('he', 'עברית')}{langBtn('en', 'EN')}{langBtn('EN', 'CAPS')}{langBtn('sym', '!@#')}
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
          {row.map(k => (
            <button key={k} style={key as React.CSSProperties} onPointerDown={e => { e.preventDefault(); onType(k); }}>{k}</button>
          ))}
          {ri === 0 && (
            <button style={{ ...key as React.CSSProperties, minWidth: 52, background: '#7f1d1d', border: '1px solid #991b1b', fontSize: '16px' }}
              onPointerDown={e => { e.preventDefault(); onBackspace(); }}>⌫</button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <button style={{ ...key as React.CSSProperties, minWidth: 200, fontSize: '12px', color: '#94a3b8' }} onPointerDown={e => { e.preventDefault(); onType(' '); }}>space / מרווח</button>
        <button style={{ ...key as React.CSSProperties, minWidth: 60, background: '#1d4ed8', border: '1px solid #2563eb', fontSize: '13px' }} onPointerDown={e => { e.preventDefault(); onEnter(); }}>↵</button>
      </div>
    </div>,
    document.body
  );
};

export default OnScreenKeyboard;
