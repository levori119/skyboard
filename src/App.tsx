import React, { useState, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import Tesseract from 'tesseract.js';

// --- רכיב כתיבה (OCR) ---
const SmartEditOverlay = ({ onComplete, onCancel }: { onComplete: (val: string) => void, onCancel: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const timerRef = useRef<any>(null);

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(recognizeText, 1500);
  };

  const recognizeText = async () => {
    if (!canvasRef.current) return;
    setIsProcessing(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng');
      onComplete(text.trim().replace(/[^0-9]/g, '') || "???");
    } catch (err) { onComplete("ERR"); }
    finally { setIsProcessing(false); }
  };

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 10000, background: '#fff', padding: '10px', border: '2px solid #2563eb', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{isProcessing ? "מעבד..." : "כתוב גובה:"}</div>
      <canvas ref={canvasRef} width={200} height={100} style={{ border: '1px solid #ccc', background: '#f8fafc', touchAction: 'none' }}
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)}
        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)} />
      <button onClick={onCancel} style={{ width: '100%', marginTop: '5px', fontSize: '10px' }}>ביטול</button>
    </div>
  );
};

// --- רכיב הפ"מ (Strip) ---
const StripComponent = ({ s, onDrop, updateField }: any) => {
  const controls = useDragControls();
  const [editingField, setEditingField] = useState<string | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div 
      ref={itemRef}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={() => {
        const mapArea = document.getElementById('map-area');
        if (mapArea && itemRef.current) {
          const mapRect = mapArea.getBoundingClientRect();
          const itemRect = itemRef.current.getBoundingClientRect();

          // חישוב המיקום יחסית למפה, תוך נטרול ה-Scroll וה-Sidebar
          const x = itemRect.left - mapRect.left;
          const y = itemRect.top - mapRect.top;

          // בדיקה אם המלבן שוחרר בתוך שטח המפה
          const isInsideMap = 
            itemRect.right > mapRect.left && 
            itemRect.left < mapRect.right &&
            itemRect.bottom > mapRect.top && 
            itemRect.top < mapRect.bottom;

          if (isInsideMap) {
            onDrop(s.id, x, y);
          }
        }
      }}
      style={{ 
        display: 'flex', background: '#fff', border: '2px solid #000', marginBottom: '8px',
        width: s.onMap ? '180px' : '100%', 
        position: s.onMap ? 'absolute' : 'relative',
        left: s.onMap ? s.x : 0, 
        top: s.onMap ? s.y : 0, 
        zIndex: 1000,
        touchAction: 'none'
      }}
    >
      <div onPointerDown={(e) => controls.start(e)} style={{ width: '30px', background: '#000', cursor: 'grab', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>⋮</div>
      <div style={{ padding: '8px', flexGrow: 1, textAlign: 'right', position: 'relative' }}>
        <div style={{ fontWeight: 'bold', fontSize: '13px', display: 'flex', justifyContent: 'space-between', direction: 'ltr' }}>
          <span>{s.callSign}</span> <span>{s.sq}</span>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
          <div onClick={() => setEditingField('alt')} style={{ flex: 1, border: '1px solid #ddd', padding: '2px', fontSize: '11px', cursor: 'pointer', textAlign: 'center' }}>ALT: {s.alt}</div>
          <div onClick={() => setEditingField('task')} style={{ flex: 1, border: '1px solid #ddd', padding: '2px', fontSize: '11px', cursor: 'pointer', textAlign: 'center' }}>{s.task}</div>
        </div>
        {editingField && <SmartEditOverlay onCancel={() => setEditingField(null)} onComplete={(v) => { updateField(s.id, editingField, v); setEditingField(null); }} />}
      </div>
    </motion.div>
  );
};

export default function App() {
  const [strips, setStrips] = useState<any[]>([]);
  const [mapImage, setMapImage] = useState<string | null>(null);

  const handleDataUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event: any) => {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(event.target.result);
      const rows = text.split('\n').filter(r => r.trim());
      const parsed = rows.slice(1).map((row, i) => {
        const p = row.split(',');
        return { id: p[0] || i, callSign: p[1], sq: p[2], alt: p[3], task: p[4], x: 0, y: 0, onMap: false };
      });
      setStrips(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMapUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev: any) => setMapImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '10px', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <b style={{fontSize: '18px'}}>BLUE TORCH</b>
        <input type="file" accept=".csv" onChange={handleDataUpload} />
        <input type="file" accept="image/*" onChange={handleMapUpload} />
      </header>

      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <div style={{ width: '250px', background: '#f1f5f9', borderLeft: '2px solid #000', padding: '10px', overflowY: 'auto' }}>
          <h5 style={{marginTop: 0}}>ממתינים</h5>
          {strips.filter(s => !s.onMap).map(s => (
            <StripComponent key={s.id} s={s} 
              updateField={(id:any, f:any, v:any) => setStrips(prev => prev.map(x => x.id === id ? {...x, [f]: v} : x))}
              onDrop={(id:any, x:any, y:any) => setStrips(prev => prev.map(item => item.id === id ? { ...item, x, y, onMap: true } : item))} 
            />
          ))}
        </div>

        {/* Map Area */}
        <div id="map-area" style={{ flexGrow: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden' }}>
          {mapImage && <img src={mapImage} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="map" />}
          {strips.filter(s => s.onMap).map(s => (
            <StripComponent key={s.id} s={s} 
              updateField={(id:any, f:any, v:any) => setStrips(prev => prev.map(x => x.id === id ? {...x, [f]: v} : x))}
              onDrop={(id:any, x:any, y:any) => setStrips(prev => prev.map(item => item.id === id ? { ...item, x, y } : item))} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}