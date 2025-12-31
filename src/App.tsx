import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import Tesseract from 'tesseract.js';

const API_URL = '/api';

// --- רכיב כתיבה ידנית (Handwriting Overlay) ---
const HandwritingOverlay = ({ onComplete, onCancel, anchorRect }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recognized, setRecognized] = useState<string | null>(null);
  const workerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '10' as any,
      });
      workerRef.current = worker;
    };
    init();
    return () => { workerRef.current?.terminate(); };
  }, []);

  const processOCR = async () => {
    if (!canvasRef.current || !workerRef.current) return;
    setLoading(true);
    const canvas = canvasRef.current;
    const { data } = await workerRef.current.recognize(canvas.toDataURL());
    const text = data.text.replace(/[^0-9]/g, '').trim();
    setRecognized(text || null);
    setLoading(false);
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: '110%',
      background: 'white', padding: '10px', borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 1000, minWidth: '160px'
    }}>
      <div style={{fontSize: '12px', marginBottom: '5px', fontWeight: 'bold', color: '#2563eb'}}>
        {loading ? "מעבד..." : "גובה:"} {recognized && <span style={{color:'green'}}>{recognized}</span>}
      </div>
      <canvas
        ref={canvasRef} width={150} height={100}
        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', touchAction: 'none' }}
        onMouseDown={(e) => {
          setIsDrawing(true);
          const ctx = canvasRef.current?.getContext('2d');
          ctx?.beginPath();
          ctx?.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        }}
        onMouseMove={(e) => {
          if (!isDrawing) return;
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) {
            ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
            ctx.lineWidth = 4; ctx.stroke();
          }
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(processOCR, 1000);
        }}
        onMouseUp={() => setIsDrawing(false)}
      />
      <div style={{display:'flex', gap:'4px', marginTop:'8px'}}>
        <button onClick={onCancel} style={{ flex:1, padding: '4px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px' }}>ביטול</button>
        <button onClick={() => onComplete(recognized)} disabled={!recognized} style={{ flex:1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px' }}>אשר</button>
      </div>
    </div>
  );
};

// --- רכיב סטריפ (Strip) ---
const Strip = ({ s, onMove, onUpdate }: any) => {
  const controls = useDragControls();
  const [edit, setEdit] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={containerRef}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={() => {
        const mapArea = document.getElementById('map-area');
        if (mapArea && containerRef.current) {
          const mapRect = mapArea.getBoundingClientRect();
          const stripRect = containerRef.current.getBoundingClientRect();
          onMove(s.id, stripRect.left - mapRect.left, stripRect.top - mapRect.top);
        }
      }}
      style={{
        width: 180, background: 'white', border: '2px solid black',
        position: s.onMap ? 'absolute' : 'relative',
        left: s.onMap ? s.x : 0, top: s.onMap ? s.y : 0,
        display: 'flex', flexDirection: 'row-reverse', marginBottom: '8px', zIndex: 50
      }}
    >
      <div onPointerDown={(e) => controls.start(e)} style={{ width: 30, background: '#1e293b', cursor: 'grab', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>⋮</div>
      <div style={{ padding: '8px', flex: 1, direction: 'rtl', textAlign: 'right', position: 'relative' }}>
        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{s.callSign}</div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
          <div onClick={() => setEdit(true)} style={{ fontSize: '10px', border: '1px solid #ddd', flex: 1, cursor: 'pointer', padding: '2px' }}>גובה: {s.alt}</div>
          <div style={{ fontSize: '10px', flex: 1, color: '#666' }}>{s.task}</div>
        </div>
        {edit && <HandwritingOverlay onCancel={() => setEdit(false)} onComplete={(val: any) => { onUpdate(s.id, val); setEdit(false); }} />}
      </div>
    </motion.div>
  );
};

// --- האפליקציה המאוחדת ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [strips, setStrips] = useState<any[]>([]);
  const [mapImg, setMapImg] = useState<string | null>(null);

  // לוגיקת CSV
  const handleCsv = (e: any) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => {
      const rows = ev.target.result.split('\n').filter((r: any) => r.trim());
      const data = rows.slice(1).map((r: string) => {
        const c = r.split(',');
        return { id: Math.random().toString(), callSign: c[1], sq: c[2], alt: c[3] || "0", task: c[4], x: 0, y: 0, onMap: false };
      });
      setStrips(data);
    };
    reader.readAsText(e.target.files[0]);
  };

  // לוגיקת מפה
  const handleMap = (e: any) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => setMapImg(ev.target.result);
    reader.readAsDataURL(e.target.files[0]);
  };

  if (!isLoggedIn) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', direction: 'rtl' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center' }}>
          <h1>BLUE TORCH</h1>
          <button onClick={() => setIsLoggedIn(true)} style={{ padding: '10px 40px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>כניסה לעמדה</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      <header style={{ padding: '10px', background: '#0f172a', color: 'white', display: 'flex', gap: '15px' }}>
        <b>BLUE TORCH</b>
        <input type="file" accept=".csv" onChange={handleCsv} style={{ fontSize: '12px' }} />
        <input type="file" accept="image/*" onChange={handleMap} style={{ fontSize: '12px' }} />
      </header>

      <div style={{ flex: 1, display: 'flex', background: '#f1f5f9', overflow: 'hidden' }}>
        {/* אזור המפה */}
        <div id="map-area" style={{ flex: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden' }}>
          {mapImg && <img src={mapImg} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          {strips.filter(s => s.onMap).map(s => (
            <Strip key={s.id} s={s} 
              onUpdate={(id: any, val: any) => setStrips(prev => prev.map(i => i.id === id ? {...i, alt: val} : i))}
              onMove={(id: any, x: any, y: any) => setStrips(prev => prev.map(i => i.id === id ? {...i, x, y} : i))}
            />
          ))}
        </div>

        {/* רשימת המתנה (Sidebar) */}
        <div style={{ width: 200, background: 'white', borderLeft: '1px solid #ccc', padding: '10px', overflowY: 'auto' }}>
          <h4 style={{marginTop: 0}}>ממתינים:</h4>
          {strips.filter(s => !s.onMap).map(s => (
            <Strip key={s.id} s={s} 
              onUpdate={(id: any, val: any) => setStrips(prev => prev.map(i => i.id === id ? {...i, alt: val} : i))}
              onMove={(id: any, x: any, y: any) => setStrips(prev => prev.map(i => i.id === id ? {...i, x, y, onMap: true} : i))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}