/**
 * ייבוא "אזורי עפרוני" - מטבלת נ"צ מודפסת למפה מעוגנת.
 *
 * הזרימה:  scripts/ofroni-zones.json  →  אימות  →  מפה חדשה + map_zones + zone_altitude_ranges
 *
 *   node scripts/import-ofroni-zones.mjs            # יבש: אימות + תצוגה מקדימה בלבד
 *   node scripts/import-ofroni-zones.mjs --commit   # כותב ל-DB
 *
 * המפה נולדת כ**עותק מעוגן** של מפת המקור (`sourceAnchorMapId`): אותה תמונת רקע
 * ואותם שני עוגנים, כדי ש-`polygon_geo` ייפול בדיוק במקום הנכון. `polygon`
 * (אחוזי-תמונה) נגזר מהעוגנים ונשמר כגיבוי, בדיוק כפי ש-MapZoneEditor עושה.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, 'ofroni-zones.json'), 'utf8'));

// ── נ"צ: DDMM.mmm → מעלות עשרוניות ────────────────────────────────────────────
// המקור המודפס כותב אורך בשתי ספרות מעלה (E3457.068). parseDdm של המערכת
// (src/utils/geo.ts) דורש שלוש, ולכן משלימים אפס מוביל לפני הפירוק.
const parseHalf = (raw, isLat) => {
  const s = String(raw).trim().toUpperCase().replace(',', '.');
  const hemi = s[0];
  if (isLat ? !'NS'.includes(hemi) : !'EW'.includes(hemi)) return null;
  const digits = s.slice(1).replace(/[^\d.]/g, '');
  const degDigits = isLat ? 2 : 3;
  const [int = '', frac = ''] = digits.split('.');
  const intPadded = int.padStart(degDigits + 2, '0');
  if (intPadded.length !== degDigits + 2) return null;
  const d = Number(intPadded.slice(0, degDigits));
  const m = Number(`${intPadded.slice(degDigits)}.${frac || '0'}`);
  if (!Number.isFinite(d) || !Number.isFinite(m) || m >= 60) return null;
  const dec = d + m / 60;
  return hemi === 'S' || hemi === 'W' ? -dec : dec;
};
const parsePoint = (text) => {
  const m = /^\s*([NS][^/]+)\/\s*([EW].+?)\s*$/.exec(String(text));
  if (!m) return null;
  const lat = parseHalf(m[1], true), lon = parseHalf(m[2], false);
  return lat == null || lon == null ? null : { lat, lon };
};

// ── אימות ─────────────────────────────────────────────────────────────────────
// גבולות ישראל והסביבה: נ"צ שנופל מחוץ להם הוא כמעט תמיד ספרה שנקראה שגוי
// מהצילום, ולא אזור אמיתי. עדיף להיעצר מלצייר אזור במקום הלא נכון.
const BOUNDS = { latMin: 29.3, latMax: 33.4, lonMin: 34.1, lonMax: 35.8 };
const NM = (a, b) => {                       // מרחק גס בין שני נ"צ, במיילים ימיים
  const dLat = (b.lat - a.lat) * 60;
  const dLon = (b.lon - a.lon) * 60 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLon);
};
const cross = (o, a, b) => (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);
const segHit = (p1, p2, p3, p4) => {          // האם שתי צלעות שאינן שכנות נחתכות
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};
const selfIntersects = (pts) => {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;    // הצלע הסוגרת שכנה לראשונה
    if (segHit(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return [i, j];
  }
  return null;
};
const areaNm2 = (pts) => {                    // שטח לפי נוסחת השרוכים, בקירוב
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const xy = pts.map(p => ({ x: p.lon * 60 * Math.cos(lat0 * Math.PI / 180), y: p.lat * 60 }));
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    a += xy[i].x * xy[j].y - xy[j].x * xy[i].y;
  }
  return Math.abs(a / 2);
};

const parsed = [];
const problems = [];
for (const z of DATA.zones) {
  const pts = [];
  z.points.forEach((raw, i) => {
    const p = parsePoint(raw);
    if (!p) { problems.push(`[${z.name}] נקודה ${i + 1}: "${raw}" אינה נ"צ תקין`); return; }
    if (p.lat < BOUNDS.latMin || p.lat > BOUNDS.latMax || p.lon < BOUNDS.lonMin || p.lon > BOUNDS.lonMax)
      problems.push(`[${z.name}] נקודה ${i + 1}: ${raw} → ${p.lat.toFixed(4)},${p.lon.toFixed(4)} מחוץ לגבולות המפה`);
    pts.push(p);
  });
  if (pts.length < 3) { problems.push(`[${z.name}] פחות מ-3 קודקודים`); continue; }
  const hit = selfIntersects(pts);
  if (hit) problems.push(`[${z.name}] הפוליגון חותך את עצמו (צלע ${hit[0] + 1} מול ${hit[1] + 1}) - כנראה סדר קודקודים שגוי`);
  const edges = pts.map((p, i) => NM(p, pts[(i + 1) % pts.length]));
  parsed.push({ ...z, pts, area: areaNm2(pts), maxEdge: Math.max(...edges), minEdge: Math.min(...edges) });
}

// ── דוח ───────────────────────────────────────────────────────────────────────
console.log(`\n  אזורי עפרוני - ${parsed.length} אזורים, ${parsed.reduce((s, z) => s + z.blocks.length, 0)} בלוקי גובה\n`);
console.table(parsed.map(z => ({
  zone: z.name,
  pts: z.pts.length,
  blocks: z.blocks.map(b => `${b.name} ${b.ft_min}-${b.ft_max}`).join(' | '),
  area_nm2: Math.round(z.area),
  max_edge_nm: z.maxEdge.toFixed(1),
  read: z.confidence,
})));
if (problems.length) { console.log('\n  ! ממצאי אימות:'); problems.forEach(p => console.log('   - ' + p)); }
else console.log('\n  OK - כל הפוליגונים תקינים גאומטרית ובתוך גבולות המפה');

// ── תצוגה מקדימה ──────────────────────────────────────────────────────────────
const PREVIEW = process.env.OFRONI_PREVIEW;
if (PREVIEW) {
  fs.writeFileSync(PREVIEW, JSON.stringify(parsed.map(z => ({
    name: z.name, blocks: z.blocks, pts: z.pts, area: z.area, confidence: z.confidence, note: z.note || null,
  })), null, 2));
  console.log(`\n  נכתבה תצוגה מקדימה: ${PREVIEW}`);
}

if (!COMMIT) { console.log('\n  ריצה יבשה. להרצה אמיתית: node scripts/import-ofroni-zones.mjs --commit\n'); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.error('\n  יש ממצאי אימות - לא כותב ל-DB.\n'); process.exit(1); }

// ── כתיבה ל-DB ────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const src = (await client.query(
    `SELECT image_data, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
            anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon
       FROM maps WHERE id = $1`, [DATA.sourceAnchorMapId])).rows[0];
  if (!src) throw new Error(`מפת המקור ${DATA.sourceAnchorMapId} לא נמצאה`);
  if (src.anchor1_lat == null || src.anchor2_lat == null) throw new Error('מפת המקור אינה מעוגנת');

  const dup = await client.query('SELECT id FROM maps WHERE name = $1', [DATA.mapName]);
  if (dup.rowCount) throw new Error(`כבר קיימת מפה בשם "${DATA.mapName}" (id ${dup.rows[0].id}) - למחוק או לשנות שם לפני ייבוא חוזר`);

  const map = (await client.query(
    `INSERT INTO maps (name, image_data, anchor1_x_img, anchor1_y_img, anchor1_lat, anchor1_lon,
                       anchor2_x_img, anchor2_y_img, anchor2_lat, anchor2_lon)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [DATA.mapName, src.image_data, src.anchor1_x_img, src.anchor1_y_img, src.anchor1_lat, src.anchor1_lon,
     src.anchor2_x_img, src.anchor2_y_img, src.anchor2_lat, src.anchor2_lon])).rows[0];

  // geo → אחוזי-תמונה, אותה אינטרפולציה ליניארית כמו geoToImagePct ב-src/utils/geo.ts
  const toPct = ({ lat, lon }) => ({
    x: Number(src.anchor1_x_img) + ((lon - Number(src.anchor1_lon)) / (Number(src.anchor2_lon) - Number(src.anchor1_lon))) * (Number(src.anchor2_x_img) - Number(src.anchor1_x_img)),
    y: Number(src.anchor1_y_img) + ((lat - Number(src.anchor1_lat)) / (Number(src.anchor2_lat) - Number(src.anchor1_lat))) * (Number(src.anchor2_y_img) - Number(src.anchor1_y_img)),
  });

  let nBlocks = 0;
  for (const z of parsed) {
    const zone = (await client.query(
      `INSERT INTO map_zones (map_id, name, color, polygon, polygon_geo) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [map.id, z.name, '#3b82f6', JSON.stringify(z.pts.map(toPct)), JSON.stringify(z.pts)])).rows[0];
    // alt_min/alt_max ב**רום טיסה** (מאות רגל) - כך בכל הטבלה, ראה data-model.md
    for (const [i, b] of z.blocks.entries()) {
      await client.query(
        `INSERT INTO zone_altitude_ranges (zone_id, name, alt_min, alt_max, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [zone.id, b.name, Math.round(b.ft_min / 100), Math.round(b.ft_max / 100), i]);
      nBlocks++;
    }
  }
  await client.query('COMMIT');
  console.log(`\n  נוצרה מפה "${DATA.mapName}" (id ${map.id}) עם ${parsed.length} אזורים ו-${nBlocks} בלוקי גובה\n`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\n  נכשל, בוצע ROLLBACK:', e.message, '\n');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
