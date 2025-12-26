import React, { useState, useRef } from 'react';
import { motion, useDragControls } from 'framer-motion';
import Tesseract from 'tesseract.js';

// --- 1. רכיב כתיבה עם זיהוי OCR משופר ---
const SmartEditOverlay = ({ onComplete, onCancel }: { onComplete: (val: string) => void, onCancel: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const timerRef = useRef<any>(null);

  const startDrawing = (e: any) => {
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    if (ctx) {
      ctx.lineTo(x, y);
      ctx.lineWidth = 6; // קו עבה עוזר ל-OCR
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(recognizeText, 1500); // מחכה 1.5 שניות של שקט
  };

  const recognizeText = async () => {
    if (!canvasRef.current) return;
    setIsProcessing(true);

    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng', {
        workerBlobURL: false,
      });

      // ניקוי תווים לא רלוונטיים (משאיר מספרים ואותיות)
      const cleanText = text.replace(/[^a-zA-Z0-9]/g, '');
      onComplete(cleanText || "???");
    } catch (err) {
      console.error(err);
      onComplete("ERR");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 5000, background: '#fff', padding: '15px', border: '3px solid #2563eb', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', color: '#2563eb' }}>
        {isProcessing ? "🔄 מפענח כתב יד..." : "✍️ כתוב נתון חדש:"}
      </div>
      <canvas 
        ref={canvasRef} width={250} height={120} 
        style={{ border: '2px solid #e2e8f0', background: '#f8fafc', touchAction: 'none', borderRadius: '8px' }}
        onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={() => setIsDrawing(false)}
        onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={() => setIsDrawing(false)}
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button onClick={() => canvasRef.current?.getContext('2d')?.clearRect(0,0,250,120)} style={{ flex: 1, padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}>נקה</button>
        <button onClick={onCancel} style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px' }}>ביטול</button>
      </div>
    </div>
  );
};

// --- 2. רכיב הפ"מ (Strip) ---
const StripComponent = ({ s, onDrop, updateField }: any) => {
  const controls = useDragControls();
  const [editingField, setEditingField] = useState<string | null>(null);

  return (
    <motion.div 
      drag dragControls={controls} dragListener={false} dragMomentum={false}
      onDragEnd={(_, info) => {
        const map = document.getElementById('map-area')?.getBoundingClientRect();
        if (map) onDrop(s.id, info.point.x - map.left, info.point.y - map.top);
      }}
      style={{ 
        display: 'flex', background: '#fff', border: '2px solid #000', marginBottom: '10px',
        width: s.onMap ? '200px' : '100%', position: s.onMap ? 'absolute' : 'relative',
        left: s.onMap ? s.x : 0, top: s.onMap ? s.y : 0, zIndex: 1000,
        boxShadow: s.onMap ? '0 10px 15px -3px rgba(0,0,0,0.1)' : 'none'
      }}
    >
      <div onPointerDown={(e) => controls.start(e)} style={{ width: '35px', background: '#000', cursor: 'grab', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⋮</div>
      <div style={{ padding: '10px', flexGrow: 1, position: 'relative' }}>
        <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
           <span>{s.callSign}</span> <span style={{color: '#64748b'}}>{s.sq}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <div onClick={() => setEditingField('alt')} style={{ flex: 1, border: '1px solid #e2e8f0', padding: '4px', borderRadius: '4px', fontSize: '12px', background: '#f8fafc' }}>
            <span style={{fontSize: '9px', color: '#94a3b8', display: 'block'}}>ALT</span>
            {s.alt}
          </div>
          <div onClick={() => setEditingField('task')} style={{ flex: 1, border: '1px solid #e2e8f0', padding: '4px', borderRadius: '4px', fontSize: '12px', background: '#f8fafc' }}>
             <span style={{fontSize: '9px', color: '#94a3b8', display: 'block'}}>TASK</span>
            {s.task}
          </div>
        </div>
        {editingField && (
          <SmartEditOverlay 
            onCancel={() => setEditingField(null)} 
            onComplete={(val) => { 
              updateField(s.id, editingField, val);
              setEditingField(null);
            }} 
          />
        )}
      </div>
    </motion.div>
  );
};

// --- 3. האפליקציה הראשית ---
export default function App() {
  const [strips, setStrips] = useState<any[]>([]);
  const [mapImage, setMapImage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 15));

  const updateField = (id: string, field: string, value: string) => {
    setStrips(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    addLog(`עדכון ${id}: ${field} -> ${value}`);
  };

  const handleDataUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event: any) => {
      try {
        const text = event.target.result;
        const rows = text.split('\n').filter((r:string) => r.trim());
        const parsed = rows.slice(1).map((row: string) => {
          const [id, callSign, sq, alt, task] = row.split(',');
          return { id: id.trim(), callSign: callSign.trim(), sq: sq.trim(), alt: alt.trim(), task: task.trim(), x: 0, y: 0, onMap: false };
        });
        setStrips(parsed);
        addLog("נתוני פ\"מים נטענו בהצלחה");
      } catch (err) { addLog("שגיאה בקריאת הקובץ"); }
    };
    reader.readAsText(file);
  };

  const handleMapUpload = (e: any) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event: any) => setMapImage(event.target.result);
    reader.readAsDataURL(file);
    addLog("מפה נטענה");
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '12px 20px', display: 'flex', gap: '20px', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <b style={{fontSize: '18px', letterSpacing: '1px'}}>BLUE TORCH</b>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{fontSize: '11px', cursor: 'pointer', background: '#334155', padding: '6px 12px', borderRadius: '4px'}}>
            📁 טען CSV <input type="file" hidden accept=".csv" onChange={handleDataUpload} />
          </label>
          <label style={{fontSize: '11px', cursor: 'pointer', background: '#334155', padding: '6px 12px', borderRadius: '4px'}}>
            🗺️ טען מפה <input type="file" hidden accept="image/*" onChange={handleMapUpload} />
          </label>
        </div>
      </header>

      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <div style={{ width: '300px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '15px', flexGrow: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px', borderBottom: '1px solid #f1f5f9', paddingBottom: '5px' }}>ממתינים לפריסה</h4>
            {strips.filter(s => !s.onMap).map(s => (
              <StripComponent key={s.id} s={s} updateField={updateField} onDrop={(id:any, x:any, y:any) => {
                setStrips(prev => prev.map(item => item.id === id ? { ...item, x, y, onMap: true } : item));
                addLog(`${id} נפרס על המפה`);
              }} />
            ))}
          </div>
          <div style={{ height: '180px', background: '#1e293b', color: '#38bdf8', padding: '12px', fontSize: '11px', overflowY: 'auto', borderTop: '4px solid #0f172a' }}>
            <div style={{ color: '#94a3b8', marginBottom: '5px', fontWeight: 'bold' }}>LOG_BOOK v1.0</div>
            {logs.map((log, i) => <div key={i} style={{marginBottom: '2px'}}>{log}</div>)}
          </div>
        </div>

        <div id="map-area" style={{ flexGrow: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden' }}>
          {mapImage ? (
            <img src={mapImage} style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute' }} alt="Map" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', flexDirection: 'column' }}>
              <span>אין מפה טעונה</span>
              <small>העלה קובץ JPG כדי להתחיל</small>
            </div>
          )}
          {strips.filter(s => s.onMap).map(s => (
            <StripComponent key={s.id} s={s} updateField={updateField} onDrop={(id:any, x:any, y:any) => {
               setStrips(prev => prev.map(item => item.id === id ? { ...item, x, y } : item));
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}