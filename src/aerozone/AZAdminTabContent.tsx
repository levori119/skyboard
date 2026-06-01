import React, { useState, useEffect, useCallback } from 'react';
import { AZAdminPanel } from './AZAdminPanel';
import { AZAirport, AZMap, AZPolygon } from './types';

const AZ_API = '/api/az';

interface Props {
  lightMode?: boolean;
  onOpenAeroZoneForDraw?: () => void;
}

export function AZAdminTabContent({ lightMode, onOpenAeroZoneForDraw }: Props) {
  const [airports, setAirports] = useState<AZAirport[]>([]);
  const [maps, setMaps] = useState<AZMap[]>([]);
  const [polygons, setPolygons] = useState<AZPolygon[]>([]);
  const [selectedAirportId, setSelectedAirportId] = useState<number | null>(null);

  const loadAirports = useCallback(() => {
    fetch(`${AZ_API}/airports`).then(r => r.json()).then(data => {
      setAirports(data);
      if (data.length > 0 && !selectedAirportId) setSelectedAirportId(data[0].id);
    }).catch(() => {});
  }, [selectedAirportId]);

  const loadMaps = useCallback(() => {
    fetch(`${AZ_API}/maps`).then(r => r.json()).then(setMaps).catch(() => {});
  }, []);

  const loadPolygons = useCallback(() => {
    if (!selectedAirportId) return;
    fetch(`${AZ_API}/airports/${selectedAirportId}/polygons`).then(r => r.json()).then(setPolygons).catch(() => {});
  }, [selectedAirportId]);

  useEffect(() => { loadAirports(); loadMaps(); }, []);
  useEffect(() => { loadPolygons(); }, [selectedAirportId]);

  const handleSelectAirport = (id: number) => {
    setSelectedAirportId(id);
    setPolygons([]);
  };

  return (
    <div style={{ width: '100%' }}>
      <AZAdminPanel
        airports={airports}
        maps={maps}
        polygons={polygons}
        selectedAirportId={selectedAirportId}
        onSelectAirport={handleSelectAirport}
        onRefreshAirports={loadAirports}
        onRefreshMaps={loadMaps}
        onRefreshPolygons={loadPolygons}
        onStartDrawPolygon={() => onOpenAeroZoneForDraw?.()}
        drawingPendingCoords={null}
        onClearDrawingPending={() => {}}
        lightMode={lightMode}
      />
    </div>
  );
}
