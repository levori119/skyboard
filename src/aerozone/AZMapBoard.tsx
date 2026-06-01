import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AZPolygon, AZPolygonStatus, AZMap,
  OPERATIONAL_COLORS, OPERATIONAL_LABELS, GRF_LABELS, POLYGON_TYPE_LABELS,
} from './types';

interface Props {
  activeMap: AZMap | null;
  polygons: AZPolygon[];
  statusMap: Record<number, AZPolygonStatus>;
  selectedPolygon: AZPolygon | null;
  onSelectPolygon: (p: AZPolygon | null) => void;
  onPolygonDrawn?: (coords: [number, number][]) => void;
  drawMode: boolean;
  lightMode?: boolean;
}

export function AZMapBoard({ activeMap, polygons, statusMap, selectedPolygon, onSelectPolygon, onPolygonDrawn, drawMode, lightMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Map<number, L.Polygon>>(new Map());
  const drawLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawPointsRef = useRef<[number, number][]>([]);
  const previewLineRef = useRef<L.Polyline | null>(null);
  const drawMarkersRef = useRef<L.CircleMarker[]>([]);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const [drawPointCount, setDrawPointCount] = useState(0);

  const MAP_BOUNDS: L.LatLngBoundsExpression = [[0, 0], [1000, 1000]];

  // Init Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 5,
      zoomControl: false,
      attributionControl: false,
    });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    const group = new L.FeatureGroup();
    group.addTo(map);
    drawLayerRef.current = group;
    mapRef.current = map;

    map.fitBounds(MAP_BOUNDS);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Load image overlay when map changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (imageOverlayRef.current) { imageOverlayRef.current.remove(); imageOverlayRef.current = null; }
    if (activeMap?.file_name) {
      const url = `/az-maps/${activeMap.file_name}`;
      const overlay = L.imageOverlay(url, MAP_BOUNDS, { opacity: 1 });
      overlay.addTo(map);
      imageOverlayRef.current = overlay;
      map.fitBounds(MAP_BOUNDS);
    } else {
      // Gray checkerboard background
      const rect = L.rectangle(MAP_BOUNDS as any, { color: '#334155', weight: 1, fillColor: '#1e293b', fillOpacity: 1 });
      rect.addTo(map);
    }
  }, [activeMap?.id, activeMap?.file_name]);

  // Draw polygons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach(layer => layer.remove());
    layersRef.current.clear();

    polygons.forEach(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return;
      const status = statusMap[polygon.id];
      const opColor = OPERATIONAL_COLORS[status?.operational || 'operational'];
      const isSelected = selectedPolygon?.id === polygon.id;

      const layer = L.polygon(polygon.coordinates as L.LatLngExpression[], {
        color: isSelected ? '#ffffff' : polygon.color,
        weight: isSelected ? 3 : 2,
        fillColor: opColor,
        fillOpacity: 0.45,
        dashArray: status?.operational === 'maintenance' ? '6,4' : undefined,
      });

      const statusLabel = OPERATIONAL_LABELS[status?.operational || 'operational'];
      const grfLabel = status?.grf ? GRF_LABELS[status.grf] : '';
      const rvrText = status?.rvr != null ? `RVR: ${status.rvr}m` : '';
      layer.bindTooltip(`
        <div style="direction:rtl;font-family:sans-serif;min-width:120px">
          <b style="font-size:13px">${polygon.name}</b><br/>
          <span style="font-size:11px;color:#94a3b8">${POLYGON_TYPE_LABELS[polygon.type]}</span><br/>
          <span style="color:${opColor};font-weight:bold;font-size:12px">⬤ ${statusLabel}</span>
          ${grfLabel ? `<br/><span style="font-size:11px">💧 ${grfLabel}</span>` : ''}
          ${rvrText ? `<br/><span style="font-size:11px">👁 ${rvrText}</span>` : ''}
        </div>
      `, { direction: 'auto', sticky: true });

      layer.on('click', () => onSelectPolygon(polygon));
      layer.addTo(map);
      layersRef.current.set(polygon.id, layer);
    });
  }, [polygons, statusMap, selectedPolygon?.id]);

  // Draw mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearDrawing = () => {
      drawPointsRef.current = [];
      setDrawPointCount(0);
      drawMarkersRef.current.forEach(m => m.remove());
      drawMarkersRef.current = [];
      if (previewLineRef.current) { previewLineRef.current.remove(); previewLineRef.current = null; }
    };

    if (!drawMode) {
      clearDrawing();
      map.off('click');
      map.off('mousemove');
      map.getContainer().style.cursor = '';
      return;
    }

    map.getContainer().style.cursor = 'crosshair';

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (drawPointsRef.current.length === 0) return;
      const pts = [...drawPointsRef.current, [e.latlng.lat, e.latlng.lng] as [number, number]];
      if (previewLineRef.current) {
        previewLineRef.current.setLatLngs(pts as any);
      } else {
        previewLineRef.current = L.polyline(pts as any, { color: '#60a5fa', weight: 2, dashArray: '4,4' }).addTo(map);
      }
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng];
      drawPointsRef.current.push(pt);
      setDrawPointCount(prev => prev + 1);
      const marker = L.circleMarker(e.latlng, { radius: 5, color: '#60a5fa', fillColor: '#93c5fd', fillOpacity: 1, weight: 2 }).addTo(map);
      drawMarkersRef.current.push(marker);
    };

    map.on('click', onClick);
    map.on('mousemove', onMouseMove);

    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMouseMove);
      map.getContainer().style.cursor = '';
    };
  }, [drawMode]);

  const finishDrawing = useCallback(() => {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    onPolygonDrawn?.(pts);
    drawPointsRef.current = [];
    setDrawPointCount(0);
    drawMarkersRef.current.forEach(m => m.remove());
    drawMarkersRef.current = [];
    if (previewLineRef.current) { previewLineRef.current.remove(); previewLineRef.current = null; }
  }, [onPolygonDrawn]);

  const cancelDrawing = useCallback(() => {
    drawPointsRef.current = [];
    setDrawPointCount(0);
    drawMarkersRef.current.forEach(m => m.remove());
    drawMarkersRef.current = [];
    if (previewLineRef.current) { previewLineRef.current.remove(); previewLineRef.current = null; }
  }, []);

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#1e293b' }} />

      {/* Draw mode overlay */}
      {drawMode && (
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: 1000, background: 'rgba(15,23,42,0.9)', padding: '10px 16px', borderRadius: '10px', border: '1px solid #334155' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', alignSelf: 'center' }}>
            {drawPointCount === 0 ? 'לחץ על המפה לסימון נקודה ראשונה' : `${drawPointCount} נקודות — לחץ להוספת נקודה נוספת`}
          </span>
          {drawPointCount >= 3 && (
            <button onClick={finishDrawing}
              style={{ padding: '7px 14px', background: '#15803d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
              ✓ סגור פוליגון
            </button>
          )}
          {drawPointCount > 0 && (
            <button onClick={cancelDrawing}
              style={{ padding: '7px 12px', background: '#7f1d1d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              ✕ בטל
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {!drawMode && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(15,23,42,0.85)', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', zIndex: 1000, direction: 'rtl' }}>
          {([['operational', 'שמיש'], ['partial', 'שמיש חלקי'], ['closed', 'סגור'], ['maintenance', 'שיפוצים']] as const).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <div style={{ width: 12, height: 12, borderRadius: '2px', background: OPERATIONAL_COLORS[key] }} />
              <span style={{ fontSize: '11px', color: '#e2e8f0' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
