import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import Tesseract from 'tesseract.js';

// --- רכיב כתיבה (OCR) ---
const HandwritingOverlay = ({ onComplete, onCancel }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<any>(null);

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
    }
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { ctx.lineTo(x, y); ctx.stroke(); }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(processOCR, 1500);
  };

  const processOCR = async () => {
    if (!canvasRef.current) return;
    setLoading(true);
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const result = await Tesseract.recognize(dataUrl, 'eng');
    const text = result.data.text.replace(/[^0-9]/g, '');
    onComplete(text || "???");
    setLoading(false);
  };

  return (
    <div style={{ position: 'absolute', top: 0, right: '110%', zIndex: 1000, background: 'white', border: '2px solid #2563eb', padding: '10px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', minWidth: '160px', direction: 'rtl' }}>
      <div style={{fontSize: '12px', marginBottom: '5px', fontWeight: 'bold', color: '#2563eb'}}>
        {loading ? "מעבד..." : "כתוב גובה:"}
      </div>
      <canvas ref={canvasRef} width={150} height={100} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', touchAction: 'none' }}
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)}
        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)} />
      <button onClick={onCancel} style={{ marginTop: '8px', width: '100%', padding: '4px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px' }}>ביטול</button>
    </div>
  );
};

// --- רכיב פ"מ (Strip) ---
const Strip = ({ s, onMove, onUpdate }: any) => {
  const controls = useDragControls();
  const [edit, setEdit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      startPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDragPos({ x: e.clientX - startPosRef.current.x, y: e.clientY - startPosRef.current.y });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      setDragPos({ 
        x: e.clientX - startPosRef.current.x, 
        y: e.clientY - startPosRef.current.y 
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const mapRect = mapArea.getBoundingClientRect();
        const dropX = e.clientX - startPosRef.current.x;
        const dropY = e.clientY - startPosRef.current.y;

        // בדיקה אם נשחרר בתוך אזור המפה
        if (e.clientX >= mapRect.left && e.clientX <= mapRect.right &&
            e.clientY >= mapRect.top && e.clientY <= mapRect.bottom) {
          const x = dropX - mapRect.left;
          const y = dropY - mapRect.top;
          onMove(s.id, x, y);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, s.id, onMove]);

  // רכיב הפ"מ הבסיסי
  const stripContent = (style: React.CSSProperties) => (
    <div ref={!isDragging ? containerRef : undefined} style={style}>
      <div 
        onPointerDown={handlePointerDown}
        style={{ width: 35, background: '#1e293b', cursor: 'grab', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px', userSelect: 'none' }}
      >⋮</div>
      <div style={{ padding: '8px', flex: 1, direction: 'rtl', textAlign: 'right' }}>
        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{s.callSign}</div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
          <div onClick={() => setEdit(true)} style={{ fontSize: '10px', border: '1px solid #e2e8f0', flex: 1, cursor: 'pointer', padding: '2px', background: '#f1f5f9' }}>
            גובה: {s.alt}
          </div>
          <div style={{ fontSize: '10px', flex: 1, color: '#64748b' }}>{s.task}</div>
        </div>
        {edit && <HandwritingOverlay onCancel={() => setEdit(false)} onComplete={(val: any) => { onUpdate(s.id, val); setEdit(false); }} />}
      </div>
    </div>
  );

  const baseStyle: React.CSSProperties = {
    width: 180, background: 'white', border: '2px solid black',
    display: 'flex', flexDirection: 'row-reverse',
    marginBottom: '8px', touchAction: 'none'
  };

  // אם בגרירה, מציג בפורטל שיעקוב אחרי העכבר
  if (isDragging) {
    return (
      <>
        {/* Placeholder במקום המקורי */}
        <div style={{ ...baseStyle, opacity: 0.3, position: s.onMap ? 'absolute' : 'relative', left: s.onMap ? s.x : 0, top: s.onMap ? s.y : 0 }}>
          {stripContent({ ...baseStyle, opacity: 0.3 })}
        </div>
        {/* רכיב גרירה שעוקב אחרי העכבר */}
        {createPortal(
          <div style={{ 
            ...baseStyle, 
            position: 'fixed', 
            left: dragPos.x, 
            top: dragPos.y, 
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            transform: 'rotate(2deg)'
          }}>
            <div style={{ width: 35, background: '#1e293b', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px' }}>⋮</div>
            <div style={{ padding: '8px', flex: 1, direction: 'rtl', textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{s.callSign}</div>
              <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                <div style={{ fontSize: '10px', border: '1px solid #e2e8f0', flex: 1, padding: '2px', background: '#f1f5f9' }}>גובה: {s.alt}</div>
                <div style={{ fontSize: '10px', flex: 1, color: '#64748b' }}>{s.task}</div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return stripContent({
    ...baseStyle,
    position: s.onMap ? 'absolute' : 'relative',
    left: s.onMap ? s.x : 0, 
    top: s.onMap ? s.y : 0,
    zIndex: 50
  });
};

export default function App() {
  const [strips, setStrips] = useState<any[]>([]);
  const [mapImg, setMapImg] = useState<string | null>(null);

  const handleCsv = (e: any) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => {
      const rows = ev.target.result.split('\n').filter((r:any)=>r.trim());
      const data = rows.slice(1).map((r: string, i: number) => {
        const c = r.split(',');
        return { id: c[0] || i.toString(), callSign: c[1] || "???", sq: c[2], alt: c[3] || "0", task: c[4], x: 0, y: 0, onMap: false };
      });
      setStrips(data);
    };
    reader.readAsText(e.target.files[0]);
  };

  const handleMap = (e: any) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => setMapImg(ev.target.result);
    reader.readAsDataURL(e.target.files[0]);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '10px 20px', background: '#0f172a', color: 'white', display: 'flex', gap: '20px', alignItems: 'center', direction: 'rtl' }}>
        <b style={{fontSize: '18px'}}>BLUE TORCH</b>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ background: '#334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            טען CSV <input type="file" accept=".csv" onChange={handleCsv} style={{ display: 'none' }} />
          </label>
          <label style={{ background: '#334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            טען מפה <input type="file" accept="image/*" onChange={handleMap} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', background: '#eee' }}>
        {/* Map Area - Left Side */}
        <div id="map-area" style={{ flex: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden' }}>
          {mapImg ? (
            <img src={mapImg} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>נא לטעון מפה</div>
          )}
          {strips.filter(s => s.onMap).map(s => (
            <Strip key={s.id} s={s} 
              onUpdate={(id: any, val: any) => setStrips(prev => prev.map(item => item.id === id ? {...item, alt: val} : item))}
              onMove={(id: any, x: any, y: any) => setStrips(prev => prev.map(item => item.id === id ? {...item, x, y} : item))} 
            />
          ))}
        </div>

        {/* Sidebar - Right Side */}
        <div style={{ width: 220, background: '#f8fafc', padding: '10px', borderLeft: '2px solid #e2e8f0', overflowY: 'auto', direction: 'rtl' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>ממתינים להצבה:</h4>
          {strips.filter(s => !s.onMap).map(s => (
            <Strip key={s.id} s={s} 
              onUpdate={(id: any, val: any) => setStrips(prev => prev.map(item => item.id === id ? {...item, alt: val} : item))}
              onMove={(id: any, x: any, y: any) => setStrips(prev => prev.map(item => item.id === id ? {...item, x, y, onMap: true} : item))} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}