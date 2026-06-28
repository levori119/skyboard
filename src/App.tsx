import React, { useState, useEffect } from 'react';
import { VirtualKeyboardProvider } from './VirtualKeyboard';
import type { CrewMember, WorkstationSession } from './types';
import { getSession, saveSession, clearSession } from './utils/session';
import { API_URL, SCREEN_SCALE_MAP } from './config';
import { APP_VERSION, APP_VERSION_DATE } from './version';
import ConfirmModal, { customConfirm } from './components/shared/ConfirmModal';
import LearnDigitsOverlay from './components/shared/LearnDigitsOverlay';
import MapsManager from './components/map/MapsManager';
import ManagementPage from './components/admin/ManagementPage';
import SectorDashboard from './components/views/SectorDashboard';
import { DebriefingTab } from './components/admin/managers';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

// ─── Aircraft Icon System ─────────────────────────────────────────────────────
// AircraftIconType + icon helpers imported from ./utils/aircraft

// --- דיאלוג אישור מותאם (במקום confirm()) ---
// ConfirmModal + customConfirm imported from ./components/shared/ConfirmModal

// --- ניהול סשן עמדה ---
// CrewMember, WorkstationSession imported from ./types

// --- Query Builder Types & Logic ---
// QOperator, QCompare, QLeaf, QGroup, QNode imported from ./types

// Query Builder helpers (qGenId, clampMenuPos, emptyQGroup, hasConditions, Q_FIELDS,
// Q_TEXT_OPS, Q_BOOL_OPS, Q_OPERATOR_LABELS, getQFieldValue, evalQLeaf, evaluateQuery)
// imported from ./utils/queryBuilder
// Session helpers (getSession, saveSession, clearSession) imported from ./utils/session

// --- רכיב כניסה לעמדה ---
const WorkstationLogin = ({ onLogin, onManagement }: { onLogin: (session: WorkstationSession) => void; onManagement?: (cm: CrewMember, mode: 'admin' | 'team_lead') => void }) => {
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWorkstationSelect, setShowWorkstationSelect] = useState(false);
  const [workstationPresets, setWorkstationPresets] = useState<any[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [selectedCrewMember, setSelectedCrewMember] = useState<CrewMember | null>(null);
  const [crewSearchQuery, setCrewSearchQuery] = useState('');
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const [showHandwritingCalibration, setShowHandwritingCalibration] = useState(false);
  const [showLoginDebrief, setShowLoginDebrief] = useState(false);
  const [pendingLoginPreset, setPendingLoginPreset] = useState<any>(null);
  const [roleForm, setRoleForm] = useState({ kshp: '', mefale: '', achori: '' });
  const [roleFormLoading, setRoleFormLoading] = useState(false);
  const [screenSize, setScreenSize] = useState<string>(() => localStorage.getItem('bt-screenSize') || '');

  // Force dark mode on login screen regardless of user preference
  useEffect(() => {
    const wasLight = document.body.classList.contains('light-mode');
    document.body.classList.remove('light-mode');
    return () => {
      if (wasLight) document.body.classList.add('light-mode');
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sectorsRes, presetsRes, crewRes] = await Promise.all([
          fetch(`${API_URL}/sectors`, { cache: 'no-store' }),
          fetch(`${API_URL}/workstation-presets`, { cache: 'no-store' }),
          fetch(`${API_URL}/crew-members`, { cache: 'no-store' })
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
      // For non-classic presets: also merge sectors from transfer/receive points so the
      // map-mode neighbor panel shows them.  Classic presets must NOT get this expansion
      // because they rely on relevantSectors being empty to use the correct loadData branch.
      const isClassicPreset = preset.preset_type === 'classic' || preset.display_mode === 'classic';
      let allRelevantIds: number[] = relevantSectorIds;
      if (!isClassicPreset) {
        const transferPtIds = (preset.classic_transfer_points || []).map((p: any) => Number(p.sector_id)).filter(Boolean);
        const receivePtIds = (preset.classic_receive_points || []).map((p: any) => Number(p.sector_id)).filter(Boolean);
        allRelevantIds = [...new Set([...relevantSectorIds, ...transferPtIds, ...receivePtIds])];
      }
      const relevantSectorsList = sectors.filter(s => allRelevantIds.includes(s.id));
      
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
        fetch(`${API_URL}/activity-log`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'workstation_login', severity: 'normal',
            workstation_preset_id: preset.id, workstation_name: preset.name,
            crew_member_id: selectedCrewMember?.id ?? null,
            crew_member_name: selectedCrewMember?.name ?? null,
            details: { role: selectedCrewMember?.is_admin ? 'admin' : selectedCrewMember?.is_team_lead ? 'team_lead' : 'operator' }
          })
        }).catch(() => {});
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
      <div style={{ 
        background: 'white', 
        color: '#1e293b',
        padding: '40px', 
        borderRadius: '16px', 
        minWidth: '450px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          {/* Animated radar + orbiting airplane logo */}
          <svg width="88" height="88" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="lglow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <radialGradient id="lradar" cx="36" cy="36" r="26" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.8"/>
                <stop offset="100%" stopColor="#0f172a" stopOpacity="0"/>
              </radialGradient>
            </defs>
            {/* Background */}
            <rect width="72" height="72" rx="18" fill="#0f172a"/>
            {/* Subtle radial glow from center */}
            <circle cx="36" cy="36" r="36" fill="url(#lradar)"/>
            {/* Grid lines */}
            <line x1="8"  y1="24" x2="64" y2="24" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            <line x1="8"  y1="36" x2="64" y2="36" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            <line x1="8"  y1="48" x2="64" y2="48" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            <line x1="24" y1="8"  x2="24" y2="64" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            <line x1="36" y1="8"  x2="36" y2="64" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            <line x1="48" y1="8"  x2="48" y2="64" stroke="#1d4ed8" strokeWidth="0.7" opacity="0.3"/>
            {/* Radar rings */}
            <circle cx="36" cy="36" r="26" stroke="#1e40af" strokeWidth="1"   fill="none" opacity="0.7"/>
            <circle cx="36" cy="36" r="17" stroke="#1e40af" strokeWidth="0.7" fill="none" opacity="0.45"/>
            <circle cx="36" cy="36" r="9"  stroke="#1e40af" strokeWidth="0.5" fill="none" opacity="0.3"/>
            {/* Center crosshair */}
            <line x1="34" y1="36" x2="38" y2="36" stroke="#3b82f6" strokeWidth="1" opacity="0.8"/>
            <line x1="36" y1="34" x2="36" y2="38" stroke="#3b82f6" strokeWidth="1" opacity="0.8"/>
            <circle cx="36" cy="36" r="1.5" fill="#3b82f6"/>
            {/* Radar sweep */}
            <g>
              <animateTransform attributeName="transform" type="rotate" from="0 36 36" to="360 36 36" dur="4s" repeatCount="indefinite"/>
              <line x1="36" y1="36" x2="62" y2="36" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.9"/>
              {/* Afterglow arc */}
              <path d="M 62,36 A 26,26 0 0 0 36,10" stroke="#3b82f6" strokeWidth="6" opacity="0.13" fill="none" strokeLinecap="round"/>
            </g>
            {/* Radar blip — appears just after sweep passes a point */}
            <circle cx="56" cy="18" r="2.5" fill="#60a5fa" filter="url(#lglow)">
              <animate attributeName="opacity" values="0;0;1;0.9;0.4;0" keyTimes="0;0.17;0.23;0.45;0.52;1" dur="4s" begin="0.9s" repeatCount="indefinite"/>
              <animate attributeName="r"       values="1;1;3;2.5;1.5;1" keyTimes="0;0.17;0.23;0.45;0.52;1" dur="4s" begin="0.9s" repeatCount="indefinite"/>
            </circle>
            {/* Second blip at different position */}
            <circle cx="24" cy="55" r="2" fill="#34d399" filter="url(#lglow)">
              <animate attributeName="opacity" values="0;0;1;0.8;0;0" keyTimes="0;0.55;0.6;0.75;0.8;1" dur="4s" begin="0.9s" repeatCount="indefinite"/>
            </circle>
            {/* Orbit path (invisible) */}
            <path id="loginOrbitPath" d="M 62,36 A 26,26 0 1,1 61.99,35.98" fill="none"/>
            {/* Fighter jet flying along the orbit */}
            <g filter="url(#lglow)">
              <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
                <mpath href="#loginOrbitPath"/>
              </animateMotion>
              {/* Fuselage — sharp pointed dart */}
              <polygon points="10,0  5,1.3  -9,2  -9,-2  5,-1.3" fill="white"/>
              {/* Delta wings — large swept triangles */}
              <polygon points="3,1.3  -7,11  -9,2" fill="#93c5fd"/>
              <polygon points="3,-1.3  -7,-11  -9,-2" fill="#93c5fd"/>
              {/* Twin tail fins */}
              <polygon points="-8,2  -11,5  -9.5,2" fill="#bfdbfe"/>
              <polygon points="-8,-2  -11,-5  -9.5,-2" fill="#bfdbfe"/>
              {/* Cockpit glint */}
              <circle cx="6.5" cy="0" r="1.3" fill="#dbeafe" opacity="0.8"/>
            </g>
          </svg>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '3px', fontFamily: 'monospace' }}>SKY KING</div>
            <div style={{ fontSize: '13px', color: '#64748b', letterSpacing: '1px', marginTop: '2px' }}>לוח שמיים</div>
          </div>
        </div>
        <p style={{ margin: '0 0 20px', color: '#64748b', textAlign: 'center' }}>מערכת ניהול אווירי טקטי</p>
        
        {!selectedCrewMember ? (
          <>
            <p style={{ margin: '0 0 15px', color: '#334155', textAlign: 'center', fontWeight: 'bold' }}>בחר איש צוות:</p>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={crewMembers.length > 0 ? `חפש מתוך ${crewMembers.length} אנשי צוות...` : 'טוען אנשי צוות...'}
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
                  direction: 'rtl',
                  background: 'white',
                  color: '#1e293b',
                  colorScheme: 'light'
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
                        {!cm.is_admin && cm.is_team_lead && <span style={{ fontSize: '11px', background: '#06b6d4', color: '#0c4a6e', padding: '2px 8px', borderRadius: '12px' }}>ראש צוות</span>}
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
              
              
              {(selectedCrewMember.is_admin || selectedCrewMember.is_team_lead) && onManagement && (
                <button
                  onClick={() => onManagement(selectedCrewMember, 'team_lead')}
                  style={{ padding: '20px', background: 'linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(6, 182, 212, 0.4)' }}
                >
                  <span style={{ fontSize: '24px' }}>⚙️</span>
                  ניהול עמדות
                </button>
              )}
              {selectedCrewMember.is_admin && onManagement && (
                <button
                  onClick={() => onManagement(selectedCrewMember, 'admin')}
                  style={{ padding: '20px', background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)' }}
                >
                  <span style={{ fontSize: '24px' }}>🛡️</span>
                  ניהול מערכת
                </button>
              )}
              {(selectedCrewMember.is_admin || selectedCrewMember.is_team_lead) && (
                <button
                  onClick={() => setShowLoginDebrief(true)}
                  style={{ padding: '20px', background: 'linear-gradient(135deg, #431407 0%, #7c2d12 100%)', color: '#fdba74', border: '1px solid #f97316', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 4px 15px rgba(249, 115, 22, 0.3)' }}
                >
                  <span style={{ fontSize: '24px' }}>📋</span>
                  תחקיר
                </button>
              )}
            </div>
          </>
        )}
        
        {error && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: '15px' }}>{error}</p>}

        {/* Screen size selector */}
        <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: '0 0 10px', color: '#475569', textAlign: 'center', fontSize: '13px', fontWeight: 'bold' }}>🖥️ גודל מסך (אינץ׳):</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {[{ label: '15.6"', value: '15.6' }, { label: '16"', value: '16' }, { label: '18"', value: '18' }, { label: '24"', value: '24' }].map(opt => {
              const isSelected = screenSize === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const sv = SCREEN_SCALE_MAP[opt.value] || 1;
                    localStorage.setItem('bt-screenSize', opt.value);
                    document.documentElement.style.setProperty('--s', String(sv));
                    document.documentElement.setAttribute('data-screen', opt.value.replace('.6', ''));
                    setScreenSize(opt.value);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    background: isSelected ? 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)' : '#f1f5f9',
                    color: isSelected ? 'white' : '#475569',
                    border: `2px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 2px 8px rgba(59,130,246,0.4)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {!screenSize && (
            <p style={{ margin: '8px 0 0', color: '#f97316', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>⚠ נא לבחור גודל מסך לפני הכניסה</p>
          )}
          {screenSize && (
            <p style={{ margin: '8px 0 0', color: '#64748b', textAlign: 'center', fontSize: '11px' }}>✓ נבחר: {screenSize}"</p>
          )}
        </div>
      </div>

      {/* מספר גרסה + תאריך ושעה של הגרסה — מוצג בעליית המערכת */}
      <div style={{
        position: 'absolute', bottom: '16px', left: 0, right: 0,
        textAlign: 'center', color: '#64748b', fontSize: '12px', letterSpacing: '0.5px',
        fontFamily: 'monospace', direction: 'ltr', pointerEvents: 'none'
      }}>
        <span style={{ color: '#94a3b8', fontWeight: 700 }}>v{APP_VERSION}</span>
        <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
        <span>{APP_VERSION_DATE}</span>
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
                      if (!preset) return;
                      setRoleFormLoading(true);
                      fetch(`${API_URL}/workstation-session-roles?preset_id=${preset.id}`)
                        .then(r => r.ok ? r.json() : { kshp: '', mefale: '', achori: '' })
                        .then(d => { setRoleForm({ kshp: d.kshp || '', mefale: d.mefale || '', achori: d.achori || '' }); })
                        .catch(() => {})
                        .finally(() => setRoleFormLoading(false));
                      setPendingLoginPreset(preset);
                    }}
                    defaultValue=""
                    style={{
                      width: '100%',
                      padding: '15px',
                      border: '2px solid #2563eb',
                      borderRadius: '8px',
                      fontSize: '16px',
                      background: 'white',
                      color: '#0f172a',
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
            
          </div>
        </div>
      )}
      
      {/* Role Entry Modal — shown after preset selection, before completing login */}
      {pendingLoginPreset && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
          <div style={{ background: '#1e293b', border: '2px solid #2563eb', borderRadius: '14px', padding: '28px 32px', minWidth: '340px', maxWidth: '420px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>✈️ כניסה לעמדה: {pendingLoginPreset.name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>מלא/י את אנשי הצוות הרלוונטיים לסשן זה (לא חובה)</div>
            </div>
            {[
              { key: 'kshp', label: 'קש"פ', icon: '📻', placeholder: 'שם / אות קריאה' },
              { key: 'mefale', label: 'מפעיל', icon: '🎯', placeholder: 'שם / אות קריאה' },
              { key: 'achori', label: 'אחורי', icon: '🔁', placeholder: 'שם / אות קריאה' },
            ].map(({ key, label, icon, placeholder }) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '5px' }}>{icon} {label}</label>
                <input
                  type="text"
                  value={(roleForm as any)[key]}
                  onChange={e => setRoleForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1px solid #334155', background: '#0f172a', color: 'white', fontSize: '14px', direction: 'rtl', boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter') (document.getElementById('roleFormSubmit') as HTMLButtonElement)?.click(); }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                id="roleFormSubmit"
                disabled={roleFormLoading}
                onClick={async () => {
                  const preset = pendingLoginPreset;
                  setRoleFormLoading(true);
                  try {
                    await fetch(`${API_URL}/workstation-session-roles/${preset.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(roleForm)
                    });
                  } catch {}
                  setRoleFormLoading(false);
                  setPendingLoginPreset(null);
                  handlePresetLogin(preset);
                }}
                style={{ flex: 1, padding: '11px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {roleFormLoading ? '...' : '✅ כניסה לעמדה'}
              </button>
              <button
                onClick={() => { const preset = pendingLoginPreset; setPendingLoginPreset(null); handlePresetLogin(preset); }}
                style={{ padding: '11px 18px', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
              >
                דלג
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

      {/* Debriefing full-screen overlay — admin / team-lead only */}
      {showLoginDebrief && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>
          {/* Header */}
          <div style={{ background: '#1e293b', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '3px solid #f97316', flexShrink: 0 }}>
            <span style={{ fontSize: '20px' }}>📋</span>
            <span style={{ color: '#fdba74', fontWeight: 700, fontSize: '17px', flex: 1 }}>תחקיר — יומן פעילות</span>
            <button
              onClick={() => setShowLoginDebrief(false)}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white', padding: '6px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
            >✕ סגור</button>
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <DebriefingTab lightMode={true} initialUndoDurationMs={selectedCrewMember?.undo_duration_ms ?? null} />
          </div>
        </div>
      )}
    </div>
  );
};

// --- מערכת למידת ספרות (עם DB) ---

// Digit API helpers (getLearnedDigits, saveLearnedDigit, clearLearnedDigits, getDigitsCount)
// imported from ./utils/digits
// compareImages imported from ./utils/handwriting

// --- עורך אזורי מפה ---
// ZONE_COLORS + MapZoneEditor imported from ./components/map/MapZoneEditor

// --- ניהול מפות ---
// MapsManager imported from ./components/map/MapsManager
// LearnDigitsOverlay imported from ./components/shared/LearnDigitsOverlay
export default function App() {
  const [session, setSession] = useState<WorkstationSession | null>(getSession());
  const [page, setPage] = useState<'login' | 'dashboard' | 'management'>('login');
  const [managementCrewMember, setManagementCrewMember] = useState<CrewMember | null>(null);
  const [managementMode, setManagementMode] = useState<'admin' | 'team_lead'>('admin');
  const [workstationPresets, setWorkstationPresets] = useState<any[]>([]);

  // Apply stored theme preference immediately on app load
  useEffect(() => {
    const t = localStorage.getItem('bt-themeMode');
    const isLight = t === 'light' || (!t && localStorage.getItem('bt-lightMode') === 'true');
    const isOcean = t === 'ocean';
    document.body.classList.toggle('light-mode', isLight);
    document.body.classList.toggle('ocean-mode', isOcean);
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
    if (session) {
      fetch(`${API_URL}/activity-log`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'workstation_logout', severity: 'normal',
          workstation_preset_id: session.presetId ?? null,
          workstation_name: session.workstationName ?? null,
          crew_member_id: session.crewMember?.id ?? null,
          crew_member_name: session.crewMember?.name ?? null,
          details: {}
        })
      }).catch(() => {});
    }
    clearSession();
    setSession(null);
    setPage('login');
    document.body.classList.remove('light-mode');
    localStorage.removeItem('bt-lightMode');
  };

  const handleCrewChange = (newCrewMember: CrewMember) => {
    if (session) {
      fetch(`${API_URL}/activity-log`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'crew_swap', severity: 'normal',
          workstation_preset_id: session.presetId ?? null,
          workstation_name: session.workstationName ?? null,
          crew_member_id: newCrewMember.id,
          crew_member_name: newCrewMember.name,
          details: {
            prevCrewMemberId: session.crewMember?.id ?? null,
            prevCrewMemberName: session.crewMember?.name ?? null,
            newRole: newCrewMember.is_admin ? 'admin' : newCrewMember.is_team_lead ? 'team_lead' : 'operator'
          }
        })
      }).catch(() => {});
      const updatedSession = { ...session, crewMember: newCrewMember };
      saveSession(updatedSession);
      setSession(updatedSession);
    }
  };

  if (page === 'management') {
    return <><ConfirmModal /><ManagementPage onBack={() => setPage('login')} crewMember={managementCrewMember} mode={managementMode} /></>;
  }

  if (!session || page === 'login') {
    return <><ConfirmModal /><WorkstationLogin onLogin={handleLogin} onManagement={(cm, mode) => { setManagementCrewMember(cm); setManagementMode(mode); setPage('management'); }} /></>;
  }

  return <><ConfirmModal /><VirtualKeyboardProvider><SectorDashboard session={session} onLogout={handleLogout} onCrewChange={handleCrewChange} workstationPresets={workstationPresets} /></VirtualKeyboardProvider></>;
}