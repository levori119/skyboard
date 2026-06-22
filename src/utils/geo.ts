export interface MapGeoAnchor {
  x1: number; y1: number; lat1: number; lon1: number;
  x2: number; y2: number; lat2: number; lon2: number;
}

export const buildGeoAnchor = (m: Record<string, unknown> | null): MapGeoAnchor | null => {
  if (!m?.anchor1_lat || !m?.anchor2_lat || m.anchor1_x_img == null || m.anchor2_x_img == null) return null;
  return {
    x1: m.anchor1_x_img as number, y1: m.anchor1_y_img as number,
    lat1: Number(m.anchor1_lat), lon1: Number(m.anchor1_lon),
    x2: m.anchor2_x_img as number, y2: m.anchor2_y_img as number,
    lat2: Number(m.anchor2_lat), lon2: Number(m.anchor2_lon),
  };
};

export const geoToImagePct = (lat: number, lon: number, a: MapGeoAnchor): { x: number; y: number } => {
  const tx = (lon - a.lon1) / (a.lon2 - a.lon1);
  const ty = (lat - a.lat1) / (a.lat2 - a.lat1);
  return { x: a.x1 + tx * (a.x2 - a.x1), y: a.y1 + ty * (a.y2 - a.y1) };
};

export const imagePctToGeo = (xImg: number, yImg: number, a: MapGeoAnchor): { lat: number; lon: number } => {
  const tx = (xImg - a.x1) / (a.x2 - a.x1);
  const ty = (yImg - a.y1) / (a.y2 - a.y1);
  return { lat: a.lat1 + ty * (a.lat2 - a.lat1), lon: a.lon1 + tx * (a.lon2 - a.lon1) };
};

export const fmtDms = (dec: number, isLat: boolean): string => {
  const abs = Math.abs(dec);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(1);
  const dir = isLat ? (dec >= 0 ? 'N' : 'S') : (dec >= 0 ? 'E' : 'W');
  return `${d}°${String(m).padStart(2, '0')}'${parseFloat(s) < 10 ? '0' : ''}${s}"${dir}`;
};
