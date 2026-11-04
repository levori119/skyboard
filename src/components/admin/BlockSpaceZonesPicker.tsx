/**
 * **מיקום מרחב בלוקים על המפה** - בעריכת מרחב בניהול. בוחרים מפה מעוגנת
 * ואזור אחד או יותר שכבר מוגדרים עליה; מרכז האזורים הוא מרכז המרחב, וממנו
 * מחושב המרחב הקרוב למטרה בעמדה (shared/blockSpaceGeo.js).
 *
 * קישור לאזורים קיימים ולא ציור חדש: אזור שזז מעדכן את המרחב, ואין גאומטריה כפולה.
 */
import { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';

interface Props {
  mapId: number | null;
  zoneIds: number[];
  onChange: (mapId: number | null, zoneIds: number[]) => void;
}

const anchored = (m: any) => m?.anchor1_lat != null && m?.anchor2_lat != null;

export default function BlockSpaceZonesPicker({ mapId, zoneIds, onChange }: Props) {
  const [maps, setMaps] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/maps`).then(r => r.ok ? r.json() : []).then(rows => {
      const all = Array.isArray(rows) ? rows : [];
      const byId = new Map(all.map((m: any) => [Number(m.id), m]));
      // מפה מעוגנת, או תת-מפה שיורשת עוגן ממפת האב
      setMaps(all.filter((m: any) => anchored(m) || (m.parent_map_id && anchored(byId.get(Number(m.parent_map_id))))));
    }).catch(() => setMaps([]));
  }, []);

  useEffect(() => {
    if (!mapId) { setZones([]); return; }
    fetch(`${API_URL}/map-zones?map_id=${mapId}`).then(r => r.ok ? r.json() : []).then(rows => setZones(Array.isArray(rows) ? rows : [])).catch(() => setZones([]));
  }, [mapId]);

  const geoCount = (z: any) => {
    try { const g = typeof z.polygon_geo === 'string' ? JSON.parse(z.polygon_geo) : z.polygon_geo; return Array.isArray(g) ? g.length : 0; } catch { return 0; }
  };
  const selectedMap = maps.find(m => Number(m.id) === Number(mapId));
  const set = new Set(zoneIds.map(Number));

  return (
    <div data-testid="bs-zones-picker">
      <label style={{ display: 'block', marginBottom: '6px', color: '#94a3b8', fontSize: '13px' }}>{tr('admin.bsMapZones')}</label>
      <select
        data-testid="bs-map-select"
        value={mapId ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null, [])}
        style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #475569', borderRadius: '7px', color: 'white', fontSize: '13px', boxSizing: 'border-box' }}
      >
        <option value="">{maps.length ? tr('admin.bsMapSelect') : tr('admin.bsNoAnchoredMaps')}</option>
        {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {mapId && (
        <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
          {zones.map(z => {
            const on = set.has(Number(z.id));
            // אזור בלי נ"צ על מפה שאין לה עוגן משלה - לא ייכנס לחישוב המרכז
            const noGeo = geoCount(z) === 0 && !anchored(selectedMap);
            return (
              <label key={z.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', fontSize: '12px', background: on ? '#1e3a5f' : '#0f172a', border: `1px solid ${on ? '#3b82f6' : '#334155'}`, color: on ? '#bfdbfe' : '#94a3b8' }}>
                <input type="checkbox" checked={on} style={{ margin: 0 }}
                  onChange={() => onChange(mapId, on ? zoneIds.filter(id => Number(id) !== Number(z.id)) : [...zoneIds, Number(z.id)])} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.color || '#3b82f6', flexShrink: 0 }} />
                {z.name || `#${z.id}`}
                {noGeo && <span style={{ color: '#f59e0b' }}>({tr('admin.bsZoneNoGeo')})</span>}
              </label>
            );
          })}
        </div>
      )}
      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#64748b' }}>{tr('admin.bsZonesHint')}</p>
    </div>
  );
}
