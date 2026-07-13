#!/usr/bin/env node
/**
 * בונה את registry התרגומים: קבצי JSON מקובצים לפי דומיין, כל ערך:
 *   "<מפתח טכני>": { "he": "...", "en": "..." }
 *
 * גם מייצר מפה  עברית → "group.key"  שבה משתמש ה-codemod כדי להחליף
 * tr('עברית')  →  t('group.key').
 */
import fs from 'fs';
import path from 'path';

const REG_DIR = 'src/i18n/registry';

// ── מיפוי קובץ → קבוצה לוגית ─────────────────────────────────────────────────
const GROUPS = {
  'views/SectorDashboard': ['ctrl', 'עמדת בקר (CTRL)'],
  'admin/ManagementPage': ['admin', 'ניהול מערכת'],
  'admin/managers': ['admin', 'ניהול מערכת'],
  'views/GroundView': ['ground', 'עמדת מגדל (TWR)'],
  'ground/GroundVehiclePanel': ['ground', 'עמדת מגדל (TWR)'],
  'ground/groundShared': ['ground', 'עמדת מגדל (TWR)'],
  'classic/ClassicViews': ['classic', 'תצוגה קלאסית'],
  'strips/Strip': ['strips', 'פ"מ / סטריפים'],
  'transfers/DraggablePanels': ['transfers', 'העברות עמדה'],
  'transfers/TransferCards': ['transfers', 'העברות עמדה'],
  'map/MapZoneEditor': ['map', 'מפות ואזורים'],
  'map/MapsManager': ['map', 'מפות ואזורים'],
  'blocks/BlockVisualPainter': ['blocks', 'בלוקי גובה'],
  'dashboard/AdminDashboard': ['dashboard', 'דשבורד מנהל'],
  'views/VerticalView': ['vertical', 'תצוגה אנכית'],
  'query/QueryBuilder': ['query', 'סינון פ"מים'],
  'shared/MyScriptTestPanel': ['misc', 'שונות'],
};

const FILES = Object.keys(GROUPS).map(k => `src/components/${k}.tsx`).filter(f => fs.existsSync(f));

// ── תעתיק עברי→לטיני (רק לייצור מפתח כשאין תרגום אנגלי) ──────────────────────
const TRANSLIT = { 'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch','ט':'t','י':'y',
  'כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s','ע':'a','פ':'p','ף':'f',
  'צ':'ts','ץ':'ts','ק':'k','ר':'r','ש':'sh','ת':'t' };

function slug(s, max = 4) {
  const words = s
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')       // הסרת אימוג'י/פיסוק
    .split(/\s+/).filter(Boolean).slice(0, max);
  const parts = words.map(w =>
    /[֐-׿]/.test(w) ? [...w].map(c => TRANSLIT[c] ?? '').join('') : w.toLowerCase()
  ).filter(Boolean);
  if (!parts.length) return 'item';
  return parts[0] + parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

// ── איסוף: איזו מחרוזת מופיעה באילו קבוצות ───────────────────────────────────
const uses = new Map(); // he → Set(group)
const HEB = /[֐-׿]/;
for (const f of FILES) {
  const key = f.replace('src/components/', '').replace('.tsx', '');
  const [group] = GROUPS[key];
  const src = fs.readFileSync(f, 'utf8');
  // ה-codemod פלט JSON.stringify → ליטרל במירכאות כפולות. מפרסרים אותו כמו שהוא.
  for (const m of src.matchAll(/\btr\(\s*("(?:\\.|[^"\\])*")\s*\)/g)) {
    let he;
    try { he = JSON.parse(m[1]); } catch { continue; }
    if (!HEB.test(he)) continue;
    if (!uses.has(he)) uses.set(he, new Set());
    uses.get(he).add(group);
  }
}

// מחרוזת שמשמשת ביותר מקבוצה אחת → common (מקור אמת יחיד, בלי כפילות)
const groupOf = new Map();
for (const [he, gs] of uses) groupOf.set(he, gs.size > 1 ? 'shared' : [...gs][0]);

// ── תרגומים קיימים (מ-ui.en.json שבנינו קודם) ────────────────────────────────
const existingEn = JSON.parse(fs.readFileSync('src/i18n/locales/ui.en.json', 'utf8'));

// ── ייצור מפתחות ייחודיים בתוך כל קבוצה ──────────────────────────────────────
const registry = {};   // group → { key: {he,en} }
const keyOfHe = {};    // he → "group.key"
const taken = {};      // group → Set(keys)

for (const he of [...groupOf.keys()].sort()) {
  const g = groupOf.get(he);
  registry[g] ??= {};
  taken[g] ??= new Set();
  const en = existingEn[he] ?? '';
  let base = slug(en || he);           // מפתח מהאנגלית אם יש, אחרת תעתיק
  if (!base) base = 'item';
  let k = base, i = 2;
  while (taken[g].has(k)) k = `${base}${i++}`;
  taken[g].add(k);
  registry[g][k] = { he, en };
  keyOfHe[he] = `${g}.${k}`;
}

// ── כתיבה ────────────────────────────────────────────────────────────────────
fs.mkdirSync(REG_DIR, { recursive: true });
const LABELS = { shared: 'כללי (משותף למספר מסכים)', ...Object.fromEntries(Object.values(GROUPS).map(([g, l]) => [g, l])) };
let totalKeys = 0, totalEn = 0;
for (const g of Object.keys(registry).sort()) {
  const entries = Object.fromEntries(Object.entries(registry[g]).sort(([a], [b]) => a.localeCompare(b)));
  const out = { _group: LABELS[g] ?? g, _note: 'מפתח = שם טכני (אל תשנה). he/en = טקסט תצוגה — ניתן לעריכה חופשית.', keys: entries };
  fs.writeFileSync(path.join(REG_DIR, `${g}.json`), JSON.stringify(out, null, 2) + '\n');
  const n = Object.keys(entries).length;
  const withEn = Object.values(entries).filter(v => v.en).length;
  totalKeys += n; totalEn += withEn;
  console.log(`${g.padEnd(10)} ${String(n).padStart(4)} מפתחות | ${String(withEn).padStart(4)} מתורגמים  → ${LABELS[g] ?? g}`);
}
fs.writeFileSync('scripts/.i18n-keymap.json', JSON.stringify(keyOfHe, null, 1));
console.log(`\nסה"כ: ${totalKeys} מפתחות | ${totalEn} מתורגמים | ${totalKeys - totalEn} ממתינים לאנגלית`);
console.log(`מפת codemod: scripts/.i18n-keymap.json`);
