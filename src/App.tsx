import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, useDragControls } from 'framer-motion';
import { createPortal } from 'react-dom';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';

const API_URL = '/api';

// --- ניהול סשן עמדה ---
interface CrewMember {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  personal_id?: string;
  is_admin: boolean;
  approved_workstations?: number[];
}

interface WorkstationSession {
  workstationId: string;
  workstationName: string;
  relevantSectors: { id: number; name: string; label_he: string; category?: string; notes?: string }[];
  mapId?: number;
  presetId?: number;
  authToken: string;
  crewMember?: CrewMember;
}

// --- Query Builder Types & Logic ---
type QOperator = 'all' | 'any' | 'none';
type QCompare = 'eq' | 'neq' | 'contains' | 'not_contains' | 'in' | 'not_in' | 'gt' | 'lt' | 'empty' | 'not_empty';
interface QLeaf { id: string; type: 'leaf'; field: string; compare: QCompare; value: string; }
interface QGroup { id: string; type: 'group'; operator: QOperator; children: QNode[]; }
type QNode = QGroup | QLeaf;

const qGenId = () => Math.random().toString(36).slice(2, 10);
const emptyQGroup = (): QGroup => ({ id: qGenId(), type: 'group', operator: 'all', children: [] });
const hasConditions = (node: QNode | null): boolean => {
  if (!node) return false;
  if (node.type === 'leaf') return true;
  return node.children.some(c => hasConditions(c));
};

const Q_FIELDS: { key: string; label: string; ftype: 'text' | 'bool' }[] = [
  { key: 'callSign', label: 'או"ק', ftype: 'text' },
  { key: 'sq', label: 'SQ', ftype: 'text' },
  { key: 'task', label: 'משימה', ftype: 'text' },
  { key: 'alt', label: 'גובה', ftype: 'text' },
  { key: 'airborne', label: 'סטטוס באוויר', ftype: 'bool' },
  { key: 'status', label: 'מצב', ftype: 'text' },
];

const Q_TEXT_OPS: { key: QCompare; label: string }[] = [
  { key: 'contains', label: 'מכיל' },
  { key: 'not_contains', label: 'לא מכיל' },
  { key: 'eq', label: 'שווה ל' },
  { key: 'neq', label: 'לא שווה ל' },
  { key: 'in', label: 'אחד מ (פסיק)' },
  { key: 'not_in', label: 'לא אחד מ' },
  { key: 'gt', label: 'גדול מ' },
  { key: 'lt', label: 'קטן מ' },
  { key: 'empty', label: 'ריק' },
  { key: 'not_empty', label: 'לא ריק' },
];
const Q_BOOL_OPS: { key: QCompare; label: string }[] = [
  { key: 'eq', label: 'שווה ל' },
  { key: 'neq', label: 'לא שווה ל' },
];
const Q_OPERATOR_LABELS: Record<QOperator, string> = {
  all: 'כל התנאים מתקיימים',
  any: 'לפחות אחד מתקיים',
  none: 'אף אחד לא מתקיים',
};

const getQFieldValue = (strip: any, field: string): any => {
  if (field === 'callSign') return strip.callSign || strip.callsign || '';
  if (field === 'airborne') return !!strip.airborne;
  return strip[field] ?? '';
};

const evalQLeaf = (strip: any, leaf: QLeaf): boolean => {
  const raw = getQFieldValue(strip, leaf.field);
  const val = String(raw).toLowerCase();
  const cmp = (leaf.value || '').toLowerCase().trim();
  const isBool = leaf.field === 'airborne';
  const boolCmp = cmp.includes('באוויר') || cmp === 'כן' || cmp === 'true' || cmp === '1' || cmp === 'yes';
  switch (leaf.compare) {
    case 'eq': return isBool ? (!!raw) === boolCmp : val === cmp;
    case 'neq': return isBool ? (!!raw) !== boolCmp : val !== cmp;
    case 'contains': return val.includes(cmp);
    case 'not_contains': return !val.includes(cmp);
    case 'in': return cmp.split(',').map(v => v.trim()).some(v => val === v);
    case 'not_in': return !cmp.split(',').map(v => v.trim()).some(v => val === v);
    case 'gt': return !isNaN(parseFloat(val)) && parseFloat(val) > parseFloat(cmp);
    case 'lt': return !isNaN(parseFloat(val)) && parseFloat(val) < parseFloat(cmp);
    case 'empty': return !raw || val === '';
    case 'not_empty': return !!(raw && val !== '');
    default: return true;
  }
};

const evaluateQuery = (strip: any, node: QNode): boolean => {
  if (node.type === 'leaf') return evalQLeaf(strip, node);
  if (node.children.length === 0) return true;
  const results = node.children.map(c => evaluateQuery(strip, c));
  switch (node.operator) {
    case 'all': return results.every(Boolean);
    case 'any': return results.some(Boolean);
    case 'none': return results.every(r => !r);
    default: return true;
  }
};

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
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [selectedCrewMember, setSelectedCrewMember] = useState<CrewMember | null>(null);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const [showCrewSelect, setShowCrewSelect] = useState(false);
  const [showHandwritingCalibration, setShowHandwritingCalibration] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sectorsRes, presetsRes, crewRes] = await Promise.all([
          fetch(`${API_URL}/sectors`),
          fetch(`${API_URL}/workstation-presets`),
          fetch(`${API_URL}/crew-members`)
        ]);
        if (sectorsRes.ok) {
          const data = await sectorsRes.json();
          setSectors(data);
        }
        if (presetsRes.ok) {
          const presets = await presetsRes.json();
          setWorkstationPresets(presets);
        }
        if (crewRes.ok) {
          const crew = await crewRes.json();
          setCrewMembers(crew);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    };
    loadData();
  }, []);

  const handlePresetLogin = async (preset: any) => {
    if (!selectedCrewMember) {
      setError('נא לבחור איש צוות');
      return;
    }
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
          presetId: preset.id,
          authToken: data.authToken,
          crewMember: selectedCrewMember
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
    if (!selectedCrewMember) {
      setError('נא לבחור איש צוות');
      return;
    }
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
          authToken: data.authToken,
          crewMember: selectedCrewMember
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
    <div className="bt-login-bg" style={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      direction: 'rtl',
      position: 'relative'
    }}>
      {/* Light/dark toggle — top left corner on login */}
      <button
        onClick={() => {
          const next = !document.body.classList.contains('light-mode');
          document.body.classList.toggle('light-mode', next);
          localStorage.setItem('bt-lightMode', String(next));
        }}
        style={{ position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '18px', lineHeight: 1, color: 'white' }}
        title="החלף מצב תצוגה"
      >☀️ / 🌙</button>
      <div style={{ 
        background: 'white', 
        padding: '40px', 
        borderRadius: '16px', 
        minWidth: '450px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ margin: '0 0 10px', color: '#0f172a', textAlign: 'center', fontSize: '32px' }}>BLUE TORCH</h1>
        <p style={{ margin: '0 0 20px', color: '#64748b', textAlign: 'center' }}>מערכת ניהול אווירי טקטי</p>
        
        {!selectedCrewMember ? (
          <>
            <p style={{ margin: '0 0 15px', color: '#334155', textAlign: 'center', fontWeight: 'bold' }}>בחר איש צוות:</p>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="חפש לפי שם..."
                value={crewSearchQuery}
                onChange={(e) => { setCrewSearchQuery(e.target.value); setShowCrewDropdown(true); }}
                onFocus={() => setShowCrewDropdown(true)}
                style={{
                  width: '100%',
                  padding: '15px 20px',
                  borderRadius: '10px',
                  border: '2px solid #e2e8f0',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  direction: 'rtl'
                }}
              />
              {showCrewDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '2px solid #e2e8f0',
                  borderTop: 'none',
                  borderRadius: '0 0 10px 10px',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  zIndex: 100,
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                }}>
                  {crewMembers
                    .filter(cm => {
                      const fullName = `${cm.first_name || ''} ${cm.last_name || ''}`.trim() || cm.name;
                      return fullName.toLowerCase().includes(crewSearchQuery.toLowerCase()) ||
                             (cm.personal_id && cm.personal_id.includes(crewSearchQuery));
                    })
                    .map(cm => (
                      <button
                        key={cm.id}
                        onClick={() => {
                          setSelectedCrewMember(cm);
                          setCrewSearchQuery('');
                          setShowCrewDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 20px',
                          background: 'white',
                          border: 'none',
                          borderBottom: '1px solid #e2e8f0',
                          fontSize: '16px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          textAlign: 'right'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      >
                        <span style={{ color: '#1e293b', fontWeight: '500' }}>
                          {cm.first_name && cm.last_name ? `${cm.first_name} ${cm.last_name}` : cm.name}
                          {cm.personal_id && <span style={{ color: '#64748b', fontSize: '13px', marginRight: '8px' }}>({cm.personal_id})</span>}
                        </span>
                        {cm.is_admin && <span style={{ fontSize: '11px', background: '#eab308', color: '#1e293b', padding: '2px 8px', borderRadius: '12px' }}>מנהל</span>}
                      </button>
                    ))}
                  {crewMembers.filter(cm => {
                    const fullName = `${cm.first_name || ''} ${cm.last_name || ''}`.trim() || cm.name;
                    return fullName.toLowerCase().includes(crewSearchQuery.toLowerCase()) ||
                           (cm.personal_id && cm.personal_id.includes(crewSearchQuery));
                  }).length === 0 && (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#64748b' }}>לא נמצאו תוצאות</div>
                  )}
                </div>
              )}
            </div>
            {showCrewDropdown && (
              <div 
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} 
                onClick={() => setShowCrewDropdown(false)}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ background: '#dbeafe', padding: '10px 15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: '#1e40af' }}>איש צוות: {selectedCrewMember.first_name && selectedCrewMember.last_name ? `${selectedCrewMember.first_name} ${selectedCrewMember.last_name}` : selectedCrewMember.name}</span>
              <button onClick={() => setSelectedCrewMember(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>החלף</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <button
                onClick={() => setShowWorkstationSelect(true)}
                style={{
                  padding: '20px',
                  background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)'
                }}
              >
                <span style={{ fontSize: '24px' }}>🖥️</span>
                בחירת עמדה
              </button>
              
              <button
                onClick={() => setShowHandwritingCalibration(true)}
                style={{
                  padding: '20px',
                  background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 15px rgba(6, 182, 212, 0.4)'
                }}
              >
                <span style={{ fontSize: '24px' }}>✍️</span>
                התאמת כתב יד
              </button>
              
              {selectedCrewMember.is_admin && onDistribution && (
                <button
                  onClick={onDistribution}
                  style={{
                    padding: '20px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)'
                  }}
                >
                  <span style={{ fontSize: '24px' }}>📋</span>
                  חלוקה כללית
                </button>
              )}
              
              {selectedCrewMember.is_admin && onManagement && (
                <button
                  onClick={onManagement}
                  style={{
                    padding: '20px',
                    background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <span style={{ fontSize: '24px' }}>⚙️</span>
                  ניהול מערכת
                </button>
              )}
            </div>
          </>
        )}
        
        {error && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '15px' }}>{error}</p>}
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
            
            {/* Workstation Presets Dropdown — filtered by approved_workstations */}
            {(() => {
              const approvedIds: number[] = selectedCrewMember?.approved_workstations || [];
              const isAdmin = selectedCrewMember?.is_admin ?? false;
              const visiblePresets = (approvedIds.length > 0 && !isAdmin)
                ? workstationPresets.filter((p: any) => approvedIds.includes(p.id))
                : workstationPresets;
              if (workstationPresets.length === 0) return null;
              if (visiblePresets.length === 0) return (
                <div style={{ marginBottom: '25px', padding: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#991b1b', fontSize: '14px', textAlign: 'center' }}>
                  אין עמדות מאושרות לאיש צוות זה
                </div>
              );
              return (
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
                    {visiblePresets.map((preset: any) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
            
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
                <label style={{ display: 'block', marginBottom: '8px', color: '#64748b' }}>נקודת העברה:</label>
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
      
      {/* Handwriting Calibration Modal */}
      {showHandwritingCalibration && selectedCrewMember && (
        <LearnDigitsOverlay 
          onClose={() => setShowHandwritingCalibration(false)} 
          crewMemberId={selectedCrewMember.id}
          crewMemberName={selectedCrewMember.name}
        />
      )}
    </div>
  );
};

// --- מערכת למידת ספרות (עם DB) ---

const getLearnedDigits = async (crewMemberId?: number): Promise<{ digit: string; imageData: string }[]> => {
  try {
    const url = crewMemberId ? `${API_URL}/digits?crew_member_id=${crewMemberId}` : `${API_URL}/digits`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

const saveLearnedDigit = async (digit: string, imageData: string, crewMemberId?: number) => {
  try {
    await fetch(`${API_URL}/digits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digit, imageData, crew_member_id: crewMemberId })
    });
  } catch (err) {
    console.error('Failed to save digit:', err);
  }
};

const clearLearnedDigits = async (crewMemberId?: number) => {
  try {
    const url = crewMemberId ? `${API_URL}/digits?crew_member_id=${crewMemberId}` : `${API_URL}/digits`;
    await fetch(url, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to clear digits:', err);
  }
};

const getDigitsCount = async (crewMemberId?: number): Promise<number> => {
  try {
    const url = crewMemberId ? `${API_URL}/digits/count?crew_member_id=${crewMemberId}` : `${API_URL}/digits/count`;
    const res = await fetch(url);
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
const LearnDigitsOverlay = ({ onClose, crewMemberId, crewMemberName }: { onClose: () => void; crewMemberId?: number; crewMemberName?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentDigit, setCurrentDigit] = useState(0);
  const [saved, setSaved] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const loadCount = async () => {
    const count = await getDigitsCount(crewMemberId);
    setTotalCount(count);
  };

  useEffect(() => {
    loadCount();
  }, [saved, crewMemberId]);

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
    await saveLearnedDigit(currentDigit.toString(), imageData, crewMemberId);
    setSaved(s => s + 1);
    clearCanvas();
  };

  const nextDigit = () => {
    setCurrentDigit((currentDigit + 1) % 10);
    clearCanvas();
  };

  const handleClearAll = async () => {
    await clearLearnedDigits(crewMemberId);
    setSaved(0);
    setTotalCount(0);
  };

  useEffect(() => {
    clearCanvas();
  }, []);

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '12px', direction: 'rtl', minWidth: '300px' }}>
        <h3 style={{ margin: '0 0 15px', color: '#1e293b', textAlign: 'center' }}>לימוד כתב יד {crewMemberName ? `- ${crewMemberName}` : ''}</h3>
        
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
      if (left + 380 > window.innerWidth) {
        left = anchorRect.left - 390;
      }
      // If would go off left edge, center it
      if (left < 10) {
        left = Math.max(10, (window.innerWidth - 380) / 2);
      }
      // If would go off bottom, move up
      if (top + 380 > window.innerHeight) {
        top = Math.max(10, window.innerHeight - 390);
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
      minWidth: '360px', 
      direction: 'rtl' 
    }}>
      <div style={{fontSize: '14px', marginBottom: '8px', fontWeight: 'bold', color: '#2563eb', textAlign: 'center'}}>
        {loading ? "מזהה..." : "כתוב מספר:"}
      </div>
      
      <canvas 
        ref={canvasRef} 
        width={336} 
        height={180} 
        style={{ background: '#ffffff', border: '2px solid #cbd5e1', borderRadius: '6px', touchAction: 'none', display: 'block', width: '336px', height: '180px' }}
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
      {(!transfer.sq && transfer.squadron) && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>SQ: {transfer.squadron}</div>}
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

// Parse a note value that may be plain text, a data-URL, or combined JSON { text, hw }
const parseNoteValue = (val: string): { text: string; hw: string } => {
  if (!val) return { text: '', hw: '' };
  if (val.startsWith('data:')) return { text: '', hw: val };
  if (val.startsWith('{')) {
    try { const p = JSON.parse(val); return { text: p.text || '', hw: p.hw || '' }; } catch {}
  }
  return { text: val, hw: '' };
};
const serializeNoteValue = (text: string, hw: string): string => {
  const hasText = text.trim().length > 0;
  const hasHw = hw.startsWith('data:');
  if (hasText && hasHw) return JSON.stringify({ text, hw });
  if (hasHw) return hw;
  return text;
};

// --- פאנל נקודת העברה עם עמודות העברה/קבלה ---
const DraggableNeighborPanel = ({ 
  neighbor, 
  subSectors,
  onDropOnMap,
  isExpanded,
  onToggle,
  outgoingTransfers,
  incomingTransfers,
  onCancelTransfer,
  onAcceptTransfer,
  onRejectTransfer,
  onAcceptToMap,
  dragStripId,
  onStripDrop,
}: { 
  neighbor: any; 
  subSectors: any[];
  onDropOnMap: (sectorId: number, x: number, y: number, subSectorLabel?: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
  outgoingTransfers: any[];
  incomingTransfers: any[];
  onCancelTransfer: (id: string) => void;
  onAcceptTransfer: (id: string) => void;
  onRejectTransfer: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
  dragStripId?: string | null;
  onStripDrop?: (stripId: string, sectorId: number) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isStripDragOver, setIsStripDragOver] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const sectorOutgoing = outgoingTransfers.filter(t => t.to_sector_id === neighbor.id);
  const sectorIncoming = incomingTransfers.filter(t => t.from_sector_id === neighbor.id);

  const handlePointerDown = (e: React.PointerEvent, subLabel?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    setDragLabel(subLabel || null);
  };

  useEffect(() => {
    if (!isDragging) return;

    let lastClientX = 0;
    let lastClientY = 0;

    const handleMove = (e: PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      setDragPos({ x: e.clientX - 50, y: e.clientY - 20 });
    };

    const dropAt = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const rawX = clientX - rect.left;
          const rawY = clientY - rect.top;
          const x = Math.max(100, Math.min(rect.width - 100, rawX));
          const y = Math.max(40, Math.min(rect.height - 50, rawY));
          onDropOnMap(neighbor.id, x, y, dragLabel || undefined);
        }
      }
      setDragLabel(null);
    };

    const handleUp = (e: PointerEvent) => dropAt(e.clientX, e.clientY);
    const handleCancel = () => dropAt(lastClientX, lastClientY);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, neighbor.id, onDropOnMap, dragLabel]);

  const neighborSubSectors = subSectors.filter(ss => ss.neighbor_id === neighbor.id);
  const hasSubSectors = neighborSubSectors.length > 0;
  const hasTransfers = sectorOutgoing.length > 0 || sectorIncoming.length > 0;

  return (
    <>
      <div style={{ borderBottom: '1px solid #334155' }}>
        <div
          className="neighbor-drop-zone"
          data-sector-id={neighbor.id}
          onPointerDown={(e) => { if (dragStripId) { e.preventDefault(); e.stopPropagation(); } else { handlePointerDown(e); } }}
          onPointerEnter={() => { if (dragStripId) setIsStripDragOver(true); }}
          onPointerLeave={() => { if (dragStripId) setIsStripDragOver(false); }}
          onDragOver={dragStripId ? (e => { e.preventDefault(); e.stopPropagation(); setIsStripDragOver(true); }) : undefined}
          onDragLeave={dragStripId ? (() => setIsStripDragOver(false)) : undefined}
          onDrop={dragStripId && onStripDrop ? (e => { e.preventDefault(); e.stopPropagation(); setIsStripDragOver(false); onStripDrop(dragStripId, neighbor.id); }) : undefined}
          style={{
            padding: '8px 12px',
            background: isStripDragOver ? '#166534' : (dragStripId ? '#1a3a2a' : (isExpanded ? '#334155' : 'transparent')),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: dragStripId ? 'copy' : 'grab',
            userSelect: 'none',
            transition: 'background 0.15s',
            border: isStripDragOver ? '2px solid #22c55e' : '2px solid transparent',
          }}
        >
          <div 
            style={{ 
              flex: 1, 
              textAlign: 'right', 
              userSelect: 'none'
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>{neighbor.label_he || neighbor.name}</div>
            {neighbor.notes && (
              <div style={{ fontSize: '9px', color: '#fbbf24', fontStyle: 'italic', marginTop: '2px' }}>
                {neighbor.notes}
              </div>
            )}
          </div>
          {(hasSubSectors || hasTransfers) && (
            <span 
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            >
              {isExpanded ? '▼' : '◀'}
              {hasTransfers && !isExpanded && (
                <span style={{ 
                  marginRight: '4px', 
                  background: '#f59e0b', 
                  color: '#1e293b', 
                  padding: '1px 5px', 
                  borderRadius: '8px', 
                  fontSize: '10px',
                  fontWeight: 'bold'
                }}>
                  {sectorOutgoing.length + sectorIncoming.length}
                </span>
              )}
            </span>
          )}
        </div>
        
        {isExpanded && (
          <div style={{ background: '#0f172a' }}>
            {hasSubSectors && neighborSubSectors.map(ss => (
              <div
                key={ss.id}
                onPointerDown={(e) => handlePointerDown(e, ss.label)}
                style={{
                  padding: '6px 12px 6px 24px',
                  fontSize: '11px',
                  color: '#94a3b8',
                  borderTop: '1px solid #1e293b',
                  cursor: 'grab',
                  userSelect: 'none'
                }}
              >
                ↳ {ss.label}
              </div>
            ))}
            
            {/* 2 Columns: Transfer / Receive */}
            {hasTransfers && (
              <div style={{ display: 'flex', borderTop: '1px solid #334155' }}>
                {/* העברה - Outgoing */}
                <div style={{ flex: 1, borderLeft: '1px solid #334155', padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                    העברה ({sectorOutgoing.length})
                  </div>
                  {sectorOutgoing.map(t => (
                    <div key={t.id} style={{ 
                      background: '#fef3c7', 
                      border: '1px solid #f59e0b',
                      borderRadius: '4px',
                      padding: '4px',
                      marginBottom: '4px',
                      fontSize: '9px'
                    }}>
                      <div style={{ fontWeight: 'bold', color: '#92400e' }}>{t.callsign}</div>
                      <div style={{ color: '#b45309' }}>גובה: {t.alt}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCancelTransfer(t.id); }}
                        style={{
                          marginTop: '3px',
                          width: '100%',
                          padding: '2px',
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          fontSize: '9px',
                          cursor: 'pointer'
                        }}
                      >
                        בטל
                      </button>
                    </div>
                  ))}
                  {sectorOutgoing.length === 0 && (
                    <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>אין</div>
                  )}
                </div>
                
                {/* קבלה - Incoming */}
                <div style={{ flex: 1, padding: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                    קבלה ({sectorIncoming.length})
                  </div>
                  {sectorIncoming.map(t => (
                    <DraggableIncomingTransferMini
                      key={t.id}
                      transfer={t}
                      onAccept={onAcceptTransfer}
                      onReject={onRejectTransfer}
                      onAcceptToMap={onAcceptToMap}
                    />
                  ))}
                  {sectorIncoming.length === 0 && (
                    <div style={{ fontSize: '9px', color: '#64748b', textAlign: 'center' }}>אין</div>
                  )}
                </div>
              </div>
            )}
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

// Mini version of incoming transfer for sector panel
const DraggableIncomingTransferMini = ({
  transfer,
  onAccept,
  onReject,
  onAcceptToMap
}: {
  transfer: any;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onAcceptToMap: (id: string, x: number, y: number) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragPos({ x: e.clientX - 40, y: e.clientY - 20 });
  };

  useEffect(() => {
    if (!isDragging) return;

    let lastClientX = 0;
    let lastClientY = 0;

    const handleMove = (e: PointerEvent) => {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      setDragPos({ x: e.clientX - 40, y: e.clientY - 20 });
    };

    const dropAt = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const sidebarArea = document.getElementById('sidebar-area');
      if (sidebarArea) {
        const sidebarRect = sidebarArea.getBoundingClientRect();
        if (clientX >= sidebarRect.left && clientX <= sidebarRect.right &&
            clientY >= sidebarRect.top && clientY <= sidebarRect.bottom) {
          onAccept(transfer.id);
          return;
        }
      }
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const x = Math.max(100, Math.min(rect.width - 100, clientX - rect.left));
          const y = Math.max(40, Math.min(rect.height - 50, clientY - rect.top));
          onAcceptToMap(transfer.id, x, y);
        }
      }
    };

    const handleUp = (e: PointerEvent) => dropAt(e.clientX, e.clientY);
    const handleCancel = () => dropAt(lastClientX, lastClientY);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [isDragging, transfer.id, onAcceptToMap]);

  return (
    <>
      <div 
        onPointerDown={handlePointerDown}
        style={{ 
          background: '#dcfce7', 
          border: '1px solid #22c55e',
          borderRadius: '4px',
          padding: '4px',
          marginBottom: '4px',
          fontSize: '9px',
          cursor: 'grab'
        }}
      >
        <div style={{ fontWeight: 'bold', color: '#166534' }}>{transfer.callsign}</div>
        <div style={{ color: '#15803d' }}>גובה: {transfer.alt}</div>
        <div style={{ display: 'flex', gap: '2px', marginTop: '3px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(transfer.id); }}
            style={{
              flex: 1,
              padding: '2px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '8px',
              cursor: 'pointer'
            }}
          >
            קבל
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onReject(transfer.id); }}
            style={{
              flex: 1,
              padding: '2px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              fontSize: '8px',
              cursor: 'pointer'
            }}
          >
            דחה
          </button>
        </div>
      </div>
      
      {isDragging && createPortal(
        <div style={{
          position: 'fixed',
          left: dragPos.x,
          top: dragPos.y,
          background: '#22c55e',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          zIndex: 9999,
          pointerEvents: 'none',
          direction: 'rtl'
        }}>
          {transfer.callsign}
          <div style={{ fontSize: '9px', opacity: 0.8 }}>גרור למפה או לפ"מ פעילים</div>
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
        העבר לנקודת העברה:
      </div>
      {neighbors.length === 0 ? (
        <div style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>אין נקודות העברה נוספות</div>
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
  incomingTransfers,
  onCancelTransfer,
  onAcceptTransfer,
  onRejectTransfer,
  onAcceptToMap,
  notes,
  onUpdateNotes,
  zoom = 1
}: { 
  marker: { sectorId: number; x: number; y: number; subLabel?: string; label: string };
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
  onRename: (newLabel: string) => void;
  strips: any[];
  onTransfer: (stripId: string, sectorId: number, x: number, y: number, subLabel?: string) => void;
  outgoingTransfers: any[];
  incomingTransfers: any[];
  onCancelTransfer: (transferId: string) => void;
  onAcceptTransfer: (transferId: string) => void;
  onRejectTransfer: (transferId: string) => void;
  onAcceptToMap: (transferId: string, x: number, y: number) => void;
  notes?: string;
  onUpdateNotes?: (sectorId: number, notes: string) => void;
  zoom?: number;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: marker.x, y: marker.y });
  const [showMenu, setShowMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempName, setTempName] = useState(marker.subLabel || '');
  const [tempNotes, setTempNotes] = useState(notes || '');
  const startPosRef = useRef({ x: 0, y: 0 });

  // Sync tempNotes when notes prop changes
  useEffect(() => {
    setTempNotes(notes || '');
  }, [notes]);

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

    const lastPos = { x: marker.x, y: marker.y };

    const handleMoveEvent = (e: PointerEvent) => {
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        lastPos.x = x;
        lastPos.y = y;
        setDragPos({ x, y });
      }
    };

    const drop = (clientX: number, clientY: number) => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const rawX = clientX - rect.left;
        const rawY = clientY - rect.top;
        const x = Math.max(100, Math.min(rect.width - 100, rawX));
        const y = Math.max(40, Math.min(rect.height - 50, rawY));
        onMove(x, y);
      }
    };

    const handleUp = (e: PointerEvent) => drop(e.clientX, e.clientY);
    const handleCancel = () => {
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const rect = mapArea.getBoundingClientRect();
        const x = Math.max(100, Math.min(rect.width - 100, lastPos.x));
        const y = Math.max(40, Math.min(rect.height - 50, lastPos.y));
        onMove(x, y);
      }
    };

    window.addEventListener('pointermove', handleMoveEvent);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMoveEvent);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
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
  
  // Filter outgoing transfers for this marker
  const markerOutgoing = (outgoingTransfers || []).filter((t: any) => 
    t.to_sector_id === marker.sectorId && 
    (marker.subLabel ? t.sub_sector_label === marker.subLabel : !t.sub_sector_label)
  );
  
  // Filter incoming transfers for this marker
  const markerIncoming = (incomingTransfers || []).filter((t: any) => 
    t.to_sector_id === marker.sectorId && 
    (marker.subLabel ? t.sub_sector_label === marker.subLabel : !t.sub_sector_label)
  );
  
  const hasTransfers = markerOutgoing.length > 0 || markerIncoming.length > 0;

  return (
    <div
      className="marker-drop-zone"
      data-marker-sector={marker.sectorId}
      data-marker-sublabel={marker.subLabel || ''}
      style={{
        position: 'absolute',
        left: (isDragging ? dragPos.x : marker.x) - 100,
        top: (isDragging ? dragPos.y : marker.y) - 40,
        width: '200px',
        background: '#3b82f6',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 50,
        userSelect: 'none',
        direction: 'rtl',
        overflow: 'hidden',
        transform: `scale(${1/zoom})`,
        transformOrigin: 'center center'
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
      
      {/* Two-column layout for העברה/קבלה - with drop zone for strip transfers */}
      <div 
        className="marker-drop-zone"
        data-marker-sector={marker.sectorId}
        data-marker-sublabel={marker.subLabel || ''}
        style={{ display: 'flex', background: '#0f172a', borderTop: '1px solid #334155' }}
      >
        {/* העברה - Outgoing */}
        <div style={{ flex: 1, borderLeft: '1px solid #334155', padding: '6px', minHeight: '60px' }}>
          <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
            העברה: ({markerOutgoing.length})
          </div>
          {markerOutgoing.map((t: any) => (
            <div key={t.id} style={{ 
              background: '#fef3c7', 
              border: '1px solid #f59e0b',
              borderRadius: '3px',
              padding: '4px',
              marginBottom: '4px',
              fontSize: '9px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#92400e' }}>{t.callsign}</span>
                <span style={{ background: '#3b82f6', color: 'white', padding: '1px 3px', borderRadius: '2px', fontSize: '8px' }}>{t.sq}</span>
              </div>
              <div style={{ color: '#b45309', fontSize: '8px' }}>גובה: {t.alt}</div>
              <button
                onClick={(e) => { e.stopPropagation(); onCancelTransfer(t.id); }}
                style={{
                  marginTop: '3px',
                  width: '100%',
                  padding: '2px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  fontSize: '8px',
                  cursor: 'pointer'
                }}
              >
                בטל העברה
              </button>
            </div>
          ))}
        </div>
        
        {/* קבלה - Incoming */}
        <div style={{ flex: 1, padding: '6px', minHeight: '60px' }}>
          <div style={{ fontSize: '10px', color: '#22c55e', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
            קבלה ({markerIncoming.length})
          </div>
          {markerIncoming.map((t: any) => (
            <div key={t.id} style={{ 
              background: '#dcfce7', 
              border: '1px solid #22c55e',
              borderRadius: '3px',
              padding: '4px',
              marginBottom: '4px',
              fontSize: '9px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#166534' }}>{t.callsign}</span>
                <span style={{ background: '#3b82f6', color: 'white', padding: '1px 3px', borderRadius: '2px', fontSize: '8px' }}>{t.sq}</span>
              </div>
              <div style={{ color: '#15803d', fontSize: '8px' }}>גובה: {t.alt}</div>
              <div style={{ display: 'flex', gap: '2px', marginTop: '3px' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onAcceptTransfer(t.id); }}
                  style={{
                    flex: 1,
                    padding: '2px',
                    background: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '8px',
                    cursor: 'pointer'
                  }}
                >
                  קבל
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRejectTransfer(t.id); }}
                  style={{
                    flex: 1,
                    padding: '2px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '8px',
                    cursor: 'pointer'
                  }}
                >
                  דחה
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Notes section */}
      {(notes || editingNotes) && (
        <div style={{ background: '#1e293b', padding: '6px', borderTop: '1px solid #334155' }}>
          {editingNotes ? (
            <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              <textarea
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                style={{ width: '100%', padding: '4px', border: '1px solid #475569', borderRadius: '4px', background: '#0f172a', color: 'white', fontSize: '10px', resize: 'none', boxSizing: 'border-box' }}
                rows={2}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <button 
                  onClick={() => { 
                    if (onUpdateNotes) onUpdateNotes(marker.sectorId, tempNotes);
                    setEditingNotes(false);
                  }} 
                  style={{ flex: 1, padding: '3px', background: '#10b981', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
                >
                  שמור
                </button>
                <button 
                  onClick={() => { setTempNotes(notes || ''); setEditingNotes(false); }} 
                  style={{ flex: 1, padding: '3px', background: '#64748b', color: 'white', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer' }}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
              style={{ fontSize: '9px', color: '#94a3b8', cursor: 'pointer' }}
              title="לחץ לעריכה"
            >
              {(() => { const np = parseNoteValue(notes || ''); return (<>
                {np.text && <span>📝 {np.text}</span>}
                {np.hw && <img src={np.hw} alt="כתב יד" style={{ maxHeight: '28px', display: 'block', marginTop: '2px', maxWidth: '100%' }} />}
              </>); })()}
            </div>
          )}
        </div>
      )}
      
      {/* Add notes button if no notes */}
      {!notes && !editingNotes && onUpdateNotes && (
        <div style={{ background: '#1e293b', padding: '4px', borderTop: '1px solid #334155', textAlign: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '9px', cursor: 'pointer' }}
          >
            + הוסף הערה
          </button>
        </div>
      )}

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
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
      {(!transfer.sq && transfer.squadron) && <div style={{ fontSize: '10px', color: '#a78bfa', marginTop: '2px' }}>SQ: {transfer.squadron}</div>}
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
const Strip = ({ s, onMove, onUpdate, neighbors, onTransfer, onToggleAirborne, onUpdateNotes, onUpdateDetails, zoom = 1 }: any) => {
  const controls = useDragControls();
  const [edit, setEdit] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{x: number; y: number} | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState(s.notes || '');
  const [showDetails, setShowDetails] = useState(false);
  const [detailsData, setDetailsData] = useState({
    weapons: (s.weapons || []) as {type: string; quantity: string}[],
    targets: (s.targets || []) as {name: string; aim_point: string}[],
    systems: (s.systems || []) as {name: string}[],
    shkadia: s.shkadia || ''
  });
  const [localTakeoffTime, setLocalTakeoffTime] = useState<string>(() => {
    if (!s.takeoff_time) return '';
    const d = new Date(s.takeoff_time);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    setDetailsData({
      weapons: s.weapons || [],
      targets: s.targets || [],
      systems: s.systems || [],
      shkadia: s.shkadia || ''
    });
  }, [s.weapons, s.targets, s.systems, s.shkadia]);

  useEffect(() => {
    if (s.takeoff_time) {
      const d = new Date(s.takeoff_time);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        setLocalTakeoffTime(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    }
  }, [s.takeoff_time]);

  const saveDetails = (updated: typeof detailsData) => {
    setDetailsData(updated);
    if (onUpdateDetails) onUpdateDetails(s.id, updated);
  };

  const hasDetails = (s.weapons && s.weapons.length > 0) || (s.targets && s.targets.length > 0) || (s.systems && s.systems.length > 0) || s.shkadia;

  // Sync tempNotes when notes prop changes
  useEffect(() => {
    setTempNotes(s.notes || '');
  }, [s.notes]);

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
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      startPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDragPos({ x: e.clientX - startPosRef.current.x, y: e.clientY - startPosRef.current.y });
      setIsDragging(true);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const findTopmostMarker = (clientX: number, clientY: number): Element | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      return els.find(el => el.classList.contains('marker-drop-zone') && el.getAttribute('data-marker-sector')) || null;
    };

    const findTopmostNeighborPanel = (clientX: number, clientY: number): Element | null => {
      const els = document.elementsFromPoint(clientX, clientY);
      return els.find(el => el.classList.contains('neighbor-drop-zone') && el.getAttribute('data-sector-id')) || null;
    };

    const clearAllDropHighlights = () => {
      document.querySelectorAll('.marker-drop-zone.strip-drag-active, .neighbor-drop-zone.strip-drag-active').forEach(el => el.classList.remove('strip-drag-active'));
    };

    const handlePointerMove = (e: PointerEvent) => {
      setDragPos({ 
        x: e.clientX - startPosRef.current.x, 
        y: e.clientY - startPosRef.current.y 
      });
      clearAllDropHighlights();
      const markerTarget = findTopmostMarker(e.clientX, e.clientY);
      if (markerTarget) { markerTarget.classList.add('strip-drag-active'); return; }
      const neighborTarget = findTopmostNeighborPanel(e.clientX, e.clientY);
      if (neighborTarget) neighborTarget.classList.add('strip-drag-active');
    };

    const handlePointerUp = (e: PointerEvent) => {
      clearAllDropHighlights();
      setIsDragging(false);
      const mapArea = document.getElementById('map-area');
      const sidebar = document.getElementById('sidebar-area');
      
      if (mapArea && sidebar) {
        const mapRect = mapArea.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        const dropX = e.clientX - startPosRef.current.x;
        const dropY = e.clientY - startPosRef.current.y;

        // 1. בדיקה אם נשחרר על סמן נקודת העברה במפה
        const topMarker = findTopmostMarker(e.clientX, e.clientY);
        if (topMarker) {
          const sectorId = parseInt(topMarker.getAttribute('data-marker-sector') || '0');
          const subLabel = topMarker.getAttribute('data-marker-sublabel') || undefined;
          if (sectorId && onTransfer) {
            const x = e.clientX - mapRect.left;
            const y = e.clientY - mapRect.top;
            onTransfer(s.id, sectorId, x, y, subLabel || undefined);
            return;
          }
        }

        // 2. בדיקה אם נשחרר על פאנל נקודת העברה בסרגל הצד — שימוש ב-elementsFromPoint
        const topNeighborPanel = findTopmostNeighborPanel(e.clientX, e.clientY);
        if (topNeighborPanel) {
          const sectorId = parseInt(topNeighborPanel.getAttribute('data-sector-id') || '0');
          if (sectorId && onTransfer) {
            onTransfer(s.id, sectorId);
            return;
          }
        }

        // 3. בדיקה אם נשחרר בתוך אזור התפריט - להחזיר לרשימה
        if (e.clientX >= sidebarRect.left && e.clientX <= sidebarRect.right &&
            e.clientY >= sidebarRect.top && e.clientY <= sidebarRect.bottom) {
          onMove(s.id, 0, 0, false);
        }
        // 4. בדיקה אם נשחרר בתוך אזור המפה
        else if (e.clientX >= mapRect.left && e.clientX <= mapRect.right &&
            e.clientY >= mapRect.top && e.clientY <= mapRect.bottom) {
          const x = dropX - mapRect.left;
          const y = dropY - mapRect.top;
          onMove(s.id, x, y, true);
        }
      }
    };

    const handlePointerCancel = () => {
      clearAllDropHighlights();
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      clearAllDropHighlights();
    };
  }, [isDragging, s.id, onMove, neighbors, onTransfer]);

  // רכיב הפ"מ הבסיסי
  const stripContent = (style: React.CSSProperties) => (
    <div ref={!isDragging ? containerRef : undefined} className="bt-strip" style={style} onContextMenu={handleContextMenu}>
      <div 
        onPointerDown={handlePointerDown}
        style={{ width: 28, background: '#1e293b', cursor: 'grab', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '16px', userSelect: 'none', touchAction: 'none', WebkitUserSelect: 'none' }}
      >⋮</div>
      <div style={{ padding: '4px 6px', flex: 1, direction: 'rtl', textAlign: 'right' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{
              fontWeight: 'bold',
              fontSize: '12px',
              ...(s.airborne ? {
                background: '#1d4ed8',
                color: 'white',
                border: '2px solid #3b82f6',
                borderRadius: '4px',
                padding: '1px 5px',
              } : {})
            }}>{s.callSign}</div>
            {(s.sq || s.squadron) && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold' }}>SQ {s.sq || s.squadron}</div>}
          </div>
          <div style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{s.task}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px', gap: '4px' }}>
          {/* RIGHT side (RTL start) — takeoff time */}
          <div>
            {s.takeoff_time && (() => {
              const now = new Date();
              const d = new Date(s.takeoff_time);
              if (isNaN(d.getTime())) return null;
              const past = d < now;
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const stripDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
              const hh = d.getHours().toString().padStart(2, '0');
              const mm = d.getMinutes().toString().padStart(2, '0');
              let label = `${hh}:${mm}`;
              if (stripDay.getTime() !== today.getTime()) {
                label = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')} ${label}`;
              }
              return (
                <div
                  title={past ? 'זמן ההמראה חלף' : `המראה: ${label}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: past ? 'white' : '#475569', background: past ? '#ef4444' : '#e2e8f0', padding: '1px 5px', borderRadius: '3px', fontWeight: past ? 'bold' : 'normal' }}
                >
                  {past && <span style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
                  🕐 {label}
                </div>
              );
            })()}
          </div>
          {/* LEFT side (RTL end) — alt + airborne */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div ref={altRef} onClick={handleEditClick} style={{ fontSize: '11px', border: '1px solid #cbd5e1', cursor: 'pointer', padding: '2px 6px', background: '#f1f5f9', borderRadius: '3px' }}>
              גובה: {s.alt || '-'}
            </div>
            {onToggleAirborne && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleAirborne(s.id, !s.airborne); }}
                style={{
                  padding: '2px 5px',
                  fontSize: '9px',
                  background: s.airborne ? '#1d4ed8' : '#94a3b8',
                  color: 'white',
                  border: s.airborne ? '1px solid #3b82f6' : 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                {s.airborne ? '✈ באוויר' : '⬛ קרקע'}
              </button>
            )}
          </div>
        </div>
        {/* Notes section */}
        {(s.notes || editingNotes) ? (
          editingNotes ? (
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px' }}>
              <textarea
                value={tempNotes}
                onChange={(e) => setTempNotes(e.target.value)}
                style={{ width: '100%', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', resize: 'none', boxSizing: 'border-box' }}
                rows={2}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                <button 
                  onClick={() => { 
                    if (onUpdateNotes) onUpdateNotes(s.id, tempNotes);
                    setEditingNotes(false);
                  }} 
                  style={{ flex: 1, padding: '2px', background: '#10b981', color: 'white', border: 'none', borderRadius: '3px', fontSize: '8px', cursor: 'pointer' }}
                >
                  שמור
                </button>
                <button 
                  onClick={() => { setTempNotes(s.notes || ''); setEditingNotes(false); }} 
                  style={{ flex: 1, padding: '2px', background: '#64748b', color: 'white', border: 'none', borderRadius: '3px', fontSize: '8px', cursor: 'pointer' }}
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
              style={{ marginTop: '4px', fontSize: '9px', color: '#64748b', cursor: 'pointer', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px' }}
              title="לחץ לעריכה"
            >
              {(() => { const np = parseNoteValue(s.notes || ''); return (<>
                {np.text && <div style={{ direction: 'rtl' }}>📝 {np.text}</div>}
                {np.hw && <img src={np.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '30px', borderRadius: '3px', display: 'block', marginTop: np.text ? '2px' : 0 }} />}
              </>); })()}
            </div>
          )
        ) : onUpdateNotes && (
          <div style={{ marginTop: '4px', textAlign: 'center' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '8px', cursor: 'pointer' }}
            >
              + הערה
            </button>
          </div>
        )}

        {/* Details toggle button */}
        <div style={{ marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '3px', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(v => !v); }}
            style={{ background: 'transparent', border: 'none', color: hasDetails ? '#3b82f6' : '#94a3b8', fontSize: '9px', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: hasDetails ? 'bold' : 'normal' }}
          >
            {hasDetails && <span style={{ width: '6px', height: '6px', background: '#3b82f6', borderRadius: '50%', display: 'inline-block' }} />}
            {showDetails ? '▲ פחות' : '▼ חימוש / מטרות / מערכות'}
          </button>
        </div>

        {/* Expandable Details Panel */}
        {showDetails && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px', background: '#f8fafc', borderRadius: '4px', padding: '6px', fontSize: '9px', direction: 'rtl' }}>
            
            {/* זמן המראה */}
            <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }}>זמן המראה:</span>
              <input
                type="datetime-local"
                value={localTakeoffTime}
                onChange={e => setLocalTakeoffTime(e.target.value)}
                onBlur={async e => {
                  const val = e.target.value;
                  if (!val) return;
                  try {
                    await fetch(`${API_URL}/strips/${s.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ takeoff_time: val })
                    });
                  } catch {}
                }}
                style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', background: 'white', minWidth: 0 }}
              />
              {localTakeoffTime && (
                <button
                  onClick={async () => {
                    setLocalTakeoffTime('');
                    try {
                      await fetch(`${API_URL}/strips/${s.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ takeoff_time: null })
                      });
                    } catch {}
                  }}
                  style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}
                >✕</button>
              )}
            </div>

            {/* חימושים */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>חימושים</span>
                <button onClick={() => saveDetails({ ...detailsData, weapons: [...detailsData.weapons, { type: '', quantity: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.weapons.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={w.type} placeholder="סוג" onChange={(e) => {
                    const updated = detailsData.weapons.map((item, idx) => idx === i ? { ...item, type: e.target.value } : item);
                    saveDetails({ ...detailsData, weapons: updated });
                  }} style={{ flex: 2, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <input value={w.quantity} placeholder="כמות" onChange={(e) => {
                    const updated = detailsData.weapons.map((item, idx) => idx === i ? { ...item, quantity: e.target.value } : item);
                    saveDetails({ ...detailsData, weapons: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, weapons: detailsData.weapons.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.weapons.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>לחץ + להוספה</div>}
            </div>

            {/* מטרות */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>מטרות</span>
                <button onClick={() => saveDetails({ ...detailsData, targets: [...detailsData.targets, { name: '', aim_point: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.targets.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={t.name} placeholder="שם מטרה" onChange={(e) => {
                    const updated = detailsData.targets.map((item, idx) => idx === i ? { ...item, name: e.target.value } : item);
                    saveDetails({ ...detailsData, targets: updated });
                  }} style={{ flex: 2, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <input value={t.aim_point} placeholder="נ. מכוון" onChange={(e) => {
                    const updated = detailsData.targets.map((item, idx) => idx === i ? { ...item, aim_point: e.target.value } : item);
                    saveDetails({ ...detailsData, targets: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, targets: detailsData.targets.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.targets.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>לחץ + להוספה</div>}
            </div>

            {/* מערכות */}
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>מערכות</span>
                <button onClick={() => saveDetails({ ...detailsData, systems: [...detailsData.systems, { name: '' }] })}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 5px', fontSize: '9px', cursor: 'pointer' }}>+</button>
              </div>
              {detailsData.systems.map((sys, i) => (
                <div key={i} style={{ display: 'flex', gap: '3px', marginBottom: '2px', alignItems: 'center' }}>
                  <input value={sys.name} placeholder="שם מערכת" onChange={(e) => {
                    const updated = detailsData.systems.map((item, idx) => idx === i ? { name: e.target.value } : item);
                    saveDetails({ ...detailsData, systems: updated });
                  }} style={{ flex: 1, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', minWidth: 0 }} />
                  <button onClick={() => saveDetails({ ...detailsData, systems: detailsData.systems.filter((_, idx) => idx !== i) })}
                    style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '3px', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>
              ))}
              {detailsData.systems.length === 0 && <div style={{ color: '#94a3b8', fontSize: '8px' }}>לחץ + להוספה</div>}
            </div>

            {/* שקדיה */}
            <div>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '3px' }}>שקדיה</div>
              <input
                value={detailsData.shkadia}
                placeholder="מי מפסר המבנה יש שקדיה"
                onChange={(e) => saveDetails({ ...detailsData, shkadia: e.target.value })}
                style={{ width: '100%', padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '9px', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}
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
        {/* Placeholder במקום המקורי — call stripContent directly to avoid double-positioning */}
        {stripContent({ ...baseStyle, opacity: 0.3, position: s.onMap ? 'absolute' : 'relative', left: s.onMap ? s.x : 0, top: s.onMap ? s.y : 0, transform: s.onMap ? `scale(${1/zoom})` : undefined, transformOrigin: 'top left' })}
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
              {(!s.sq && s.squadron) && <div style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', marginTop: '2px' }}>SQ: {s.squadron}</div>}
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
    zIndex: 50,
    transform: s.onMap ? `scale(${1/zoom})` : undefined,
    transformOrigin: 'top left'
  });
};

// --- מקלדת על-מסך ---
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
const OnScreenKeyboard = ({ onType, onBackspace, onEnter, onClose }: {
  onType: (c: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  onClose: () => void;
}) => {
  const [lang, setLang] = useState<'he'|'en'|'EN'|'sym'>('he');
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
      style={{ ...key as any, minWidth: 50, background: lang === l ? '#2563eb' : '#1e3a5f', border: lang === l ? '1px solid #3b82f6' : '1px solid #1e40af', fontSize: '12px', fontWeight: 'bold' }}
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
      {/* Drag handle + close */}
      <div onPointerDown={onDragStart} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', background: '#1e293b', borderRadius: '6px', padding: '4px 8px', marginBottom: '2px' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px' }}>⌨ מקלדת וירטואלית — גרור להזזה</span>
        <button onPointerDown={e => { e.stopPropagation(); onClose(); }} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '13px', fontWeight: 'bold' }}>✕</button>
      </div>
      {/* Language row */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        {langBtn('he', 'עברית')}{langBtn('en', 'EN')}{langBtn('EN', 'CAPS')}{langBtn('sym', '!@#')}
      </div>
      {/* Key rows */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
          {row.map(k => (
            <button key={k} style={key as any} onPointerDown={e => { e.preventDefault(); onType(k); }}>{k}</button>
          ))}
          {ri === 0 && (
            <button style={{ ...key as any, minWidth: 52, background: '#7f1d1d', border: '1px solid #991b1b', fontSize: '16px' }}
              onPointerDown={e => { e.preventDefault(); onBackspace(); }}>⌫</button>
          )}
        </div>
      ))}
      {/* Bottom row */}
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
        <button style={{ ...key as any, minWidth: 200, fontSize: '12px', color: '#94a3b8' }} onPointerDown={e => { e.preventDefault(); onType(' '); }}>space / מרווח</button>
        <button style={{ ...key as any, minWidth: 60, background: '#1d4ed8', border: '1px solid #2563eb', fontSize: '13px' }} onPointerDown={e => { e.preventDefault(); onEnter(); }}>↵</button>
      </div>
    </div>,
    document.body
  );
};
// --- קנבס כתב יד לטבלה ---
const TableHandwritingCanvas = ({ existing, onConfirm, onCancel, showText = true }: { existing: string; onConfirm: (note: string) => void; onCancel: () => void; showText?: boolean }) => {
  const parsed = parseNoteValue(existing);
  const [textValue, setTextValue] = useState(parsed.text);
  const [showOSK, setShowOSK] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hwRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastRef = useRef<{x:number;y:number}|null>(null);
  const insertAtCursor = (char: string) => {
    const el = textareaRef.current;
    if (!el) { setTextValue(v => v + char); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = el.value.slice(0, s) + char + el.value.slice(e2);
    setTextValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
  };
  const oskBackspace = () => {
    const el = textareaRef.current;
    if (!el) { setTextValue(v => v.slice(0, -1)); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = s === e2 ? el.value.slice(0, Math.max(0, s - 1)) + el.value.slice(e2) : el.value.slice(0, s) + el.value.slice(e2);
    const ns = s === e2 ? Math.max(0, s - 1) : s;
    setTextValue(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ns, ns); });
  };

  // Load existing handwriting onto canvas
  useEffect(() => {
    const canvas = hwRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (parsed.hw) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = parsed.hw;
    }
  }, []);

  const getXY = (e: any) => {
    const canvas = hwRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };
  const onDown = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    isDrawingRef.current = true;
    const {x,y} = getXY(e);
    lastRef.current = {x,y};
  };
  const onMove = (e: any) => {
    if (!isDrawingRef.current || !lastRef.current) return;
    e.preventDefault();
    const {x,y} = getXY(e);
    const ctx = hwRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(lastRef.current.x, lastRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastRef.current = {x,y};
  };
  const onUp = () => { isDrawingRef.current = false; lastRef.current = null; };
  const clearHw = () => {
    const canvas = hwRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) { ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
  };
  const confirm = () => {
    const hwData = hwRef.current?.toDataURL('image/png') || '';
    // Check if canvas has actual drawing (not just white fill) by comparing to a blank canvas
    const blank = document.createElement('canvas');
    blank.width = hwRef.current?.width || 480;
    blank.height = hwRef.current?.height || 200;
    const bctx = blank.getContext('2d');
    if (bctx) { bctx.fillStyle = '#fff'; bctx.fillRect(0,0,blank.width,blank.height); }
    const hasDrawing = hwData !== blank.toDataURL('image/png');
    onConfirm(serializeNoteValue(textValue, hasDrawing ? hwData : ''));
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={e => e.stopPropagation()}>
      <div style={{ background:'white', borderRadius:'12px', padding:'16px', display:'flex', flexDirection:'column', gap:'10px', width:'min(92vw, 520px)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ fontWeight:'bold', fontSize:'16px', direction:'rtl', textAlign:'center' }}>עריכת הערה</div>

        {/* Text input — shown only when showText is true */}
        {showText && (
          <div style={{ direction:'rtl' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
              <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'600' }}>⌨️ טקסט</span>
              <button
                onPointerDown={e => { e.preventDefault(); setShowOSK(v => !v); }}
                style={{ padding:'4px 10px', background: showOSK ? '#2563eb' : '#475569', color:'white', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:'bold' }}
              >⌨ מקלדת וירטואלית</button>
            </div>
            <textarea
              ref={textareaRef}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              dir="rtl"
              rows={3}
              style={{ width:'100%', padding:'10px', fontSize:'16px', border:'2px solid #cbd5e1', borderRadius:'8px', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
              placeholder="כתוב כאן..."
              autoFocus
              onFocus={e => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            />
            {showOSK && (
              <OnScreenKeyboard
                onType={insertAtCursor}
                onBackspace={oskBackspace}
                onEnter={() => insertAtCursor('\n')}
                onClose={() => setShowOSK(false)}
              />
            )}
          </div>
        )}

        {/* Handwriting canvas — always visible */}
        <div style={{ direction:'rtl' }}>
          <div style={{ fontSize:'12px', color:'#64748b', marginBottom:'4px', fontWeight:'600' }}>🖊️ כתב יד</div>
          <canvas
            ref={hwRef}
            width={480}
            height={200}
            style={{ border:'2px solid #cbd5e1', borderRadius:'8px', cursor:'crosshair', touchAction:'none', background:'#fff', display:'block', width:'100%' }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onPointerCancel={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:'8px', direction:'rtl', flexWrap:'wrap', justifyContent:'center' }}>
          <button onClick={confirm} style={{ padding:'9px 24px', background:'#2563eb', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'15px' }}>קבל</button>
          <button onClick={clearHw} style={{ padding:'9px 16px', background:'#64748b', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>נקה ציור</button>
          <button onClick={onCancel} style={{ padding:'9px 16px', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'14px' }}>ביטול</button>
        </div>
      </div>
    </div>
  );
};

// --- דשבורד עמדה ---
const SectorDashboard = ({ session, onLogout, onCrewChange, workstationPresets }: { session: WorkstationSession; onLogout: () => void; onCrewChange?: (newCrewMember: CrewMember) => void; workstationPresets: any[] }) => {
  const [strips, setStrips] = useState<any[]>([]);
  const [waitingStrips, setWaitingStrips] = useState<any[]>([]);
  const [allSectors, setAllSectors] = useState(session.relevantSectors);
  const neighbors = allSectors.slice(1);
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
  const [drawTool, setDrawTool] = useState<'pen'|'eraser'|'circle'|'rect'>('pen');
  const eraserMode = drawTool === 'eraser';
  type MapShape = { id: string; type: 'circle'|'rect'; x: number; y: number; w: number; h: number; color: string; filled: boolean; strokeWidth: number; };
  const [mapShapes, setMapShapes] = useState<MapShape[]>([]);
  const [shapeFilled, setShapeFilled] = useState(false);
  const [shapePreview, setShapePreview] = useState<{x1:number;y1:number;x2:number;y2:number}|null>(null);
  const shapeStartRef = useRef<{x:number;y:number}|null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string|null>(null);
  const shapeMoveRef = useRef<{id:string;ox:number;oy:number;sx:number;sy:number}|null>(null);
  const shapeResizeRef = useRef<{id:string;ox:number;oy:number;origW:number;origH:number}|null>(null);
  const drawingModeRef = useRef(false);
  const [availableMaps, setAvailableMaps] = useState<{id: number; name: string}[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{x: number; y: number} | null>(null);

  // Personal filter state
  const [personalFilter, setPersonalFilter] = useState<QGroup | null>(null);
  const [showPersonalFilter, setShowPersonalFilter] = useState(false);
  const [personalFilterDraft, setPersonalFilterDraft] = useState<QGroup | null>(null);

  // Load personal filter on mount
  useEffect(() => {
    const presetId = session.presetId;
    const crewId = session.crewMember?.id;
    if (!presetId || !crewId) return;
    fetch(`${API_URL}/workstation-personal-filters?preset_id=${presetId}&crew_member_id=${crewId}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.type === 'group') {
          setPersonalFilter(data as QGroup);
          setPersonalFilterDraft(data as QGroup);
        }
      })
      .catch(() => {});
  }, [session.presetId, session.crewMember?.id]);

  const savePersonalFilter = async (q: QGroup | null) => {
    const presetId = session.presetId;
    const crewId = session.crewMember?.id;
    if (!presetId || !crewId) return;
    await fetch(`${API_URL}/workstation-personal-filters`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId, crew_member_id: crewId, filter_query: q }),
    });
    setPersonalFilter(q);
  };

  // Keep the drawing canvas sized to the map area so 1px on canvas = 1px on screen
  useEffect(() => {
    const syncCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const mapArea = document.getElementById('map-area');
      if (!mapArea) return;
      const { width, height } = mapArea.getBoundingClientRect();
      if (canvas.width !== Math.round(width) || canvas.height !== Math.round(height)) {
        const ctx = canvas.getContext('2d');
        const saved = ctx ? canvas.toDataURL() : null;
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        if (saved && ctx) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = saved;
        }
      }
    };
    syncCanvasSize();
    const observer = new ResizeObserver(syncCanvasSize);
    const mapArea = document.getElementById('map-area');
    if (mapArea) observer.observe(mapArea);
    return () => observer.disconnect();
  }, []);

  const [showCrewSwap, setShowCrewSwap] = useState(false);
  const [availableCrewMembers, setAvailableCrewMembers] = useState<CrewMember[]>([]);
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('bt-lightMode') === 'true');

  useEffect(() => {
    document.body.classList.toggle('light-mode', lightMode);
    localStorage.setItem('bt-lightMode', String(lightMode));
  }, [lightMode]);

  const [tableMode, setTableMode] = useState(false);
  const [showMapDropdown, setShowMapDropdown] = useState(false);
  const [showTableDropdown, setShowTableDropdown] = useState(false);
  const [tableEditingNotes, setTableEditingNotes] = useState<Record<string, string>>({});
  const [tableRowOrder, setTableRowOrder] = useState<string[]>([]);
  const [tableSortBySector, setTableSortBySector] = useState(false);
  const [tableHandwritingId, setTableHandwritingId] = useState<string | null>(null);
  const [tableEditingCell, setTableEditingCell] = useState<string | null>(null); // "stripId__colKey"
  const [tableDragRow, setTableDragRow] = useState<string | null>(null);
  const [tableDragOverRow, setTableDragOverRow] = useState<string | null>(null);
  const [tableTransferOpen, setTableTransferOpen] = useState<string | null>(null);
  const [availableTableModes, setAvailableTableModes] = useState<any[]>([]);
  const [selectedTableModeId, setSelectedTableModeId] = useState<number | null>(null);
  const [tableGroupByKey, setTableGroupByKey] = useState<string | null>(null);
  const [tableGroupOrder, setTableGroupOrder] = useState<string[]>([]);
  const tableElRef = useRef<HTMLTableElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableStickyOffsets, setTableStickyOffsets] = useState<number[]>([]);
  const frozenColCountRef = useRef(0);
  const [tableSortKey, setTableSortKey] = useState<string | null>(null);
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');
  const [tableHeaderMenuKey, setTableHeaderMenuKey] = useState<string | null>(null);
  const [tableGroupDragKey, setTableGroupDragKey] = useState<string | null>(null);
  const [tableGroupDragOverKey, setTableGroupDragOverKey] = useState<string | null>(null);
  // Strips manually placed onto the table board (empty by default)
  const [tableOnBoard, setTableOnBoard] = useState<Set<string>>(new Set());
  // Right-click context menu for a table row
  const [tableRowCtxMenu, setTableRowCtxMenu] = useState<{ stripId: string; x: number; y: number } | null>(null);
  // Strip being dragged from sidebar into the table (HTML5 drag fallback)
  const tableSidebarDragId = useRef<string | null>(null);
  // Whether the right sidebar is pinned (visible)
  const [sidebarPinned, setSidebarPinned] = useState(true);
  const [neighborPanelOpen, setNeighborPanelOpen] = useState(() => session.relevantSectors.length > 0);
  // Whether the table is being drag-hovered from sidebar
  const [tableDragOver, setTableDragOver] = useState(false);
  // Pointer-events drag from sidebar to table
  const sidebarPointerDragRef = useRef<{ id: number; label: string } | null>(null);
  const [sidebarPointerGhost, setSidebarPointerGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  // Pointer-events drag from table row to neighbor transfer panel or back to sidebar
  const tablePointerDragRef = useRef<{ id: string; label: string } | null>(null);
  const [tablePointerGhost, setTablePointerGhost] = useState<{ x: number; y: number; label: string; overSidebar?: boolean } | null>(null);

  // Single floating notepad
  const [showNotepad, setShowNotepad] = useState(false);
  const [notepadPos, setNotepadPos] = useState({ x: 200, y: 80 });
  const [notepadSize, setNotepadSize] = useState({ w: 320, h: 240 });
  const [notepadMode, setNotepadMode] = useState<'keyboard' | 'handwriting' | 'both'>('keyboard');
  const [notepadText, setNotepadText] = useState('');
  const [showNotepadOSK, setShowNotepadOSK] = useState(false);
  const notepadSavedImageRef = useRef<string | null>(null);
  const notepadCanvasRef = useRef<HTMLCanvasElement>(null);
  const notepadDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const notepadDrawingRef = useRef(false);
  const notepadLastRef = useRef<{ x: number; y: number } | null>(null);
  const notepadTextareaRef = useRef<HTMLTextAreaElement>(null);

  const restoreNotepadCanvas = () => {
    const saved = notepadSavedImageRef.current;
    if (!saved) return;
    const canvas = notepadCanvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => { const ctx = canvas.getContext('2d'); if (ctx) ctx.drawImage(img, 0, 0); };
    img.src = saved;
  };
  useEffect(() => { restoreNotepadCanvas(); }, [notepadSize, notepadMode]);
  useEffect(() => {
    if (showNotepad) { const t = setTimeout(restoreNotepadCanvas, 0); return () => clearTimeout(t); }
  }, [showNotepad]);

  const notepadInsertAtCursor = (char: string) => {
    const el = notepadTextareaRef.current;
    if (!el) { setNotepadText(v => v + char); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = el.value.slice(0, s) + char + el.value.slice(e2);
    setNotepadText(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + char.length, s + char.length); });
  };
  const notepadOskBackspace = () => {
    const el = notepadTextareaRef.current;
    if (!el) { setNotepadText(v => v.slice(0, -1)); return; }
    const s = el.selectionStart ?? el.value.length;
    const e2 = el.selectionEnd ?? s;
    const next = s === e2 ? el.value.slice(0, Math.max(0, s - 1)) + el.value.slice(e2) : el.value.slice(0, s) + el.value.slice(e2);
    const ns = s === e2 ? Math.max(0, s - 1) : s;
    setNotepadText(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ns, ns); });
  };
  const primarySector = session.relevantSectors[0];
  const primarySectorId = primarySector?.id;

  // Sync row order when strips change
  useEffect(() => {
    setTableRowOrder(prev => {
      const existingSet = new Set(prev);
      const newIds = strips.filter(s => !existingSet.has(s.id)).map(s => s.id);
      const filtered = prev.filter(id => strips.some(s => s.id === id));
      return [...filtered, ...newIds];
    });
  }, [strips.map(s => s.id).join(',')]);

  // Determine the effective query filter for this workstation
  const myPresetConfig = workstationPresets.find(p => Number(p.id) === Number(session?.presetId));
  const adminFilterQuery: QGroup | null = myPresetConfig?.filter_query || null;
  // Personal filter takes priority over admin filter; if either is active, use query-based filtering
  // While the panel is open, apply the draft filter live for real-time preview
  const _rawFilter: QGroup | null = (showPersonalFilter && personalFilterDraft)
    ? personalFilterDraft
    : (personalFilter || adminFilterQuery);
  const effectiveFilter: QGroup | null = hasConditions(_rawFilter) ? _rawFilter : null;

  // Only show strips that belong to this workstation (not neighboring sector strips)
  const myStrips = effectiveFilter
    ? strips.filter(s => s.status !== 'pending_transfer' && evaluateQuery(s, effectiveFilter))
    : strips.filter(s =>
        s.status !== 'pending_transfer' &&
        (session.presetId
          ? Number(s.workstation_preset_id) === Number(session.presetId)
          : true)
      );

  // Table strips: strips manually placed on board OR placed on map (includes pending_transfer so they show grayed-out)
  const myTableStrips = effectiveFilter
    ? strips.filter(s => (tableOnBoard.has(s.id) || s.onMap) && evaluateQuery(s, effectiveFilter))
    : strips.filter(s =>
        (tableOnBoard.has(s.id) || s.onMap) &&
        (session.presetId
          ? Number(s.workstation_preset_id) === Number(session.presetId)
          : true)
      );
  const partialLoadThreshold: number = myPresetConfig?.partial_load ?? 3;
  const fullLoadThreshold: number = myPresetConfig?.full_load ?? 5;

  // Load count per the rules:
  // 1. Airborne strips at my workstation
  // 2. Ground strips at my workstation with takeoff within next 10 min
  // 3. Pending incoming transfers where strip is airborne OR takeoff within next 10 min
  const nowMs = Date.now();
  const in10Ms = nowMs + 10 * 60 * 1000;
  const isWithin10Min = (t: string | null | undefined) => {
    if (!t) return false;
    const ms = new Date(t).getTime();
    return ms >= nowMs && ms <= in10Ms;
  };
  const myActiveStrips = myStrips.filter(s => s.status !== 'pending_transfer');
  const airborneMine = myActiveStrips.filter(s => s.airborne).length;
  const groundSoonMine = myActiveStrips.filter(s => !s.airborne && isWithin10Min(s.takeoff_time)).length;
  const relevantIncoming = incomingTransfers.filter(t =>
    t.status === 'pending' && (t.airborne || isWithin10Min(t.takeoff_time))
  ).length;
  const loadCount = airborneMine + groundSoonMine + relevantIncoming;
  const loadLevel: 'none' | 'partial' | 'full' =
    loadCount >= fullLoadThreshold ? 'full' :
    loadCount >= partialLoadThreshold ? 'partial' : 'none';

  // Computed strips order for table display
  const tableDisplayStrips = (() => {
    if (tableSortBySector) {
      return [...myTableStrips].sort((a, b) => {
        const sA = allSectors.find(sec => sec.id === a.sectorId)?.name || '';
        const sB = allSectors.find(sec => sec.id === b.sectorId)?.name || '';
        return sA.localeCompare(sB, 'he');
      });
    }
    const ordered = tableRowOrder.map(id => myTableStrips.find(s => s.id === id)).filter(Boolean) as any[];
    const extra = myTableStrips.filter(s => !tableRowOrder.includes(s.id));
    return [...ordered, ...extra];
  })();

  const getStripFieldValue = (s: any, colKey: string): string => {
    const sectorName = allSectors.find(sec => sec.id === s.sectorId)?.name || (s.sectorId ? `#${s.sectorId}` : '—');
    switch (colKey) {
      case 'callSign': return s.callSign || '—';
      case 'squadron': return s.sq || s.squadron || '—';
      case 'sector': return sectorName;
      case 'shkadia': return s.shkadia || '—';
      case 'alt': return String(s.alt || '—');
      case 'weapons': return (Array.isArray(s.weapons) ? s.weapons : []).map((w: any) => w.type).join(', ') || '—';
      case 'targets': return (Array.isArray(s.targets) ? s.targets : []).map((t: any) => t.name).join(', ') || '—';
      default: {
        const cf = s.custom_fields && typeof s.custom_fields === 'object' ? s.custom_fields : {};
        return cf[colKey] || '—';
      }
    }
  };

  const tableDisplayItems: any[] = (() => {
    if (!tableGroupByKey) {
      if (tableSortKey) {
        return [...myTableStrips].sort((a, b) => {
          const av = getStripFieldValue(a, tableSortKey);
          const bv = getStripFieldValue(b, tableSortKey);
          const cmp = av.localeCompare(bv, 'he');
          return tableSortDir === 'asc' ? cmp : -cmp;
        });
      }
      return tableDisplayStrips;
    }
    const grouped: Record<string, any[]> = {};
    myTableStrips.forEach(s => {
      const val = getStripFieldValue(s, tableGroupByKey);
      if (!grouped[val]) grouped[val] = [];
      grouped[val].push(s);
    });
    const allKeys = Object.keys(grouped);
    const orderedKeys = [
      ...tableGroupOrder.filter(k => grouped[k]),
      ...allKeys.filter(k => !tableGroupOrder.includes(k))
    ];
    const items: any[] = [];
    orderedKeys.forEach(gk => {
      items.push({ _type: 'groupHeader', groupKey: gk, count: grouped[gk].length });
      let grpStrips = grouped[gk];
      if (tableSortKey) {
        grpStrips = [...grpStrips].sort((a, b) => {
          const av = getStripFieldValue(a, tableSortKey);
          const bv = getStripFieldValue(b, tableSortKey);
          const cmp = av.localeCompare(bv, 'he');
          return tableSortDir === 'asc' ? cmp : -cmp;
        });
      }
      grpStrips.forEach(s => items.push({ ...s, _type: 'strip' }));
    });
    return items;
  })();

  const loadCrewMembers = async () => {
    try {
      const res = await fetch(`${API_URL}/crew-members`);
      if (res.ok) setAvailableCrewMembers(await res.json());
    } catch (err) {
      console.error('Failed to load crew members:', err);
    }
  };

  const handleCrewSwap = (member: CrewMember) => {
    setShowCrewSwap(false);
    if (onCrewChange) {
      onCrewChange(member);
    }
  };

  const loadData = async () => {
    if (!primarySectorId) return;
    try {
      const hasPreset = !!session.presetId;
      
      // Build all requests
      const requests: Promise<Response>[] = [
        fetch(`${API_URL}/sectors/${primarySectorId}/sub-sectors`),
        fetch(`${API_URL}/maps`),
        hasPreset 
          ? fetch(`${API_URL}/workstations/${session.presetId}/incoming-transfers`)
          : fetch(`${API_URL}/sectors/${primarySectorId}/incoming-transfers`),
        hasPreset
          ? fetch(`${API_URL}/workstations/${session.presetId}/outgoing-transfers`)
          : fetch(`${API_URL}/sectors/${primarySectorId}/outgoing-transfers`)
      ];
      
      // Use workstation-scoped strips endpoint if presetId exists (filters by held_by_workstation)
      // Otherwise fall back to per-sector fetching
      if (hasPreset) {
        requests.push(fetch(`${API_URL}/workstations/${session.presetId}/strips`));
        requests.push(fetch(`${API_URL}/workstation-presets/${session.presetId}/waiting-strips`));
      } else {
        // Fallback: fetch strips from all relevant sectors (for ad-hoc sessions)
        const allSectorIds = allSectors.map(s => s.id);
        for (const sectorId of allSectorIds) {
          requests.push(fetch(`${API_URL}/sectors/${sectorId}/strips`));
        }
      }
      
      const results = await Promise.all(requests);
      
      const [subSectorsRes, mapsRes, incomingRes, outgoingRes] = results;
      
      if (subSectorsRes.ok) setSubSectors(await subSectorsRes.json());
      if (mapsRes.ok) setAvailableMaps(await mapsRes.json());
      if (incomingRes.ok) setIncomingTransfers(await incomingRes.json());
      if (outgoingRes.ok) setOutgoingTransfers(await outgoingRes.json());
      
      if (hasPreset) {
        const stripsRes = results[4];
        const waitingRes = results[5];
        if (stripsRes.ok) setStrips(await stripsRes.json());
        if (waitingRes.ok) setWaitingStrips(await waitingRes.json());
      } else {
        // Combine strips from all sector requests (fallback for ad-hoc sessions)
        const allStripsData: any[] = [];
        for (let i = 4; i < results.length; i++) {
          if (results[i].ok) {
            const data = await results[i].json();
            allStripsData.push(...data);
          }
        }
        // Remove duplicates by id
        const uniqueStrips = allStripsData.filter((strip, index, self) => 
          index === self.findIndex(s => s.id === strip.id)
        );
        setStrips(uniqueStrips);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  };

  const loadDefaultMap = async () => {
    try {
      if (session.mapId) {
        const mapRes = await fetch(`${API_URL}/maps/${session.mapId}`);
        if (mapRes.ok) {
          const map = await mapRes.json();
          setMapImg(map.image_data);
          return;
        }
      }
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
  }, [session.mapId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [primarySectorId]);

  useEffect(() => {
    const fetchTableModes = async () => {
      try {
        const res = await fetch(`${API_URL}/table-modes`);
        if (res.ok) {
          const modes = await res.json();
          setAvailableTableModes(modes);
        }
        if (session.presetId) {
          const presetRes = await fetch(`${API_URL}/workstation-presets`);
          if (presetRes.ok) {
            const presets = await presetRes.json();
            const myPreset = presets.find((p: any) => Number(p.id) === Number(session.presetId));
            if (myPreset?.table_mode_id) {
              setSelectedTableModeId(Number(myPreset.table_mode_id));
              setTableMode(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load table modes:', err);
      }
    };
    fetchTableModes();
  }, [session.presetId]);

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

  const handleMoveRef = useRef<(id: string, x: number, y: number, toMap: boolean) => void>(() => {});
  const handleTransferRef = useRef<(stripId: string, toSectorId: number) => void>(() => {});
  const tableModeRef = useRef(false);
  const mapZoomRef = useRef(1);
  const mapPanRef = useRef({ x: 0, y: 0 });

  const handleMove = async (id: string, x: number, y: number, toMap: boolean) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, x, y, onMap: toMap} : item));
    if (toMap) {
      // When placed on map, ensure strip appears in table too
      setTableOnBoard(prev => new Set([...prev, String(id)]));
    }
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
  handleMoveRef.current = handleMove;
  tableModeRef.current = tableMode;
  mapZoomRef.current = mapZoom;
  mapPanRef.current = mapPan;
  drawingModeRef.current = drawingMode;

  // Auto-scroll table container to the right when table mode activates
  useEffect(() => {
    if (!tableMode || !tableScrollRef.current) return;
    const el = tableScrollRef.current;
    requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
  }, [tableMode, selectedTableModeId]);

  // Measure frozen column offsets after table mode changes
  useEffect(() => {
    const measure = () => {
      if (!tableMode || !tableElRef.current || frozenColCountRef.current === 0) {
        setTableStickyOffsets(prev => prev.length === 0 ? prev : []);
        return;
      }
      const thead = tableElRef.current.querySelector('thead tr');
      if (!thead) { setTableStickyOffsets(prev => prev.length === 0 ? prev : []); return; }
      const ths = Array.from(thead.querySelectorAll('th')) as HTMLTableCellElement[];
      const fc = frozenColCountRef.current;
      const offsets: number[] = [];
      let right = 0;
      for (let i = 0; i <= fc && i < ths.length; i++) {
        offsets.push(right);
        right += ths[i]?.offsetWidth || 0;
      }
      setTableStickyOffsets(offsets);
    };
    // Small delay to let the DOM settle
    const t = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(t);
  }, [tableMode, selectedTableModeId]); // eslint-disable-line

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

  const handleTransfer = async (stripId: string, toSectorId: number, targetX?: number, targetY?: number, subSectorLabel?: string, toWorkstationId?: number) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          toSectorId, 
          workstationId: session.workstationId,
          targetX: targetX || 0,
          targetY: targetY || 0,
          subSectorLabel,
          fromWorkstationId: session.presetId,
          toWorkstationId: toWorkstationId || null
        })
      });
      // Optimistic update: immediately mark the strip as pending_transfer in local state
      // so the load count drops right away without waiting for the next poll cycle
      setStrips(prev => prev.map(s => s.id === stripId ? { ...s, status: 'pending_transfer' } : s));
      loadData();
    } catch (err) {
      console.error('Failed to initiate transfer:', err);
    }
  };
  handleTransferRef.current = handleTransfer;

  const handleNeighborDropOnMap = (sectorId: number, x: number, y: number, subLabel?: string) => {
    const sector = allSectors.find(n => n.id === sectorId);
    const label = subLabel || sector?.label_he || sector?.name || 'נקודת העברה';
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

  // Auto-expand neighbor panels that have pending transfers
  useEffect(() => {
    if (incomingTransfers.length === 0 && outgoingTransfers.length === 0) return;
    setExpandedNeighbors(prev => {
      const next = new Set(prev);
      allSectors.forEach(neighbor => {
        const hasOutgoing = outgoingTransfers.some(t => t.to_sector_id === neighbor.id);
        const hasIncoming = incomingTransfers.some(t => t.from_sector_id === neighbor.id);
        if (hasOutgoing || hasIncoming) next.add(neighbor.id);
      });
      return next;
    });
  }, [incomingTransfers, outgoingTransfers, allSectors]);

  // Pointer-event drag from sidebar to table — global move/up listeners
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!sidebarPointerDragRef.current) return;
      const mapArea = document.getElementById('map-area');
      let ghostX = e.clientX;
      if (!tableModeRef.current && mapArea) {
        const r = mapArea.getBoundingClientRect();
        ghostX = Math.min(e.clientX, r.right - 60);
        setTableDragOver(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      } else if (mapArea) {
        const r = mapArea.getBoundingClientRect();
        setTableDragOver(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      }
      setSidebarPointerGhost(prev => prev ? { ...prev, x: ghostX, y: e.clientY } : null);
    };
    const onUp = (e: PointerEvent) => {
      if (!sidebarPointerDragRef.current) return;
      const { id } = sidebarPointerDragRef.current;
      sidebarPointerDragRef.current = null;
      setSidebarPointerGhost(null);
      setTableDragOver(false);
      const mapArea = document.getElementById('map-area');
      if (mapArea) {
        const r = mapArea.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          if (tableModeRef.current) {
            // Table mode: add to table board
            setTableOnBoard(prev => new Set([...prev, String(id)]));
            handleMoveRef.current(String(id), 0, 0, false);
          } else {
            // Map mode: place strip on map at drop coordinates (accounting for zoom/pan)
            const zoom = mapZoomRef.current;
            const pan = mapPanRef.current;
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const rawX = (e.clientX - cx - pan.x) / zoom + r.width / 2;
            const rawY = (e.clientY - cy - pan.y) / zoom + r.height / 2;
            const clampedX = Math.max(100, Math.min(r.width - 100, rawX));
            const clampedY = Math.max(40, Math.min(r.height - 50, rawY));
            handleMoveRef.current(String(id), clampedX, clampedY, true);
          }
        }
      }
    };
    const onCancel = () => {
      sidebarPointerDragRef.current = null;
      setSidebarPointerGhost(null);
      setTableDragOver(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

  // Global pointer drag: table row → neighbor transfer panel OR back to sidebar (iPad-compatible)
  useEffect(() => {
    const clearHighlights = () => {
      document.querySelectorAll('.neighbor-drop-zone.strip-drag-active').forEach(el => el.classList.remove('strip-drag-active'));
    };
    const isOverSidebar = (x: number, y: number) => {
      const sidebar = document.getElementById('sidebar-area');
      if (!sidebar) return false;
      const r = sidebar.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const onMove = (e: PointerEvent) => {
      if (!tablePointerDragRef.current) return;
      e.preventDefault();
      const overSidebar = isOverSidebar(e.clientX, e.clientY);
      setTablePointerGhost(prev => prev ? { ...prev, x: e.clientX, y: e.clientY, overSidebar } : null);
      clearHighlights();
      if (!overSidebar) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const neighborEl = els.find((el: Element) => el.classList.contains('neighbor-drop-zone') && el.getAttribute('data-sector-id'));
        if (neighborEl) neighborEl.classList.add('strip-drag-active');
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!tablePointerDragRef.current) return;
      const { id } = tablePointerDragRef.current;
      tablePointerDragRef.current = null;
      setTablePointerGhost(null);
      setTableDragRow(null);
      clearHighlights();
      // Dropped on sidebar → remove from table
      if (isOverSidebar(e.clientX, e.clientY)) {
        setTableOnBoard(prev => { const next = new Set(prev); next.delete(String(id)); return next; });
        handleMoveRef.current(String(id), 0, 0, false);
        return;
      }
      // Dropped on neighbor panel → initiate transfer
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const neighborEl = els.find((el: Element) => el.classList.contains('neighbor-drop-zone') && el.getAttribute('data-sector-id'));
      if (neighborEl) {
        const sectorId = Number(neighborEl.getAttribute('data-sector-id'));
        handleTransferRef.current(id, sectorId);
      }
    };
    const onCancel = () => {
      if (!tablePointerDragRef.current) return;
      tablePointerDragRef.current = null;
      setTablePointerGhost(null);
      setTableDragRow(null);
      clearHighlights();
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, []);

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
  
  const handleUpdateSectorNotes = async (sectorId: number, newNotes: string) => {
    // Update local state immediately
    setAllSectors(prev => prev.map(s => s.id === sectorId ? {...s, notes: newNotes} : s));
    try {
      await fetch(`${API_URL}/sectors/${sectorId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: newNotes })
      });
    } catch (err) {
      console.error('Failed to update sector notes:', err);
    }
  };

  const handleAddSubSector = async () => {
    if (!newSubSectorNeighbor || !newSubSectorLabel.trim() || !primarySectorId) return;
    try {
      await fetch(`${API_URL}/sectors/${primarySectorId}/sub-sectors`, {
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
    if (!confirm('האם למחוק את תת-נקודת ההעברה?')) return;
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

  const deleteStrip = async (stripId: string) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete strip:', err);
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

  const handleUpdateStripNotes = async (id: string, notes: string) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, notes} : item));
    try {
      await fetch(`${API_URL}/strips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
    } catch (err) {
      console.error('Failed to update strip notes:', err);
    }
  };

  const handleUpdateStripDetails = async (id: string, details: { weapons: any[]; targets: any[]; systems: any[]; shkadia: string }) => {
    setStrips(prev => prev.map(item => item.id === id ? {...item, ...details} : item));
    try {
      await fetch(`${API_URL}/strips/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
      });
    } catch (err) {
      console.error('Failed to update strip details:', err);
    }
  };

  const handleAssignWaitingStrip = async (stripId: string) => {
    if (!primarySectorId) return;
    try {
      await fetch(`${API_URL}/strips/${stripId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectorId: primarySectorId })
      });
      loadData();
    } catch (err) {
      console.error('Failed to assign waiting strip:', err);
    }
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingModeRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
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
    if (!drawingModeRef.current || !isDrawingRef.current) return;
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

  // iPad fix: directly update canvas DOM pointer events so first pen stroke is captured immediately
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.pointerEvents = drawingMode ? 'auto' : 'none';
    if (!drawingMode) {
      setSelectedShapeId(null);
      setShapePreview(null);
      shapeStartRef.current = null;
      shapeMoveRef.current = null;
      shapeResizeRef.current = null;
    }
  }, [drawingMode]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{ padding: '10px 20px', background: '#0f172a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <b style={{fontSize: '18px'}}>BLUE TORCH</b>
          <span style={{ background: '#2563eb', padding: '4px 12px', borderRadius: '4px', fontSize: '14px' }}>
            {session.workstationName}
          </span>
          {session.crewMember && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: '#10b981', padding: '4px 12px', borderRadius: '4px', fontSize: '13px' }}>
                {session.crewMember.name}
              </span>
              <button 
                onClick={() => { loadCrewMembers(); setShowCrewSwap(true); }}
                style={{ background: '#f59e0b', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', border: 'none', color: '#1e293b', cursor: 'pointer', fontWeight: 'bold' }}
              >
                החלף
              </button>
            </div>
          )}
          {/* Load mode badge */}
          {loadLevel !== 'none' && (
            <div
              className={loadLevel === 'full' ? 'load-badge-full' : 'load-badge-partial'}
              style={{
                padding: '4px 14px',
                borderRadius: '6px',
                background: loadLevel === 'full' ? '#dc2626' : '#d97706',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '13px',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: `2px solid ${loadLevel === 'full' ? '#fca5a5' : '#fde68a'}`,
                cursor: 'default',
                userSelect: 'none',
              }}
              title={`עומס ${loadLevel === 'full' ? 'מלא' : 'חלקי'}: ${loadCount} פ"ממים | באוויר: ${airborneMine} | ממריאים תוך 10 ד': ${groundSoonMine} | נכנסות: ${relevantIncoming} | (סף חלקי: ${partialLoadThreshold}, מלא: ${fullLoadThreshold})`}
            >
              {loadLevel === 'full' ? '🔴' : '🟠'}
              {loadLevel === 'full' ? 'עומס מלא' : 'עומס חלקי'}
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '4px', padding: '1px 6px', fontSize: '12px' }}>{loadCount}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* כפתור מפה + תפריט בחירת מפה */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setTableMode(false); setShowMapDropdown(v => !v); setShowTableDropdown(false); }}
              style={{ 
                background: !tableMode ? '#2563eb' : '#334155', 
                color: 'white', padding: '5px 14px', borderRadius: '4px', fontSize: '12px', border: 'none', cursor: 'pointer',
                fontWeight: !tableMode ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              🗺 מפה {showMapDropdown ? '▲' : '▼'}
            </button>
            {showMapDropdown && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', zIndex: 1000, minWidth: '140px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', overflow: 'hidden' }}
                onMouseLeave={() => setShowMapDropdown(false)}>
                {availableMaps.length === 0
                  ? <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '12px' }}>אין מפות זמינות</div>
                  : availableMaps.map(m => (
                    <div key={m.id}
                      onClick={() => { selectMap(m.id); setShowMapDropdown(false); }}
                      style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: 'white', direction: 'rtl', borderBottom: '1px solid #334155' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      🗺 {m.name}
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          {/* כפתור טבלה + תפריט בחירת טבלה */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setTableMode(true); setShowTableDropdown(v => !v); setShowMapDropdown(false); }}
              style={{ 
                background: tableMode ? '#2563eb' : '#334155', 
                color: 'white', padding: '5px 14px', borderRadius: '4px', fontSize: '12px', border: 'none', cursor: 'pointer',
                fontWeight: tableMode ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              📋 טבלה {showTableDropdown ? '▲' : '▼'}
            </button>
            {showTableDropdown && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', zIndex: 1000, minWidth: '150px', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', overflow: 'hidden' }}
                onMouseLeave={() => setShowTableDropdown(false)}>
                {availableTableModes.length === 0
                  ? <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '12px' }}>אין טבלאות מוגדרות</div>
                  : availableTableModes.map(tm => (
                    <div key={tm.id}
                      onClick={() => { setSelectedTableModeId(tm.id); setShowTableDropdown(false); }}
                      style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: 'white', direction: 'rtl', borderBottom: '1px solid #334155',
                        background: tableMode && selectedTableModeId === tm.id ? '#1e40af' : '' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#2563eb')}
                      onMouseLeave={e => (e.currentTarget.style.background = (tableMode && selectedTableModeId === tm.id) ? '#1e40af' : '')}
                    >
                      📋 {tm.name}
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          <button
            onClick={() => setLightMode(v => !v)}
            title={lightMode ? 'עבור למצב כהה' : 'עבור למצב בהיר'}
            style={{ background: lightMode ? '#334155' : '#f1f5f9', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          >{lightMode ? '🌙' : '☀️'}</button>
          <button onClick={() => {
            if (showNotepad) {
              const canvas = notepadCanvasRef.current;
              if (canvas) notepadSavedImageRef.current = canvas.toDataURL();
            }
            setShowNotepad(v => !v);
          }} style={{ background: showNotepad ? '#f59e0b' : '#334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white', fontWeight: showNotepad ? 'bold' : 'normal' }}>
            📄 פתקית
          </button>
          <button onClick={onLogout} style={{ background: '#dc2626', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', border: 'none', color: 'white' }}>
            יציאה
          </button>
        </div>
      </header>

      {/* Personal Filter Overlay */}
      {showPersonalFilter && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPersonalFilter(false); }}>
          <div style={{ background: '#0f172a', border: '2px solid #2563eb', borderRadius: '12px', padding: '20px 24px', width: '680px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', direction: 'rtl', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <span style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '16px' }}>🔍 סינון אישי</span>
                {adminFilterQuery && !personalFilter && (
                  <span style={{ marginRight: '12px', color: '#4ade80', fontSize: '12px' }}>⬆ מופעל סינון עמדה (מנהל)</span>
                )}
                {adminFilterQuery && personalFilter && (
                  <span style={{ marginRight: '12px', color: '#fbbf24', fontSize: '12px' }}>⚠ דריסת סינון עמדה בסינון אישי</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {personalFilter && (
                  <button
                    onClick={async () => { await savePersonalFilter(null); setPersonalFilterDraft(null); }}
                    style={{ padding: '5px 12px', background: '#7f1d1d', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    🗑 מחק סינון אישי
                  </button>
                )}
                <button
                  onClick={async () => { await savePersonalFilter(personalFilterDraft); setShowPersonalFilter(false); }}
                  style={{ padding: '5px 14px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ✓ שמור וסגור
                </button>
                <button
                  onClick={() => setShowPersonalFilter(false)}
                  style={{ padding: '5px 12px', background: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {adminFilterQuery && (
              <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#1e293b', borderRadius: '6px', border: '1px solid #16a34a', color: '#4ade80', fontSize: '12px' }}>
                🔒 סינון עמדה (מנהל, {adminFilterQuery.children.length} תנאים) — {personalFilter ? 'מוחלף ע"י הסינון האישי שלך' : 'פעיל כרגע'}
              </div>
            )}

            <QueryBuilder
              value={personalFilterDraft}
              onChange={q => setPersonalFilterDraft(q)}
              label='סינון אישי (דריסת סינון עמדה)'
            />
          </div>
        </div>
      )}

      {showLearn && <LearnDigitsOverlay onClose={() => setShowLearn(false)} crewMemberId={session.crewMember?.id} crewMemberName={session.crewMember?.name} />}
      
      {/* Crew Swap Modal */}
      {showCrewSwap && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '25px', width: '350px', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#1e293b' }}>החלפת איש צוות</h3>
              <button onClick={() => setShowCrewSwap(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '15px' }}>בחר איש צוות חדש. העמדה תישאר פעילה עם נתוני כתב היד של איש הצוות החדש.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {availableCrewMembers.map(cm => (
                <button
                  key={cm.id}
                  onClick={() => handleCrewSwap(cm)}
                  disabled={session.crewMember?.id === cm.id}
                  style={{
                    padding: '12px 15px',
                    background: session.crewMember?.id === cm.id ? '#e2e8f0' : '#f1f5f9',
                    color: session.crewMember?.id === cm.id ? '#94a3b8' : '#1e293b',
                    border: session.crewMember?.id === cm.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    cursor: session.crewMember?.id === cm.id ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{cm.name}</span>
                  {session.crewMember?.id === cm.id && <span style={{ fontSize: '11px', color: '#3b82f6' }}>נוכחי</span>}
                  {cm.is_admin && session.crewMember?.id !== cm.id && <span style={{ fontSize: '10px', background: '#eab308', color: '#1e293b', padding: '2px 6px', borderRadius: '10px' }}>מנהל</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {showSubSectorManager && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', width: '500px', maxHeight: '80vh', overflowY: 'auto', direction: 'rtl' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>ניהול תת-נקודות העברה</h2>
              <button onClick={() => setShowSubSectorManager(false)} style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            
            <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>הוסף תת-נקודה חדשה</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select 
                  value={newSubSectorNeighbor || ''} 
                  onChange={(e) => setNewSubSectorNeighbor(parseInt(e.target.value) || null)}
                  style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', flex: 1, minWidth: '120px' }}
                >
                  <option value="">בחר נקודת העברה</option>
                  {neighbors.map(n => (
                    <option key={n.id} value={n.id}>{n.label_he || n.name}</option>
                  ))}
                </select>
                <input 
                  type="text" 
                  value={newSubSectorLabel}
                  onChange={(e) => setNewSubSectorLabel(e.target.value)}
                  placeholder="שם תת-נקודה"
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
              <h3 style={{ margin: '0 0 10px', fontSize: '14px' }}>תת-נקודות קיימות</h3>
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
                  אין תת-נקודות. הוסף חדשה למעלה.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', background: '#eee', overflow: 'hidden', position: 'relative' }}>
        {/* Sector Panels - Far Left — collapsible, open when transfer points exist */}
        {allSectors.length > 0 && (
          neighborPanelOpen ? (
            <div id="neighbor-panel" style={{ width: 200, background: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column', direction: 'rtl', flexShrink: 0 }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px' }}>נקודות העברה</h4>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{tableMode ? 'גרור שורת פמם מהטבלה להעברה' : 'גרור למפה להעברה עם מיקום'}</div>
                </div>
                <button
                  onClick={() => setNeighborPanelOpen(false)}
                  title="סגור חלונית"
                  style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 7px', borderRadius: '4px', fontSize: '13px', lineHeight: 1, flexShrink: 0 }}
                >◀</button>
              </div>
              {allSectors.map(n => (
                <DraggableNeighborPanel
                  key={n.id}
                  neighbor={n}
                  subSectors={subSectors}
                  onDropOnMap={handleNeighborDropOnMap}
                  isExpanded={expandedNeighbors.has(n.id)}
                  onToggle={() => toggleNeighborExpanded(n.id)}
                  outgoingTransfers={outgoingTransfers}
                  incomingTransfers={incomingTransfers}
                  onCancelTransfer={handleCancelTransfer}
                  onAcceptTransfer={handleAcceptTransfer}
                  onRejectTransfer={handleRejectTransfer}
                  onAcceptToMap={handleAcceptToMap}
                  dragStripId={tableMode ? tableDragRow : null}
                  onStripDrop={tableMode ? (stripId, sectorId) => { handleTransfer(stripId, sectorId); setTableDragRow(null); } : undefined}
                />
              ))}
            </div>
          ) : (
            /* Collapsed strip — shows toggle button on left edge */
            <div style={{ width: 28, background: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: '8px', gap: '6px' }}>
              <button
                onClick={() => setNeighborPanelOpen(true)}
                title="פתח נקודות העברה"
                style={{ background: '#334155', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px 4px', borderRadius: '0 4px 4px 0', fontSize: '12px', lineHeight: 1 }}
              >▶</button>
              {(() => {
                const pendingCount = incomingTransfers.filter(t => allSectors.some(n => n.id === t.from_sector_id)).length;
                return pendingCount > 0 ? (
                  <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '10px', color: '#f87171', fontWeight: 'bold', background: '#450a0a', borderRadius: '4px', padding: '4px 2px', cursor: 'pointer' }} onClick={() => setNeighborPanelOpen(true)}>
                    {pendingCount} ממתין
                  </div>
                ) : null;
              })()}
            </div>
          )
        )}

        {/* Map Area / Table View */}
        <div
          ref={tableScrollRef}
          id="map-area"
          style={{ flex: 1, position: 'relative', background: tableMode ? (tableDragOver ? '#1a2744' : '#0f172a') : '#cbd5e1', overflow: tableMode ? 'auto' : 'hidden', minHeight: 0, transition: 'background 0.15s' }}
          onDragOver={tableMode ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (tableSidebarDragId.current) setTableDragOver(true); } : undefined}
          onDragLeave={tableMode ? () => setTableDragOver(false) : undefined}
          onDrop={tableMode ? e => {
            e.preventDefault();
            setTableDragOver(false);
            const rawId = e.dataTransfer.getData('text/strip-id') || String(tableSidebarDragId.current ?? '');
            const sid = rawId ? Number(rawId) : null;
            if (sid) {
              setTableOnBoard(prev => new Set([...prev, String(sid)]));
              tableSidebarDragId.current = null;
            }
          } : undefined}
          onClick={() => { setTableRowCtxMenu(null); setTableHeaderMenuKey(null); }}
        >
          {/* Table Mode */}
          {tableMode && (() => {
            const activeMode = availableTableModes.find(tm => tm.id === selectedTableModeId);
            const columns: any[] = activeMode?.columns && activeMode.columns.length > 0
              ? activeMode.columns
              : [
                  { key: 'callSign', label: 'או"ק', editable: 'none' },
                  { key: 'squadron', label: 'SQ', editable: 'none' },
                  { key: 'weapons', label: 'חימושים', editable: 'none' },
                  { key: 'targets', label: "מטרות", editable: 'none' },
                  { key: 'shkadia', label: 'שקדיה', editable: 'none' },
                  { key: 'sector', label: 'אזור', editable: 'none' },
                  { key: 'notes', label: 'הערות', editable: 'handwriting' },
                  { key: 'transfer', label: 'העבר', editable: 'none' },
                ];

            const renderCell = (s: any, col: any) => {
              const colKey: string = col.key || col.field || '';
              const weapons: any[] = Array.isArray(s.weapons) ? s.weapons : [];
              const targets: any[] = Array.isArray(s.targets) ? s.targets : [];
              const currentNote = tableEditingNotes[s.id] !== undefined ? tableEditingNotes[s.id] : (s.notes || '');
              const isNoteImage = currentNote.startsWith('data:image');
              const sectorName = allSectors.find(sec => sec.id === s.sectorId)?.name || (s.sectorId ? `#${s.sectorId}` : '—');
              const customFields = (s.custom_fields && typeof s.custom_fields === 'object') ? s.custom_fields : {};
              const customVal = customFields[colKey] || '';

              if (col.isCustom || colKey.startsWith('custom_')) {
                const saveCustom = async (val: string) => {
                  const newCF = { ...customFields, [colKey]: val };
                  await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_fields: newCF }) });
                  setStrips(prev => prev.map(st => st.id === s.id ? { ...st, custom_fields: newCF } : st));
                };
                if (col.editable === 'none') {
                  return <td key={colKey} style={{ padding: '10px 12px', color: '#e2e8f0', verticalAlign: 'top', fontSize: '12px' }}>{customVal || '—'}</td>;
                }
                const isImg = customVal.startsWith('data:image');
                const cellKey = s.id + '__' + colKey;
                const isEditingThis = tableEditingCell === cellKey;
                return (
                  <td key={colKey} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                    {isEditingThis && isImg ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <img src={customVal} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '36px', borderRadius: '4px', border: '1px solid #334155' }} />
                        <button onMouseDown={e => e.preventDefault()} onClick={() => { saveCustom(''); setTableEditingCell(null); }} style={{ fontSize: '10px', padding: '2px 6px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 מחק</button>
                        {(col.editable === 'handwriting' || col.editable === 'both') && (
                          <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(cellKey); setTableEditingCell(null); }} style={{ fontSize: '10px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️ ערוך</button>
                        )}
                        <button onMouseDown={e => e.preventDefault()} onClick={() => setTableEditingCell(null)} style={{ fontSize: '10px', padding: '2px 6px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: '3px', cursor: 'pointer' }}>סגור</button>
                      </div>
                    ) : isEditingThis ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                        {(col.editable === 'keyboard' || col.editable === 'both') && (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                            <textarea
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus
                              defaultValue={customVal}
                              onBlur={async e => {
                                if (e.target.value !== customVal) await saveCustom(e.target.value);
                                setTableEditingCell(null);
                              }}
                              placeholder={col.label || '...'}
                              rows={2}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            {customVal && (
                              <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { saveCustom(''); setTableEditingCell(null); }}
                                style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', alignSelf: 'flex-start' }}
                              >🗑 נקה</button>
                            )}
                          </div>
                        )}
                        {(col.editable === 'handwriting' || col.editable === 'both') && (
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { setTableHandwritingId(cellKey); setTableEditingCell(null); }}
                            title="כתב יד"
                            style={{ padding: '4px 7px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', flexShrink: 0 }}
                          >✏️</button>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => (col.editable === 'keyboard' || col.editable === 'both') ? setTableEditingCell(cellKey) : undefined}
                        style={{ cursor: (col.editable === 'keyboard' || col.editable === 'both') ? 'text' : 'default', minHeight: '28px', padding: '4px 6px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', color: customVal ? (lightMode ? '#1e293b' : '#e2e8f0') : (lightMode ? '#94a3b8' : '#64748b'), border: '1px solid transparent', userSelect: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}
                      >
                        {isImg
                          ? <img src={customVal} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '32px', borderRadius: '4px', border: lightMode ? '1px solid #cbd5e1' : '1px solid #334155' }} />
                          : customVal
                            ? <span>{customVal}</span>
                            : <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{col.label || '...'}</span>
                        }
                        {(col.editable === 'handwriting' || col.editable === 'both') && (
                          <button onClick={e => { e.stopPropagation(); setTableHandwritingId(cellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>✏️</button>
                        )}
                      </div>
                    )}
                  </td>
                );
              }

              switch (colKey) {
                case 'callSign': {
                  const csCellKey = s.id + '__callSign';
                  const csEditing = tableEditingCell === csCellKey;
                  if (col.editable === 'keyboard' || col.editable === 'both') {
                    const saveField = async (val: string) => {
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, callSign: val } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callSign: val }) });
                    };
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {csEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={s.callSign || ''} rows={1}
                              onBlur={async e => { if (e.target.value !== (s.callSign || '')) await saveField(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '13px', fontWeight: 'bold', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {col.editable === 'both' && <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(csCellKey); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️</button>}
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(csCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '14px', fontWeight: 'bold', color: lightMode ? '#1e293b' : 'white', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                            <span style={{ flex: 1 }}>{s.callSign}</span>
                            {s.airborne && <span style={{ fontSize: '10px', color: '#22c55e', background: lightMode ? '#dcfce7' : '#052e16', padding: '1px 4px', borderRadius: '3px' }}>מאוויר</span>}
                            {col.editable === 'both' && <button onClick={e => { e.stopPropagation(); setTableHandwritingId(csCellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>✏️</button>}
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', color: lightMode ? '#1e293b' : 'white', fontWeight: 'bold', fontSize: '14px', verticalAlign: 'top' }}>
                      <div>{s.callSign}</div>
                      {s.airborne && <span style={{ fontSize: '10px', color: '#22c55e', background: lightMode ? '#dcfce7' : '#052e16', padding: '2px 5px', borderRadius: '4px', display: 'block', marginTop: '2px' }}>מאוויר</span>}
                    </td>
                  );
                }
                case 'airborne':
                  if (col.editable === 'toggle') {
                    return (
                      <td key={col.key} style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleAirborne(s.id, !s.airborne)}
                          style={{ padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', background: s.airborne ? '#16a34a' : '#334155', color: s.airborne ? 'white' : '#94a3b8', transition: 'all 0.15s' }}
                        >{s.airborne ? '✈ מאוויר' : '○ קרקע'}</button>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                      {s.airborne ? <span style={{ color: '#22c55e', fontSize: '12px' }}>מאוויר</span> : <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px' }}>—</span>}
                    </td>
                  );
                case 'squadron': {
                  const sqCellKey = s.id + '__squadron';
                  const sqEditing = tableEditingCell === sqCellKey;
                  if (col.editable === 'keyboard' || col.editable === 'both') {
                    const saveField = async (val: string) => {
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, sq: val } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sq: val }) });
                    };
                    const currentSq = s.sq || s.squadron || '';
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {sqEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={currentSq} rows={1}
                              onBlur={async e => { if (e.target.value !== currentSq) await saveField(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {currentSq && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveField(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 נקה</button>}
                              {col.editable === 'both' && <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(sqCellKey); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️</button>}
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(sqCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', color: currentSq ? (lightMode ? '#1e293b' : '#e2e8f0') : (lightMode ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                            <span style={{ flex: 1 }}>{currentSq || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>SQ</span>}</span>
                            {col.editable === 'both' && <button onClick={e => { e.stopPropagation(); setTableHandwritingId(sqCellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>✏️</button>}
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', color: '#e2e8f0', verticalAlign: 'top' }}>
                      <div>{s.sq || s.squadron || '—'}</div>
                      {s.alt && <div style={{ fontSize: '11px', color: lightMode ? '#64748b' : '#94a3b8', marginTop: '2px' }}>גובה: {s.alt}</div>}
                    </td>
                  );
                }
                case 'alt': {
                  const altCellKey = s.id + '__alt';
                  const altEditing = tableEditingCell === altCellKey;
                  if (col.editable === 'keyboard' || col.editable === 'both') {
                    const saveField = async (val: string) => {
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, alt: val } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alt: val }) });
                    };
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {altEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={s.alt || ''} rows={1}
                              onBlur={async e => { if (e.target.value !== (s.alt || '')) await saveField(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {s.alt && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveField(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 נקה</button>}
                              {col.editable === 'both' && <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(altCellKey); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️</button>}
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(altCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', color: s.alt ? (lightMode ? '#475569' : '#94a3b8') : (lightMode ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                            <span style={{ flex: 1 }}>{s.alt || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>גובה</span>}</span>
                            {col.editable === 'both' && <button onClick={e => { e.stopPropagation(); setTableHandwritingId(altCellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>✏️</button>}
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', color: '#94a3b8', verticalAlign: 'top', fontSize: '12px' }}>{s.alt || '—'}</td>
                  );
                }
                case 'weapons': {
                  const wpCellKey = s.id + '__weapons';
                  const wpEditing = tableEditingCell === wpCellKey;
                  const weaponsText = weapons.map((w: any) => w.type + (w.quantity ? ` ×${w.quantity}` : '')).join('\n');
                  if (col.editable === 'keyboard') {
                    const saveWeapons = async (text: string) => {
                      const arr = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                        const m = line.match(/^(.+?)\s*[×x](\d+)$/);
                        return m ? { type: m[1].trim(), quantity: m[2] } : { type: line, quantity: '' };
                      });
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, weapons: arr } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weapons: arr }) });
                    };
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {wpEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={weaponsText} rows={Math.max(2, weapons.length + 1)} placeholder={'שם חימוש ×כמות\nשורה לכל חימוש'}
                              onBlur={async e => { if (e.target.value !== weaponsText) await saveWeapons(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: '#fbbf24', padding: '5px 7px', fontSize: '11px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            {weapons.length > 0 && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveWeapons(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', alignSelf: 'flex-start' }}>🗑 נקה</button>}
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(wpCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', userSelect: 'none' }}>
                            {weapons.length === 0
                              ? <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '12px', color: lightMode ? '#94a3b8' : '#64748b' }}>ללא חימושים</span>
                              : weapons.map((w: any, i: number) => <div key={i} style={{ color: lightMode ? '#92400e' : '#fbbf24', fontSize: '12px' }}>{w.type}{w.quantity ? ` ×${w.quantity}` : ''}</div>)
                            }
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                      {weapons.length === 0
                        ? <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px' }}>—</span>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {weapons.map((w: any, i: number) => (
                              <div key={i} style={{ color: lightMode ? '#92400e' : '#fbbf24', fontSize: '12px' }}>{w.type}{w.quantity ? ` ×${w.quantity}` : ''}</div>
                            ))}
                          </div>
                      }
                    </td>
                  );
                }
                case 'targets': {
                  const tgCellKey = s.id + '__targets';
                  const tgEditing = tableEditingCell === tgCellKey;
                  const targetsText = targets.map((t: any) => t.name + (t.aim_point ? ` / ${t.aim_point}` : '')).join('\n');
                  if (col.editable === 'keyboard') {
                    const saveTargets = async (text: string) => {
                      const arr = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
                        const parts = line.split('/');
                        return { name: parts[0].trim(), aim_point: parts[1]?.trim() || '' };
                      });
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, targets: arr } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets: arr }) });
                    };
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {tgEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={targetsText} rows={Math.max(2, targets.length + 1)} placeholder={'שם מטרה / נקודת כוון\nשורה לכל מטרה'}
                              onBlur={async e => { if (e.target.value !== targetsText) await saveTargets(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: '#f87171', padding: '5px 7px', fontSize: '11px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            {targets.length > 0 && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveTargets(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer', alignSelf: 'flex-start' }}>🗑 נקה</button>}
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(tgCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', userSelect: 'none' }}>
                            {targets.length === 0
                              ? <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '12px', color: lightMode ? '#94a3b8' : '#64748b' }}>ללא מטרות</span>
                              : targets.map((t: any, i: number) => <div key={i} style={{ color: lightMode ? '#b91c1c' : '#f87171', fontSize: '12px' }}>{t.name}{t.aim_point ? ` / ${t.aim_point}` : ''}</div>)
                            }
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                      {targets.length === 0
                        ? <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px' }}>—</span>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {targets.map((t: any, i: number) => (
                              <div key={i} style={{ color: lightMode ? '#b91c1c' : '#f87171', fontSize: '12px' }}>{t.name}{t.aim_point ? ` / ${t.aim_point}` : ''}</div>
                            ))}
                          </div>
                      }
                    </td>
                  );
                }
                case 'shkadia': {
                  const shkCellKey = s.id + '__shkadia';
                  const shkEditing = tableEditingCell === shkCellKey;
                  if (col.editable === 'keyboard' || col.editable === 'both') {
                    const saveField = async (val: string) => {
                      setStrips(prev => prev.map(st => st.id === s.id ? { ...st, shkadia: val } : st));
                      await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shkadia: val }) });
                    };
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {shkEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={s.shkadia || ''} rows={1}
                              onBlur={async e => { if (e.target.value !== (s.shkadia || '')) await saveField(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {s.shkadia && <button onMouseDown={e => e.preventDefault()} onClick={() => { saveField(''); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 נקה</button>}
                              {col.editable === 'both' && <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(shkCellKey); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️</button>}
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(shkCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', color: s.shkadia ? '#a78bfa' : (lightMode ? '#94a3b8' : '#64748b'), display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none' }}>
                            <span style={{ flex: 1 }}>{s.shkadia || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>שקדיה</span>}</span>
                            {col.editable === 'both' && <button onClick={e => { e.stopPropagation(); setTableHandwritingId(shkCellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>✏️</button>}
                          </div>
                        )}
                      </td>
                    );
                  }
                  return <td key={col.key} style={{ padding: '10px 12px', color: '#a78bfa', verticalAlign: 'top', fontSize: '12px' }}>{s.shkadia || '—'}</td>;
                }
                case 'sector':
                  if (col.editable === 'dropdown') {
                    return (
                      <td key={col.key} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        <select
                          value={s.sectorId || ''}
                          onChange={async e => {
                            const newSectorId = Number(e.target.value) || null;
                            setStrips(prev => prev.map(st => st.id === s.id ? { ...st, sectorId: newSectorId } : st));
                            await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sectorId: newSectorId }) });
                          }}
                          style={{ background: '#0f172a', color: tableSortBySector ? '#38bdf8' : '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', width: '100%', direction: 'rtl' }}
                        >
                          <option value="">— ללא —</option>
                          {allSectors.map(sec => (
                            <option key={sec.id} value={sec.id}>{sec.name}</option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={{ padding: '10px 12px', color: tableSortBySector ? '#38bdf8' : '#94a3b8', verticalAlign: 'top', fontSize: '12px' }}>{sectorName}</td>
                  );
                case 'notes': {
                  const noteParsed = parseNoteValue(currentNote);
                  const hasAnyNote = noteParsed.text.trim().length > 0 || noteParsed.hw.startsWith('data:');
                  if (col.editable === 'none') {
                    return (
                      <td key={colKey} style={{ padding: '6px 8px', color: '#e2e8f0', verticalAlign: 'top', fontSize: '12px' }}>
                        {noteParsed.text && <div style={{ direction: 'rtl', marginBottom: noteParsed.hw ? '4px' : 0 }}>{noteParsed.text}</div>}
                        {noteParsed.hw && <img src={noteParsed.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '32px' }} />}
                        {!hasAnyNote && '—'}
                      </td>
                    );
                  }
                  const notesCellKey = s.id + '__notes';
                  const notesEditing = tableEditingCell === notesCellKey;
                  const saveNoteText = async (newText: string) => {
                    const newNote = serializeNoteValue(newText, noteParsed.hw);
                    setStrips(prev => prev.map(st => st.id === s.id ? { ...st, notes: newNote } : st));
                    await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: newNote }) });
                  };
                  const clearNoteText = async () => {
                    const newNote = serializeNoteValue('', noteParsed.hw);
                    setStrips(prev => prev.map(st => st.id === s.id ? { ...st, notes: newNote } : st));
                    await fetch(`${API_URL}/strips/${s.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: newNote }) });
                  };
                  if (col.editable === 'keyboard' || col.editable === 'both') {
                    return (
                      <td key={colKey} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                        {notesEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <textarea autoFocus defaultValue={noteParsed.text} rows={2}
                              onBlur={async e => { if (e.target.value !== noteParsed.text) await saveNoteText(e.target.value); setTableEditingCell(null); }}
                              style={{ width: '100%', background: '#0f172a', border: '1px solid #6d28d9', borderRadius: '4px', color: 'white', padding: '5px 7px', fontSize: '12px', resize: 'vertical', direction: 'rtl', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                            {noteParsed.hw && <img src={noteParsed.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '32px', borderRadius: '4px', border: '1px solid #334155' }} />}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {noteParsed.text && <button onMouseDown={e => e.preventDefault()} onClick={() => { clearNoteText(); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 8px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>🗑 נקה</button>}
                              {col.editable === 'both' && <button onMouseDown={e => e.preventDefault()} onClick={() => { setTableHandwritingId(notesCellKey); setTableEditingCell(null); }} style={{ fontSize: '11px', padding: '2px 6px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>✏️ כתב יד</button>}
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => setTableEditingCell(notesCellKey)} style={{ cursor: 'text', minHeight: '24px', padding: '3px 5px', borderRadius: '4px', direction: 'rtl', fontSize: '12px', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {noteParsed.text && <div style={{ color: lightMode ? '#1e293b' : '#e2e8f0', background: lightMode ? '#e2e8f0' : '#1e293b', borderRadius: '3px', padding: '2px 5px', fontSize: '11px' }}>{noteParsed.text}</div>}
                            {noteParsed.hw && <img src={noteParsed.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '34px', borderRadius: '4px', border: lightMode ? '1px solid #cbd5e1' : '1px solid #334155' }} />}
                            {!hasAnyNote && <span style={{ opacity: 0.5, fontStyle: 'italic', color: lightMode ? '#94a3b8' : '#64748b' }}>הערה...</span>}
                            {col.editable === 'both' && <button onClick={e => { e.stopPropagation(); setTableHandwritingId(notesCellKey); }} title="כתב יד" style={{ padding: '2px 5px', background: '#4c1d95', color: '#a78bfa', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', alignSelf: 'flex-start' }}>✏️</button>}
                          </div>
                        )}
                      </td>
                    );
                  }
                  if (col.editable === 'handwriting') {
                    return (
                      <td key={colKey} onClick={() => setTableHandwritingId(notesCellKey)} style={{ padding: '6px 8px', verticalAlign: 'top', cursor: 'pointer' }} title="לחץ לעריכת כתב יד">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '24px' }}>
                          {noteParsed.hw && <img src={noteParsed.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '34px', borderRadius: '4px', border: lightMode ? '1px solid #cbd5e1' : '1px solid #334155' }} />}
                          {!hasAnyNote && <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px' }}>—</span>}
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={colKey} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                      {hasAnyNote ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {noteParsed.text && <div style={{ direction: 'rtl', fontSize: '11px', color: lightMode ? '#1e293b' : '#e2e8f0', background: lightMode ? '#e2e8f0' : '#1e293b', borderRadius: '4px', padding: '3px 6px' }}>{noteParsed.text}</div>}
                          {noteParsed.hw && <img src={noteParsed.hw} alt="כתב יד" style={{ maxWidth: '100%', maxHeight: '34px', borderRadius: '4px', border: lightMode ? '1px solid #cbd5e1' : '1px solid #334155' }} />}
                        </div>
                      ) : (
                        <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                  );
                }
                case 'transfer':
                  return (
                    <td key={col.key} style={{ padding: '8px', verticalAlign: 'top', position: 'relative' }}>
                      <select
                        value=""
                        onChange={async e => {
                          const secId = Number(e.target.value);
                          if (secId) await handleTransfer(s.id, secId);
                          setTableTransferOpen(null);
                        }}
                        style={{ background: '#334155', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', width: '100%', direction: 'rtl' }}
                      >
                        <option value="">בחר...</option>
                        {allSectors.map(sec => (
                          <option key={sec.id} value={sec.id}>{sec.name}</option>
                        ))}
                      </select>
                    </td>
                  );
                default:
                  return <td key={col.key} style={{ padding: '10px 12px', color: '#94a3b8', verticalAlign: 'top', fontSize: '12px' }}>—</td>;
              }
            };

            const frozenCount = activeMode?.frozenColumns || 0;
            frozenColCountRef.current = frozenCount;
            const hasFrozen = frozenCount > 0;

            return (
              <>
              <table
                ref={tableElRef}
                style={{ width: hasFrozen ? 'max-content' : '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: '13px', direction: 'rtl' }}
                onDragOver={e => e.preventDefault()}
                onClick={() => tableHeaderMenuKey && setTableHeaderMenuKey(null)}
              >
                <thead>
                  <tr style={{ background: '#1e293b' }}>
                    <th
                      className={hasFrozen ? 'frozen-col' : undefined}
                      style={{
                        padding: '8px 6px', width: '28px', color: lightMode ? '#475569' : '#94a3b8', borderBottom: '2px solid #334155',
                        position: 'sticky', top: 0, zIndex: hasFrozen ? 15 : 10,
                        ...(hasFrozen ? { right: tableStickyOffsets[0] ?? 0, background: '#1e293b' } : {})
                      }}
                      title="גרור לסידור מחדש"
                    >⠿</th>
                    {columns.map((col, colIdx) => {
                      const colKey = col.key || col.field || '';
                      const isGrouped = tableGroupByKey === colKey;
                      const isSorted = tableSortKey === colKey;
                      const isMenuOpen = tableHeaderMenuKey === colKey;
                      const isFrozen = colIdx < frozenCount;
                      const isLastFrozen = isFrozen && colIdx === frozenCount - 1;
                      const frozenRight = isFrozen ? (tableStickyOffsets[colIdx + 1] ?? undefined) : undefined;
                      return (
                        <th key={colKey} className={isFrozen ? (isLastFrozen ? 'frozen-col-last' : 'frozen-col') : undefined} style={{ padding: '8px 10px', textAlign: 'right', color: isGrouped ? '#a78bfa' : isSorted ? '#38bdf8' : '#94a3b8', borderBottom: '2px solid #334155', position: 'sticky', top: 0, minWidth: '80px', userSelect: 'none', zIndex: isFrozen ? 12 : 10, ...(isFrozen ? { right: frozenRight, background: '#1e293b', borderLeft: isLastFrozen ? '2px solid #7c3aed' : undefined } : {}) }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                            <span>{col.label}</span>
                            {isGrouped && <span style={{ fontSize: '9px', background: '#4c1d95', color: '#c4b5fd', padding: '1px 4px', borderRadius: '3px' }}>⊞</span>}
                            {isSorted && <span style={{ fontSize: '11px' }}>{tableSortDir === 'asc' ? '↑' : '↓'}</span>}
                            <button
                              onClick={e => { e.stopPropagation(); setTableHeaderMenuKey(prev => prev === colKey ? null : colKey); }}
                              style={{ background: isMenuOpen ? '#334155' : 'transparent', border: 'none', color: lightMode ? '#64748b' : '#94a3b8', cursor: 'pointer', padding: '1px 3px', borderRadius: '3px', fontSize: '10px', lineHeight: 1, flexShrink: 0 }}
                            >▾</button>
                          </div>
                          {isMenuOpen && (
                            <div
                              className="table-header-menu"
                              onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '100%', right: 0, background: '#0f2444', border: '1px solid #3b82f6', borderRadius: '6px', zIndex: 300, minWidth: '140px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', padding: '4px', direction: 'rtl' }}
                            >
                              <button
                                onClick={() => {
                                  if (isGrouped) {
                                    setTableGroupByKey(null);
                                    setTableGroupOrder([]);
                                  } else {
                                    const vals = [...new Set(myStrips.map(s => getStripFieldValue(s, colKey)))];
                                    setTableGroupByKey(colKey);
                                    setTableGroupOrder(vals);
                                  }
                                  setTableHeaderMenuKey(null);
                                }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isGrouped ? '#2d1b69' : 'transparent', color: isGrouped ? '#c4b5fd' : '#e2e8f0', border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >{isGrouped ? '✕ הסר קיבוץ' : '⊞ קבץ לפי'}</button>
                              <button
                                onClick={() => { setTableSortKey(colKey); setTableSortDir('asc'); setTableHeaderMenuKey(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isSorted && tableSortDir === 'asc' ? '#1e3a5f' : 'transparent', color: '#e2e8f0', border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >↑ מיין עולה</button>
                              <button
                                onClick={() => { setTableSortKey(colKey); setTableSortDir('desc'); setTableHeaderMenuKey(null); }}
                                style={{ display: 'block', width: '100%', textAlign: 'right', background: isSorted && tableSortDir === 'desc' ? '#1e3a5f' : 'transparent', color: '#e2e8f0', border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                              >↓ מיין יורד</button>
                              {isSorted && (
                                <button
                                  onClick={() => { setTableSortKey(null); setTableHeaderMenuKey(null); }}
                                  style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#94a3b8', border: 'none', padding: '7px 10px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}
                                >✕ הסר מיון</button>
                              )}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableDisplayItems.map((item, idx) => {
                    if (item._type === 'groupHeader') {
                      const isDragOverGroup = tableGroupDragOverKey === item.groupKey;
                      return (
                        <tr
                          key={'group_' + item.groupKey}
                          draggable
                          onDragStart={e => { e.stopPropagation(); setTableGroupDragKey(item.groupKey); }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setTableGroupDragOverKey(item.groupKey); }}
                          onDragLeave={() => setTableGroupDragOverKey(null)}
                          onDrop={e => {
                            e.stopPropagation();
                            if (tableGroupDragKey && tableGroupDragKey !== item.groupKey) {
                              setTableGroupOrder(prev => {
                                const arr = [...prev];
                                const fi = arr.indexOf(tableGroupDragKey);
                                const ti = arr.indexOf(item.groupKey);
                                if (fi !== -1 && ti !== -1) { arr.splice(fi, 1); arr.splice(ti, 0, tableGroupDragKey); }
                                return arr;
                              });
                            }
                            setTableGroupDragKey(null); setTableGroupDragOverKey(null);
                          }}
                          style={{
                            background: isDragOverGroup ? '#1d4ed8' : '#131f35',
                            borderTop: '2px solid #2d4a8a',
                            borderBottom: isDragOverGroup ? '2px solid #3b82f6' : '1px solid #2d4a8a',
                            cursor: 'grab',
                            opacity: tableGroupDragKey === item.groupKey ? 0.5 : 1
                          }}
                        >
                          <td colSpan={columns.length + 1} style={{ padding: '5px 12px', direction: 'rtl' }}>
                            <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '14px', marginLeft: '10px' }}>⠿</span>
                            <span style={{ background: '#3b0764', color: '#c4b5fd', fontWeight: 'bold', fontSize: '12px', padding: '2px 10px', borderRadius: '4px', marginLeft: '8px' }}>{item.groupKey}</span>
                            <span style={{ color: lightMode ? '#475569' : '#94a3b8', fontSize: '11px' }}>({item.count})</span>
                          </td>
                        </tr>
                      );
                    }
                    const s = item;
                    const isEven = idx % 2 === 0;
                    const isDragOver = tableDragOverRow === s.id;
                    const isPendingTransfer = s.status === 'pending_transfer';
                    const rowBg = isDragOver ? '#1d4ed8'
                      : isPendingTransfer ? (isEven ? '#2d3344' : '#252b3a')
                      : (isEven ? '#1e293b' : '#0f172a');
                    return (
                      <tr
                        key={s.id}
                        draggable={!isPendingTransfer}
                        onDragStart={e => { if (!isPendingTransfer) { e.dataTransfer.setData('text/strip-id-for-transfer', s.id); setTableDragRow(s.id); } }}
                        onDragOver={e => {
                          e.preventDefault();
                          if (tableSidebarDragId.current) { e.dataTransfer.dropEffect = 'move'; setTableDragOver(true); return; }
                          if (!isPendingTransfer) setTableDragOverRow(s.id);
                        }}
                        onDragLeave={() => setTableDragOverRow(null)}
                        onDragEnd={() => { setTableDragRow(null); setTableDragOverRow(null); }}
                        onDrop={e => {
                          setTableDragOver(false);
                          const rawId = e.dataTransfer.getData('text/strip-id') || String(tableSidebarDragId.current ?? '');
                          const droppedFromSidebar = rawId ? Number(rawId) : null;
                          if (droppedFromSidebar) {
                            setTableOnBoard(prev => new Set([...prev, String(droppedFromSidebar)]));
                            tableSidebarDragId.current = null;
                            setTableDragRow(null); setTableDragOverRow(null);
                            return;
                          }
                          if (tableDragRow && tableDragRow !== s.id && !tableSortBySector && !tableGroupByKey && !tableSortKey) {
                            setTableRowOrder(prev => {
                              const arr = [...prev];
                              const fi = arr.indexOf(tableDragRow);
                              const ti = arr.indexOf(s.id);
                              if (fi !== -1 && ti !== -1) { arr.splice(fi, 1); arr.splice(ti, 0, tableDragRow); }
                              return arr;
                            });
                          }
                          setTableDragRow(null); setTableDragOverRow(null);
                        }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTableRowCtxMenu({ stripId: s.id, x: e.clientX, y: e.clientY }); }}
                        style={{
                          background: rowBg,
                          borderBottom: isDragOver ? '2px solid #3b82f6' : '1px solid #334155',
                          opacity: isPendingTransfer ? 0.6 : (tableDragRow === s.id ? 0.5 : 1),
                          transition: 'background 0.1s'
                        }}
                      >
                        <td
                          className={hasFrozen ? 'frozen-col' : undefined}
                          style={{ padding: '10px 6px', color: '#475569', textAlign: 'center', cursor: (tableSortBySector || tableGroupByKey || tableSortKey || isPendingTransfer) ? 'default' : 'grab', fontSize: '16px', verticalAlign: 'middle', touchAction: 'none', ...(hasFrozen ? { position: 'sticky', right: tableStickyOffsets[0] ?? 0, background: rowBg, zIndex: 3 } : {}) }}
                          onPointerDown={isPendingTransfer ? undefined : e => {
                            e.preventDefault();
                            e.stopPropagation();
                            const label = s.callSign || String(s.id);
                            tablePointerDragRef.current = { id: s.id, label };
                            setTableDragRow(s.id);
                            setTablePointerGhost({ x: e.clientX, y: e.clientY, label });
                          }}
                        >
                          {isPendingTransfer
                            ? <span title="ממתין לקבלה על ידי הנמען" style={{ fontSize: '11px', background: '#374151', color: '#9ca3af', borderRadius: '4px', padding: '2px 6px', whiteSpace: 'nowrap' }}>ממתין ⏳</span>
                            : '⠿'}
                        </td>
                        {columns.map((col, colIdx) => {
                          const cell = renderCell(s, col);
                          const isFrozen = colIdx < frozenCount;
                          if (isFrozen) {
                            const fr = tableStickyOffsets[colIdx + 1];
                            const isLastFrozenTd = colIdx === frozenCount - 1;
                            return React.cloneElement(cell, {
                              className: isLastFrozenTd ? 'frozen-col-last' : 'frozen-col',
                              style: { ...cell.props.style, position: 'sticky', right: fr, background: rowBg, zIndex: 3, ...(isLastFrozenTd ? { borderLeft: '2px solid #7c3aed' } : {}) }
                            });
                          }
                          return cell;
                        })}
                      </tr>
                    );
                  })}
                  {myTableStrips.length === 0 && (
                    <tr><td colSpan={columns.length + 1} style={{ padding: '60px 40px', textAlign: 'center', color: '#475569' }}>
                      <div style={{ fontSize: '32px', marginBottom: '12px' }}>⟵</div>
                      <div style={{ fontSize: '15px', color: '#64748b' }}>גרור פממים מהצד הימני לכאן</div>
                    </td></tr>
                  )}
                </tbody>
              </table>
              {tableHandwritingId && (() => {
                const hasColKey = tableHandwritingId.includes('__');
                const [hwStripId, hwColKey] = hasColKey ? tableHandwritingId.split('__') : [tableHandwritingId, null];
                const isCustomField = hwColKey != null && hwColKey.startsWith('custom_');
                const hwStrip = strips.find(s => s.id === hwStripId);
                const hwExisting = isCustomField
                  ? ((hwStrip?.custom_fields && typeof hwStrip.custom_fields === 'object') ? hwStrip.custom_fields[hwColKey!] : '') || ''
                  : (hwStripId in tableEditingNotes ? tableEditingNotes[hwStripId] : (hwStrip?.notes || ''));
                const hwColEditable = (() => {
                  if (!hwColKey) return 'both';
                  const _activeMode = availableTableModes.find((tm: any) => tm.id === selectedTableModeId);
                  const _columns: any[] = _activeMode?.columns?.length > 0 ? _activeMode.columns : [];
                  return _columns.find((c: any) => (c.key || c.field || c.id) === hwColKey)?.editable || 'both';
                })();
                return (
                  <TableHandwritingCanvas
                    existing={hwExisting}
                    showText={hwColEditable !== 'handwriting'}
                    onConfirm={async (dataUrl) => {
                      if (isCustomField && hwColKey) {
                        const newCF = { ...(hwStrip?.custom_fields || {}), [hwColKey]: dataUrl };
                        await fetch(`${API_URL}/strips/${hwStripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ custom_fields: newCF }) });
                        setStrips(prev => prev.map(st => st.id === hwStripId ? { ...st, custom_fields: newCF } : st));
                      } else {
                        setTableEditingNotes(prev => ({ ...prev, [hwStripId]: dataUrl }));
                        await fetch(`${API_URL}/strips/${hwStripId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: dataUrl }) });
                        setStrips(prev => prev.map(st => st.id === hwStripId ? { ...st, notes: dataUrl } : st));
                      }
                      setTableHandwritingId(null);
                    }}
                    onCancel={() => setTableHandwritingId(null)}
                  />
                );
              })()}
              </>
            );
          })()}
          {/* Table row right-click context menu */}
          {tableRowCtxMenu && (
            <div
              style={{ position: 'fixed', top: tableRowCtxMenu.y, left: tableRowCtxMenu.x, background: '#1e293b', border: '1px solid #3b82f6', borderRadius: '6px', zIndex: 9999, minWidth: '150px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', padding: '4px', direction: 'rtl' }}
              onClick={e => e.stopPropagation()}
            >
              {(() => {
                const _activeMode = availableTableModes.find((tm: any) => tm.id === selectedTableModeId);
                const _columns: any[] = _activeMode?.columns?.length > 0 ? _activeMode.columns : [{ key: 'notes', editable: 'handwriting' }];
                const notesColEditable = _columns.find((c: any) => (c.key || c.field) === 'notes')?.editable ?? 'handwriting';
                const notesHwAllowed = notesColEditable === 'handwriting' || notesColEditable === 'both';
                return notesHwAllowed ? (
                  <button
                    onClick={() => { setTableHandwritingId(tableRowCtxMenu.stripId); setTableRowCtxMenu(null); }}
                    style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#93c5fd', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
                  >📝 הערות</button>
                ) : null;
              })()}
              <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
              <button
                onClick={() => {
                  setTableOnBoard(prev => { const next = new Set(prev); next.delete(tableRowCtxMenu.stripId); return next; });
                  setTableRowCtxMenu(null);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#94a3b8', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px' }}
              >✕ הסר מהלוח</button>
              <div style={{ height: '1px', background: '#334155', margin: '2px 8px' }} />
              <button
                onClick={() => {
                  if (confirm('למחוק פמם זה?')) deleteStrip(tableRowCtxMenu.stripId);
                  setTableRowCtxMenu(null);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'right', background: 'transparent', color: '#f87171', border: 'none', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}
              >🗑 מחק</button>
            </div>
          )}

          {!tableMode && <>
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
                onUpdateNotes={handleUpdateStripNotes}
                onUpdateDetails={handleUpdateStripDetails}
                zoom={mapZoom}
              />
            ))}
            
            {/* Markers Layer */}
            {neighborMarkers.map((marker, idx) => (
              <DraggableMapMarker
                key={`marker-${marker.sectorId}-${marker.subLabel || idx}`}
                marker={marker}
                strips={strips}
                outgoingTransfers={outgoingTransfers}
                incomingTransfers={incomingTransfers}
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
                onAcceptTransfer={handleAcceptTransfer}
                onRejectTransfer={handleRejectTransfer}
                onAcceptToMap={handleAcceptToMap}
                notes={allSectors.find(s => s.id === marker.sectorId)?.notes}
                onUpdateNotes={handleUpdateSectorNotes}
                zoom={mapZoom}
              />
            ))}
            
          </div>

          {/* Drawing Canvas Overlay - outside transform so coordinates are 1:1 with pointer position */}
          <canvas
            ref={canvasRef}
            onPointerDown={e => {
              e.preventDefault(); e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                startDrawing(e);
              } else if (drawingModeRef.current) {
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelectedShapeId(null);
                const rect = e.currentTarget.getBoundingClientRect();
                shapeStartRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                setShapePreview({ x1: shapeStartRef.current.x, y1: shapeStartRef.current.y, x2: shapeStartRef.current.x, y2: shapeStartRef.current.y });
              }
            }}
            onPointerMove={e => {
              e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                draw(e);
              } else if (shapeStartRef.current) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                setShapePreview(prev => prev ? { ...prev, x2: x, y2: y } : null);
              }
            }}
            onPointerUp={e => {
              e.stopPropagation();
              if (drawTool === 'pen' || drawTool === 'eraser') {
                stopDrawing();
              } else if (shapeStartRef.current && shapePreview) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x2 = e.clientX - rect.left; const y2 = e.clientY - rect.top;
                const x = Math.min(shapeStartRef.current.x, x2);
                const y = Math.min(shapeStartRef.current.y, y2);
                const w = Math.abs(x2 - shapeStartRef.current.x);
                const h = Math.abs(y2 - shapeStartRef.current.y);
                if (w > 5 || h > 5) {
                  setMapShapes(prev => [...prev, { id: Date.now().toString(), type: drawTool as 'circle'|'rect', x, y, w: Math.max(w, 10), h: Math.max(h, 10), color: penColor, filled: shapeFilled, strokeWidth: penSize }]);
                }
                shapeStartRef.current = null; setShapePreview(null);
              }
            }}
            onPointerLeave={e => { e.stopPropagation(); stopDrawing(); }}
            onPointerCancel={e => { e.stopPropagation(); stopDrawing(); shapeStartRef.current = null; setShapePreview(null); }}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: drawingMode ? 'auto' : 'none',
              cursor: drawingMode ? (eraserMode ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\'%3E%3Cpath d=\'M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l7 7c.8.8.8 2 0 2.8L14 22\'/%3E%3Cpath d=\'M6.5 13.5 15 5\'/%3E%3C/svg%3E") 12 12, auto' : 'crosshair') : 'default',
              touchAction: 'none', zIndex: 200
            }}
          />
          {/* SVG Shape Overlay — always visible, interactive only in drawing mode */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 201, overflow: 'visible', pointerEvents: 'none', touchAction: 'none' }}>
            {mapShapes.map(shape => {
              const isSelected = selectedShapeId === shape.id && drawingMode;
              const cx = shape.x + shape.w / 2; const cy = shape.y + shape.h / 2;
              const shapeProps = {
                fill: shape.filled ? shape.color : 'none',
                stroke: shape.color, strokeWidth: shape.strokeWidth,
                style: { cursor: drawingMode ? 'move' : 'default', pointerEvents: (drawingMode ? 'auto' : 'none') as React.CSSProperties['pointerEvents'] },
                onPointerDown: drawingMode ? (e: React.PointerEvent) => {
                  e.preventDefault(); e.stopPropagation();
                  setSelectedShapeId(shape.id);
                  shapeMoveRef.current = { id: shape.id, ox: e.clientX, oy: e.clientY, sx: shape.x, sy: shape.y };
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                } : undefined,
                onPointerMove: drawingMode ? (e: React.PointerEvent) => {
                  if (!shapeMoveRef.current || shapeMoveRef.current.id !== shape.id) return;
                  const dx = e.clientX - shapeMoveRef.current.ox; const dy = e.clientY - shapeMoveRef.current.oy;
                  setMapShapes(prev => prev.map(s => s.id === shape.id ? { ...s, x: shapeMoveRef.current!.sx + dx, y: shapeMoveRef.current!.sy + dy } : s));
                } : undefined,
                onPointerUp: drawingMode ? () => { shapeMoveRef.current = null; } : undefined,
                onContextMenu: drawingMode ? (e: React.MouseEvent) => { e.preventDefault(); setMapShapes(prev => prev.filter(s => s.id !== shape.id)); setSelectedShapeId(null); } : undefined,
              };
              return (
                <g key={shape.id}>
                  {shape.type === 'rect'
                    ? <rect x={shape.x} y={shape.y} width={Math.max(shape.w,1)} height={Math.max(shape.h,1)} {...shapeProps} />
                    : <ellipse cx={cx} cy={cy} rx={Math.max(shape.w/2,1)} ry={Math.max(shape.h/2,1)} {...shapeProps} />
                  }
                  {isSelected && <>
                    {/* Resize handle — bottom-right corner */}
                    <circle cx={shape.x+shape.w} cy={shape.y+shape.h} r={9} fill="white" stroke="#3b82f6" strokeWidth={2}
                      style={{ cursor: 'se-resize', pointerEvents: 'auto' }}
                      onPointerDown={e => {
                        e.preventDefault(); e.stopPropagation();
                        shapeResizeRef.current = { id: shape.id, ox: e.clientX, oy: e.clientY, origW: shape.w, origH: shape.h };
                        (e.currentTarget as Element).setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={e => {
                        if (!shapeResizeRef.current || shapeResizeRef.current.id !== shape.id) return;
                        const dw = e.clientX - shapeResizeRef.current.ox; const dh = e.clientY - shapeResizeRef.current.oy;
                        setMapShapes(prev => prev.map(s => s.id === shape.id ? { ...s, w: Math.max(10, shapeResizeRef.current!.origW+dw), h: Math.max(10, shapeResizeRef.current!.origH+dh) } : s));
                      }}
                      onPointerUp={() => { shapeResizeRef.current = null; }}
                    />
                    <text x={shape.x+shape.w} y={shape.y+shape.h} textAnchor="middle" dominantBaseline="middle" fill="#3b82f6" fontSize={11} style={{ pointerEvents: 'none', userSelect: 'none' }}>↔</text>
                    {/* Delete badge — top-right corner */}
                    <g style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setMapShapes(prev => prev.filter(s => s.id !== shape.id)); setSelectedShapeId(null); }}>
                      <circle cx={shape.x+shape.w} cy={shape.y} r={10} fill="#dc2626" />
                      <text x={shape.x+shape.w} y={shape.y} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={13} fontWeight="bold" style={{ pointerEvents: 'none', userSelect: 'none' }}>✕</text>
                    </g>
                  </>}
                </g>
              );
            })}
            {/* Shape preview while drawing */}
            {shapePreview && (() => {
              const x = Math.min(shapePreview.x1, shapePreview.x2); const y = Math.min(shapePreview.y1, shapePreview.y2);
              const w = Math.max(Math.abs(shapePreview.x2-shapePreview.x1), 1); const h = Math.max(Math.abs(shapePreview.y2-shapePreview.y1), 1);
              return drawTool === 'rect'
                ? <rect x={x} y={y} width={w} height={h} fill={shapeFilled ? penColor+'40' : 'none'} stroke={penColor} strokeWidth={penSize} strokeDasharray="6,3" style={{ pointerEvents: 'none' }} />
                : <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={shapeFilled ? penColor+'40' : 'none'} stroke={penColor} strokeWidth={penSize} strokeDasharray="6,3" style={{ pointerEvents: 'none' }} />;
            })()}
          </svg>
          
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
                {/* Tool selector */}
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                  {([
                    { id: 'pen', label: '✏️', title: 'עט' },
                    { id: 'eraser', label: '🧹', title: 'מחק' },
                    { id: 'rect', label: '⬜', title: 'מלבן' },
                    { id: 'circle', label: '⭕', title: 'עיגול' },
                  ] as const).map(t => (
                    <button key={t.id} onClick={() => setDrawTool(t.id)} title={t.title} style={{
                      padding: '5px 7px', fontSize: '15px', lineHeight: 1,
                      background: drawTool === t.id ? '#3b82f6' : '#334155',
                      color: 'white', border: drawTool === t.id ? '2px solid #fff' : '1px solid #64748b',
                      borderRadius: '5px', cursor: 'pointer',
                    }}>{t.label}</button>
                  ))}
                </div>

                {/* Fill toggle — visible only for shape tools */}
                {(drawTool === 'rect' || drawTool === 'circle') && (
                  <button onClick={() => setShapeFilled(f => !f)} style={{
                    padding: '5px 8px', fontSize: '11px', fontWeight: 'bold',
                    background: shapeFilled ? '#10b981' : '#475569',
                    color: 'white', border: shapeFilled ? '2px solid #fff' : '1px solid #64748b',
                    borderRadius: '5px', cursor: 'pointer'
                  }}>{shapeFilled ? 'מלא ✓' : 'קו בלבד'}</button>
                )}

                {/* Color palette */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#000000', '#ffffff'].map(color => (
                    <button key={color} onClick={() => { setPenColor(color); if (drawTool === 'eraser') setDrawTool('pen'); }}
                      style={{
                        width: 24, height: 24, background: color,
                        border: penColor === color ? '3px solid #fff' : '1px solid #64748b',
                        borderRadius: '4px', cursor: 'pointer',
                        boxShadow: penColor === color ? '0 0 0 2px #3b82f6' : 'none'
                      }} />
                  ))}
                </div>

                {/* Stroke width */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'white', fontSize: '10px' }}>עובי:</span>
                  <input type="range" min="1" max="10" value={penSize}
                    onChange={e => setPenSize(Number(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }} />
                  <span style={{ color: 'white', fontSize: '10px', minWidth: '16px' }}>{penSize}</span>
                </div>
                
                <button onClick={() => { clearCanvas(); setMapShapes([]); setSelectedShapeId(null); }} style={{
                  padding: '6px', background: '#dc2626', color: 'white', border: 'none',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '11px'
                }}>נקה הכל</button>
              </>
            )}
          </div>
          </>}
        </div>

        {/* Sidebar - Right Side - Shows active strips */}
        <div id="sidebar-area" style={{ width: sidebarPinned ? 240 : 36, background: tablePointerGhost?.overSidebar ? '#450a0a' : '#f8fafc', padding: sidebarPinned ? '10px' : '6px 4px', borderLeft: tablePointerGhost?.overSidebar ? '2px solid #f87171' : '2px solid #e2e8f0', overflowY: sidebarPinned ? 'auto' : 'hidden', direction: 'rtl', transition: 'width 0.2s, background 0.1s, border-color 0.1s', flexShrink: 0, position: 'relative' }}>
          {/* Pin toggle button + filter button */}
          <div style={{ position: sidebarPinned ? 'absolute' : 'relative', top: sidebarPinned ? 6 : 0, left: sidebarPinned ? 4 : 0, zIndex: 10, display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={() => setSidebarPinned(v => !v)}
              title={sidebarPinned ? 'סגור חלונית' : 'פתח חלונית'}
              style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', padding: '2px 5px', color: '#475569' }}
            >📌</button>
            {sidebarPinned && (
              <button
                onClick={() => { setPersonalFilterDraft(personalFilter); setShowPersonalFilter(v => !v); }}
                title="סינון אישי"
                style={{
                  background: personalFilter ? '#1d4ed8' : adminFilterQuery ? '#1e293b' : 'transparent',
                  border: personalFilter ? '1px solid #60a5fa' : adminFilterQuery ? '1px solid #4ade80' : '1px solid #cbd5e1',
                  borderRadius: '4px', cursor: 'pointer', fontSize: '13px', padding: '2px 6px', color: personalFilter ? '#93c5fd' : adminFilterQuery ? '#4ade80' : '#475569',
                  fontWeight: personalFilter ? 'bold' : 'normal'
                }}
              >{personalFilter ? '🔍✓' : '🔍'}</button>
            )}
          </div>
          {!sidebarPinned && (() => {
            const closedCount = tableMode
              ? myStrips.filter(s => !tableOnBoard.has(s.id) && s.status !== 'pending_transfer').length
              : myStrips.filter(s => s.status !== 'pending_transfer' && !s.onMap).length;
            return closedCount > 0 ? (
              <div
                onClick={() => setSidebarPinned(true)}
                title={`קיימים ${closedCount} פ"מם במאגר — לחץ לפתיחה`}
                style={{
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                  fontSize: '11px',
                  color: '#7c3aed',
                  fontWeight: 'bold',
                  marginTop: '12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  lineHeight: 1.3,
                  background: '#f3e8ff',
                  borderRadius: '6px',
                  padding: '8px 4px',
                  border: '1px solid #c4b5fd',
                }}
              >
                קיימים {closedCount} פ"מם
              </div>
            ) : null;
          })()}
          {sidebarPinned && (tableMode ? (
            <>
              <h4 style={{ margin: '0 0 6px 30px', fontSize: '13px', color: '#1e293b' }}>פ"מ עמדה ({myStrips.filter(s => !tableOnBoard.has(s.id)).length}):</h4>
              <div style={{ fontSize: '10px', color: lightMode ? '#64748b' : '#94a3b8', marginBottom: '8px' }}>גרור פמם לטבלה להוספה</div>
              {[...myStrips.filter(s => !tableOnBoard.has(s.id) && s.status !== 'pending_transfer')].sort((a,b) => {
                if (a.airborne && !b.airborne) return -1;
                if (!a.airborne && b.airborne) return 1;
                const ta = a.takeoff_time ? new Date(a.takeoff_time).getTime() : Infinity;
                const tb = b.takeoff_time ? new Date(b.takeoff_time).getTime() : Infinity;
                return ta - tb;
              }).map(s => {
                const now = new Date();
                const tkDt = s.takeoff_time ? new Date(s.takeoff_time) : null;
                const tkPast = tkDt && !isNaN(tkDt.getTime()) && tkDt < now;
                let tkLabel = '';
                if (tkDt && !isNaN(tkDt.getTime())) {
                  const hh = tkDt.getHours().toString().padStart(2,'0');
                  const mm = tkDt.getMinutes().toString().padStart(2,'0');
                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const tkDay = new Date(tkDt.getFullYear(), tkDt.getMonth(), tkDt.getDate());
                  tkLabel = tkDay.getTime() !== today.getTime() ? `${tkDt.getDate().toString().padStart(2,'0')}/${(tkDt.getMonth()+1).toString().padStart(2,'0')} ${hh}:${mm}` : `${hh}:${mm}`;
                }
                return (
                <div
                  key={s.id}
                  onPointerDown={e => {
                    e.preventDefault();
                    sidebarPointerDragRef.current = { id: s.id, label: s.callSign };
                    setSidebarPointerGhost({ x: e.clientX, y: e.clientY, label: s.callSign });
                  }}
                  style={{ marginBottom: '6px', cursor: 'grab', userSelect: 'none', background: tableDragOver && sidebarPointerDragRef.current?.id === s.id ? '#1d4ed8' : '#1e293b', border: `1px solid ${tkPast ? '#ef4444' : '#334155'}`, borderRadius: '4px', padding: '6px 8px', direction: 'rtl', touchAction: 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#f1f5f9' }}>{s.callSign}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {tkLabel && <span style={{ fontSize: '10px', color: tkPast ? 'white' : '#94a3b8', background: tkPast ? '#ef4444' : 'transparent', padding: tkPast ? '1px 4px' : '0', borderRadius: '3px', fontWeight: tkPast ? 'bold' : 'normal' }}>🕐 {tkLabel}</span>}
                      {(s.sq || s.squadron) && <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 'bold' }}>SQ {s.sq || s.squadron}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                    {s.task && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s.task}</span>}
                    {s.alt && <span style={{ fontSize: '10px', color: lightMode ? '#64748b' : '#94a3b8' }}>גובה: {s.alt}</span>}
                  </div>
                </div>
              );})}
              {myStrips.filter(s => !tableOnBoard.has(s.id) && s.status !== 'pending_transfer').length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>כל הפממים בטבלה</div>
              )}
            </>
          ) : (
            <>
              <h4 style={{ margin: '0 0 6px 30px', fontSize: '13px', color: '#1e293b' }}>פ"מ עמדה ({myStrips.filter(s => s.status !== 'pending_transfer' && !s.onMap).length}):</h4>
              <div style={{ fontSize: '10px', color: lightMode ? '#64748b' : '#94a3b8', marginBottom: '8px' }}>גרור פמם למפה להוספה</div>
              {[...myStrips.filter(s => s.status !== 'pending_transfer' && !s.onMap)].sort((a,b) => {
                if (a.airborne && !b.airborne) return -1;
                if (!a.airborne && b.airborne) return 1;
                const ta = a.takeoff_time ? new Date(a.takeoff_time).getTime() : Infinity;
                const tb = b.takeoff_time ? new Date(b.takeoff_time).getTime() : Infinity;
                return ta - tb;
              }).map(s => {
                const now = new Date();
                const tkDt = s.takeoff_time ? new Date(s.takeoff_time) : null;
                const tkPast = tkDt && !isNaN(tkDt.getTime()) && tkDt < now;
                let tkLabel = '';
                if (tkDt && !isNaN(tkDt.getTime())) {
                  const hh = tkDt.getHours().toString().padStart(2,'0');
                  const mm = tkDt.getMinutes().toString().padStart(2,'0');
                  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const tkDay = new Date(tkDt.getFullYear(), tkDt.getMonth(), tkDt.getDate());
                  tkLabel = tkDay.getTime() !== today.getTime() ? `${tkDt.getDate().toString().padStart(2,'0')}/${(tkDt.getMonth()+1).toString().padStart(2,'0')} ${hh}:${mm}` : `${hh}:${mm}`;
                }
                return (
                <div
                  key={s.id}
                  onPointerDown={e => {
                    e.preventDefault();
                    const mapArea = document.getElementById('map-area');
                    const startX = mapArea ? mapArea.getBoundingClientRect().right - 60 : e.clientX;
                    sidebarPointerDragRef.current = { id: s.id, label: s.callSign };
                    setSidebarPointerGhost({ x: startX, y: e.clientY, label: s.callSign });
                  }}
                  style={{ marginBottom: '6px', cursor: 'grab', userSelect: 'none', background: '#1e293b', border: `1px solid ${tkPast ? '#ef4444' : '#334155'}`, borderRadius: '4px', padding: '6px 8px', direction: 'rtl', touchAction: 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#f1f5f9' }}>{s.callSign}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {tkLabel && <span style={{ fontSize: '10px', color: tkPast ? 'white' : '#94a3b8', background: tkPast ? '#ef4444' : 'transparent', padding: tkPast ? '1px 4px' : '0', borderRadius: '3px', fontWeight: tkPast ? 'bold' : 'normal' }}>🕐 {tkLabel}</span>}
                      {(s.sq || s.squadron) && <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 'bold' }}>SQ {s.sq || s.squadron}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {s.alt && <span style={{ fontSize: '10px', color: '#94a3b8' }}>גובה: {s.alt}</span>}
                    {s.task && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{s.task}</span>}
                    {s.sq && <span style={{ fontSize: '10px', background: '#3b82f6', color: 'white', padding: '1px 4px', borderRadius: '3px' }}>{s.sq}</span>}
                    {s.airborne && <span style={{ fontSize: '9px', background: '#1d4ed8', color: 'white', padding: '1px 4px', borderRadius: '3px' }}>באוויר</span>}
                  </div>
                </div>
              );})}
              {myStrips.filter(s => s.status !== 'pending_transfer' && !s.onMap).length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>כל הפממים על המפה</div>
              )}
            </>
          ))}
        </div>

        {/* Sidebar pointer-drag ghost */}
        {sidebarPointerGhost && (
          <div style={{ position: 'fixed', left: sidebarPointerGhost.x + 12, top: sidebarPointerGhost.y - 14, background: tableDragOver ? '#1d4ed8' : '#334155', color: 'white', padding: '4px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', border: '2px solid #3b82f6' }}>
            {sidebarPointerGhost.label}
          </div>
        )}
        {tablePointerGhost && (
          <div style={{ position: 'fixed', left: tablePointerGhost.x + 12, top: tablePointerGhost.y - 14, background: tablePointerGhost.overSidebar ? '#b91c1c' : '#7c3aed', color: 'white', padding: '4px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', border: `2px solid ${tablePointerGhost.overSidebar ? '#f87171' : '#a78bfa'}` }}>
            {tablePointerGhost.overSidebar ? `↩ ${tablePointerGhost.label}` : tablePointerGhost.label}
          </div>
        )}

        {/* Floating Notepad */}
        {showNotepad && (
          <div
            style={{
              position: 'absolute',
              left: notepadPos.x,
              top: notepadPos.y,
              width: notepadSize.w,
              height: notepadSize.h,
              background: 'white',
              border: '2px solid #94a3b8',
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 6000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              direction: 'rtl',
              minWidth: 200,
              minHeight: 160
            }}
          >
            {/* Title bar - drag handle */}
            <div
              style={{ background: '#1e293b', color: 'white', padding: '6px 10px', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', flexShrink: 0 }}
              onMouseDown={(e) => {
                e.preventDefault();
                notepadDragRef.current = { startX: e.clientX, startY: e.clientY, origX: notepadPos.x, origY: notepadPos.y };
                const onMove = (me: MouseEvent) => {
                  if (!notepadDragRef.current) return;
                  setNotepadPos({
                    x: notepadDragRef.current.origX + me.clientX - notepadDragRef.current.startX,
                    y: notepadDragRef.current.origY + me.clientY - notepadDragRef.current.startY
                  });
                };
                const onUp = () => {
                  notepadDragRef.current = null;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>📄 פתקית</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['keyboard', 'handwriting', 'both'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => {
                      const canvas = notepadCanvasRef.current;
                      if (canvas) notepadSavedImageRef.current = canvas.toDataURL();
                      setNotepadMode(m);
                    }}
                    style={{ padding: '2px 7px', fontSize: '10px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: notepadMode === m ? '#3b82f6' : '#334155', color: 'white' }}
                  >
                    {m === 'keyboard' ? '⌨' : m === 'handwriting' ? '✍' : '⌨+✍'}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const canvas = notepadCanvasRef.current;
                    if (canvas) notepadSavedImageRef.current = canvas.toDataURL();
                    setShowNotepad(false);
                  }}
                  style={{ padding: '2px 7px', fontSize: '12px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: '#ef4444', color: 'white', marginRight: '4px' }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {notepadMode !== 'handwriting' && (
                <div style={{ padding: '2px 8px 0', display: 'flex', justifyContent: 'flex-start' }}>
                  <button
                    onPointerDown={e => { e.preventDefault(); setShowNotepadOSK(v => !v); }}
                    style={{ padding: '3px 10px', background: showNotepadOSK ? '#2563eb' : '#475569', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                  >⌨ מקלדת וירטואלית</button>
                </div>
              )}
              <textarea
                ref={notepadTextareaRef}
                value={notepadText}
                onChange={e => setNotepadText(e.target.value)}
                placeholder="הקלד טקסט חופשי כאן..."
                style={{
                  flex: notepadMode === 'both' ? '0 0 45%' : 1,
                  width: '100%',
                  border: 'none',
                  borderBottom: notepadMode === 'both' ? '1px solid #e2e8f0' : 'none',
                  outline: 'none',
                  resize: 'none',
                  fontSize: '14px',
                  padding: '10px',
                  direction: 'rtl',
                  fontFamily: 'inherit',
                  background: 'white',
                  boxSizing: 'border-box',
                  display: notepadMode === 'handwriting' ? 'none' : undefined
                }}
              />
              {showNotepadOSK && notepadMode !== 'handwriting' && (
                <OnScreenKeyboard
                  onType={notepadInsertAtCursor}
                  onBackspace={notepadOskBackspace}
                  onEnter={() => notepadInsertAtCursor('\n')}
                  onClose={() => setShowNotepadOSK(false)}
                />
              )}
              <canvas
                ref={notepadCanvasRef}
                width={notepadSize.w - 4}
                height={notepadMode === 'both' ? Math.floor((notepadSize.h - 80) * 0.55) : notepadSize.h - 60}
                style={{
                  flex: 1,
                  width: '100%',
                  display: notepadMode === 'keyboard' ? 'none' : 'block',
                  cursor: 'crosshair',
                  touchAction: 'none'
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  notepadDrawingRef.current = true;
                  const canvas = notepadCanvasRef.current;
                  if (!canvas) return;
                  const rect = canvas.getBoundingClientRect();
                  notepadLastRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                }}
                onPointerMove={(e) => {
                  e.stopPropagation();
                  if (!notepadDrawingRef.current || !notepadLastRef.current) return;
                  const canvas = notepadCanvasRef.current;
                  if (!canvas) return;
                  const ctx = canvas.getContext('2d');
                  if (!ctx) return;
                  const rect = canvas.getBoundingClientRect();
                  const scaleX = canvas.width / rect.width;
                  const scaleY = canvas.height / rect.height;
                  const prevX = notepadLastRef.current.x * scaleX;
                  const prevY = notepadLastRef.current.y * scaleY;
                  const curX = (e.clientX - rect.left) * scaleX;
                  const curY = (e.clientY - rect.top) * scaleY;
                  ctx.strokeStyle = '#1e293b';
                  ctx.lineWidth = 2;
                  ctx.lineCap = 'round';
                  ctx.lineJoin = 'round';
                  ctx.beginPath();
                  ctx.moveTo(prevX, prevY);
                  ctx.lineTo(curX, curY);
                  ctx.stroke();
                  notepadLastRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                }}
                onPointerUp={(e) => { e.stopPropagation(); notepadDrawingRef.current = false; notepadLastRef.current = null; }}
                onPointerLeave={(e) => { e.stopPropagation(); notepadDrawingRef.current = false; notepadLastRef.current = null; }}
              />
            </div>

            {/* Bottom bar */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '4px 10px', display: 'flex', direction: 'ltr', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <button
                onClick={() => {
                  setNotepadText('');
                  notepadSavedImageRef.current = null;
                  const canvas = notepadCanvasRef.current;
                  if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
                }}
                style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
              >
                נקה
              </button>
              <div
                title="גרור לשינוי גודל"
                style={{ width: 20, height: 20, cursor: 'nwse-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', userSelect: 'none', flexShrink: 0 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const canvas = notepadCanvasRef.current;
                  if (canvas) notepadSavedImageRef.current = canvas.toDataURL();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const origW = notepadSize.w;
                  const origH = notepadSize.h;
                  const onMove = (me: MouseEvent) => {
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    setNotepadSize({
                      w: Math.max(200, origW + dx),
                      h: Math.max(160, origH + dy)
                    });
                  };
                  const onUp = () => {
                    window.removeEventListener('mousemove', onMove);
                    window.removeEventListener('mouseup', onUp);
                  };
                  window.addEventListener('mousemove', onMove);
                  window.addEventListener('mouseup', onUp);
                }}
              >
                ⇲
              </div>
            </div>
          </div>
        )}
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

// --- מסך חלוקה כללית ---
const StripDistribution = ({ onBack }: { onBack: () => void }) => {
  const [strips, setStrips] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [newStrip, setNewStrip] = useState({ callSign: '', sq: '', alt: '', task: '', squadron: '', takeoff_time: '' });
  const [expandedStripId, setExpandedStripId] = useState<string | null>(null);
  const [stripDetails, setStripDetails] = useState<Record<string, { weapons: {type:string;quantity:string}[]; targets: {name:string;aim_point:string}[]; systems: {name:string}[]; shkadia: string }>>({});
  const [savingStripId, setSavingStripId] = useState<string | null>(null);
  const [savedStripId, setSavedStripId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [stripsRes, presetsRes] = await Promise.all([
        fetch(`${API_URL}/strips/all`),
        fetch(`${API_URL}/workstation-presets`)
      ]);
      if (stripsRes.ok) setStrips(await stripsRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const assignStripToWorkstation = async (stripId: string, workstationPresetId: number | null) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}/assign-workstation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstationPresetId })
      });
      await loadData();
    } catch (err) {
      console.error('Failed to assign strip:', err);
    }
  };

  const createStrip = async () => {
    if (!newStrip.callSign.trim()) return;
    try {
      await fetch(`${API_URL}/strips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newStrip,
          sectorId: null,
          takeoff_time: newStrip.takeoff_time || null
        })
      });
      setNewStrip({ callSign: '', sq: '', alt: '', task: '', squadron: '', takeoff_time: '' });
      loadData();
    } catch (err) {
      console.error('Failed to create strip:', err);
    }
  };

  const deleteStrip = async (stripId: string) => {
    try {
      await fetch(`${API_URL}/strips/${stripId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete strip:', err);
    }
  };

  const updateStripInline = async (stripId: string, fields: Record<string, any>) => {
    setStrips(prev => prev.map(s => s.id === stripId ? { ...s, ...fields } : s));
    try {
      await fetch(`${API_URL}/strips/${stripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
    } catch (err) {
      console.error('Failed to update strip:', err);
      loadData();
    }
  };

  const [editingTakeoffId, setEditingTakeoffId] = useState<string | null>(null);

  const toggleExpandStrip = (strip: any) => {
    if (expandedStripId === strip.id) {
      setExpandedStripId(null);
    } else {
      setExpandedStripId(strip.id);
      if (!stripDetails[strip.id]) {
        setStripDetails(prev => ({
          ...prev,
          [strip.id]: {
            weapons: strip.weapons || [],
            targets: strip.targets || [],
            systems: strip.systems || [],
            shkadia: strip.shkadia || ''
          }
        }));
      }
    }
  };

  const updateDetail = (stripId: string, field: string, value: any) => {
    setStripDetails(prev => ({ ...prev, [stripId]: { ...prev[stripId], [field]: value } }));
  };

  const saveStripDetails = async (stripId: string) => {
    const details = stripDetails[stripId];
    if (!details) return;
    setSavingStripId(stripId);
    setSavedStripId(null);
    setSaveError(null);
    try {
      const res = await fetch(`${API_URL}/strips/${stripId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details)
      });
      if (!res.ok) throw new Error('Server error');
      setSavedStripId(stripId);
      setTimeout(() => setSavedStripId(null), 2500);
      await loadData();
    } catch (err) {
      console.error('Failed to save strip details:', err);
      setSaveError(stripId);
      setTimeout(() => setSaveError(null), 3000);
    } finally {
      setSavingStripId(null);
    }
  };

  const unassignedStrips = strips.filter(s => !s.workstation_preset_id || s.workstation_preset_id === null);

  const [randomizing, setRandomizing] = useState(false);

  const randomDistribute = async () => {
    if (unassignedStrips.length === 0 || presets.length === 0) return;
    setRandomizing(true);
    try {
      // Shuffle unassigned strips
      const shuffled = [...unassignedStrips].sort(() => Math.random() - 0.5);
      // Round-robin across presets
      const assignments: { stripId: string; presetId: number }[] = shuffled.map((strip, idx) => ({
        stripId: strip.id,
        presetId: presets[idx % presets.length].id
      }));
      await Promise.all(
        assignments.map(({ stripId, presetId }) =>
          fetch(`${API_URL}/strips/${stripId}/assign-workstation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workstationPresetId: presetId })
          })
        )
      );
      await loadData();
    } catch (err) {
      console.error('Failed to randomly distribute:', err);
    } finally {
      setRandomizing(false);
    }
  };

  return (
    <div style={{ height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      <header style={{ padding: '15px 30px', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ margin: 0, color: 'white', fontSize: '24px' }}>חלוקה כללית</h1>
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>סה"כ {strips.length} פממים</span>
          {unassignedStrips.length > 0 && presets.length > 0 && (
            <button
              onClick={randomDistribute}
              disabled={randomizing}
              style={{
                padding: '8px 18px',
                background: randomizing ? '#475569' : '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: randomizing ? 'default' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.2s'
              }}
            >
              🎲 {randomizing ? 'מחלק...' : `חלוקה רנדומלית (${unassignedStrips.length})`}
            </button>
          )}
        </div>
        <button
          onClick={onBack}
          style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
        >
          חזרה למסך ראשי
        </button>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Create New Strip */}
        <div style={{ width: '300px', background: '#1e293b', padding: '20px', borderLeft: '1px solid #334155', overflowY: 'auto' }}>
          <h3 style={{ color: 'white', margin: '0 0 20px', fontSize: '16px' }}>הוספת פמם חדש</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="text"
              placeholder="או״ק (Call Sign)"
              value={newStrip.callSign}
              onChange={e => setNewStrip({ ...newStrip, callSign: e.target.value })}
              style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="טייסת"
                value={newStrip.squadron}
                onChange={e => setNewStrip({ ...newStrip, squadron: e.target.value })}
                style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px', flex: 2 }}
              />
              <input
                type="text"
                placeholder="מס׳"
                value={newStrip.sq}
                onChange={e => setNewStrip({ ...newStrip, sq: e.target.value })}
                style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px', flex: 1 }}
              />
            </div>
            <input
              type="text"
              placeholder="גובה"
              value={newStrip.alt}
              onChange={e => setNewStrip({ ...newStrip, alt: e.target.value })}
              style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px' }}
            />
            <input
              type="text"
              placeholder="משימה"
              value={newStrip.task}
              onChange={e => setNewStrip({ ...newStrip, task: e.target.value })}
              style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '14px' }}
            />
            <div>
              <label style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px', display: 'block' }}>זמן המראה</label>
              <input
                type="datetime-local"
                value={newStrip.takeoff_time}
                onChange={e => setNewStrip({ ...newStrip, takeoff_time: e.target.value })}
                style={{ padding: '10px', borderRadius: '6px', border: 'none', fontSize: '13px', width: '100%', background: '#0f172a', color: 'white', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={createStrip}
              style={{ padding: '12px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
            >
              הוסף פמם
            </button>
          </div>

          <div style={{ marginTop: '30px', borderTop: '1px solid #334155', paddingTop: '20px' }}>
            <h3 style={{ color: 'white', margin: '0 0 15px', fontSize: '16px' }}>פממים לא משויכים ({unassignedStrips.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {unassignedStrips.map(strip => (
                <div
                  key={strip.id}
                  style={{ background: '#334155', padding: '10px', borderRadius: '6px', color: 'white', fontSize: '13px' }}
                >
                  <div style={{ fontWeight: 'bold' }}>{strip.call_sign}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{(strip.sq || strip.squadron) && `SQ: ${strip.sq || strip.squadron} | `}גובה: {strip.alt}</div>
                  <select
                    onChange={e => {
                      if (e.target.value) {
                        assignStripToWorkstation(strip.id, parseInt(e.target.value));
                      }
                    }}
                    defaultValue=""
                    style={{ marginTop: '6px', width: '100%', padding: '6px', borderRadius: '4px', border: 'none', fontSize: '11px', background: '#1e293b', color: 'white' }}
                  >
                    <option value="" disabled>שייך לעמדה...</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ))}
              {unassignedStrips.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center' }}>כל הפממים משויכים</div>
              )}
            </div>
          </div>
        </div>

        {/* Main Area - Strips by Workstation */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
            {presets.map(preset => {
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

              const formatTakeoffTime = (t: string | null): string => {
                if (!t) return '';
                const d = new Date(t);
                if (isNaN(d.getTime())) return t;
                const stripDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const hh = d.getHours().toString().padStart(2, '0');
                const mm = d.getMinutes().toString().padStart(2, '0');
                const timeStr = `${hh}:${mm}`;
                if (stripDate.getTime() !== today.getTime()) {
                  const dd = d.getDate().toString().padStart(2, '0');
                  const mo = (d.getMonth() + 1).toString().padStart(2, '0');
                  return `${dd}/${mo} ${timeStr}`;
                }
                return timeStr;
              };

              const isTakeoffPast = (t: string | null): boolean => {
                if (!t) return false;
                const d = new Date(t);
                return !isNaN(d.getTime()) && d < now;
              };

              const workstationStrips = strips
                .filter(s => Number(s.workstation_preset_id) === Number(preset.id))
                .sort((a, b) => {
                  if (a.airborne && !b.airborne) return -1;
                  if (!a.airborne && b.airborne) return 1;
                  const ta = a.takeoff_time ? new Date(a.takeoff_time).getTime() : Infinity;
                  const tb = b.takeoff_time ? new Date(b.takeoff_time).getTime() : Infinity;
                  return ta - tb;
                });
              
              return (
                <div key={preset.id} style={{ background: '#1e293b', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ background: '#334155', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>{preset.name}</h3>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>{workstationStrips.length} פממים</span>
                  </div>
                  
                  <div style={{ padding: '15px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {workstationStrips.map(strip => {
                        const isExpanded = expandedStripId === strip.id;
                        const det = stripDetails[strip.id];
                        const hasDetails = (strip.weapons?.length > 0) || (strip.targets?.length > 0) || (strip.systems?.length > 0) || strip.shkadia;
                        const past = isTakeoffPast(strip.takeoff_time);
                        const takeoffDisplay = formatTakeoffTime(strip.takeoff_time);
                        return (
                        <div key={strip.id} style={{ background: '#0f172a', borderRadius: '6px', overflow: 'hidden', border: isExpanded ? '1px solid #3b82f6' : '1px solid transparent' }}>
                          <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {strip.call_sign}
                                {(strip.sq || strip.squadron) && <span style={{ color: '#94a3b8', fontWeight: 'normal', fontSize: '12px' }}>SQ {strip.sq || strip.squadron}</span>}
                                {hasDetails && <span style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} title="יש נתוני חימוש/מטרות" />}
                                {past && (
                                  <span
                                    style={{ width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }}
                                    title="זמן ההמראה חלף"
                                  />
                                )}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                                {strip.task && <span style={{ color: '#60a5fa', fontSize: '11px', background: '#1e3a5f', padding: '1px 5px', borderRadius: '3px' }}>{strip.task}</span>}
                                {strip.alt && <span style={{ color: '#94a3b8', fontSize: '11px' }}>↑{strip.alt}</span>}
                                {/* Airborne toggle */}
                                <button
                                  onClick={() => updateStripInline(strip.id, { airborne: !strip.airborne })}
                                  title={strip.airborne ? 'לחץ להחזיר לקרקע' : 'לחץ לסמן כ"באוויר"'}
                                  style={{
                                    background: strip.airborne ? '#064e3b' : '#422006',
                                    border: `1px solid ${strip.airborne ? '#34d399' : '#f59e0b'}`,
                                    color: strip.airborne ? '#34d399' : '#f59e0b',
                                    borderRadius: '4px', padding: '2px 8px', fontSize: '11px',
                                    cursor: 'pointer', fontWeight: 'bold'
                                  }}
                                >{strip.airborne ? '✈ באוויר' : '⬛ קרקע'}</button>
                                {/* Takeoff time */}
                                {editingTakeoffId === strip.id ? (
                                  <input
                                    type="datetime-local"
                                    autoFocus
                                    defaultValue={strip.takeoff_time ? new Date(strip.takeoff_time).toISOString().slice(0,16) : ''}
                                    onBlur={e => { updateStripInline(strip.id, { takeoff_time: e.target.value || null }); setEditingTakeoffId(null); }}
                                    onChange={e => e.stopPropagation()}
                                    style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0f172a', color: 'white', fontSize: '11px' }}
                                  />
                                ) : (
                                  <span
                                    onClick={() => setEditingTakeoffId(strip.id)}
                                    title="לחץ לעריכת זמן המראה"
                                    style={{ color: past ? '#ef4444' : takeoffDisplay ? '#e2e8f0' : '#475569', fontSize: '11px', cursor: 'pointer', borderBottom: '1px dashed #475569', paddingBottom: '1px' }}
                                  >
                                    🕐 {takeoffDisplay || 'הגדר המראה'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <button
                                onClick={() => toggleExpandStrip(strip)}
                                style={{ padding: '4px 8px', background: isExpanded ? '#3b82f6' : '#334155', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                              >
                                {isExpanded ? '▲ סגור' : '▼ פרטים'}
                              </button>
                              <button
                                onClick={() => assignStripToWorkstation(strip.id, null)}
                                style={{ padding: '4px 8px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                              >
                                הסר
                              </button>
                              <button
                                onClick={() => deleteStrip(strip.id)}
                                style={{ padding: '4px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}
                              >
                                מחק
                              </button>
                            </div>
                          </div>

                          {/* Expandable Detail Panel */}
                          {isExpanded && det && (
                            <div style={{ background: '#1e293b', padding: '12px', borderTop: '1px solid #334155', direction: 'rtl' }}>
                              
                              {/* חימושים */}
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>חימושים</span>
                                  <button onClick={() => updateDetail(strip.id, 'weapons', [...det.weapons, { type: '', quantity: '' }])}
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>+ הוסף</button>
                                </div>
                                {det.weapons.length === 0 && <div style={{ color: '#475569', fontSize: '11px' }}>אין חימושים מוגדרים</div>}
                                {det.weapons.map((w, i) => (
                                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'center' }}>
                                    <input value={w.type} placeholder="סוג חימוש"
                                      onChange={e => { const arr = det.weapons.map((x, idx) => idx === i ? {...x, type: e.target.value} : x); updateDetail(strip.id, 'weapons', arr); }}
                                      style={{ flex: 2, padding: '5px 8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px' }} />
                                    <input value={w.quantity} placeholder="כמות"
                                      onChange={e => { const arr = det.weapons.map((x, idx) => idx === i ? {...x, quantity: e.target.value} : x); updateDetail(strip.id, 'weapons', arr); }}
                                      style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px' }} />
                                    <button onClick={() => updateDetail(strip.id, 'weapons', det.weapons.filter((_, idx) => idx !== i))}
                                      style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 7px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                                  </div>
                                ))}
                              </div>

                              {/* מטרות */}
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>מטרות לתקיפה</span>
                                  <button onClick={() => updateDetail(strip.id, 'targets', [...det.targets, { name: '', aim_point: '' }])}
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>+ הוסף</button>
                                </div>
                                {det.targets.length === 0 && <div style={{ color: '#475569', fontSize: '11px' }}>אין מטרות מוגדרות</div>}
                                {det.targets.map((t, i) => (
                                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'center' }}>
                                    <input value={t.name} placeholder="שם מטרה"
                                      onChange={e => { const arr = det.targets.map((x, idx) => idx === i ? {...x, name: e.target.value} : x); updateDetail(strip.id, 'targets', arr); }}
                                      style={{ flex: 2, padding: '5px 8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px' }} />
                                    <input value={t.aim_point} placeholder="נקודת מכוון"
                                      onChange={e => { const arr = det.targets.map((x, idx) => idx === i ? {...x, aim_point: e.target.value} : x); updateDetail(strip.id, 'targets', arr); }}
                                      style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px' }} />
                                    <button onClick={() => updateDetail(strip.id, 'targets', det.targets.filter((_, idx) => idx !== i))}
                                      style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 7px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                                  </div>
                                ))}
                              </div>

                              {/* מערכות */}
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>מערכות</span>
                                  <button onClick={() => updateDetail(strip.id, 'systems', [...det.systems, { name: '' }])}
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer' }}>+ הוסף</button>
                                </div>
                                {det.systems.length === 0 && <div style={{ color: '#475569', fontSize: '11px' }}>אין מערכות מוגדרות</div>}
                                {det.systems.map((sys, i) => (
                                  <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '5px', alignItems: 'center' }}>
                                    <input value={sys.name} placeholder="שם מערכת"
                                      onChange={e => { const arr = det.systems.map((x, idx) => idx === i ? { name: e.target.value } : x); updateDetail(strip.id, 'systems', arr); }}
                                      style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px' }} />
                                    <button onClick={() => updateDetail(strip.id, 'systems', det.systems.filter((_, idx) => idx !== i))}
                                      style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 7px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                                  </div>
                                ))}
                              </div>

                              {/* שקדיה */}
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>שקדיה</div>
                                <input value={det.shkadia} placeholder="מי מפסר המבנה יש שקדיה"
                                  onChange={e => updateDetail(strip.id, 'shkadia', e.target.value)}
                                  style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '12px', boxSizing: 'border-box' }} />
                              </div>

                              <button
                                onClick={() => saveStripDetails(strip.id)}
                                disabled={savingStripId === strip.id}
                                style={{ 
                                  width: '100%', padding: '8px', 
                                  background: saveError === strip.id ? '#dc2626' : savedStripId === strip.id ? '#16a34a' : '#22c55e', 
                                  color: 'white', border: 'none', borderRadius: '6px', 
                                  cursor: savingStripId === strip.id ? 'wait' : 'pointer', 
                                  fontSize: '13px', fontWeight: 'bold',
                                  opacity: savingStripId === strip.id ? 0.7 : 1
                                }}
                              >
                                {savingStripId === strip.id ? 'שומר...' : saveError === strip.id ? 'שגיאה בשמירה ✕' : savedStripId === strip.id ? 'נשמר בהצלחה ✓' : 'שמור שינויים'}
                              </button>
                            </div>
                          )}
                        </div>
                        );
                      })}
                      {workstationStrips.length === 0 && (
                        <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '10px' }}>
                          אין פממים משויכים
                        </div>
                      )}
                    </div>
                    
                    {/* Add strip to workstation */}
                    {unassignedStrips.length > 0 && (
                      <select
                        onChange={e => {
                          if (e.target.value) {
                            assignStripToWorkstation(e.target.value, preset.id);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                        style={{ marginTop: '12px', width: '100%', padding: '8px', borderRadius: '4px', border: 'none', fontSize: '12px', background: '#334155', color: 'white' }}
                      >
                        <option value="" disabled>+ הוסף פמם לעמדה</option>
                        {unassignedStrips.map(s => (
                          <option key={s.id} value={s.id}>{s.call_sign}{(s.sq || s.squadron) ? ` (${s.sq || s.squadron})` : ''}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- הגדרת שדות פמם ---
const STRIP_FIELD_DEFS = [
  { key: 'callSign',  label: 'או"ק',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'airborne',  label: 'מאוויר',         editableOptions: ['none', 'toggle'] },
  { key: 'squadron',  label: 'SQ',             editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'alt',       label: 'גובה',           editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'weapons',   label: 'חימושים',        editableOptions: ['none', 'keyboard'] },
  { key: 'targets',   label: "מטרות",          editableOptions: ['none', 'keyboard'] },
  { key: 'shkadia',   label: 'שקדיה',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'notes',     label: 'הערות',          editableOptions: ['none', 'keyboard', 'both'] },
  { key: 'sector',    label: 'אזור',           editableOptions: ['none', 'dropdown'] },
  { key: 'transfer',  label: 'העבר',           editableOptions: ['none'] as string[] },
];

const CUSTOM_FIELD_EDITABLE_OPTIONS = ['none', 'keyboard', 'both'];

const EDITABLE_LABELS: Record<string, string> = { none: 'קריאה בלבד', keyboard: 'מקלדת', handwriting: 'כתב יד', both: 'מקלדת+כתב יד', toggle: 'מתג', dropdown: 'רשימת בחירה' };

// --- ניהול מודי טבלה ---
const TableModesManager = () => {
  const [modes, setModes] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', columns: [] as any[], frozenColumns: 0 });
  const [dragColIdx, setDragColIdx] = useState<number | null>(null);
  const [dragOverColIdx, setDragOverColIdx] = useState<number | null>(null);

  const loadModes = async () => {
    const res = await fetch(`${API_URL}/table-modes`);
    if (res.ok) setModes(await res.json());
  };

  useEffect(() => { loadModes(); }, []);

  const startNew = () => {
    setEditing(null);
    setForm({ name: '', columns: [], frozenColumns: 0 });
  };

  const startEdit = (mode: any) => {
    setEditing(mode);
    const cols = (mode.columns || []).map((c: any) => ({
      ...c,
      key: c.key || c.field || ('custom_' + Date.now()),
      isCustom: c.isCustom || (c.key || c.field || '').startsWith('custom_')
    }));
    setForm({ name: mode.name, columns: cols, frozenColumns: mode.frozenColumns || 0 });
  };

  const addColumn = () => {
    setForm(f => ({
      ...f,
      columns: [...f.columns, { id: Date.now().toString(), key: 'callSign', label: 'או"ק', editable: 'none', isCustom: false }]
    }));
  };

  const addCustomColumn = () => {
    const uid = 'custom_' + Date.now();
    setForm(f => ({
      ...f,
      columns: [...f.columns, { id: uid, key: uid, label: 'שדה חופשי', editable: 'none', isCustom: true }]
    }));
  };

  const updateCol = (idx: number, changes: any) => {
    setForm(f => {
      const cols = [...f.columns];
      cols[idx] = { ...cols[idx], ...changes };
      return { ...f, columns: cols };
    });
  };

  const removeCol = (idx: number) => {
    setForm(f => ({ ...f, columns: f.columns.filter((_, i) => i !== idx) }));
  };

  const handleColDrop = (targetIdx: number) => {
    if (dragColIdx === null || dragColIdx === targetIdx) return;
    setForm(f => {
      const cols = [...f.columns];
      const [moved] = cols.splice(dragColIdx, 1);
      cols.splice(targetIdx, 0, moved);
      return { ...f, columns: cols };
    });
    setDragColIdx(null);
    setDragOverColIdx(null);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API_URL}/table-modes/${editing.id}` : `${API_URL}/table-modes`;
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditing(null);
    setForm({ name: '', columns: [], frozenColumns: 0 });
    loadModes();
  };

  const deleteMode = async (id: number) => {
    if (!confirm('למחוק מוד טבלה זה?')) return;
    await fetch(`${API_URL}/table-modes/${id}`, { method: 'DELETE' });
    loadModes();
  };

  const fieldDef = (key: string) => STRIP_FIELD_DEFS.find(f => f.key === key) || null;

  return (
    <div>
      <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>מודי טבלה</h2>

      {/* Form */}
      <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', color: '#94a3b8' }}>{editing ? `עריכה: ${editing.name}` : 'מוד חדש'}</h3>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="שם המוד (לדוגמה: טבלה מפורטת)"
          style={{ width: '100%', padding: '10px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box', marginBottom: '16px', direction: 'rtl' }}
        />

        {/* Columns */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>עמודות (גרור לשינוי סדר):</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addColumn} style={{ padding: '6px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>+ שדה מפמם</button>
              <button onClick={addCustomColumn} style={{ padding: '6px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '13px' }}>+ שדה חופשי</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.columns.map((col, idx) => {
              const def = col.isCustom ? null : fieldDef(col.key || col.field);
              const editableOpts = col.isCustom ? CUSTOM_FIELD_EDITABLE_OPTIONS : (def?.editableOptions || ['none']);
              const isDragOver = dragOverColIdx === idx;
              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={() => setDragColIdx(idx)}
                  onDragOver={e => { e.preventDefault(); setDragOverColIdx(idx); }}
                  onDragLeave={() => setDragOverColIdx(null)}
                  onDrop={() => handleColDrop(idx)}
                  onDragEnd={() => { setDragColIdx(null); setDragOverColIdx(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: isDragOver ? '#1d4ed8' : (idx < form.frozenColumns ? '#1a0e2e' : col.isCustom ? '#1a1040' : '#1e293b'),
                    border: isDragOver ? '2px solid #3b82f6' : (idx + 1 === form.frozenColumns ? '1px solid #7c3aed' : idx < form.frozenColumns ? '1px solid #4c1d95' : col.isCustom ? '1px solid #6d28d9' : '1px solid #334155'),
                    borderRadius: '6px', padding: '8px 10px',
                    opacity: dragColIdx === idx ? 0.5 : 1, cursor: 'grab', transition: 'background 0.1s'
                  }}
                >
                  <span style={{ color: '#475569', fontSize: '16px', flexShrink: 0 }}>⠿</span>
                  {col.isCustom ? (
                    <span style={{ fontSize: '11px', color: '#a78bfa', background: '#2e1065', padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}>שדה חופשי</span>
                  ) : (
                    <select
                      value={col.key || col.field || 'callSign'}
                      onChange={e => {
                        const newDef = fieldDef(e.target.value);
                        updateCol(idx, {
                          key: e.target.value,
                          field: e.target.value,
                          label: newDef?.label || e.target.value,
                          editable: newDef?.editableOptions[0] || 'none'
                        });
                      }}
                      style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl' }}
                    >
                      {STRIP_FIELD_DEFS.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  )}
                  <input
                    value={col.label}
                    onChange={e => updateCol(idx, { label: e.target.value })}
                    placeholder={col.isCustom ? "שם השדה (לדוגמה: מהירות)" : "כותרת עמודה"}
                    style={{ flex: 1, background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl' }}
                  />
                  {/* Editability control: single select */}
                  <select
                    value={col.editable}
                    onChange={e => updateCol(idx, { editable: e.target.value })}
                    style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px', direction: 'rtl', flexShrink: 0 }}
                  >
                    {editableOpts.filter((o: string) => o !== 'handwriting' || !editableOpts.includes('both')).map((opt: string) => (
                      <option key={opt} value={opt}>{EDITABLE_LABELS[opt]}</option>
                    ))}
                  </select>
                  <button
                    title={idx + 1 === form.frozenColumns ? 'בטל הקפאה' : 'הקפא עד עמודה זו'}
                    onClick={() => setForm(f => ({ ...f, frozenColumns: idx + 1 === f.frozenColumns ? 0 : idx + 1 }))}
                    style={{ padding: '4px 7px', background: idx < form.frozenColumns ? '#4c1d95' : 'transparent', color: idx + 1 === form.frozenColumns ? '#c4b5fd' : idx < form.frozenColumns ? '#a78bfa' : '#475569', border: `1px solid ${idx + 1 === form.frozenColumns ? '#7c3aed' : idx < form.frozenColumns ? '#4c1d95' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', flexShrink: 0, transition: 'all 0.1s' }}
                  >📌</button>
                  <button onClick={() => removeCol(idx)} style={{ padding: '4px 8px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}>✕</button>
                </div>
              );
            })}
            {form.columns.length === 0 && (
              <div style={{ color: '#475569', textAlign: 'center', padding: '20px', background: '#1e293b', borderRadius: '6px', fontSize: '13px' }}>
                לחץ "+ שדה מפמם" להוסיף עמודה מנתוני הפמם, או "+ שדה חופשי" לשדה בעל שם חופשי
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button onClick={save} disabled={!form.name.trim()} style={{ padding: '10px 24px', background: form.name.trim() ? '#059669' : '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: form.name.trim() ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 'bold' }}>
            {editing ? 'עדכון' : 'שמירה'}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', columns: [], frozenColumns: 0 }); }} style={{ padding: '10px 20px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>
              ביטול
            </button>
          )}
        </div>
      </div>

      {/* Modes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {modes.map(mode => (
          <div key={mode.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '16px' }}>{mode.name}</strong>
                <span style={{ color: '#64748b', fontSize: '13px', marginRight: '12px' }}>
                  {mode.columns?.length || 0} עמודות: {(mode.columns || []).map((c: any) => c.label).join(' | ')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => startEdit(mode)} style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                <button onClick={() => deleteMode(mode.id)} style={{ padding: '6px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
              </div>
            </div>
          </div>
        ))}
        {modes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>אין מודי טבלה. צור מוד חדש למעלה.</div>
        )}
      </div>
    </div>
  );
};

// --- Query Builder Components ---
const QLeafEditor = ({ leaf, onUpdate, onDelete }: { leaf: QLeaf; onUpdate: (l: QLeaf) => void; onDelete: () => void }) => {
  const fieldDef = Q_FIELDS.find(f => f.key === leaf.field) || Q_FIELDS[0];
  const ops = fieldDef.ftype === 'bool' ? Q_BOOL_OPS : Q_TEXT_OPS;
  const needsValue = leaf.compare !== 'empty' && leaf.compare !== 'not_empty';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '6px 8px', flexWrap: 'wrap', direction: 'rtl' }}>
      <select value={leaf.field} onChange={e => onUpdate({ ...leaf, field: e.target.value, compare: fieldDef.ftype === 'bool' ? 'eq' : 'contains', value: '' })}
        style={{ padding: '4px 6px', background: '#1e293b', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
        {Q_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select value={leaf.compare} onChange={e => onUpdate({ ...leaf, compare: e.target.value as QCompare })}
        style={{ padding: '4px 6px', background: '#1e293b', color: '#a78bfa', border: '1px solid #6d28d9', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
        {ops.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {needsValue && (
        fieldDef.ftype === 'bool' ? (
          <select value={leaf.value || 'באוויר'} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
            style={{ padding: '4px 6px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}>
            <option value="באוויר">✈ באוויר</option>
            <option value="קרקע">⬛ קרקע</option>
          </select>
        ) : (
          <input type="text" value={leaf.value} onChange={e => onUpdate({ ...leaf, value: e.target.value })}
            placeholder={leaf.compare === 'in' || leaf.compare === 'not_in' ? 'ערך1, ערך2, ...' : 'ערך...'}
            style={{ padding: '4px 8px', background: '#1e293b', color: 'white', border: '1px solid #475569', borderRadius: '4px', fontSize: '13px', width: '110px', direction: 'rtl' }} />
        )
      )}
      <button onClick={onDelete} title="מחק תנאי" style={{ padding: '2px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', marginRight: 'auto' }}>✕</button>
    </div>
  );
};

const QGroupEditor = ({ group, onUpdate, onDelete, isRoot = false, depth = 0 }: {
  group: QGroup; onUpdate: (g: QGroup) => void; onDelete?: () => void; isRoot?: boolean; depth?: number;
}) => {
  const addLeaf = () => {
    const leaf: QLeaf = { id: qGenId(), type: 'leaf', field: 'task', compare: 'contains', value: '' };
    onUpdate({ ...group, children: [...group.children, leaf] });
  };
  const addGroup = () => {
    onUpdate({ ...group, children: [...group.children, emptyQGroup()] });
  };
  const updateChild = (updated: QNode) => {
    onUpdate({ ...group, children: group.children.map(c => c.id === updated.id ? updated : c) });
  };
  const deleteChild = (id: string) => {
    onUpdate({ ...group, children: group.children.filter(c => c.id !== id) });
  };

  const borderColor = depth === 0 ? '#2563eb' : depth === 1 ? '#7c3aed' : '#059669';
  return (
    <div style={{ borderRight: `3px solid ${borderColor}`, paddingRight: '12px', marginRight: depth > 0 ? '8px' : '0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', direction: 'rtl' }}>
        <select value={group.operator} onChange={e => onUpdate({ ...group, operator: e.target.value as QOperator })}
          style={{ padding: '5px 10px', background: '#1e3a5f', color: '#93c5fd', border: `1px solid ${borderColor}`, borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
          {(Object.keys(Q_OPERATOR_LABELS) as QOperator[]).map(op => (
            <option key={op} value={op}>{Q_OPERATOR_LABELS[op]}</option>
          ))}
        </select>
        <button onClick={addLeaf} style={{ padding: '4px 10px', background: '#052e16', color: '#86efac', border: '1px solid #16a34a', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>+ תנאי</button>
        <button onClick={addGroup} style={{ padding: '4px 10px', background: '#1e1b4b', color: '#c4b5fd', border: '1px solid #7c3aed', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>+ קבוצה</button>
        {!isRoot && onDelete && (
          <button onClick={onDelete} style={{ padding: '4px 8px', background: '#450a0a', color: '#fca5a5', border: '1px solid #b91c1c', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>✕ קבוצה</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {group.children.map(child =>
          child.type === 'group' ? (
            <QGroupEditor key={child.id} group={child} onUpdate={updateChild} onDelete={() => deleteChild(child.id)} depth={depth + 1} />
          ) : (
            <QLeafEditor key={child.id} leaf={child as QLeaf} onUpdate={updateChild as any} onDelete={() => deleteChild(child.id)} />
          )
        )}
        {group.children.length === 0 && (
          <div style={{ color: '#475569', fontSize: '12px', padding: '10px', textAlign: 'center', border: '1px dashed #334155', borderRadius: '6px', direction: 'rtl' }}>
            לחץ &quot;+ תנאי&quot; כדי להוסיף תנאי ראשון
          </div>
        )}
      </div>
    </div>
  );
};

const QueryBuilder = ({ value, onChange, label = 'שאילתת סינון פממים' }: { value: QGroup | null; onChange: (q: QGroup | null) => void; label?: string }) => {
  const [enabled, setEnabled] = useState(!!value);
  const [group, setGroup] = useState<QGroup>(value || emptyQGroup());

  useEffect(() => {
    if (value) { setGroup(value); setEnabled(true); }
    else { setEnabled(false); }
  }, [JSON.stringify(value)]);

  const handleToggle = () => {
    if (enabled) { setEnabled(false); onChange(null); }
    else { setEnabled(true); onChange(group); }
  };
  const handleUpdate = (g: QGroup) => { setGroup(g); onChange(g); };

  return (
    <div style={{ marginTop: '15px', padding: '14px', background: '#1e293b', borderRadius: '8px', border: `1px solid ${enabled ? '#2563eb' : '#334155'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: enabled ? '14px' : '0', direction: 'rtl' }}>
        <span style={{ color: enabled ? '#60a5fa' : '#64748b', fontSize: '14px', fontWeight: 'bold' }}>🔍 {label}</span>
        <button onClick={handleToggle}
          style={{ padding: '5px 14px', background: enabled ? '#1d4ed8' : '#334155', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          {enabled ? '✓ פעיל' : 'הפעל'}
        </button>
      </div>
      {enabled && <QGroupEditor group={group} isRoot onUpdate={handleUpdate} />}
    </div>
  );
};

// --- דף ניהול ---
const ManagementPage = ({ onBack }: { onBack: () => void }) => {
  const [activeTab, setActiveTab] = useState<'maps' | 'sectors' | 'presets' | 'strips' | 'crew' | 'table_modes'>('presets');
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [sectors, setSectors] = useState<any[]>([]);
  const [maps, setMaps] = useState<{id: number; name: string}[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [tableModes, setTableModes] = useState<any[]>([]);
  
  // Crew member editing
  const [editingCrewMember, setEditingCrewMember] = useState<CrewMember | null>(null);
  const [crewMemberForm, setCrewMemberForm] = useState({ first_name: '', last_name: '', personal_id: '', is_admin: false, approved_workstations: [] as number[] });
  
  // Sector editing
  const [editingSector, setEditingSector] = useState<any | null>(null);
  const [sectorForm, setSectorForm] = useState({ name: '', label_he: '', category: '', notes: '' });
  
  // Preset editing
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: '',
    map_id: '',
    relevant_sectors: [] as number[],
    table_mode_id: '' as string | number,
    partial_load: 3 as number,
    full_load: 5 as number,
    filter_query: null as QGroup | null,
  });

  const loadData = async () => {
    try {
      const [sectorsRes, mapsRes, presetsRes, crewRes, tableModesRes] = await Promise.all([
        fetch(`${API_URL}/sectors`),
        fetch(`${API_URL}/maps`),
        fetch(`${API_URL}/workstation-presets`),
        fetch(`${API_URL}/crew-members`),
        fetch(`${API_URL}/table-modes`)
      ]);
      if (sectorsRes.ok) setSectors(await sectorsRes.json());
      if (mapsRes.ok) setMaps(await mapsRes.json());
      if (presetsRes.ok) setPresets(await presetsRes.json());
      if (crewRes.ok) setCrewMembers(await crewRes.json());
      if (tableModesRes.ok) setTableModes(await tableModesRes.json());
    } catch (err) {
      console.error('Failed to load:', err);
    }
  };

  // Crew member management
  const saveCrewMember = async () => {
    if (!crewMemberForm.first_name.trim() || !crewMemberForm.last_name.trim()) return;
    try {
      const method = editingCrewMember ? 'PUT' : 'POST';
      const url = editingCrewMember ? `${API_URL}/crew-members/${editingCrewMember.id}` : `${API_URL}/crew-members`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crewMemberForm)
      });
      setEditingCrewMember(null);
      setCrewMemberForm({ first_name: '', last_name: '', personal_id: '', is_admin: false, approved_workstations: [] });
      loadData();
    } catch (err) {
      console.error('Failed to save crew member:', err);
    }
  };

  const editCrewMember = (member: CrewMember) => {
    setEditingCrewMember(member);
    setCrewMemberForm({ 
      first_name: member.first_name || '', 
      last_name: member.last_name || '', 
      personal_id: member.personal_id || '',
      is_admin: member.is_admin,
      approved_workstations: member.approved_workstations || []
    });
  };

  const deleteCrewMember = async (id: number) => {
    if (!confirm('למחוק איש צוות זה? הפעולה תמחק גם את נתוני כתב היד שלו.')) return;
    try {
      await fetch(`${API_URL}/crew-members/${id}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to delete crew member:', err);
    }
  };
  
  const toggleWorkstationApproval = (presetId: number) => {
    setCrewMemberForm(f => ({
      ...f,
      approved_workstations: f.approved_workstations.includes(presetId)
        ? f.approved_workstations.filter(id => id !== presetId)
        : [...f.approved_workstations, presetId]
    }));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sector management
  const saveSector = async () => {
    if (!sectorForm.name.trim()) return;
    try {
      const method = editingSector ? 'PUT' : 'POST';
      const url = editingSector ? `${API_URL}/sectors/${editingSector.id}` : `${API_URL}/sectors`;
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: sectorForm.name, 
          label_he: sectorForm.label_he || sectorForm.name,
          category: sectorForm.category,
          notes: sectorForm.notes
        })
      });
      setEditingSector(null);
      setSectorForm({ name: '', label_he: '', category: '', notes: '' });
      loadData();
    } catch (err) {
      console.error('Failed to save sector:', err);
    }
  };

  const editSector = (sector: any) => {
    setEditingSector(sector);
    setSectorForm({
      name: sector.name,
      label_he: sector.label_he || '',
      category: sector.category || '',
      notes: sector.notes || ''
    });
  };

  const deleteSector = async (id: number) => {
    if (!confirm('למחוק נקודת העברה זו?')) return;
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
          map_id: presetForm.map_id ? parseInt(presetForm.map_id as string) : null,
          relevant_sectors: presetForm.relevant_sectors,
          table_mode_id: presetForm.table_mode_id ? Number(presetForm.table_mode_id) : null,
          partial_load: presetForm.partial_load,
          full_load: presetForm.full_load,
          filter_query: presetForm.filter_query || null,
        })
      });
      setEditingPreset(null);
      setPresetForm({ name: '', map_id: '', relevant_sectors: [], table_mode_id: '', partial_load: 3, full_load: 5, filter_query: null });
      loadData();
    } catch (err) {
      console.error('Failed to save preset:', err);
    }
  };

  const editPreset = (preset: any) => {
    setEditingPreset(preset);
    setPresetForm({
      name: preset.name,
      map_id: preset.map_id?.toString() || '',
      relevant_sectors: preset.relevant_sectors || [],
      table_mode_id: preset.table_mode_id || '',
      partial_load: preset.partial_load ?? 3,
      full_load: preset.full_load ?? 5,
      filter_query: preset.filter_query || null,
    });
  };

  const toggleSectorSelection = (sectorId: number) => {
    setPresetForm(p => ({
      ...p,
      relevant_sectors: p.relevant_sectors.includes(sectorId) 
        ? p.relevant_sectors.filter(id => id !== sectorId)
        : [...p.relevant_sectors, sectorId]
    }));
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
        <button onClick={() => setActiveTab('sectors')} style={tabStyle(activeTab === 'sectors')}>נקודות העברה</button>
        <button onClick={() => setActiveTab('maps')} style={tabStyle(activeTab === 'maps')}>מפות</button>
        <button onClick={() => setActiveTab('strips')} style={tabStyle(activeTab === 'strips')}>פממים</button>
        <button onClick={() => setActiveTab('crew')} style={tabStyle(activeTab === 'crew')}>אנשי צוות</button>
        <button onClick={() => setActiveTab('table_modes')} style={tabStyle(activeTab === 'table_modes')}>מודי טבלה</button>
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
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>מצב תצוגה ברירת מחדל:</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: presetForm.table_mode_id ? '14px' : '0' }}>
                    <button
                      type="button"
                      onClick={() => setPresetForm(p => ({ ...p, table_mode_id: '' }))}
                      style={{
                        flex: 1, padding: '10px', border: presetForm.table_mode_id ? '2px solid #334155' : '2px solid #2563eb',
                        borderRadius: '8px', background: presetForm.table_mode_id ? '#1e293b' : '#1e3a5f',
                        color: presetForm.table_mode_id ? '#94a3b8' : 'white', cursor: 'pointer', fontSize: '14px', fontWeight: presetForm.table_mode_id ? 'normal' : 'bold'
                      }}
                    >🗺 מוד מפה</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!presetForm.table_mode_id && tableModes.length > 0) {
                          setPresetForm(p => ({ ...p, table_mode_id: tableModes[0].id }));
                        }
                      }}
                      style={{
                        flex: 1, padding: '10px', border: presetForm.table_mode_id ? '2px solid #2563eb' : '2px solid #334155',
                        borderRadius: '8px', background: presetForm.table_mode_id ? '#1e3a5f' : '#1e293b',
                        color: presetForm.table_mode_id ? 'white' : '#94a3b8', cursor: tableModes.length === 0 ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: presetForm.table_mode_id ? 'bold' : 'normal'
                      }}
                      title={tableModes.length === 0 ? 'צור מוד טבלה תחילה בלשונית "מודי טבלה"' : ''}
                    >📋 מוד טבלה</button>
                  </div>
                  {presetForm.table_mode_id !== '' && tableModes.length > 0 && (
                    <div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>בחר טבלה:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tableModes.map(tm => (
                          <button
                            key={tm.id}
                            type="button"
                            onClick={() => setPresetForm(p => ({ ...p, table_mode_id: tm.id }))}
                            style={{
                              textAlign: 'right', padding: '10px 14px', border: Number(presetForm.table_mode_id) === tm.id ? '2px solid #3b82f6' : '1px solid #334155',
                              borderRadius: '6px', background: Number(presetForm.table_mode_id) === tm.id ? '#1e3a8a' : '#1e293b',
                              color: 'white', cursor: 'pointer', fontSize: '13px', direction: 'rtl'
                            }}
                          >
                            <strong>{tm.name}</strong>
                            <span style={{ color: '#64748b', fontSize: '11px', marginRight: '10px' }}>
                              {(tm.columns || []).map((c: any) => c.label).join(' | ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {presetForm.table_mode_id !== '' && tableModes.length === 0 && (
                    <div style={{ color: '#f87171', fontSize: '13px', padding: '10px', background: '#1e293b', borderRadius: '6px' }}>
                      אין מודי טבלה מוגדרים. צור מוד טבלה בלשונית "מודי טבלה".
                    </div>
                  )}
                </div>
                
                {/* Load thresholds */}
                <div style={{ marginTop: '15px', padding: '14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                  <label style={{ display: 'block', marginBottom: '10px', color: '#f59e0b', fontSize: '14px', fontWeight: 'bold' }}>⚡ מוד עומס</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#fbbf24', fontSize: '13px' }}>עומס חלקי (כתום) — מספר פ"ממים:</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={presetForm.partial_load}
                        onChange={e => setPresetForm(p => ({ ...p, partial_load: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #f59e0b', borderRadius: '6px', background: '#0f172a', color: '#fbbf24', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', color: '#f87171', fontSize: '13px' }}>עומס מלא (אדום) — מספר פ"ממים:</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={presetForm.full_load}
                        onChange={e => setPresetForm(p => ({ ...p, full_load: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ef4444', borderRadius: '6px', background: '#0f172a', color: '#f87171', fontSize: '16px', fontWeight: 'bold', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: '11px', direction: 'rtl' }}>
                    סופרים: פ"ממים באוויר בעמדה + פ"ממים שממריאים תוך 10 ד' + העברות נכנסות (באוויר או ממריאים תוך 10 ד')
                  </p>
                </div>

                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>נקודות העברה (לחץ לבחירה):</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {sectors.map(sector => {
                      const isSelected = presetForm.relevant_sectors.includes(sector.id);
                      return (
                        <button
                          key={sector.id}
                          onClick={() => toggleSectorSelection(sector.id)}
                          style={{
                            padding: '8px 16px',
                            border: isSelected ? '2px solid #3b82f6' : '2px solid #475569',
                            borderRadius: '20px',
                            background: isSelected ? '#1e40af' : '#334155',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {sector.label_he || sector.name}
                          {sector.category && <span style={{ color: '#94a3b8', marginRight: '6px' }}>({sector.category})</span>}
                        </button>
                      );
                    })}
                    {sectors.length === 0 && (
                      <span style={{ color: '#64748b', fontSize: '14px' }}>אין נקודות העברה מוגדרות. הוסף נקודות בלשונית "נקודות העברה".</span>
                    )}
                  </div>
                </div>
                
                {/* Filter Query Builder */}
                <QueryBuilder
                  value={presetForm.filter_query}
                  onChange={q => setPresetForm(p => ({ ...p, filter_query: q }))}
                  label='שאילתת סינון פממים לעמדה'
                />

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button
                    onClick={savePreset}
                    style={{ padding: '10px 25px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    {editingPreset ? 'עדכון' : 'הוספה'}
                  </button>
                  {editingPreset && (
                    <button
                      onClick={() => { setEditingPreset(null); setPresetForm({ name: '', map_id: '', relevant_sectors: [], table_mode_id: '' }); }}
                      style={{ padding: '10px 25px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </div>
              
              {/* Presets List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {presets.map(preset => {
                  const relevantSectorNames = (preset.relevant_sectors || [])
                    .map((id: number) => sectors.find(s => s.id === id)?.label_he || sectors.find(s => s.id === id)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <div key={preset.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '16px' }}>{preset.name}</strong>
                        <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                          מפה: {maps.find(m => m.id === preset.map_id)?.name || 'לא מוגדר'}
                          {relevantSectorNames && ` | נקודות העברה: ${relevantSectorNames}`}
                          {preset.table_mode_id && ` | טבלה: ${tableModes.find(tm => tm.id === preset.table_mode_id)?.name || '#' + preset.table_mode_id}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => editPreset(preset)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                        <button onClick={() => deletePreset(preset.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                      </div>
                    </div>
                  );
                })}
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
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>ניהול נקודות העברה</h2>
              
              {/* Sector Form */}
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingSector ? 'עריכת נקודת העברה' : 'נקודת העברה חדשה'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>קוד:</label>
                    <input
                      type="text"
                      value={sectorForm.name}
                      onChange={(e) => setSectorForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="NORTH"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>שם בעברית:</label>
                    <input
                      type="text"
                      value={sectorForm.label_he}
                      onChange={(e) => setSectorForm(f => ({ ...f, label_he: e.target.value }))}
                      placeholder="צפון"
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>קטגוריה:</label>
                    <input
                      type="text"
                      value={sectorForm.category}
                      onChange={(e) => setSectorForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="למשל: מרחב, גישה, מסלול..."
                      style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', color: '#94a3b8', fontSize: '14px' }}>הערות (להעברת מידע בין עמדות):</label>
                  <textarea
                    value={sectorForm.notes}
                    onChange={(e) => setSectorForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="לדוגמה: זוגי צפוני, אי-זוגי דרומה..."
                    rows={3}
                    style={{ width: '100%', padding: '10px', border: '1px solid #475569', borderRadius: '6px', background: '#1e293b', color: 'white', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                  <button
                    onClick={saveSector}
                    style={{ padding: '10px 25px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
                  >
                    {editingSector ? 'עדכון' : 'הוספה'}
                  </button>
                  {editingSector && (
                    <button
                      onClick={() => { setEditingSector(null); setSectorForm({ name: '', label_he: '', category: '', notes: '' }); }}
                      style={{ padding: '10px 25px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </div>
              
              {/* Sectors List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sectors.map(sector => (
                  <div key={sector.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <strong style={{ fontSize: '16px' }}>{sector.label_he || sector.name}</strong>
                          <span style={{ color: '#64748b', fontSize: '14px' }}>({sector.name})</span>
                          {sector.category && (
                            <span style={{ background: '#7c3aed', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{sector.category}</span>
                          )}
                        </div>
                        {sector.notes && (
                          <div style={{ marginTop: '8px', padding: '10px', background: '#1e293b', borderRadius: '6px', color: '#94a3b8', fontSize: '13px', borderRight: '3px solid #f59e0b' }}>
                            {sector.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginRight: '15px' }}>
                        <button onClick={() => editSector(sector)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                        <button onClick={() => deleteSector(sector.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                      </div>
                    </div>
                  </div>
                ))}
                {sectors.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    אין נקודות העברה מוגדרות. הוסף נקודה חדשה למעלה.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Maps Tab */}
          {activeTab === 'maps' && (
            <MapsManager onClose={() => {}} onMapsUpdated={loadData} isEmbedded={true} />
          )}

          {/* Strips Tab */}
          {activeTab === 'strips' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>טעינת פממים מקובץ</h2>
              
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ color: '#94a3b8', marginBottom: '15px', fontSize: '14px', lineHeight: '1.6' }}>
                  טען פממים מקובץ <strong style={{color:'#60a5fa'}}>Excel (.xlsx)</strong> או <strong style={{color:'#60a5fa'}}>CSV (.csv)</strong>.<br/>
                  <strong>או"ק הוא שדה חד-ערכי - אם קיים פמם עם אותה קריאה, הרשומה תידלג.</strong>
                </p>
                
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  id="csvFileInput"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const parseWeapons = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const parts = s.split(':');
                        return { type: (parts[0] || '').trim(), quantity: (parts[1] || '').trim() };
                      });
                    };
                    const parseTargets = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => {
                        const parts = s.split(':');
                        return { name: (parts[0] || '').trim(), aim_point: (parts[1] || '').trim() };
                      });
                    };
                    const parseSystems = (val: string) => {
                      if (!val || !val.trim()) return [];
                      return val.split(';').map(s => s.trim()).filter(Boolean).map(s => ({ name: s }));
                    };

                    let rows: Record<string, string>[] = [];

                    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                      const buffer = await file.arrayBuffer();
                      const wb = XLSX.read(buffer, { type: 'array' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
                    } else {
                      const text = await file.text();
                      const lines = text.split('\n').filter(line => line.trim());
                      if (lines.length < 2) { alert('הקובץ ריק או חסר נתונים'); return; }
                      const headers = lines[0].split(',').map(h => h.trim());
                      rows = lines.slice(1).map(line => {
                        const values = line.split(',').map(v => v.trim());
                        const row: Record<string, string> = {};
                        headers.forEach((h, i) => { row[h] = values[i] || ''; });
                        return row;
                      });
                    }

                    const getField = (row: Record<string, string>, ...keys: string[]) => {
                      for (const k of keys) {
                        const found = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
                        if (found && row[found] !== undefined && String(row[found]).trim() !== '') return String(row[found]).trim();
                      }
                      return '';
                    };

                    const parseTakeoffDatetime = (dateStr: string, timeStr: string): string | null => {
                      if (!dateStr && !timeStr) return null;
                      let day = '', month = '', year = '', hh = '', mm = '';
                      const d = dateStr.trim();
                      if (d) {
                        if (/^\d{8}$/.test(d)) {
                          if (parseInt(d.slice(0, 4)) > 1900) { year = d.slice(0,4); month = d.slice(4,6); day = d.slice(6,8); }
                          else { day = d.slice(0,2); month = d.slice(2,4); year = d.slice(4,8); }
                        } else if (/^\d{6}$/.test(d)) {
                          day = d.slice(0,2); month = d.slice(2,4); year = '20' + d.slice(4,6);
                        } else {
                          const parts = d.split(/[\/\-\.]/);
                          if (parts.length === 3) {
                            if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
                            else { day = parts[0]; month = parts[1]; year = parts[2].length === 2 ? '20' + parts[2] : parts[2]; }
                          }
                        }
                      }
                      const t = timeStr.trim().replace(/:/g, '');
                      if (t.length >= 4) { hh = t.slice(0,2); mm = t.slice(2,4); }
                      else if (t.length === 3) { hh = '0' + t.slice(0,1); mm = t.slice(1,3); }
                      else if (t.length > 0) { hh = t.padStart(2,'0'); mm = '00'; }
                      if (!year || !month || !day) {
                        const now = new Date();
                        year = year || String(now.getFullYear());
                        month = month || String(now.getMonth() + 1).padStart(2,'0');
                        day = day || String(now.getDate()).padStart(2,'0');
                      }
                      if (!hh) { hh = '00'; mm = '00'; }
                      const iso = `${year.padStart(4,'0')}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hh}:${mm}:00`;
                      const dt = new Date(iso);
                      return isNaN(dt.getTime()) ? null : dt.toISOString();
                    };

                    const strips = rows
                      .filter(row => getField(row, 'callSign', 'call_sign', 'קריאה'))
                      .map(row => {
                        const dateVal = getField(row, 'DATE', 'date', 'תאריך');
                        const timeVal = getField(row, 'TAKEOFF TIME', 'takeoff_time', 'takeoff time', 'time', 'זמן המראה', 'המראה');
                        const takeoff_time = parseTakeoffDatetime(dateVal, timeVal);
                        return {
                          callSign: getField(row, 'callSign', 'call_sign', 'קריאה'),
                          sq: getField(row, 'sq', 'SQ', 'סקוודרון', 'squadron', 'טייסת'),
                          alt: getField(row, 'alt', 'גובה'),
                          task: getField(row, 'task', 'משימה'),
                          weapons: parseWeapons(getField(row, 'weapons', 'חימושים')),
                          targets: parseTargets(getField(row, 'targets', 'מטרות')),
                          systems: parseSystems(getField(row, 'systems', 'מערכות')),
                          shkadia: getField(row, 'shkadia', 'שקדיה'),
                          takeoff_time
                        };
                      });
                    
                    try {
                      const res = await fetch(`${API_URL}/strips/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ strips })
                      });
                      const result = await res.json();
                      setCsvImportResult(result);
                    } catch (err) {
                      console.error('Import error:', err);
                      alert('שגיאה בטעינת הקובץ');
                    }
                    e.target.value = '';
                  }}
                />
                
                <button
                  onClick={() => document.getElementById('csvFileInput')?.click()}
                  style={{ padding: '12px 30px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
                >
                  בחר קובץ Excel / CSV
                </button>
                
                {csvImportResult && (
                  <div style={{ marginTop: '20px', padding: '15px', background: '#1e293b', borderRadius: '8px' }}>
                    <div style={{ color: '#22c55e', marginBottom: '8px', fontSize: '15px' }}>
                      נטענו בהצלחה: {csvImportResult.imported} פממים
                    </div>
                    {csvImportResult.skipped > 0 && (
                      <div style={{ color: '#f59e0b', marginBottom: '8px', fontSize: '14px' }}>
                        נדלגו (כפילויות): {csvImportResult.skipped} פממים
                      </div>
                    )}
                    {csvImportResult.errors.length > 0 && (
                      <div style={{ color: '#dc2626', fontSize: '13px' }}>
                        שגיאות: {csvImportResult.errors.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>פורמט הקובץ</h3>
                
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#94a3b8', lineHeight: '2' }}>
                  <div><strong style={{color:'white'}}>שורה 1:</strong> כותרות עמודות (חובה)</div>
                  <div><strong style={{color:'white'}}>עמודות חובה:</strong> <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px'}}>callSign</code></div>
                  <div><strong style={{color:'white'}}>עמודות אופציונליות:</strong></div>
                  <div style={{paddingRight:'16px'}}>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>sq</code> — SQ (גם: <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>SQ</code>, <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>squadron</code>, <code style={{background:'#1e293b', padding:'1px 4px', borderRadius:'3px'}}>טייסת</code>)<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>alt</code> — גובה<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>task</code> — משימה<br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>DATE</code> — תאריך המראה, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>DD/MM/YYYY</code> או <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>DDMMYYYY</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>TAKEOFF TIME</code> — שעת המראה, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>HHMM</code> או <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>HH:MM</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>weapons</code> — חימושים, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>סוג1:כמות1; סוג2:כמות2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>targets</code> — מטרות, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>שם מטרה:נ.מכוון; מטרה2:נ.מכוון2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>systems</code> — מערכות, פורמט: <code style={{background:'#1e293b', padding:'1px 6px', borderRadius:'3px'}}>מערכת1; מערכת2</code><br/>
                    <code style={{background:'#334155', padding:'1px 6px', borderRadius:'3px', marginLeft:'8px'}}>shkadia</code> — שקדיה (טקסט חופשי)
                  </div>
                </div>

                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>דוגמה (CSV):</h4>
                <pre style={{ background: '#1e293b', padding: '15px', borderRadius: '6px', fontSize: '12px', overflow: 'auto', color: '#e2e8f0', direction: 'ltr', textAlign: 'left' }}>
{`callSign,sq,alt,task,DATE,TAKEOFF TIME,weapons,targets,systems,shkadia
BLUE01,69,FL350,CAP,23/03/2026,0630,AIM120:4; AIM9:2,TANGO1:IP_NORTH; TANGO2:IP_EAST,LANTIRN; EW,מטוס 2
HAWK23,105,FL280,ESCORT,23/03/2026,0800,,,FLIR,
VIPER07,117,FL400,STRIKE,23/03/2026,0945,GBU12:2; GBU31:1,BRIDGE_A:IP_SOUTH,,מטוס 1`}
                </pre>

                <h4 style={{ margin: '15px 0 8px 0', fontSize: '14px', color: '#94a3b8' }}>דוגמה (Excel):</h4>
                <div style={{ background: '#1e293b', borderRadius: '6px', overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px', direction: 'ltr', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#334155' }}>
                        {['callSign','sq','alt','task','DATE','TAKEOFF TIME','weapons','targets','systems','shkadia'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', color: h === 'DATE' || h === 'TAKEOFF TIME' ? '#86efac' : '#60a5fa', borderBottom: '1px solid #475569', fontWeight: 'bold' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['BLUE01','69','FL350','CAP','23/03/2026','0630','AIM120:4; AIM9:2','TANGO1:IP_NORTH','LANTIRN; EW','מטוס 2'],
                        ['HAWK23','105','FL280','ESCORT','23/03/2026','0800','','','FLIR',''],
                        ['VIPER07','117','FL400','STRIKE','23/03/2026','0945','GBU12:2; GBU31:1','BRIDGE_A:IP_SOUTH','','מטוס 1'],
                      ].map((row, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#0f172a' : '#162032' }}>
                          {row.map((cell, j) => (
                            <td key={j} style={{ padding: '5px 10px', color: j === 4 || j === 5 ? '#86efac' : '#e2e8f0', borderBottom: '1px solid #1e293b' }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Crew Members Tab */}
          {activeTab === 'crew' && (
            <div>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '18px' }}>ניהול משתמשים</h2>
              
              {/* Crew Member Form */}
              <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#94a3b8' }}>
                  {editingCrewMember ? 'עריכת משתמש' : 'משתמש חדש'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="שם פרטי"
                      value={crewMemberForm.first_name}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, first_name: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '150px' }}
                    />
                    <input
                      type="text"
                      placeholder="שם משפחה"
                      value={crewMemberForm.last_name}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, last_name: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '150px' }}
                    />
                    <input
                      type="text"
                      placeholder="מ.א"
                      value={crewMemberForm.personal_id}
                      onChange={(e) => setCrewMemberForm(f => ({ ...f, personal_id: e.target.value }))}
                      style={{ padding: '10px 14px', borderRadius: '6px', border: 'none', background: '#334155', color: 'white', fontSize: '15px', width: '120px' }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={crewMemberForm.is_admin}
                        onChange={(e) => setCrewMemberForm(f => ({ ...f, is_admin: e.target.checked }))}
                        style={{ width: '18px', height: '18px' }}
                      />
                      מנהל מערכת
                    </label>
                  </div>
                  
                  {/* Approved Workstations Multi-Select */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', color: '#94a3b8', fontSize: '14px' }}>עמדות מאושרות:</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {presets.map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => toggleWorkstationApproval(preset.id)}
                          style={{
                            padding: '6px 12px',
                            background: crewMemberForm.approved_workstations.includes(preset.id) ? '#3b82f6' : '#334155',
                            color: 'white',
                            border: crewMemberForm.approved_workstations.includes(preset.id) ? '2px solid #60a5fa' : '1px solid #475569',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          {preset.name}
                        </button>
                      ))}
                      {presets.length === 0 && <span style={{ color: '#64748b', fontSize: '13px' }}>אין עמדות מוגדרות</span>}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={saveCrewMember}
                      disabled={!crewMemberForm.first_name.trim() || !crewMemberForm.last_name.trim()}
                      style={{ padding: '10px 25px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', opacity: (crewMemberForm.first_name.trim() && crewMemberForm.last_name.trim()) ? 1 : 0.5 }}
                    >
                      {editingCrewMember ? 'עדכון' : 'הוספה'}
                    </button>
                    {editingCrewMember && (
                      <button
                        onClick={() => { setEditingCrewMember(null); setCrewMemberForm({ first_name: '', last_name: '', personal_id: '', is_admin: false, approved_workstations: [] }); }}
                        style={{ padding: '10px 20px', background: '#475569', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
                      >
                        ביטול
                      </button>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Crew Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {crewMembers.map(member => (
                  <div key={member.id} style={{ background: '#0f172a', borderRadius: '8px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>{member.first_name} {member.last_name}</span>
                        {member.personal_id && <span style={{ fontSize: '12px', color: '#94a3b8' }}>מ.א: {member.personal_id}</span>}
                        {member.is_admin && (
                          <span style={{ fontSize: '12px', background: '#eab308', color: '#1e293b', padding: '2px 10px', borderRadius: '12px', fontWeight: 'bold' }}>מנהל</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => editCrewMember(member)} style={{ padding: '6px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>עריכה</button>
                        <button onClick={() => deleteCrewMember(member.id)} style={{ padding: '6px 15px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>מחיקה</button>
                      </div>
                    </div>
                    {member.approved_workstations && member.approved_workstations.length > 0 && (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        עמדות: {member.approved_workstations.map(wsId => {
                          const preset = presets.find(p => p.id === wsId);
                          return preset?.name || wsId;
                        }).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
                {crewMembers.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                    אין משתמשים מוגדרים. הוסף משתמש חדש למעלה.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Table Modes Tab */}
          {activeTab === 'table_modes' && <TableModesManager />}

        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<WorkstationSession | null>(getSession());
  const [page, setPage] = useState<'login' | 'dashboard' | 'management' | 'distribution'>('login');
  const [workstationPresets, setWorkstationPresets] = useState<any[]>([]);

  // Apply stored light/dark preference immediately on app load
  useEffect(() => {
    const stored = localStorage.getItem('bt-lightMode') === 'true';
    document.body.classList.toggle('light-mode', stored);
  }, []);

  // Load workstation presets so load-mode thresholds are available in SectorDashboard
  useEffect(() => {
    fetch(`${API_URL}/workstation-presets`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setWorkstationPresets(data))
      .catch(() => {});
  }, []);

  const handleLogin = (newSession: WorkstationSession) => {
    setSession(newSession);
    setPage('dashboard');
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setPage('login');
  };

  const handleCrewChange = (newCrewMember: CrewMember) => {
    if (session) {
      const updatedSession = { ...session, crewMember: newCrewMember };
      saveSession(updatedSession);
      setSession(updatedSession);
    }
  };

  if (page === 'management') {
    return <ManagementPage onBack={() => setPage('login')} />;
  }

  if (page === 'distribution') {
    return <StripDistribution onBack={() => setPage('login')} />;
  }

  if (!session || page === 'login') {
    return <WorkstationLogin onLogin={handleLogin} onManagement={() => setPage('management')} onDistribution={() => setPage('distribution')} />;
  }

  return <SectorDashboard session={session} onLogout={handleLogout} onCrewChange={handleCrewChange} workstationPresets={workstationPresets} />;
}