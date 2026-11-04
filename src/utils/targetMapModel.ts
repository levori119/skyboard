/**
 * **מפת המטרות ליד הבלוקים** - המודל הגאוגרפי (בלי React), כדי שיהיה בדיק.
 *
 * לכל פ"מ: המיקום שלו ונקודות המכוון שלו, והמפה מותחת קו מהפ"מ לכל מטרה (קו
 * מלא לראשונה לביצוע, מקווקו לשאר). מיקום הפ"מ:
 *   1. מרכז מרחב הבלוקים שלו - משם הוא יוצא לתקוף, וזה מה שהחלוקה למרחבים קובעת
 *   2. אחרת המיקום שלו על המפה (`map_lat/map_lon`)
 *   3. אחרת אין מיקום - המטרות שלו מוצגות בלי קו
 */
import { coordToLatLon, toAimPoints } from '../types/aimPoints';
import { firstExecIndex } from './blockSpaceAuto';

export interface LatLon { lat: number; lon: number }
export interface MapTarget extends LatLon { label: string; first: boolean }
export interface MapStrip { id: string; label: string; pos: LatLon | null; spaceId: string | null; targets: MapTarget[] }
export interface MapSpace { id: string; name: string; center: LatLon | null; polygons: LatLon[][] }
export interface TargetMapModel { strips: MapStrip[]; spaces: MapSpace[]; bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null }

const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function buildTargetMapModel(strips: any[], spaces: any[], label: (s: any) => string): TargetMapModel {
  const spaceById = new Map<string, MapSpace>();
  for (const sp of spaces || []) {
    const lat = num(sp.center_lat), lon = num(sp.center_lon);
    const polygons = (Array.isArray(sp.polygons) ? sp.polygons : [])
      .map((poly: any[]) => (Array.isArray(poly) ? poly : []).map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)))
      .filter((poly: LatLon[]) => poly.length >= 3);
    spaceById.set(String(sp.id), { id: String(sp.id), name: String(sp.name ?? ''), center: lat != null && lon != null ? { lat, lon } : null, polygons });
  }

  const outStrips: MapStrip[] = [];
  for (const s of strips || []) {
    const rows = toAimPoints(s.targets);
    const fi = firstExecIndex(s.targets);
    const targets: MapTarget[] = [];
    rows.forEach((r, i) => {
      const p = coordToLatLon(r.coord);
      if (p) targets.push({ ...p, label: String(r.aim_point || r.name || i + 1), first: i === fi });
    });
    const spaceId = s.block_space_id != null && s.block_space_id !== '' ? String(s.block_space_id) : null;
    const spaceCenter = spaceId ? spaceById.get(spaceId)?.center ?? null : null;
    const mlat = num(s.map_lat), mlon = num(s.map_lon);
    const pos = spaceCenter ?? (mlat != null && mlon != null ? { lat: mlat, lon: mlon } : null);
    if (!targets.length && !pos) continue;
    outStrips.push({ id: String(s.id), label: label(s), pos, spaceId, targets });
  }

  // מרחבים שמוצגים: מרחבי העמדה שיש להם גאומטריה (גם בלי פ"מים - כדי לראות לאן אפשר לשלוח)
  const outSpaces = [...spaceById.values()].filter(sp => sp.center || sp.polygons.length);

  const pts: LatLon[] = [
    ...outStrips.flatMap(s => [...s.targets, ...(s.pos ? [s.pos] : [])]),
    ...outSpaces.flatMap(sp => [...sp.polygons.flat(), ...(sp.center ? [sp.center] : [])]),
  ];
  const bounds = pts.length ? {
    minLat: Math.min(...pts.map(p => p.lat)), maxLat: Math.max(...pts.map(p => p.lat)),
    minLon: Math.min(...pts.map(p => p.lon)), maxLon: Math.max(...pts.map(p => p.lon)),
  } : null;
  return { strips: outStrips, spaces: outSpaces, bounds };
}

/**
 * הטלה שוות-מרחקים מתוקנת קו-רוחב, שממלאת את המסגרת בלי עיוות: מעלת אורך
 * מכווצת ב-cos(קו הרוחב) כמו במציאות, וטווח זעיר (נקודה אחת) מורחב לכ-5 ק"מ.
 */
export function makeProjection(b: NonNullable<TargetMapModel['bounds']>, w: number, h: number, pad = 28) {
  const midLat = (b.minLat + b.maxLat) / 2;
  const k = Math.cos(midLat * Math.PI / 180) || 1;
  const MIN_SPAN = 0.05;
  const latSpan = Math.max(b.maxLat - b.minLat, MIN_SPAN);
  const lonSpan = Math.max((b.maxLon - b.minLon) * k, MIN_SPAN);
  const scale = Math.max(Math.min((w - 2 * pad) / lonSpan, (h - 2 * pad) / latSpan), 1e-6);
  const cLat = midLat, cLon = (b.minLon + b.maxLon) / 2;
  return (p: LatLon) => ({ x: w / 2 + (p.lon - cLon) * k * scale, y: h / 2 - (p.lat - cLat) * scale });
}
