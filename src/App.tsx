import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
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
const WorkstationLogin = ({ onLogin, onManagement }: { onLogin: (session: WorkstationSession) => void; onManagement?: () => void }) => {
  const [sectors, setSectors] = useState<any[]>([]);
  const [selectedSector, setSelectedSector] = useState<number | null>(null);
  const [workstationName, setWorkstationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWorkstationSelect, setShowWorkstationSelect] = useState(false);
  const [workstationPresets, setWorkstationPresets] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sectorsRes, presetsRes] = await Promise.all([
          fetch(`${API_URL}/sectors`),
          fetch(`${API_URL}/workstation-presets`)
        ]);
        if (sectorsRes.ok) {
          const data = await sectorsRes.json();
          setSectors(data);
        }
        if (presetsRes.ok) {
          const presets = await presetsRes.json();
          setWorkstationPresets(presets);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  const handlePresetLogin = async (preset: any) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/workstations/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset.name, sectorId: preset.sector_id, presetId: preset.id })
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
        minWidth: '450px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ margin: '0 0 10px', color: '#0f172a', textAlign: 'center', fontSize: '32px' }}>BLUE TORCH</h1>
        <p style={{ margin: '0 0 40px', color: '#64748b', textAlign: 'center' }}>מערכת ניהול אווירי טקטי</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button
            onClick={() => setShowWorkstationSelect(true)}
            style={{
              padding: '25px',
              background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '20px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
            }}
          >
            <span style={{ fontSize: '28px' }}>🖥️</span>
            בחירת עמדה
          </button>
          
          {onManagement && (
            <button
              onClick={onManagement}
              style={{
                padding: '25px',
                background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
              }}
            >
              <span style={{ fontSize: '28px' }}>⚙️</span>
              ניהול מערכת
            </button>
          )}
        </div>
      </div>
      
      {/* Workstation Selection Modal */}
      {showWorkstationSelect && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '16px',
            minWidth: '500px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#0f172a' }}>בחירת עמדה</h2>
              <button onClick={() => setShowWorkstationSelect(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
            </div>
            
            {/* Workstation Presets */}
            {workstationPresets.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#334155' }}>עמדות מוגדרות:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {workstationPresets.map((preset: any) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetLogin(preset)}
                      style={{
                        padding: '15px',
                        background: '#f1f5f9',
                        border: '2px solid #e2e8f0',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'right',
                        fontSize: '16px'
                      }}
                    >
                      <strong>{preset.name}</strong>
                      <span style={{ color: '#64748b', marginRight: '10px' }}>
                        ({sectors.find((s: any) => s.id === preset.sector_id)?.label_he || 'לא מוגדר'})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#334155' }}>או הגדר עמדה חדשה:</label>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#64748b' }}>שם עמדה:</label>
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
                <label style={{ display: 'block', marginBottom: '8px', color: '#64748b' }}>סקטור:</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {sectors.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSector(s.id)}
                      style={{
                        flex: 1,
                        minWidth: '100px',
                        padding: '12px',
                        border: selectedSector === s.id ? '3px solid #2563eb' : '2px solid #e2e8f0',
                        borderRadius: '8px',
                        background: selectedSector === s.id ? '#dbeafe' : 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
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
                <div style={{ padding: '10px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '15px', textAlign: 'center' }}>
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
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: loading ? 'default' : 'pointer'
                }}
              >
                {loading ? 'מתחבר...' : 'כניסה'}
              </button>
            </div>
          </div>
        </div>
      )}
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

// --- ניהול מפות ---
const MapsManager = ({ onClose, onMapsUpdated, isEmbedded = false }: { onClose: () => void; onMapsUpdated: () => void; isEmbedded?: boolean }) => {
  const [maps, setMaps] = useState<{id: number; name: string; created_at: string}[]>([]);
  const [newMapName, setNewMapName] = useState('');
  const [newMapData, setNewMapData] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadMaps = async () => {
    try {
      const res = await fetch(`${API_URL}/maps`);
      if (res.ok) setMaps(await res.json());
    } catch (err) {
      console.error('Failed to load maps:', err);
    }
  };

  useEffect(() => {
    loadMaps();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setNewMapData(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!newMapName.trim() || !newMapData) return;
    setUploading(true);
    try {
      const res = await fetch(`${API_URL}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMapName.trim(), image_data: newMapData })
      });
      if (res.ok) {
        setNewMapName('');
        setNewMapData(null);
        loadMaps();
        onMapsUpdated();
      }
    } catch (err) {
      console.error('Failed to upload map:', err);
    }
    setUploading(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('למחוק את המפה?')) return;
    try {
      await fetch(`${API_URL}/maps/${id}`, { method: 'DELETE' });
      loadMaps();
      onMapsUpdated();
    } catch (err) {
      console.error('Failed to delete map:', err);
    }
  };

  const content = (
    <div style={{ background: isEmbedded ? '#1e293b' : 'white', borderRadius: '12px', padding: '24px', width: isEmbedded ? '100%' : '600px', maxHeight: isEmbedded ? 'none' : '80vh', overflowY: 'auto', direction: 'rtl' }}>
      {!isEmbedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}>ניהול מפות</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
        </div>
      )}
      
      {isEmbedded && <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: 'white' }}>ניהול מפות</h2>}

      <div style={{ background: isEmbedded ? '#334155' : '#f1f5f9', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: isEmbedded ? '#94a3b8' : '#475569' }}>העלאת מפה חדשה</h3>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newMapName}
            onChange={(e) => setNewMapName(e.target.value)}
            placeholder="שם המפה"
            style={{ flex: 1, minWidth: '150px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: 'white' }}
          />
          <label style={{ background: '#475569', color: 'white', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            {newMapData ? 'קובץ נבחר ✓' : 'בחר קובץ JPG'}
            <input type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <button
            onClick={handleUpload}
            disabled={!newMapName.trim() || !newMapData || uploading}
            style={{
              background: newMapName.trim() && newMapData ? '#059669' : '#94a3b8',
              color: 'white',
              padding: '8px 20px',
              border: 'none',
              borderRadius: '6px',
              cursor: newMapName.trim() && newMapData ? 'pointer' : 'not-allowed',
              fontSize: '14px'
            }}
          >
            {uploading ? 'מעלה...' : 'העלה'}
          </button>
        </div>
        {newMapData && (
          <div style={{ marginTop: '12px' }}>
            <img src={newMapData} style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
          </div>
        )}
      </div>

      <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: isEmbedded ? '#94a3b8' : '#475569' }}>מפות קיימות ({maps.length})</h3>
      {maps.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>אין מפות עדיין</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {maps.map(map => (
            <div key={map.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: isEmbedded ? '#475569' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: isEmbedded ? 'white' : '#1e293b' }}>{map.name}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(map.created_at).toLocaleDateString('he-IL')}</div>
              </div>
              <button
                onClick={() => handleDelete(map.id)}
                style={{ background: '#ef4444', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                מחק
              </button>
            </div>
          ))}
        </div>
      )}

      {!isEmbedded && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button onClick={onClose} style={{ background: '#1e293b', color: 'white', padding: '10px 30px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
            סגור
          </button>
        </div>
      )}
    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {content}
    </div>,
    document.body
  );
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
const HandwritingOverlay = ({ onComplete, onCancel, anchorRect }: { onComplete: (val: string) => void; onCancel: () => void; anchorRect?: DOMRect | null }) => {
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

  // Calculate position - show to the right of the element, or centered if no anchor
  const getPosition = () => {
    if (anchorRect) {
      let top = anchorRect.top;
      let left = anchorRect.right + 10;
      
      // If would go off right edge, show to the left instead
      if (left + 260 > window.innerWidth) {
        left = anchorRect.left - 270;
      }
      // If would go off left edge, center it
      if (left < 10) {
        left = Math.max(10, (window.innerWidth - 260) / 2);
      }
      // If would go off bottom, move up
      if (top + 300 > window.innerHeight) {
        top = Math.max(10, window.innerHeight - 310);
      }
      return { top, left };
    }
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  };

  const pos = getPosition();

  return createPortal(
    <div style={{ 
      position: 'fixed', 
      top: typeof pos.top === 'number' ? pos.top : pos.top,
      left: typeof pos.left === 'number' ? pos.left : pos.left,
      transform: (pos as any).transform || 'none',
      zIndex: 10001, 
      background: 'white', 
      border: '2px solid #2563eb', 
      padding: '12px', 
      borderRadius: '10px', 
      boxShadow: '0 6px 20px rgba(0,0,0,0.25)', 
      minWidth: '244px', 
      direction: 'rtl' 
    }}>
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
    </div>,
    document.body
  );
};

// --- רכיב עריכת פמם בהעברה ---
const TransferStripEditor = ({ transfer, onAltUpdate, onCancel }: { 
  transfer: any; 
  onAltUpdate: (stripId: string, alt: string) => void;
  onCancel: (transferId: string) => void;
}) => {
  const [edit, setEdit] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const altRef = useRef<HTMLSpanElement>(null);

  const handleEditClick = () => {
    if (altRef.current) {
      setAnchorRect(altRef.current.getBoundingClientRect());
    }
    setEdit(true);
  };

  return (
    <div style={{ 
      padding: '8px', 
      background: '#fef3c7', 
      border: '2px dashed #f59e0b', 
      borderRadius: '6px', 
      marginBottom: '6px' 
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{transfer.callsign}</span>
        <span style={{ fontSize: '10px', background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>{transfer.sq}</span>
      </div>
      {transfer.squadron && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>טייסת: {transfer.squadron}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <span 
          ref={altRef}
          onClick={handleEditClick} 
          style={{ fontSize: '10px', background: '#fde68a', padding: '2px 6px', borderRadius: '4px', color: '#92400e', cursor: 'pointer', border: '1px solid #f59e0b' }}
        >
          גובה: {transfer.alt}
        </span>
        <span style={{ fontSize: '10px', color: '#92400e' }}>ממתין לאישור...</span>
      </div>
      <button 
        onClick={() => onCancel(transfer.id)} 
        style={{ 
          marginTop: '6px', 
          width: '100%', 
          padding: '4px', 
          background: '#dc2626', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          fontSize: '10px', 
          cursor: 'pointer' 
        }}
      >
        בטל העברה
      </button>
      {edit && (
        <HandwritingOverlay 
          onCancel={() => setEdit(false)} 
          onComplete={(val: string) => { 
            onAltUpdate(transfer.strip_id, val); 
            setEdit(false); 
          }} 
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
};

// --- פאנל סקטור שכן ניתן לגרירה ---
const DraggableNeighborPanel = ({ 
  neighbor, 
  subSectors,
  onDropOnMap,
  isExpanded,
  onToggle 
}: { 
  neighbor: any; 
  subSectors: any[];
  onDropOnMap: (sectorId: number, x: number, y: number, subSectorLabel?: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent, subLabel?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    setDragLabel(subLabel || null);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    };

    const handleUp = (e: PointerEvent) => {
      setIsDragging(false);
      
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && 
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          onDropOnMap(neighbor.id, x, y, dragLabel || undefined);
        }
      }
      setDragLabel(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, neighbor.id, onDropOnMap, dragLabel]);

  const neighborSubSectors = subSectors.filter(ss => ss.neighbor_id === neighbor.id);
  const hasSubSectors = neighborSubSectors.length > 0;

  return (
    <>
      <div style={{ borderBottom: '1px solid #334155' }}>
        <div
          onClick={onToggle}
          style={{
            padding: '12px',
            background: isExpanded ? '#334155' : 'transparent',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer'
          }}
        >
          <div 
            style={{ 
              flex: 1, 
              textAlign: 'right', 
              fontSize: '14px',
              userSelect: 'none'
            }}
          >
            {neighbor.label_he || neighbor.name}
          </div>
          {hasSubSectors && (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {isExpanded ? '▼' : '◀'}
            </span>
          )}
        </div>
        
        {isExpanded && hasSubSectors && (
          <div style={{ background: '#0f172a' }}>
            {neighborSubSectors.map(ss => (
              <div
                key={ss.id}
                onPointerDown={(e) => handlePointerDown(e, ss.label)}
                style={{
                  padding: '8px 12px 8px 24px',
                  fontSize: '12px',
                  color: '#94a3b8',
                  borderTop: '1px solid #1e293b',
                  cursor: 'grab',
                  userSelect: 'none'
                }}
              >
                ↳ {ss.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          left: dragPos.x,
          top: dragPos.y,
          background: '#2563eb',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          zIndex: 9999,
          pointerEvents: 'none',
          direction: 'rtl'
        }}>
          {dragLabel ? `${neighbor.label_he || neighbor.name} - ${dragLabel}` : (neighbor.label_he || neighbor.name)}
          <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>שחרר על המפה</div>
        </div>,
        document.body
      )}
    </>
  );
};

// --- תפריט קליק ימני ---
const ContextMenu = ({ x, y, neighbors, onSelect, onClose }: { 
  x: number; 
  y: number; 
  neighbors: any[]; 
  onSelect: (sectorId: number) => void; 
  onClose: () => void;
}) => {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  return createPortal(
    <div 
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'white',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        minWidth: '150px',
        direction: 'rtl',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: '8px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
        העבר לסקטור:
      </div>
      {neighbors.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>אין סקטורים שכנים</div>
      ) : (
        neighbors.map(n => (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: 'none',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'right',
              fontSize: '13px',
              borderBottom: '1px solid #f1f5f9'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#dbeafe'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            {n.label_he || n.name}
          </button>
        ))
      )}
    </div>,
    document.body
  );
};

// --- Draggable Map Marker component ---
const DraggableMapMarker = ({ 
  marker, 
  onMove, 
  onRemove, 
  onRename,
  strips,
  onTransfer,
  outgoingTransfers,
  onCancelTransfer
}: { 
  marker: { sectorId: number; x: number; y: number; subLabel?: string; label: string };
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
  onRename: (newLabel: string) => void;
  strips: any[];
  onTransfer: (stripId: string, sectorId: number, x: number, y: number, subLabel?: string) => void;
  outgoingTransfers: any[];
  onCancelTransfer: (transferId: string) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: marker.x, y: marker.y });
  const [showMenu, setShowMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(marker.subLabel || '');
  const startPosRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation();
    startPosRef.current = { x: e.clientX - marker.x, y: e.clientY - marker.y };
    setDragPos({ x: marker.x, y: marker.y });
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMoveEvent = (e: PointerEvent) => {
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        setDragPos({ 
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    };

    const handleUp = (e: PointerEvent) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const newX = e.clientX - rect.left;
        const newY = e.clientY - rect.top;
        if (newX >= 0 && newX <= rect.width && newY >= 0 && newY <= rect.height) {
          onMove(newX, newY);
        }
      }
    };

    window.addEventListener('pointermove', handleMoveEvent);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMoveEvent);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, onMove]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setTempName(marker.subLabel || marker.label);
    setEditingName(true);
  };

  const handleSaveName = () => {
    onRename(tempName);
    setEditingName(false);
  };

  const availableStrips = strips.filter((s: any) => !s.onMap && s.status !== 'pending_transfer');
  
  const markerTransfers = (outgoingTransfers || []).filter((t: any) => 
    t.to_sector_id === marker.sectorId && 
    (marker.subLabel ? t.sub_sector_label === marker.subLabel : !t.sub_sector_label)
  );

  return (
    <div
      data-marker-sector={marker.sectorId}
      data-marker-sublabel={marker.subLabel || ''}
      style={{
        position: 'absolute',
        left: (isDragging ? dragPos.x : marker.x) - 75,
        top: (isDragging ? dragPos.y : marker.y) - 40,
        width: '150px',
        background: '#3b82f6',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 50,
        userSelect: 'none',
        direction: 'rtl',
        overflow: 'hidden'
      }}
      onContextMenu={handleContextMenu}
    >
      <div 
        onPointerDown={handlePointerDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 8px',
          background: '#2563eb',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
          {marker.label}
          {marker.subLabel && <span style={{ fontSize: '10px', opacity: 0.8 }}> ({marker.subLabel})</span>}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: '#1d4ed8',
              border: 'none',
              color: 'white',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            +
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: '#dc2626',
              border: 'none',
              color: 'white',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>
      </div>
      
      <div 
        className="marker-drop-zone"
        data-marker-sector={marker.sectorId}
        data-marker-sublabel={marker.subLabel || ''}
        style={{
          padding: markerTransfers.length > 0 ? '6px' : '15px 10px',
          background: 'white',
          textAlign: 'center',
          color: '#64748b',
          fontSize: '12px',
          border: '2px dashed #cbd5e1',
          margin: '4px',
          borderRadius: '4px',
          minHeight: '40px'
        }}
      >
        {markerTransfers.length === 0 ? (
          <span>גרור לכאן</span>
        ) : (
          <div style={{ textAlign: 'right' }}>
            {markerTransfers.map((t: any) => (
              <div key={t.id} style={{ 
                background: '#fef3c7', 
                border: '1px solid #f59e0b',
                borderRadius: '3px',
                padding: '4px 6px',
                marginBottom: '4px',
                fontSize: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', color: '#92400e' }}>{t.callsign}</span>
                  <span style={{ background: '#3b82f6', color: 'white', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>{t.sq}</span>
                </div>
                {t.squadron && <div style={{ fontSize: '9px', color: '#7c3aed', fontWeight: 'bold' }}>טייסת: {t.squadron}</div>}
                <div style={{ color: '#b45309', fontSize: '9px' }}>גובה: {t.alt}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); onCancelTransfer(t.id); }}
                  style={{
                    marginTop: '4px',
                    width: '100%',
                    padding: '3px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '9px',
                    cursor: 'pointer'
                  }}
                >
                  בטל העברה
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showMenu && availableStrips.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '4px',
            minWidth: '120px',
            zIndex: 100
          }}
        >
          <div style={{ fontSize: '10px', color: '#64748b', padding: '4px', borderBottom: '1px solid #e2e8f0' }}>
            בחר פמם להעברה:
          </div>
          {availableStrips.map((s: any) => (
            <button
              key={s.id}
              onClick={() => {
                onTransfer(s.id, marker.sectorId, marker.x, marker.y, marker.subLabel);
                setShowMenu(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 8px',
                background: 'transparent',
                border: 'none',
                textAlign: 'right',
                cursor: 'pointer',
                fontSize: '11px',
                color: '#1e293b'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.callsign}</span>
                <span style={{ background: '#3b82f6', color: 'white', padding: '1px 4px', borderRadius: '3px', fontSize: '9px' }}>{s.sq}</span>
              </div>
              {s.squadron && <div style={{ fontSize: '9px', color: '#7c3aed' }}>טייסת: {s.squadron}</div>}
              <div style={{ fontSize: '9px', color: '#64748b' }}>גובה: {s.alt}</div>
            </button>
          ))}
        </div>
      )}

      {editingName && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '8px',
            zIndex: 100
          }}
        >
          <input
            type="text"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100px', fontSize: '11px' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button onClick={handleSaveName} style={{ flex: 1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
              שמור
            </button>
            <button onClick={() => setEditingName(false)} style={{ flex: 1, padding: '4px', background: '#64748b', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- רכיב העברה נכנסת ניתנת לגרירה ---
const DraggableIncomingTransfer = ({ transfer, onAccept, onReject, onAcceptToMap }: { 
  transfer: any; 
  onAccept: (id: string) => void; 
  onReject: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
}) => {
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
        const dropX = e.clientX;
        const dropY = e.clientY;

        if (dropX >= sidebarRect.left && dropX <= sidebarRect.right &&
            dropY >= sidebarRect.top && dropY <= sidebarRect.bottom) {
          onAccept(transfer.id);
        }
        else if (dropX >= mapRect.left && dropX <= mapRect.right &&
            dropY >= mapRect.top && dropY <= mapRect.bottom) {
          const x = dropX - mapRect.left;
          const y = dropY - mapRect.top;
          onAcceptToMap(transfer.id, x, y);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, transfer.id, onAccept, onAcceptToMap]);

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: '12px' }}>{transfer.callsign}</span>
        <span style={{ fontSize: '10px', background: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>{transfer.sq}</span>
      </div>
      {transfer.squadron && <div style={{ fontSize: '10px', color: '#a78bfa', marginTop: '2px' }}>טייסת: {transfer.squadron}</div>}
      <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
        <span>גובה: {transfer.alt}</span>
      </div>
      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
        מ: {transfer.from_sector_label}
        {transfer.sub_sector_label && <span style={{ color: '#60a5fa' }}> ({transfer.sub_sector_label})</span>}
      </div>
    </>
  );

  const baseStyle: React.CSSProperties = {
    background: '#334155', 
    padding: '8px', 
    borderRadius: '4px', 
    marginBottom: '8px',
    cursor: 'grab',
    touchAction: 'none'
  };

  if (isDragging) {
    return (
      <>
        <div ref={containerRef} style={{ ...baseStyle, opacity: 0.3 }}>{content}</div>
        {createPortal(
          <div style={{ 
            ...baseStyle, 
            position: 'fixed', 
            left: dragPos.x, 
            top: dragPos.y, 
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
            transform: 'rotate(2deg)',
            width: 180
          }}>
            {content}
            <div style={{ fontSize: '9px', color: '#10b981', marginTop: '6px', textAlign: 'center' }}>
              גרור למפה או לממתינים
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div ref={containerRef} style={baseStyle} onPointerDown={handlePointerDown}>
      {content}
      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px', textAlign: 'center' }}>
        גרור למפה או לממתינים להצבה
      </div>
      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
        <button onClick={(e) => { e.stopPropagation(); onAccept(transfer.id); }} style={{ flex: 1, padding: '4px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
          לממתינים
        </button>
        <button onClick={(e) => { e.stopPropagation(); onReject(transfer.id); }} style={{ flex: 1, padding: '4px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>
          דחה
        </button>
      </div>
    </div>
  );
};

// --- רכיב פ"מ (Strip) ---
const Strip = ({ s, onMove, onUpdate, neighbors, onTransfer, onToggleAirborne }: any) => {
  const controls = useDragControls();
  const [edit, setEdit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEditClick = () => {
    if (altRef.current) {
      setAnchorRect(altRef.current.getBoundingClientRect());
    }
    setEdit(true);
  };

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
      const neighborPanel = document.getElementById('neighbor-panel');
      
      if (mapArea && sidebar) {
        const mapRect = mapArea.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const dropX = e.clientX - startPosRef.current.x;
        const dropY = e.clientY - startPosRef.current.y;

        // בדיקה אם נשחרר על סמן סקטור במפה - העברה
        const markerDropZones = document.querySelectorAll('.marker-drop-zone');
        for (const zone of markerDropZones) {
          const zoneRect = zone.getBoundingClientRect();
          if (e.clientX >= zoneRect.left && e.clientX <= zoneRect.right &&
              e.clientY >= zoneRect.top && e.clientY <= zoneRect.bottom) {
            const sectorId = parseInt(zone.getAttribute('data-marker-sector') || '0');
            const subLabel = zone.getAttribute('data-marker-sublabel') || undefined;
            if (sectorId && onTransfer) {
              const x = e.clientX - mapRect.left;
              const y = e.clientY - mapRect.top;
              onTransfer(s.id, sectorId, x, y, subLabel || undefined);
              return;
            }
          }
        }

        // בדיקה אם נשחרר בתוך אזור הסקטורים השכנים - העברה
        if (neighborPanel && neighbors && neighbors.length > 0) {
          const neighborRect = neighborPanel.getBoundingClientRect();
          if (e.clientX >= neighborRect.left && e.clientX <= neighborRect.right &&
              e.clientY >= neighborRect.top && e.clientY <= neighborRect.bottom) {
            const neighborButtons = neighborPanel.querySelectorAll('[data-sector-id]');
            for (const btn of neighborButtons) {
              const btnRect = btn.getBoundingClientRect();
              if (e.clientX >= btnRect.left && e.clientX <= btnRect.right &&
                  e.clientY >= btnRect.top && e.clientY <= btnRect.bottom) {
                const sectorId = parseInt(btn.getAttribute('data-sector-id') || '0');
                if (sectorId && onTransfer) {
                  onTransfer(s.id, sectorId);
                  return;
                }
              }
            }
            if (onTransfer) {
              onTransfer(s.id, neighbors[0].id);
              return;
            }
          }
        }

        // בדיקה אם נשחרר בתוך אזור התפריט - להחזיר לרשימה
        if (e.clientX >= sidebarRect.left && e.clientX <= sidebarRect.right &&
            e.clientY >= sidebarRect.top && e.clientY <= sidebarRect.bottom) {
          onMove(s.id, 0, 0, false);
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
  }, [isDragging, s.id, onMove, neighbors, onTransfer]);

  // רכיב הפ"מ הבסיסי
  const stripContent = (style: React.CSSProperties) => (
    <div ref={!isDragging ? containerRef : undefined} style={style} onContextMenu={handleContextMenu}>
      <div 
        onPointerDown={handlePointerDown}
        style={{ width: 28, background: '#1e293b', cursor: 'grab', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '16px', userSelect: 'none' }}
      >⋮</div>
      <div style={{ padding: '4px 6px', flex: 1, direction: 'rtl', textAlign: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{s.callSign}</div>
            {s.squadron && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold' }}>/{s.squadron}</div>}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{s.task}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
          <div ref={altRef} onClick={handleEditClick} style={{ fontSize: '11px', border: '1px solid #cbd5e1', cursor: 'pointer', padding: '2px 6px', background: '#f1f5f9', borderRadius: '3px' }}>
            גובה: {s.alt || '-'}
          </div>
          <div style={{ fontSize: '10px', background: '#3b82f6', color: 'white', padding: '1px 5px', borderRadius: '3px' }}>{s.sq}</div>
          {onToggleAirborne && (
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleAirborne(s.id, !s.airborne); }}
              style={{ 
                padding: '2px 5px', 
                fontSize: '9px', 
                background: s.airborne ? '#3b82f6' : '#94a3b8', 
                color: 'white', 
                border: 'none', 
                borderRadius: '3px', 
                cursor: 'pointer',
                marginRight: 'auto'
              }}
            >
              {s.airborne ? 'באוויר' : 'טרם המראה'}
            </button>
          )}
        </div>
      </div>
      {edit && (
        <HandwritingOverlay 
          onCancel={() => setEdit(false)} 
          onComplete={(val: string) => { onUpdate(s.id, val); setEdit(false); }} 
          anchorRect={anchorRect}
        />
      )}
      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          neighbors={neighbors || []} 
          onSelect={(sectorId) => {
            if (onTransfer) onTransfer(s.id, sectorId);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );

  const baseStyle: React.CSSProperties = {
    width: 180, 
    background: s.airborne ? '#dbeafe' : 'white', 
    border: s.airborne ? '2px solid #3b82f6' : '2px solid black',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{s.callSign}</div>
                <div style={{ fontSize: '11px', background: '#3b82f6', color: 'white', padding: '1px 6px', borderRadius: '3px' }}>{s.sq}</div>
              </div>
              {s.squadron && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>טייסת: {s.squadron}</div>}
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
  const [subSectors, setSubSectors] = useState<any[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<any[]>([]);
  const [outgoingTransfers, setOutgoingTransfers] = useState<any[]>([]);
  const [mapImg, setMapImg] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [showLearn, setShowLearn] = useState(false);
  const [expandedNeighbors, setExpandedNeighbors] = useState<Set<number>>(new Set());
  const [pendingMapTransfer, setPendingMapTransfer] = useState<{sectorId: number; x: number; y: number; subLabel?: string} | null>(null);
  const [neighborMarkers, setNeighborMarkers] = useState<{sectorId: number; x: number; y: number; subLabel?: string; label: string}[]>([]);
  const [showSubSectorManager, setShowSubSectorManager] = useState(false);
  const [editingSubSector, setEditingSubSector] = useState<any>(null);
  const [newSubSectorNeighbor, setNewSubSectorNeighbor] = useState<number | null>(null);
  const [newSubSectorLabel, setNewSubSectorLabel] = useState('');
  const [drawingMode, setDrawingMode] = useState(false);
  const [penColor, setPenColor] = useState('#ef4444');
  const [penSize, setPenSize] = useState(3);
  const [eraserMode, setEraserMode] = useState(false);
  const [availableMaps, setAvailableMaps] = useState<{id: number; name: string}[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{x: number; y: number} | null>(null);

  const loadData = async () => {
    try {
      const [stripsRes, neighborsRes, subSectorsRes, incomingRes, outgoingRes, mapsRes] = await Promise.all([
        fetch(`${API_URL}/sectors/${session.sectorId}/strips`),
        fetch(`${API_URL}/sectors/${session.sectorId}/neighbors`),
        fetch(`${API_URL}/sectors/${session.sectorId}/sub-sectors`),
        fetch(`${API_URL}/sectors/${session.sectorId}/incoming-transfers`),
        fetch(`${API_URL}/sectors/${session.sectorId}/outgoing-transfers`),
        fetch(`${API_URL}/maps`)
      ]);
      
      if (stripsRes.ok) setStrips(await stripsRes.json());
      if (neighborsRes.ok) setNeighbors(await neighborsRes.json());
      if (subSectorsRes.ok) setSubSectors(await subSectorsRes.json());
      if (incomingRes.ok) setIncomingTransfers(await incomingRes.json());
      if (outgoingRes.ok) setOutgoingTransfers(await outgoingRes.json());
      if (mapsRes.ok) setAvailableMaps(await mapsRes.json());
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadDefaultMap = async () => {
    try {
      const defaultsRes = await fetch(`${API_URL}/defaults`);
      if (defaultsRes.ok) {
        const defaults = await defaultsRes.json();
        if (defaults.defaultMap && !mapImg) {
          const mapRes = await fetch(`${API_URL}/maps/${defaults.defaultMap}`);
          if (mapRes.ok) {
            const map = await mapRes.json();
            setMapImg(map.image_data);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load default map:', err);
    }
  };

  useEffect(() => {
    loadDefaultMap();
  }, []);

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

  const selectMap = async (mapId: number) => {
    try {
      const res = await fetch(`${API_URL}/maps/${mapId}`);
      if (res.ok) {
        const map = await res.json();
        setMapImg(map.image_data);
      }
    } catch (err) {
      console.error('Failed to load map:', err);
    }
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

  const handleTransfer = async (stripId: string, toSectorId: number, targetX?: number, targetY?: number, subSectorLabel?: string) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          toSectorId, 
          workstationId: session.workstationId,
          targetX: targetX || 0,
          targetY: targetY || 0,
          subSectorLabel
        })
      });
      loadData();
    } catch (err) {
      console.error('Failed to initiate transfer:', err);
    }
  };

  const handleNeighborDropOnMap = (sectorId: number, x: number, y: number, subLabel?: string) => {
    const neighbor = neighbors.find(n => n.id === sectorId);
    const label = subLabel || neighbor?.label || 'סקטור';
    setNeighborMarkers(prev => [...prev.filter(m => m.sectorId !== sectorId || m.subLabel !== subLabel), 
      { sectorId, x, y, subLabel, label }
    ]);
  };

  const handleSelectStripForTransfer = (stripId: string) => {
    if (pendingMapTransfer) {
      handleTransfer(stripId, pendingMapTransfer.sectorId, pendingMapTransfer.x, pendingMapTransfer.y, pendingMapTransfer.subLabel);
      setPendingMapTransfer(null);
    }
  };

  const toggleNeighborExpanded = (neighborId: number) => {
    setExpandedNeighbors(prev => {
      const next = new Set(prev);
      if (next.has(neighborId)) next.delete(neighborId);
      else next.add(neighborId);
      return next;
    });
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

  const handleAcceptToMap = async (transferId: string, x: number, y: number) => {
    try {
      await fetch(`${API_URL}/transfers/${transferId}/accept-to-map`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y })
      });
      loadData();
    } catch (err) {
      console.error('Failed to accept transfer to map:', err);
    }
  };

  const handleAddSubSector = async () => {
    if (!newSubSectorNeighbor || !newSubSectorLabel.trim()) return;
    try {
      await fetch(`${API_URL}/sectors/${session.sectorId}/sub-sectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborId: newSubSectorNeighbor,
          label: newSubSectorLabel.trim()
        })
      });
      setNewSubSectorNeighbor(null);
      setNewSubSectorLabel('');
      loadData();
    } catch (err) {
      console.error('Failed to add sub-sector:', err);
    }
  };

  const handleUpdateSubSector = async (subSectorId: number, label: string) => {
    try {
      await fetch(`${API_URL}/sub-sectors/${subSectorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      setEditingSubSector(null);
      loadData();
    } catch (err) {
      console.error('Failed to update sub-sector:', err);
    }
  };

  const handleDeleteSubSector = async (subSectorId: number) => {
    if (!confirm('האם למחוק את תת-הסקטור?')) return;
    try {
      await fetch(`${API_URL}/sub-sectors/${subSectorId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete sub-sector:', err);
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    try {
      await fetch(`${API_URL}/transfers/${transferId}/cancel`, { method: 'POST' });
      loadData();
    } catch (err) {
      console.error('Failed to cancel transfer:', err);
    }
  };

  const handleToggleAirborne = async (id: string, airborne: boolean) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, airborne} : item));
    try {
      await fetch(`${API_URL}/strips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airborne })
      });
    } catch (err) {
      console.error('Failed to update airborne status:', err);
    }
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode) return;
    isDrawingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    lastPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode || !isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPosRef.current) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.globalCompositeOperation = eraserMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = eraserMode ? 'rgba(0,0,0,1)' : penColor;
    ctx.lineWidth = eraserMode ? penSize * 10 : penSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    lastPosRef.current = { x, y };
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const mapArea = document.getElementById('map-area');
      if (canvas && mapArea) {
        canvas.width = mapArea.clientWidth;
        canvas.height = mapArea.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '10px 20px', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <b style={{fontSize: '18px'}}>BLUE TORCH</b>
          <span style={{ background: '#2563eb', padding: '4px 12px', borderRadius: '4px', fontSize: '14px' }}>
            {session.sectorLabelHe} | {session.workstationName}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            onChange={(e) => e.target.value && selectMap(Number(e.target.value))}
            style={{ background: '#334155', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
            defaultValue=""
          >
            <option value="" disabled>בחר מפה</option>
            {availableMaps.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={() => setShowLearn(true)} style={{ background: '#7c3aed', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            למד כתב יד
          </button>
          <button onClick={() => setShowSubSectorManager(true)} style={{ background: '#0891b2', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            ניהול תת-סקטורים
          </button>
          <button onClick={onLogout} style={{ background: '#dc2626', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            יציאה
          </button>
        </div>
      </header>
      {showLearn && <LearnDigitsOverlay onClose={() => setShowLearn(false)} />}
      
      {showSubSectorManager && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '500px', maxHeight: '80vh', overflowY: 'auto', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>ניהול תת-סקטורים</h2>
              <button onClick={() => setShowSubSectorManager(false)} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>הוסף תת-סקטור חדש</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select 
                  value={newSubSectorNeighbor || ''} 
                  onChange={(e) => setNewSubSectorNeighbor(parseInt(e.target.value) || null)}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1, minWidth: '120px' }}
                >
                  <option value="">בחר סקטור שכן</option>
                  {neighbors.map(n => (
                    <option key={n.id} value={n.id}>{n.label_he || n.name}</option>
                  ))}
                </select>
                <input 
                  type="text" 
                  value={newSubSectorLabel}
                  onChange={(e) => setNewSubSectorLabel(e.target.value)}
                  placeholder="שם תת-סקטור"
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1, minWidth: '100px' }}
                />
                <button 
                  onClick={handleAddSubSector}
                  disabled={!newSubSectorNeighbor || !newSubSectorLabel.trim()}
                  style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (!newSubSectorNeighbor || !newSubSectorLabel.trim()) ? 0.5 : 1 }}
                >
                  הוסף
                </button>
              </div>
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>תת-סקטורים קיימים</h3>
              {neighbors.map(neighbor => {
                const neighborSubs = subSectors.filter(ss => ss.neighbor_id === neighbor.id);
                if (neighborSubs.length === 0) return null;
                return (
                  <div key={neighbor.id} style={{ marginBottom: '15px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#334155', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
                      {neighbor.label_he || neighbor.name}
                    </div>
                    {neighborSubs.map(ss => (
                      <div key={ss.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#f1f5f9', borderRadius: '4px', marginBottom: '6px' }}>
                        {editingSubSector?.id === ss.id ? (
                          <>
                            <input 
                              type="text" 
                              value={editingSubSector.label}
                              onChange={(e) => setEditingSubSector({...editingSubSector, label: e.target.value})}
                              style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                            />
                            <button onClick={() => handleUpdateSubSector(ss.id, editingSubSector.label)} style={{ padding: '4px 10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                              שמור
                            </button>
                            <button onClick={() => setEditingSubSector(null)} style={{ padding: '4px 10px', background: '#64748b', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                              ביטול
                            </button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 1, fontSize: '13px' }}>{ss.label}</span>
                            <button onClick={() => setEditingSubSector({id: ss.id, label: ss.label})} style={{ padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                              ערוך
                            </button>
                            <button onClick={() => handleDeleteSubSector(ss.id)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                              מחק
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {subSectors.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                  אין תת-סקטורים. הוסף חדש למעלה.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', background: '#eee' }}>
        {/* Neighbor Panels - Far Left */}
        <div id="neighbor-panel" style={{ width: 200, background: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #334155' }}>
            <h4 style={{ margin: 0, fontSize: '14px' }}>סקטורים שכנים</h4>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>גרור למפה להעברה עם מיקום</div>
          </div>
          {neighbors.map(n => (
            <DraggableNeighborPanel
              key={n.id}
              neighbor={n}
              subSectors={subSectors}
              onDropOnMap={handleNeighborDropOnMap}
              isExpanded={expandedNeighbors.has(n.id)}
              onToggle={() => toggleNeighborExpanded(n.id)}
            />
          ))}
          
          {incomingTransfers.length > 0 && (
            <div style={{ padding: '10px', borderTop: '2px solid #f59e0b', marginTop: 'auto' }}>
              <h4 style={{ margin: '0 0 10px', fontSize: '12px', color: '#f59e0b' }}>העברות נכנסות ({incomingTransfers.length})</h4>
              {incomingTransfers.map(t => (
                <DraggableIncomingTransfer 
                  key={t.id}
                  transfer={t}
                  onAccept={handleAcceptTransfer}
                  onReject={handleRejectTransfer}
                  onAcceptToMap={handleAcceptToMap}
                />
              ))}
            </div>
          )}
        </div>

        {/* Map Area */}
        <div id="map-area" style={{ flex: 1, position: 'relative', background: '#cbd5e1', overflow: 'hidden', minHeight: 0 }}>
          {/* Map Zoom Toolbar */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(30,41,59,0.9)', padding: '6px', borderRadius: '8px' }}>
            <button
              onClick={() => setMapZoom(z => Math.min(z + 0.25, 3))}
              style={{ width: 32, height: 32, background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
            >+</button>
            <button
              onClick={() => setMapZoom(z => Math.max(z - 0.25, 0.5))}
              style={{ width: 32, height: 32, background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}
            >−</button>
            <button
              onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }); }}
              style={{ width: 32, height: 32, background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
            >איפוס</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
              <button onClick={() => setMapPan(p => ({ ...p, y: p.y + 50 }))} style={{ width: 32, height: 24, background: '#334155', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>▲</button>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button onClick={() => setMapPan(p => ({ ...p, x: p.x + 50 }))} style={{ width: 15, height: 24, background: '#334155', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>◀</button>
                <button onClick={() => setMapPan(p => ({ ...p, x: p.x - 50 }))} style={{ width: 15, height: 24, background: '#334155', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>▶</button>
              </div>
              <button onClick={() => setMapPan(p => ({ ...p, y: p.y - 50 }))} style={{ width: 32, height: 24, background: '#334155', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '12px' }}>▼</button>
            </div>
            <div style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'center', marginTop: '2px' }}>{Math.round(mapZoom * 100)}%</div>
          </div>
          
          {/* Map + Strips Container with Transform (zoom/pan applies to both) */}
          <div style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%',
            transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out'
          }}>
            {/* Map Image */}
            {mapImg ? (
              <img src={mapImg} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            ) : (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', pointerEvents: 'none' }}>נא לטעון מפה</div>
            )}
            
            {/* Strips Layer */}
            {strips.filter(s => s.onMap && s.status !== 'pending_transfer').map(s => (
              <Strip key={s.id} s={s} 
                onUpdate={handleAltUpdate}
                onMove={handleMove}
                neighbors={neighbors}
                onTransfer={handleTransfer}
                onToggleAirborne={handleToggleAirborne}
              />
            ))}
            
            {/* Markers Layer */}
            {neighborMarkers.map((marker, idx) => (
              <DraggableMapMarker
                key={`marker-${marker.sectorId}-${marker.subLabel || idx}`}
                marker={marker}
                strips={strips}
                outgoingTransfers={outgoingTransfers}
                onMove={(x, y) => {
                  setNeighborMarkers(prev => prev.map(m => 
                    m === marker ? { ...m, x, y } : m
                  ));
                }}
                onRemove={() => setNeighborMarkers(prev => prev.filter(m => m !== marker))}
                onRename={(newLabel) => {
                  setNeighborMarkers(prev => prev.map(m => 
                    m === marker ? { ...m, subLabel: newLabel } : m
                  ));
                }}
                onTransfer={handleTransfer}
                onCancelTransfer={handleCancelTransfer}
              />
            ))}
            
            {/* Drawing Canvas Overlay - inside transform container */}
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: drawingMode ? 'auto' : 'none',
                cursor: drawingMode ? (eraserMode ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\'%3E%3Cpath d=\'M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l7 7c.8.8.8 2 0 2.8L14 22\'/%3E%3Cpath d=\'M6.5 13.5 15 5\'/%3E%3C/svg%3E") 12 12, auto' : 'crosshair') : 'default',
                touchAction: 'none'
              }}
            />
          </div>
          
          {/* Drawing Toolbar */}
          <div style={{
            position: 'absolute',
            top: 10,
            left: 60,
            background: 'rgba(15, 23, 42, 0.9)',
            borderRadius: '8px',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            zIndex: 1000
          }}>
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              style={{
                padding: '8px 12px',
                background: drawingMode ? '#10b981' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              {drawingMode ? 'סיום ציור' : 'מצב ציור'}
            </button>
            
            {drawingMode && (
              <>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#000000', '#ffffff'].map(color => (
                    <button
                      key={color}
                      onClick={() => { setPenColor(color); setEraserMode(false); }}
                      style={{
                        width: 24,
                        height: 24,
                        background: color,
                        border: !eraserMode && penColor === color ? '3px solid #fff' : '1px solid #64748b',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        boxShadow: !eraserMode && penColor === color ? '0 0 0 2px #3b82f6' : 'none'
                      }}
                    />
                  ))}
                </div>
                
                <button
                  onClick={() => setEraserMode(!eraserMode)}
                  style={{
                    padding: '6px',
                    background: eraserMode ? '#f59e0b' : '#475569',
                    color: 'white',
                    border: eraserMode ? '2px solid #fff' : 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: eraserMode ? 'bold' : 'normal'
                  }}
                >
                  {eraserMode ? 'מחק פעיל' : 'מחק'}
                </button>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'white', fontSize: '10px' }}>עובי:</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={penSize}
                    onChange={(e) => setPenSize(Number(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <span style={{ color: 'white', fontSize: '10px', minWidth: '16px' }}>{penSize}</span>
                </div>
                
                <button
                  onClick={clearCanvas}
                  style={{
                    padding: '6px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  נקה הכל
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sidebar - Right Side */}
        <div id="sidebar-area" style={{ width: 240, background: '#f8fafc', padding: '10px', borderLeft: '2px solid #e2e8f0', overflowY: 'auto', direction: 'rtl' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>ממתינים להצבה:</h4>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '10px' }}>קליק ימני על פמם לבחירת סקטור יעד</div>
          {strips.filter(s => !s.onMap && s.status !== 'pending_transfer').map(s => (
            <div key={s.id} style={{ marginBottom: '8px' }}>
              <Strip s={s} 
                onUpdate={handleAltUpdate}
                onMove={handleMove}
                neighbors={neighbors}
                onTransfer={handleTransfer}
                onToggleAirborne={handleToggleAirborne}
              />
            </div>
          ))}

          {outgoingTransfers.length > 0 && (
            <>
              <h4 style={{ margin: '20px 0 10px', fontSize: '14px', color: '#f59e0b' }}>בהעברה ({outgoingTransfers.length}):</h4>
              {/* Group by destination sector */}
              {Object.entries(
                outgoingTransfers.reduce((groups: Record<string, any[]>, t) => {
                  const key = t.to_sector_label || t.to_sector_name;
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(t);
                  return groups;
                }, {})
              ).map(([sectorLabel, transfers]) => (
                <div key={sectorLabel} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#b45309', marginBottom: '6px', borderBottom: '1px solid #fbbf24', paddingBottom: '4px' }}>
                    → {sectorLabel}
                  </div>
                  {(transfers as any[]).map(t => (
                    <TransferStripEditor 
                      key={t.id}
                      transfer={t}
                      onAltUpdate={handleAltUpdate}
                      onCancel={handleCancelTransfer}
                    />
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Strip Selection Modal */}
      {pendingMapTransfer && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            width: '300px',
            direction: 'rtl'
          }}>
            <h3 style={{ margin: '0 0 15px', fontSize: '16px' }}>בחר פמם להעברה</h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '15px' }}>
              יעד: {neighbors.find(n => n.id === pendingMapTransfer.sectorId)?.label_he || 'לא ידוע'}
              {pendingMapTransfer.subLabel && ` (${pendingMapTransfer.subLabel})`}
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {strips.filter(s => !s.onMap && s.status !== 'pending_transfer').map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectStripForTransfer(s.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px',
                    marginBottom: '8px',
                    background: '#f1f5f9',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'right'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{s.callSign}</div>
                    <div style={{ fontSize: '11px', background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>{s.sq}</div>
                  </div>
                  {s.squadron && <div style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>טייסת: {s.squadron}</div>}
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>גובה: {s.alt} | {s.task}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingMapTransfer(null)}
              style={{
                marginTop: '15px',
                width: '100%',
                padding: '10px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ביטול
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// --- דף ניהול ---
const ManagementPage = ({ onBack }: { onBack: () => void }) => {
  const [activeTab, setActiveTab] = useState<'maps' | 'sectors' | 'presets'>('presets');
  const [sectors, setSectors] = useState<any[]>([]);
  const [maps, setMaps] = useState<{id: number; name: string}[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [allSubSectors, setAllSubSectors] = useState<any[]>([]);
  
  // Sector editing
  const [editingSector, setEditingSector] = useState<any | null>(null);
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorLabel, setNewSectorLabel] = useState('');
  
  // Preset editing
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: '',
    sector_id: '',
    map_id: '',
    my_sub_sectors: [] as string[],
    neighbor_sub_sectors: [] as string[]
  });

  const loadData = async () => {
    try {
      const [sectorsRes, mapsRes, presetsRes] = await Promise.all([
        fetch(`${API_URL}/sectors`),
        fetch(`${API_URL}/maps`),
        fetch(`${API_URL}/workstation-presets`)
      ]);
      if (sectorsRes.ok) {
        const sectorsData = await sectorsRes.json();
        setSectors(sectorsData);
        // Load sub-sectors for each sector
        const allSubs: any[] = [];
        for (const sector of sectorsData) {
          const subsRes = await fetch(`${API_URL}/sectors/${sector.id}/sub-sectors`);
          if (subsRes.ok) {
            const subs = await subsRes.json();
            allSubs.push(...subs.map((s: any) => ({ ...s, sectorId: sector.id, sectorLabel: sector.label_he || sector.name })));
          }
        }
        setAllSubSectors(allSubs);
      }
      if (mapsRes.ok) setMaps(await mapsRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sector management
  const createSector = async () => {
    if (!newSectorName.trim()) return;
    try {
      await fetch(`${API_URL}/sectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSectorName, label_he: newSectorLabel || newSectorName })
      });
      setNewSectorName('');
      setNewSectorLabel('');
      loadData();
    } catch (err) {
      console.error('Failed to create sector:', err);
    }
  };

  const updateSector = async (id: number, name: string, label_he: string) => {
    try {
      await fetch(`${API_URL}/sectors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, label_he })
      });
      setEditingSector(null);
      loadData();
    } catch (err) {
      console.error('Failed to update sector:', err);
    }
  };

  const deleteSector = async (id: number) => {
    if (!confirm('למחוק סקטור זה?')) return;
    try {
      await fetch(`${API_URL}/sectors/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete sector:', err);
    }
  };

  // Preset management
  const savePreset = async () => {
    if (!presetForm.name.trim()) return;
    try {
      const method = editingPreset ? 'PUT' : 'POST';
      const url = editingPreset ? `${API_URL}/workstation-presets/${editingPreset.id}` : `${API_URL}/workstation-presets`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetForm.name,
          sector_id: presetForm.sector_id ? parseInt(presetForm.sector_id) : null,
          map_id: presetForm.map_id ? parseInt(presetForm.map_id) : null,
          my_sub_sectors: presetForm.my_sub_sectors,
          neighbor_sub_sectors: presetForm.neighbor_sub_sectors
        })
      });
      setEditingPreset(null);
      setPresetForm({ name: '', sector_id: '', map_id: '', my_sub_sectors: [], neighbor_sub_sectors: [] });
      loadData();
    } catch (err) {
      console.error('Failed to save preset:', err);
    }
  };

  const editPreset = (preset: any) => {
    setEditingPreset(preset);
    setPresetForm({
      name: preset.name,
      sector_id: preset.sector_id?.toString() || '',
      map_id: preset.map_id?.toString() || '',
      my_sub_sectors: preset.my_sub_sectors || [],
      neighbor_sub_sectors: preset.neighbor_sub_sectors || []
    });
  };

  const deletePreset = async (id: number) => {
    if (!confirm('למחוק עמדה זו?')) return;
    try {
      await fetch(`${API_URL}/workstation-presets/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  };

  const tabStyle = (active: boolean) => ({
    padding: '12px 24px',
    background: active ? '#3b82f6' : '#334155',
    color: 'white',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: active ? 'bold' : 'normal' as const
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: 'white', direction: 'rtl' }}>
      <header style={{ background: '#1e293b', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '22px' }}>ניהול מערכת</h1>
        <button onClick={onBack} style={{ background: '#475569', color: 'white', padding: '10px 25px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
          חזרה
        </button>
      </header>

      {/* Tabs */}
      <div style={{ padding: '20px 30px 0', display: 'flex', gap: '4px' }}>
        <button onClick={() => setActiveTab('presets')} style={tabStyle(activeTab === 'presets')}>עמדות</button>
        <button onClick={() => setActiveTab('sectors')} style={tabStyle(activeTab === 'sectors')}>סקטורים</button>
        <button onClick={() => setActiveTab('maps')} style={tabStyle(activeTab === 'maps')}>מפות</button>
      </div>
      
      <div style={{ padding: '0 30px 30px', maxWidth: '1000px' }}>
        <div style={{ background: '#1e293b', borderRadius: '0 0 12px 12px', padding: '24px', minHeight: '500px' }}>
          
          {/* Presets Tab */}
          {activeTab === 'presets' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>הגדרת עמדות</h2>
              
              {/* Preset Form */}
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingPreset ? 'עריכת עמדה' : 'עמדה חדשה'}
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שם עמדה:</label>
                    <input
                      type="text"
                      value={presetForm.name}
                      onChange={(e) => setPresetForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="לדוגמה: מרחבי 305"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>סקטור:</label>
                    <select
                      value={presetForm.sector_id}
                      onChange={(e) => setPresetForm(p => ({ ...p, sector_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px' }}
                    >
                      <option value="">בחר סקטור</option>
                      {sectors.map(s => (
                        <option key={s.id} value={s.id}>{s.label_he || s.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>מפה:</label>
                    <select
                      value={presetForm.map_id}
                      onChange={(e) => setPresetForm(p => ({ ...p, map_id: e.target.value }))}
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px' }}
                    >
                      <option value="">בחר מפה</option>
                      {maps.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>התתי-סקטורים שלי (יוצגו לסקטורים שכנים):</label>
                  <input
                    type="text"
                    value={presetForm.my_sub_sectors.join(', ')}
                    onChange={(e) => setPresetForm(p => ({ ...p, my_sub_sectors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                    placeholder="תת-סקטור 1, תת-סקטור 2..."
                    style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button
                    onClick={savePreset}
                    style={{ padding: '10px 25px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    {editingPreset ? 'עדכון' : 'הוספה'}
                  </button>
                  {editingPreset && (
                    <button
                      onClick={() => { setEditingPreset(null); setPresetForm({ name: '', sector_id: '', map_id: '', my_sub_sectors: [], neighbor_sub_sectors: [] }); }}
                      style={{ padding: '10px 25px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </div>
              
              {/* Presets List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {presets.map(preset => (
                  <div key={preset.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '16px' }}>{preset.name}</strong>
                      <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                        סקטור: {sectors.find(s => s.id === preset.sector_id)?.label_he || 'לא מוגדר'} | 
                        מפה: {maps.find(m => m.id === preset.map_id)?.name || 'לא מוגדר'}
                        {preset.my_sub_sectors?.length > 0 && ` | תתי-סקטורים: ${preset.my_sub_sectors.join(', ')}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => editPreset(preset)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                      <button onClick={() => deletePreset(preset.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                    </div>
                  </div>
                ))}
                {presets.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    אין עמדות מוגדרות. הוסף עמדה חדשה למעלה.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sectors Tab */}
          {activeTab === 'sectors' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>ניהול סקטורים</h2>
              
              {/* New Sector Form */}
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>סקטור חדש</h3>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>קוד:</label>
                    <input
                      type="text"
                      value={newSectorName}
                      onChange={(e) => setNewSectorName(e.target.value)}
                      placeholder="NORTH"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שם בעברית:</label>
                    <input
                      type="text"
                      value={newSectorLabel}
                      onChange={(e) => setNewSectorLabel(e.target.value)}
                      placeholder="צפון"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={createSector}
                    style={{ padding: '10px 25px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', height: 'fit-content' }}
                  >
                    הוספה
                  </button>
                </div>
              </div>
              
              {/* Sectors List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sectors.map(sector => (
                  <div key={sector.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px' }}>
                    {editingSector?.id === sector.id ? (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editingSector.name}
                          onChange={(e) => setEditingSector({ ...editingSector, name: e.target.value })}
                          style={{ flex: 1, padding: '8px', border: '1px solid #475569', borderRadius: '4px', background: '#1e293b', color: 'white', fontSize: '14px' }}
                        />
                        <input
                          type="text"
                          value={editingSector.label_he}
                          onChange={(e) => setEditingSector({ ...editingSector, label_he: e.target.value })}
                          style={{ flex: 1, padding: '8px', border: '1px solid #475569', borderRadius: '4px', background: '#1e293b', color: 'white', fontSize: '14px' }}
                        />
                        <button onClick={() => updateSector(sector.id, editingSector.name, editingSector.label_he)} style={{ padding: '6px 15px', background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>שמור</button>
                        <button onClick={() => setEditingSector(null)} style={{ padding: '6px 15px', background: '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>ביטול</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '16px' }}>{sector.label_he || sector.name}</strong>
                          <span style={{ color: '#64748b', marginRight: '10px', fontSize: '14px' }}>({sector.name})</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => setEditingSector({ ...sector })} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                          <button onClick={() => deleteSector(sector.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maps Tab */}
          {activeTab === 'maps' && (
            <MapsManager onClose={() => {}} onMapsUpdated={loadData} isEmbedded={true} />
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<WorkstationSession | null>(getSession());
  const [page, setPage] = useState<'login' | 'dashboard' | 'management'>('login');

  const handleLogin = (newSession: WorkstationSession) => {
    setSession(newSession);
    setPage('dashboard');
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setPage('login');
  };

  if (page === 'management') {
    return <ManagementPage onBack={() => setPage('login')} />;
  }

  if (!session || page === 'login') {
    return <WorkstationLogin onLogin={handleLogin} onManagement={() => setPage('management')} />;
  }

  return <SectorDashboard session={session} onLogout={handleLogout} />;
}