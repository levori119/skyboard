import React, { useState, useRef } from 'react';
import { AZAirport, AZMap, AZPolygon, AirportType, PolygonType, POLYGON_TYPE_LABELS } from './types';

const AZ_API = '/api/az';

interface Props {
  airports: AZAirport[];
  maps: AZMap[];
  polygons: AZPolygon[];
  selectedAirportId: number | null;
  onSelectAirport: (id: number) => void;
  onRefreshAirports: () => void;
  onRefreshMaps: () => void;
  onRefreshPolygons: () => void;
  onStartDrawPolygon: () => void;
  drawingPendingCoords: [number, number][] | null;
  onClearDrawingPending: () => void;
  lightMode?: boolean;
}

const inputStyle = (lightMode?: boolean): React.CSSProperties => ({
  width: '100%', padding: '7px 10px', boxSizing: 'border-box',
  background: lightMode ? '#f8fafc' : '#0f172a',
  border: `1px solid ${lightMode ? '#e2e8f0' : '#334155'}`,
  borderRadius: '6px', color: lightMode ? '#0f172a' : '#f1f5f9', fontSize: '13px',
});

const btnPrimary: React.CSSProperties = {
  padding: '7px 14px', background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold',
};

export function AZAdminPanel({ airports, maps, polygons, selectedAirportId, onSelectAirport, onRefreshAirports, onRefreshMaps, onRefreshPolygons, onStartDrawPolygon, drawingPendingCoords, onClearDrawingPending, lightMode }: Props) {
  const [activeTab, setActiveTab] = useState<'airports' | 'maps' | 'polygons'>('airports');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Airport form
  const [apName, setApName] = useState('');
  const [apIcao, setApIcao] = useState('');
  const [apType, setApType] = useState<AirportType>('military');

  // Map form
  const [mapName, setMapName] = useState('');
  const [mapFile, setMapFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Polygon form (filled when coords are ready)
  const [polyName, setPolyName] = useState('');
  const [polyType, setPolyType] = useState<PolygonType>('runway');
  const [polyColor, setPolyColor] = useState('#3b82f6');
  const [polyNote, setPolyNote] = useState('');
  const [polyParentId, setPolyParentId] = useState<string>('');
  const [selectedMapId, setSelectedMapId] = useState<string>('');

  const bg = lightMode ? '#ffffff' : '#1e293b';
  const border = lightMode ? '#e2e8f0' : '#334155';
  const textMain = lightMode ? '#0f172a' : '#f1f5f9';
  const textSub = lightMode ? '#64748b' : '#94a3b8';
  const tabActiveBg = lightMode ? '#dbeafe' : '#1e3a5f';
  const tabActiveColor = lightMode ? '#1d4ed8' : '#60a5fa';

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const createAirport = async () => {
    if (!apName.trim()) return;
    setSaving(true);
    await fetch(`${AZ_API}/airports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: apName, icao_code: apIcao, type: apType }) });
    setApName(''); setApIcao(''); setSaving(false);
    onRefreshAirports(); showMsg('שדה תעופה נוצר');
  };

  const uploadMap = async () => {
    if (!mapName.trim() || !selectedAirportId) return;
    setSaving(true);
    try {
      let fileName = '';
      if (mapFile) {
        const reader = new FileReader();
        const b64: string = await new Promise(res => { reader.onload = () => res(reader.result as string); reader.readAsDataURL(mapFile); });
        const ext = mapFile.name.split('.').pop() || 'png';
        const resp = await fetch(`${AZ_API}/maps/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airport_id: selectedAirportId, name: mapName, image_data: b64, ext }) });
        const data = await resp.json();
        fileName = data.file_name;
      } else {
        await fetch(`${AZ_API}/maps`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airport_id: selectedAirportId, name: mapName }) });
      }
      setMapName(''); setMapFile(null); if (fileRef.current) fileRef.current.value = '';
      onRefreshMaps(); showMsg('מפה נוספה');
    } finally { setSaving(false); }
  };

  const setMapActive = async (mapId: number) => {
    await fetch(`${AZ_API}/maps/${mapId}/activate`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airport_id: selectedAirportId }) });
    onRefreshMaps(); showMsg('מפה הוגדרה כפעילה');
  };

  const deletePolygon = async (id: number) => {
    if (!confirm('למחוק פוליגון זה?')) return;
    await fetch(`${AZ_API}/polygons/${id}`, { method: 'DELETE' });
    onRefreshPolygons();
  };

  const savePolygon = async () => {
    if (!polyName.trim() || !selectedAirportId || !drawingPendingCoords) return;
    setSaving(true);
    await fetch(`${AZ_API}/polygons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      airport_id: selectedAirportId,
      map_id: selectedMapId ? parseInt(selectedMapId) : null,
      parent_id: polyParentId ? parseInt(polyParentId) : null,
      name: polyName, type: polyType, color: polyColor, note: polyNote,
      coordinates: drawingPendingCoords,
    }) });
    setPolyName(''); setPolyNote(''); setPolyParentId('');
    onClearDrawingPending(); onRefreshPolygons(); setSaving(false); showMsg('פוליגון נשמר');
  };

  const airportMaps = maps.filter(m => m.airport_id === selectedAirportId);
  const airportPolygons = polygons.filter(p => p.airport_id === selectedAirportId);
  const topLevelPolygons = airportPolygons.filter(p => !p.parent_id);

  return (
    <div style={{ width: '100%', height: '100%', background: bg, direction: 'rtl', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, padding: '8px 12px 0', gap: '4px' }}>
        {([['airports', '✈ שדות תעופה'], ['maps', '🗺 מפות'], ['polygons', '🔶 אלמנטים']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '7px 14px', background: activeTab === tab ? tabActiveBg : 'transparent', color: activeTab === tab ? tabActiveColor : textSub, border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab ? 'bold' : 'normal' }}>
            {label}
          </button>
        ))}
        {msg && <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: '12px', color: '#22c55e' }}>✓ {msg}</span>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* === AIRPORTS TAB === */}
        {activeTab === 'airports' && (
          <div>
            <h4 style={{ margin: '0 0 12px 0', color: textMain, fontSize: '14px' }}>הוסף שדה תעופה חדש</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <input placeholder="שם השדה *" value={apName} onChange={e => setApName(e.target.value)} style={inputStyle(lightMode)} />
              <input placeholder="קוד ICAO (לדוגמה: LLBG)" value={apIcao} onChange={e => setApIcao(e.target.value.toUpperCase())} style={{ ...inputStyle(lightMode), direction: 'ltr' }} maxLength={4} />
              <select value={apType} onChange={e => setApType(e.target.value as AirportType)} style={inputStyle(lightMode)}>
                <option value="military">צבאי</option>
                <option value="civil">אזרחי</option>
                <option value="mixed">משולב</option>
              </select>
              <button onClick={createAirport} disabled={saving} style={btnPrimary}>+ צור שדה תעופה</button>
            </div>

            <h4 style={{ margin: '0 0 10px 0', color: textMain, fontSize: '14px' }}>שדות קיימים</h4>
            {airports.length === 0 && <div style={{ color: textSub, fontSize: '13px' }}>אין שדות מוגדרים</div>}
            {airports.map(ap => (
              <div key={ap.id} onClick={() => onSelectAirport(ap.id)}
                style={{ padding: '10px 12px', marginBottom: '6px', background: selectedAirportId === ap.id ? tabActiveBg : (lightMode ? '#f8fafc' : '#0f172a'), border: `1px solid ${selectedAirportId === ap.id ? tabActiveColor : border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: textMain, fontSize: '14px' }}>{ap.name}</div>
                  <div style={{ fontSize: '11px', color: textSub }}>{ap.icao_code || '—'} · {ap.type === 'military' ? 'צבאי' : ap.type === 'civil' ? 'אזרחי' : 'משולב'}</div>
                </div>
                {selectedAirportId === ap.id && <span style={{ marginRight: 'auto', color: tabActiveColor, fontSize: '12px', fontWeight: 'bold' }}>✓ נבחר</span>}
              </div>
            ))}
          </div>
        )}

        {/* === MAPS TAB === */}
        {activeTab === 'maps' && (
          <div>
            {!selectedAirportId && <div style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '12px' }}>⚠ בחר שדה תעופה תחילה</div>}
            <h4 style={{ margin: '0 0 12px 0', color: textMain, fontSize: '14px' }}>העלה מפה חדשה</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              <input placeholder="שם המפה *" value={mapName} onChange={e => setMapName(e.target.value)} style={inputStyle(lightMode)} />
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: textSub, marginBottom: '4px' }}>קובץ תמונה (PNG/JPG/SVG):</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={e => setMapFile(e.target.files?.[0] || null)}
                  style={{ ...inputStyle(lightMode), cursor: 'pointer' }} />
              </div>
              <button onClick={uploadMap} disabled={saving || !selectedAirportId} style={{ ...btnPrimary, opacity: !selectedAirportId ? 0.5 : 1 }}>+ הוסף מפה</button>
            </div>

            <h4 style={{ margin: '0 0 10px 0', color: textMain, fontSize: '14px' }}>מפות קיימות</h4>
            {airportMaps.length === 0 && <div style={{ color: textSub, fontSize: '13px' }}>אין מפות מוגדרות לשדה זה</div>}
            {airportMaps.map(m => (
              <div key={m.id} style={{ padding: '10px 12px', marginBottom: '6px', background: m.is_active ? tabActiveBg : (lightMode ? '#f8fafc' : '#0f172a'), border: `1px solid ${m.is_active ? tabActiveColor : border}`, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', color: textMain, fontSize: '13px' }}>{m.name}</div>
                  {m.file_name && <div style={{ fontSize: '10px', color: textSub, direction: 'ltr', textAlign: 'left' }}>{m.file_name}</div>}
                </div>
                {m.is_active ? <span style={{ color: tabActiveColor, fontWeight: 'bold', fontSize: '12px' }}>✓ פעיל</span>
                  : <button onClick={() => setMapActive(m.id)} style={{ ...btnPrimary, padding: '4px 10px', fontSize: '11px' }}>הגדר כפעיל</button>}
              </div>
            ))}
          </div>
        )}

        {/* === POLYGONS TAB === */}
        {activeTab === 'polygons' && (
          <div>
            {!selectedAirportId && <div style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '12px' }}>⚠ בחר שדה תעופה תחילה</div>}

            {/* Draw button or pending form */}
            {drawingPendingCoords ? (
              <div style={{ background: lightMode ? '#eff6ff' : '#1e3a5f', border: `1px solid ${tabActiveColor}`, borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ color: tabActiveColor, fontWeight: 'bold', fontSize: '13px', marginBottom: '10px' }}>✏ פוליגון חדש — {drawingPendingCoords.length} נקודות</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input placeholder="שם האלמנט *" value={polyName} onChange={e => setPolyName(e.target.value)} style={inputStyle(lightMode)} />
                  <select value={polyType} onChange={e => setPolyType(e.target.value as PolygonType)} style={inputStyle(lightMode)}>
                    {Object.entries(POLYGON_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', color: textSub }}>צבע:</label>
                    <input type="color" value={polyColor} onChange={e => setPolyColor(e.target.value)} style={{ width: 40, height: 32, padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                    <div style={{ width: 24, height: 24, borderRadius: '4px', background: polyColor }} />
                  </div>
                  <select value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)} style={inputStyle(lightMode)}>
                    <option value="">ללא מפה ספציפית</option>
                    {airportMaps.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                  </select>
                  <select value={polyParentId} onChange={e => setPolyParentId(e.target.value)} style={inputStyle(lightMode)}>
                    <option value="">ללא אב (פוליגון ראשי)</option>
                    {topLevelPolygons.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                  </select>
                  <input placeholder="הערה" value={polyNote} onChange={e => setPolyNote(e.target.value)} style={inputStyle(lightMode)} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={savePolygon} disabled={saving || !polyName.trim()} style={{ ...btnPrimary, flex: 1 }}>💾 שמור פוליגון</button>
                    <button onClick={onClearDrawingPending} style={{ padding: '7px 12px', background: '#374151', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>ביטול</button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={onStartDrawPolygon} disabled={!selectedAirportId}
                style={{ ...btnPrimary, width: '100%', marginBottom: '16px', padding: '10px', background: selectedAirportId ? '#7c3aed' : '#374151', opacity: !selectedAirportId ? 0.5 : 1 }}>
                ✏ צייר פוליגון חדש על המפה
              </button>
            )}

            {/* Polygon list */}
            <h4 style={{ margin: '0 0 8px 0', color: textMain, fontSize: '14px' }}>אלמנטים מוגדרים</h4>
            {airportPolygons.length === 0 && <div style={{ color: textSub, fontSize: '13px' }}>אין אלמנטים מוגדרים לשדה זה</div>}
            {airportPolygons.map(p => (
              <div key={p.id} style={{ padding: '8px 12px', marginBottom: '4px', background: lightMode ? '#f8fafc' : '#0f172a', border: `1px solid ${border}`, borderRadius: '7px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 12, height: 12, borderRadius: '3px', background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', color: textMain, fontSize: '12px' }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: textSub }}>{POLYGON_TYPE_LABELS[p.type]}{p.parent_id ? ' (תת-אלמנט)' : ''} · {p.coordinates?.length || 0} נקודות</div>
                </div>
                <button onClick={() => deletePolygon(p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' }}>🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
