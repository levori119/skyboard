import React, { useState, useEffect, useCallback } from 'react';
import { AZMapBoard } from './AZMapBoard';
import { AZStatusPanel } from './AZStatusPanel';
import { AZStatusTable } from './AZStatusTable';
import { AZAdminPanel } from './AZAdminPanel';
import {
  AZAirport, AZMap, AZPolygon, AZPolygonStatus,
} from './types';

const AZ_API = '/api/az';

interface Props {
  lightMode?: boolean;
  onClose: () => void;
}

export function AeroZone({ lightMode, onClose }: Props) {
  const [tab, setTab] = useState<'map' | 'table' | 'admin'>('map');
  const [airports, setAirports] = useState<AZAirport[]>([]);
  const [selectedAirportId, setSelectedAirportId] = useState<number | null>(null);
  const [maps, setMaps] = useState<AZMap[]>([]);
  const [polygons, setPolygons] = useState<AZPolygon[]>([]);
  const [statusMap, setStatusMap] = useState<Record<number, AZPolygonStatus>>({});
  const [selectedPolygon, setSelectedPolygon] = useState<AZPolygon | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawingPendingCoords, setDrawingPendingCoords] = useState<[number, number][] | null>(null);
  const [loading, setLoading] = useState(false);

  const activeMap = maps.find(m => m.is_active && m.airport_id === selectedAirportId) || null;

  // Load airports on mount
  useEffect(() => {
    fetch(`${AZ_API}/airports`).then(r => r.json()).then(data => {
      setAirports(data);
      if (data.length > 0) setSelectedAirportId(data[0].id);
    }).catch(() => {});
  }, []);

  const loadMaps = useCallback(() => {
    fetch(`${AZ_API}/maps`).then(r => r.json()).then(setMaps).catch(() => {});
  }, []);

  const loadPolygons = useCallback(() => {
    if (!selectedAirportId) return;
    fetch(`${AZ_API}/airports/${selectedAirportId}/polygons`).then(r => r.json()).then((data: AZPolygon[]) => {
      setPolygons(data);
      // Load statuses for all polygons
      if (data.length > 0) {
        const ids = data.map(p => p.id).join(',');
        fetch(`${AZ_API}/polygons/statuses?ids=${ids}`).then(r => r.json()).then((statuses: AZPolygonStatus[]) => {
          const map: Record<number, AZPolygonStatus> = {};
          statuses.forEach(s => { map[s.polygon_id] = s; });
          setStatusMap(map);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, [selectedAirportId]);

  useEffect(() => { loadMaps(); }, [loadMaps]);
  useEffect(() => { loadPolygons(); }, [loadPolygons]);

  // Poll statuses every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (polygons.length > 0) {
        const ids = polygons.map(p => p.id).join(',');
        fetch(`${AZ_API}/polygons/statuses?ids=${ids}`).then(r => r.json()).then((statuses: AZPolygonStatus[]) => {
          const map: Record<number, AZPolygonStatus> = {};
          statuses.forEach(s => { map[s.polygon_id] = s; });
          setStatusMap(map);
        }).catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [polygons]);

  const handleSaveStatus = useCallback(async (polygonId: number, patch: Partial<AZPolygonStatus>) => {
    await fetch(`${AZ_API}/polygons/${polygonId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    // Optimistic update
    setStatusMap(prev => ({
      ...prev,
      [polygonId]: { ...(prev[polygonId] || { polygon_id: polygonId, grf: 'dry', visibility_category: 'good' }), ...patch, polygon_id: polygonId, updated_at: new Date().toISOString() } as AZPolygonStatus,
    }));
  }, []);

  const handlePolygonDrawn = useCallback((coords: [number, number][]) => {
    setDrawingPendingCoords(coords);
    setDrawMode(false);
    setTab('admin');
  }, []);

  const bg = lightMode ? '#f1f5f9' : '#0f172a';
  const border = lightMode ? '#e2e8f0' : '#1e3a5f';
  const textMain = lightMode ? '#0f172a' : '#f1f5f9';
  const textSub = lightMode ? '#64748b' : '#94a3b8';
  const topBg = lightMode ? '#1e40af' : '#0c1a3a';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: active ? 'bold' : 'normal',
    background: active ? '#1d4ed8' : 'transparent', color: active ? 'white' : 'rgba(255,255,255,0.65)',
    borderRadius: '6px', transition: 'background 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 8000, background: bg, display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      {/* Topbar */}
      <div style={{ background: topBg, borderBottom: `1px solid ${border}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px', height: '52px', flexShrink: 0 }}>
        <span style={{ fontSize: '20px' }}>✈</span>
        <span style={{ fontWeight: 'bold', fontSize: '16px', color: 'white', marginLeft: '4px' }}>AeroZone</span>
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: '12px' }}>ניהול קרקעי שדה תעופה</span>

        {/* Airport selector */}
        <select
          value={selectedAirportId || ''}
          onChange={e => { setSelectedAirportId(parseInt(e.target.value)); setSelectedPolygon(null); }}
          style={{ padding: '5px 10px', background: '#1e3a5f', border: '1px solid #2d4a7a', borderRadius: '6px', color: 'white', fontSize: '13px', cursor: 'pointer', minWidth: 120 }}>
          {airports.length === 0 && <option value="">אין שדות — הגדר בניהול</option>}
          {airports.map(ap => <option key={ap.id} value={ap.id}>{ap.name}{ap.icao_code ? ` (${ap.icao_code})` : ''}</option>)}
        </select>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
          <button style={tabStyle(tab === 'map')} onClick={() => { setTab('map'); setDrawMode(false); }}>🗺 מפה מבצעית</button>
          <button style={tabStyle(tab === 'table')} onClick={() => { setTab('table'); setDrawMode(false); }}>📋 טבלת סטטוסים</button>
          <button style={tabStyle(tab === 'admin')} onClick={() => { setTab('admin'); setDrawMode(false); }}>⚙ ניהול שדה</button>
        </div>

        {/* Draw toggle (map tab only) */}
        {tab === 'map' && (
          <button
            onClick={() => setDrawMode(v => !v)}
            style={{ padding: '6px 12px', background: drawMode ? '#7c3aed' : '#374151', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: drawMode ? 'bold' : 'normal', marginRight: 4 }}>
            {drawMode ? '✏ מצב ציור פעיל' : '✏ צייר אזור'}
          </button>
        )}

        {/* Active map indicator */}
        {activeMap && tab === 'map' && (
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginRight: 'auto' }}>📍 {activeMap.name}</span>
        )}

        {/* Close */}
        <button onClick={onClose} title="סגור AeroZone"
          style={{ marginRight: 'auto', padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          ✕ סגור
        </button>
      </div>

      {/* Status bar */}
      {tab === 'map' && (
        <div style={{ background: lightMode ? '#dbeafe' : '#0c1a3a', borderBottom: `1px solid ${border}`, padding: '4px 16px', display: 'flex', gap: '16px', alignItems: 'center', fontSize: '11px', color: textSub, flexShrink: 0 }}>
          {(() => {
            const counts = { operational: 0, partial: 0, closed: 0, maintenance: 0 };
            polygons.forEach(p => {
              const s = statusMap[p.id];
              counts[s?.operational || 'operational']++;
            });
            return (
              <>
                <span>✈ {polygons.length} אלמנטים</span>
                <span style={{ color: '#22c55e' }}>● שמיש: {counts.operational}</span>
                <span style={{ color: '#f59e0b' }}>● שמיש חלקי: {counts.partial}</span>
                <span style={{ color: '#ef4444' }}>● סגור: {counts.closed}</span>
                {counts.maintenance > 0 && <span style={{ color: '#f97316' }}>● שיפוצים: {counts.maintenance}</span>}
              </>
            );
          })()}
          <span style={{ marginRight: 'auto' }}>{new Date().toLocaleTimeString('he-IL')} UTC+3</span>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {tab === 'map' && (
          <>
            <AZMapBoard
              activeMap={activeMap}
              polygons={polygons.filter(p => p.airport_id === selectedAirportId)}
              statusMap={statusMap}
              selectedPolygon={selectedPolygon}
              onSelectPolygon={p => { setSelectedPolygon(p); }}
              onPolygonDrawn={handlePolygonDrawn}
              drawMode={drawMode}
              lightMode={lightMode}
            />
            {selectedPolygon && (
              <AZStatusPanel
                polygon={selectedPolygon}
                status={statusMap[selectedPolygon.id] || null}
                onSave={handleSaveStatus}
                onClose={() => setSelectedPolygon(null)}
                lightMode={lightMode}
              />
            )}
          </>
        )}

        {tab === 'table' && (
          <AZStatusTable
            polygons={polygons.filter(p => p.airport_id === selectedAirportId)}
            statusMap={statusMap}
            onSelect={p => { setSelectedPolygon(p); setTab('map'); }}
            selectedId={selectedPolygon?.id || null}
            lightMode={lightMode}
          />
        )}

        {tab === 'admin' && (
          <AZAdminPanel
            airports={airports}
            maps={maps}
            polygons={polygons}
            selectedAirportId={selectedAirportId}
            onSelectAirport={id => { setSelectedAirportId(id); setSelectedPolygon(null); }}
            onRefreshAirports={() => fetch(`${AZ_API}/airports`).then(r => r.json()).then(setAirports).catch(() => {})}
            onRefreshMaps={loadMaps}
            onRefreshPolygons={loadPolygons}
            onStartDrawPolygon={() => { setTab('map'); setDrawMode(true); }}
            drawingPendingCoords={drawingPendingCoords}
            onClearDrawingPending={() => setDrawingPendingCoords(null)}
            lightMode={lightMode}
          />
        )}
      </div>
    </div>
  );
}
