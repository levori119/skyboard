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
  relevantSectors: { id: number; name: string; label_he: string; category?: string; notes?: string }[];
  mapId?: number;
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
const WorkstationLogin = ({ onLogin, onManagement, onDistribution }: { onLogin: (session: WorkstationSession) => void; onManagement?: () => void; onDistribution?: () => void }) => {
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
      const relevantSectorIds: number[] = preset.relevant_sectors || [];
      const relevantSectorsList = sectors.filter(s => relevantSectorIds.includes(s.id));

      const res = await fetch(`${API_URL}/workstations/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset.name, presetId: preset.id })
      });

      if (res.ok) {
        const data = await res.json();
        const session: WorkstationSession = {
          workstationId: data.workstation.id,
          workstationName: data.workstation.name,
          relevantSectors: relevantSectorsList,
          mapId: preset.map_id,
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
      const selectedSectorObj = sectors.find(s => s.id === selectedSector);

      const res = await fetch(`${API_URL}/workstations/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workstationName })
      });

      if (res.ok) {
        const data = await res.json();
        const session: WorkstationSession = {
          workstationId: data.workstation.id,
          workstationName: data.workstation.name,
          relevantSectors: selectedSectorObj ? [selectedSectorObj] : [],
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

          {onDistribution && (
            <button
              onClick={onDistribution}
              style={{
                padding: '25px',
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
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
                boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)'
              }}
            >
              <span style={{ fontSize: '28px' }}>📋</span>
              חלוקה כללית
            </button>
          )}

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

            {/* Workstation Presets Dropdown */}
            {workstationPresets.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#334155' }}>בחר עמדה מוגדרת:</label>
                <select
                  onChange={(e) => {
                    const preset = workstationPresets.find((p: any) => p.id === Number(e.target.value));
                    if (preset) handlePresetLogin(preset);
                  }}
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '15px',
                    border: '2px solid #2563eb',
                    borderRadius: '8px',
                    fontSize: '16px',
                    background: 'white',
                    cursor: 'pointer',
                    direction: 'rtl'
                  }}
                >
                  <option value="" disabled>-- בחר עמדה --</option>
                  {workstationPresets.map((preset: any) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
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