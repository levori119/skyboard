import React, { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import Tesseract from 'tesseract.js';

const API_URL = '/api';

// --- ניהול סשן עמדה ---
interface WorkstationSession {
  workstationId: string;
  workstationName: string;
  sectorId: number;
  sectorName: string;
  sectorLabelHe: string;
  authToken: string;
}

const getSession = (): WorkstationSession | null => {
  try {
    const data = sessionStorage.getItem('workstation_session');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const saveSession = (session: WorkstationSession) => {
  sessionStorage.setItem('workstation_session', JSON.stringify(session));
};

const clearSession = () => {
  sessionStorage.removeItem('workstation_session');
};

// --- רכיב כניסה לעמדה ---
const WorkstationLogin = ({ onLogin }: { onLogin: (session: WorkstationSession) => void }) => {
  const [sectors, setSectors] = useState<any[]>([]);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [workstationName, setWorkstationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSectors = async () => {
      try {
        const res = await fetch(`${API_URL}/sectors`);
        if (res.ok) {
          const data = await res.json();
          setSectors(data);
        }
      } catch (err) {
        console.error('Failed to load sectors:', err);
      }
    };
    loadSectors();
  }, []);

  const handleLogin = async () => {
    if (!selectedSector || !workstationName.trim()) {
      setError('נא למלא את כל השדות');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/workstations/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workstationName, sectorId: selectedSector })
      });

      if (res.ok) {
        const data = await res.json();
        const session: WorkstationSession = {
          workstationId: data.workstation.id,
          workstationName: data.workstation.name,
          sectorId: data.sector.id,
          sectorName: data.sector.name,
          sectorLabelHe: data.sector.label_he,
          authToken: data.authToken
        };
        saveSession(session);
        onLogin(session);
      } else {
        setError('שגיאה בכניסה');
      }
    } catch (err) {
      setError('שגיאת חיבור');
    }

    setLoading(false);
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      direction: 'rtl'
    }}>
      <div style={{ 
        background: 'white', 
        padding: '40px', 
        borderRadius: '16px', 
        minWidth: '400px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ margin: '0 0 10px', color: '#0f172a', textAlign: 'center', fontSize: '28px' }}>BLUE TORCH</h1>
        <p style={{ margin: '0 0 30px', color: '#64748b', textAlign: 'center' }}>מערכת ניהול אווירי טקטי</p>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#334155' }}>שם עמדה:</label>
          <input
            type="text"
            value={workstationName}
            onChange={(e) => setWorkstationName(e.target.value)}
            placeholder="לדוגמה: עמדה 1"
            style={{ 
              width: '100%', 
              padding: '12px', 
              border: '2px solid #e2e8f0', 
              borderRadius: '8px', 
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#334155' }}>סקטור:</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {sectors.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSector(s.id)}
                style={{
                  flex: 1,
                  minWidth: '100px',
                  padding: '15px',
                  border: selectedSector === s.id ? '3px solid #2563eb' : '2px solid #e2e8f0',
                  borderRadius: '8px',
                  background: selectedSector === s.id ? '#dbeafe' : 'white',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: selectedSector === s.id ? '#1d4ed8' : '#334155'
                }}
              >
                {s.label_he || s.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
            {error}
          </div>
        )}
        
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '15px',
            background: loading ? '#94a3b8' : '#0f172a',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '18px',
            fontWeight: 'bold',
            cursor: loading ? 'default' : 'pointer'
          }}
        >
          {loading ? 'מתחבר...' : 'כניסה'}
        </button>
      </div>
    </div>
  );
};

// --- מערכת למידת ספרות (עם DB) ---

const getLearnedDigits = async (): Promise<{ digit: string; imageData: string }[]> => {
  try {
    const res = await fetch(`${API_URL}/digits`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

const saveLearnedDigit = async (digit: string, imageData: string) => {
  try {
    await fetch(`${API_URL}/digits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digit, imageData })
    });
  } catch (err) {
    console.error('Failed to save digit:', err);
  }
};

const clearLearnedDigits = async () => {
  try {
    await fetch(`${API_URL}/digits`, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to clear digits:', err);
  }
};

const getDigitsCount = async (): Promise<number> => {
  try {
    const res = await fetch(`${API_URL}/digits/count`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
};

const compareImages = (img1Data: ImageData, img2Data: ImageData): number => {
  const data1 = img1Data.data;
  const data2 = img2Data.data;
  let matches = 0;
  let total = 0;
  
  for (let i = 0; i < data1.length; i += 4) {
    const isDark1 = data1[i] < 128;
    const isDark2 = data2[i] < 128;
    if (isDark1 || isDark2) {
      total++;
      if (isDark1 === isDark2) matches++;
    }
  }
  
  return total > 0 ? matches / total : 0;
};

// --- רכיב לימוד ספרות ---
const LearnDigitsOverlay = ({ onClose }: { onClose: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDigit, setCurrentDigit] = useState(0);
  const [saved, setSaved] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadCount = async () => {
    const count = await getDigitsCount();
    setTotalCount(count);
  };

  useEffect(() => {
    loadCount();
  }, [saved]);

  const getCoords = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
    }
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { 
      ctx.lineTo(x, y); 
      ctx.stroke(); 
    }
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const saveDigit = async () => {
    if (!canvasRef.current) return;
    const imageData = canvasRef.current.toDataURL('image/png');
    await saveLearnedDigit(currentDigit.toString(), imageData);
    setSaved(s => s + 1);
    clearCanvas();
  };

  const nextDigit = () => {
    setCurrentDigit((currentDigit + 1) % 10);
    clearCanvas();
  };

  const handleClearAll = async () => {
    await clearLearnedDigits();
    setSaved(0);
    setTotalCount(0);
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', direction: 'rtl', minWidth: '300px' }}>
        <h3 style={{ margin: '0 0 15px', color: '#1e293b', textAlign: 'center' }}>לימוד כתב יד</h3>
        
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', color: '#64748b' }}>כתוב את הספרה: </span>
          <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#2563eb' }}>{currentDigit}</span>
        </div>
        
        <canvas 
          ref={canvasRef} 
          width={150} 
          height={150} 
          style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '8px', touchAction: 'none', display: 'block', margin: '0 auto' }}
          onMouseDown={startDrawing} 
          onMouseMove={draw} 
          onMouseUp={() => setIsDrawing(false)}
          onMouseLeave={() => setIsDrawing(false)}
          onTouchStart={startDrawing} 
          onTouchMove={draw} 
          onTouchEnd={() => setIsDrawing(false)} 
        />
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
          <button onClick={clearCanvas} style={{ flex: 1, padding: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer' }}>נקה</button>
          <button onClick={saveDigit} style={{ flex: 1, padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>שמור</button>
          <button onClick={nextDigit} style={{ flex: 1, padding: '8px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>הבא</button>
        </div>
        
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
          נשמרו בסשן: {saved} | סה"כ ב-DB: {totalCount}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
          <button onClick={handleClearAll} style={{ flex: 1, padding: '8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>מחק הכל</button>
          <button onClick={onClose} style={{ flex: 1, padding: '8px', background: '#1e293b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>סיום</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// --- רכיב כתיבה (OCR) ---
const HandwritingOverlay = ({ onComplete, onCancel }: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recognized, setRecognized] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  const workerRef = useRef<any>(null);

  useEffect(() => {
    const initWorker = async () => {
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
      });
      workerRef.current = worker;
    };
    initWorker();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const getCoords = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: any) => {
    e.preventDefault();
    setIsDrawing(true);
    setRecognized(null);
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
    }
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoords(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { 
      ctx.lineTo(x, y); 
      ctx.stroke(); 
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(processOCR, 800);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setRecognized(null);
  };

  const preprocessCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const tempCanvas = document.createElement('canvas');
    const scale = 3;
    tempCanvas.width = canvas.width * scale;
    tempCanvas.height = canvas.height * scale;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return null;

    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.3 + data[i+1] * 0.59 + data[i+2] * 0.11;
      const value = gray < 180 ? 0 : 255;
      data[i] = data[i+1] = data[i+2] = value;
    }

    tempCtx.putImageData(imageData, 0, 0);

    const padding = 40;
    const paddedCanvas = document.createElement('canvas');
    paddedCanvas.width = tempCanvas.width + padding * 2;
    paddedCanvas.height = tempCanvas.height + padding * 2;
    const paddedCtx = paddedCanvas.getContext('2d');
    if (paddedCtx) {
      paddedCtx.fillStyle = '#ffffff';
      paddedCtx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      paddedCtx.drawImage(tempCanvas, padding, padding);
    }

    return paddedCanvas.toDataURL('image/png');
  };

  const matchWithLearnedDigits = async (): Promise<string | null> => {
    if (!canvasRef.current) return null;
    
    const learnedDigits = await getLearnedDigits();
    if (learnedDigits.length === 0) return null;

    const currentCanvas = canvasRef.current;
    const currentCtx = currentCanvas.getContext('2d');
    if (!currentCtx) return null;

    const normalizeCanvas = document.createElement('canvas');
    normalizeCanvas.width = 50;
    normalizeCanvas.height = 50;
    const normalizeCtx = normalizeCanvas.getContext('2d');
    if (!normalizeCtx) return null;

    normalizeCtx.fillStyle = '#ffffff';
    normalizeCtx.fillRect(0, 0, 50, 50);
    normalizeCtx.drawImage(currentCanvas, 0, 0, 50, 50);
    const currentData = normalizeCtx.getImageData(0, 0, 50, 50);

    let bestMatch = { digit: '', score: 0 };

    for (const learned of learnedDigits) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve) => {
        img.onload = () => {
          normalizeCtx.fillStyle = '#ffffff';
          normalizeCtx.fillRect(0, 0, 50, 50);
          normalizeCtx.drawImage(img, 0, 0, 50, 50);
          const learnedData = normalizeCtx.getImageData(0, 0, 50, 50);
          
          const score = compareImages(currentData, learnedData);
          if (score > bestMatch.score) {
            bestMatch = { digit: learned.digit, score };
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = learned.imageData;
      });
    }

    return bestMatch.score > 0.6 ? bestMatch.digit : null;
  };

  const processOCR = async () => {
    if (!canvasRef.current) return;
    setLoading(true);
    
    const learnedResult = await matchWithLearnedDigits();
    
    if (learnedResult) {
      setRecognized(learnedResult);
      setLoading(false);
      return;
    }

    if (!workerRef.current) {
      setLoading(false);
      return;
    }

    const dataUrl = preprocessCanvas();
    if (!dataUrl) {
      setLoading(false);
      return;
    }
    
    try {
      const result = await workerRef.current.recognize(dataUrl);
      const text = result.data.text.replace(/[^0-9]/g, '');
      setRecognized(text || null);
    } catch (err) {
      console.error('OCR error:', err);
    }
    setLoading(false);
  };

  const confirmValue = () => {
    if (recognized) {
      onComplete(recognized);
    }
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  return (
    <div style={{ position: 'absolute', top: -10, right: '110%', zIndex: 1000, background: 'white', border: '2px solid #2563eb', padding: '12px', borderRadius: '10px', boxShadow: '0 6px 20px rgba(0,0,0,0.25)', minWidth: '244px', direction: 'rtl' }}>
      <div style={{fontSize: '14px', marginBottom: '8px', fontWeight: 'bold', color: '#2563eb', textAlign: 'center'}}>
        {loading ? "מזהה..." : "כתוב מספר:"}
      </div>
      
      <canvas 
        ref={canvasRef} 
        width={220} 
        height={100} 
        style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '6px', touchAction: 'none', display: 'block', width: '220px', height: '100px' }}
        onMouseDown={startDrawing} 
        onMouseMove={draw} 
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing} 
        onTouchMove={draw} 
        onTouchEnd={stopDrawing} 
      />
      
      {recognized && (
        <div style={{ marginTop: '8px', padding: '8px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '6px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#065f46' }}>זוהה: </span>
          <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>{recognized}</span>
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        <button onClick={clearCanvas} style={{ flex: 1, padding: '6px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>נקה</button>
        <button onClick={processOCR} disabled={loading} style={{ flex: 1, padding: '6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>עבד מחדש</button>
        <button onClick={onCancel} style={{ flex: 1, padding: '6px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
      </div>
      {recognized && (
        <button onClick={confirmValue} style={{ marginTop: '6px', width: '100%', padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>אישור - {recognized}</button>
      )}
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
      const sidebar = document.getElementById('sidebar-area');
      
      if (mapArea && sidebar) {
        const mapRect = mapArea.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const dropX = e.clientX - startPosRef.current.x;
        const dropY = e.clientY - startPosRef.current.y;

        // בדיקה אם נשחרר בתוך אזור התפריט - להחזיר לרשימה
        if (e.clientX >= sidebarRect.left && e.clientX <= sidebarRect.right &&
            e.clientY >= sidebarRect.top && e.clientY <= sidebarRect.bottom) {
          onMove(s.id, 0, 0, false); // החזר לתפריט
        }
        // בדיקה אם נשחרר בתוך אזור המפה
        else if (e.clientX >= mapRect.left && e.clientX <= mapRect.right &&
            e.clientY >= mapRect.top && e.clientY <= mapRect.bottom) {
          const x = dropX - mapRect.left;
          const y = dropY - mapRect.top;
          onMove(s.id, x, y, true);
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

// --- דשבורד סקטור ---
const SectorDashboard = ({ session, onLogout }: { session: WorkstationSession; onLogout: () => void }) => {
  const [strips, setStrips] = useState<any[]>([]);
  const [neighbors, setNeighbors] = useState<any[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<any[]>([]);
  const [outgoingTransfers, setOutgoingTransfers] = useState<any[]>([]);
  const [mapImg, setMapImg] = useState<string | null>(null);
  const [showLearn, setShowLearn] = useState(false);
  const [selectedNeighbor, setSelectedNeighbor] = useState<number | null>(null);

  const loadData = async () => {
    try {
      const [stripsRes, neighborsRes, incomingRes, outgoingRes] = await Promise.all([
        fetch(`${API_URL}/sectors/${session.sectorId}/strips`),
        fetch(`${API_URL}/sectors/${session.sectorId}/neighbors`),
        fetch(`${API_URL}/sectors/${session.sectorId}/incoming-transfers`),
        fetch(`${API_URL}/sectors/${session.sectorId}/outgoing-transfers`)
      ]);
      
      if (stripsRes.ok) setStrips(await stripsRes.json());
      if (neighborsRes.ok) setNeighbors(await neighborsRes.json());
      if (incomingRes.ok) setIncomingTransfers(await incomingRes.json());
      if (outgoingRes.ok) setOutgoingTransfers(await outgoingRes.json());
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [session.sectorId]);

  const handleMap = (e: any) => {
    const reader = new FileReader();
    reader.onload = (ev: any) => setMapImg(ev.target.result);
    reader.readAsDataURL(e.target.files[0]);
  };

  const handleMove = async (id: string, x: number, y: number, toMap: boolean) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, x, y, onMap: toMap} : item));
    try {
      await fetch(`${API_URL}/strips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y, onMap: toMap })
      });
    } catch (err) {
      console.error('Failed to update strip position:', err);
    }
  };

  const handleAltUpdate = async (id: string, alt: string) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, alt} : item));
    try {
      await fetch(`${API_URL}/strips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt })
      });
    } catch (err) {
      console.error('Failed to update strip altitude:', err);
    }
  };

  const handleTransfer = async (stripId: string, toSectorId: number) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toSectorId, workstationId: session.workstationId })
      });
      loadData();
    } catch (err) {
      console.error('Failed to initiate transfer:', err);
    }
  };

  const handleAcceptTransfer = async (transferId: string) => {
    try {
      await fetch(`${API_URL}/transfers/${transferId}/accept`, { method: 'POST' });
      loadData();
    } catch (err) {
      console.error('Failed to accept transfer:', err);
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    try {
      await fetch(`${API_URL}/transfers/${transferId}/reject`, { method: 'POST' });
      loadData();
    } catch (err) {
      console.error('Failed to reject transfer:', err);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '10px 20px', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <b style={{fontSize: '18px'}}>BLUE TORCH</b>
          <span style={{ background: '#2563eb', padding: '4px 12px', borderRadius: '4px', fontSize: '14px' }}>
            {session.sectorLabelHe} | {session.workstationName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{ background: '#334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            טען מפה <input type="file" accept="image/*" onChange={handleMap} style={{ display: 'none' }} />
          </label>
          <button onClick={() => setShowLearn(true)} style={{ background: '#7c3aed', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            למד כתב יד
          </button>
          <button onClick={onLogout} style={{ background: '#dc2626', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            יציאה
          </button>
        </div>
      </header>
      {showLearn && <LearnDigitsOverlay onClose={() => setShowLearn(false)} />}

      <div style={{ flex: 1, display: 'flex', background: '#eee' }}>
        {/* Neighbor Panels - Far Left */}
        <div style={{ width: 200, background: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #334155' }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>סקטורים שכנים</h4>
          </div>
          {neighbors.map(n => (
            <button
              key={n.id}
              onClick={() => setSelectedNeighbor(selectedNeighbor === n.id ? null : n.id)}
              style={{
                padding: '12px',
                background: selectedNeighbor === n.id ? '#334155' : 'transparent',
                border: 'none',
                borderBottom: '1px solid #334155',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'right',
                fontSize: '14px'
              }}
            >
              {n.label_he || n.name}
            </button>
          ))}
          
          {incomingTransfers.length > 0 && (
            <div style={{ padding: '10px', borderTop: '2px solid #f59e0b', marginTop: 'auto' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '12px', color: '#f59e0b' }}>העברות נכנסות ({incomingTransfers.length})</h4>
              {incomingTransfers.map(t => (
                <div key={t.id} style={{ background: '#334155', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{t.callsign}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>מ: {t.from_sector_label}</div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                    <button onClick={() => handleAcceptTransfer(t.id)} style={{ flex: 1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
                      קבל
                    </button>
                    <button onClick={() => handleRejectTransfer(t.id)} style={{ flex: 1, padding: '4px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
                      דחה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Map Area */}
        <div id="map-area" style={{ flex: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden' }}>
          {mapImg ? (
            <img src={mapImg} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>נא לטעון מפה</div>
          )}
          {strips.filter(s => s.onMap && s.status !== 'pending_transfer').map(s => (
            <Strip key={s.id} s={s} 
              onUpdate={handleAltUpdate}
              onMove={handleMove} 
            />
          ))}
        </div>

        {/* Sidebar - Right Side */}
        <div id="sidebar-area" style={{ width: 240, background: '#f8fafc', padding: '10px', borderLeft: '2px solid #e2e8f0', overflowY: 'auto', direction: 'rtl' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>ממתינים להצבה:</h4>
          {strips.filter(s => !s.onMap && s.status !== 'pending_transfer').map(s => (
            <div key={s.id} style={{ marginBottom: '8px' }}>
              <Strip s={s} 
                onUpdate={handleAltUpdate}
                onMove={handleMove} 
              />
              {selectedNeighbor && (
                <button
                  onClick={() => handleTransfer(s.id, selectedNeighbor)}
                  style={{ 
                    width: '100%', 
                    padding: '4px', 
                    background: '#3b82f6', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    fontSize: '10px', 
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                >
                  העבר ל{neighbors.find(n => n.id === selectedNeighbor)?.label_he}
                </button>
              )}
            </div>
          ))}

          {outgoingTransfers.length > 0 && (
            <>
              <h4 style={{ margin: '20px 0 10px', fontSize: '14px', color: '#f59e0b' }}>בהעברה ({outgoingTransfers.length}):</h4>
              {outgoingTransfers.map(t => (
                <div key={t.id} style={{ 
                  padding: '8px', 
                  background: '#fef3c7', 
                  border: '2px dashed #f59e0b', 
                  borderRadius: '6px', 
                  marginBottom: '8px' 
                }}>
                  <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{t.callsign}</div>
                  <div style={{ fontSize: '10px', color: '#92400e' }}>→ {t.to_sector_label}</div>
                  <div style={{ fontSize: '10px', color: '#92400e', marginTop: '4px' }}>ממתין לאישור...</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<WorkstationSession | null>(getSession());

  const handleLogin = (newSession: WorkstationSession) => {
    setSession(newSession);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (!session) {
    return <WorkstationLogin onLogin={handleLogin} />;
  }

  return <SectorDashboard session={session} onLogout={handleLogout} />;
}