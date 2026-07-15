#!/usr/bin/env node
/**
 * מוסיף מחרוזות חדשות ל-registry **בלי לדרוס** את הקיים, וממיר בקוד:
 *     tr("טקסט עברי")  →  tr('group.key')
 *
 * (i18n-build-registry.mjs בונה מאפס — מסוכן אחרי שהקוד כבר משתמש במפתחות.)
 */
import fs from 'fs';
import path from 'path';

const REG = 'src/i18n/registry';
const EN = JSON.parse(fs.readFileSync('scripts/.adjacent-en.json', 'utf8'));

const GROUP_OF_FILE = {
  'views/SectorDashboard': 'ctrl',
  'admin/ManagementPage': 'admin',
  'admin/managers': 'admin',
  'views/GroundView': 'ground',
  'ground/GroundVehiclePanel': 'ground',
  'classic/ClassicViews': 'classic',
  'strips/Strip': 'strips',
  'transfers/DraggablePanels': 'transfers',
  'transfers/TransferCards': 'transfers',
  'map/MapZoneEditor': 'map',
  'map/MapsManager': 'map',
  'blocks/BlockVisualPainter': 'blocks',
  'dashboard/AdminDashboard': 'dashboard',
  'views/VerticalView': 'vertical',
  'query/QueryBuilder': 'query',
  'admin/TranslationsManager': 'admin',
};

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk('src/components').filter(f => f.endsWith('.tsx'));

// 1. איזו מחרוזת (עדיין עברית ב-tr) מופיעה באילו קבוצות
const uses = new Map();
const RAW = /\btr\(\s*("(?:\\.|[^"\\])*")\s*\)/g;
for (const f of files) {
  const rel = f.replace(/\\/g, '/').replace('src/components/', '').replace('.tsx', '');
  const g = GROUP_OF_FILE[rel];
  if (!g) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(RAW)) {
    let he; try { he = JSON.parse(m[1]); } catch { continue; }
    if (!/[֐-׿]/.test(he)) continue;                 // כבר מפתח — לא עברית
    (uses.get(he) ?? uses.set(he, new Set()).get(he)).add(g);
  }
}
console.log(`מחרוזות עבריות שנותרו בקוד: ${uses.size}`);

// 2. קבוצה: אם ביותר מאחת → shared
const groupOf = new Map([...uses].map(([he, gs]) => [he, gs.size > 1 ? 'shared' : [...gs][0]]));

// 3. טעינת ה-registry הקיים + המפתחות התפוסים
const reg = {};
for (const f of fs.readdirSync(REG)) reg[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(REG, f), 'utf8'));
const taken = Object.fromEntries(Object.entries(reg).map(([g, d]) => [g, new Set(Object.keys(d.keys))]));

const slug = s => {
  const w = s.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4);
  if (!w.length) return 'item';
  return w[0].toLowerCase() + w.slice(1).map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
};

// 3b. אינדקס הפוך: he → "group.key" מכל מה שכבר קיים.
// מונע כפילויות — מחרוזת שכבר יש לה מפתח (למשל 'ביטול' = shared.cancel) תשתמש בו.
const existingByHe = new Map();
for (const [g, d] of Object.entries(reg))
  for (const [k, v] of Object.entries(d.keys))
    if (!existingByHe.has(v.he)) existingByHe.set(v.he, `${g}.${k}`);

// 4. יצירת מפתחות + הוספה ל-registry
const keyOf = {};
let added = 0, reused = 0, noEn = [];
for (const he of [...groupOf.keys()].sort()) {
  const g = groupOf.get(he);
  if (!reg[g]) { console.log('⚠️ קבוצה חסרה:', g); continue; }

  const existing = existingByHe.get(he);
  if (existing) { keyOf[he] = existing; reused++; continue; }  // שימוש חוזר

  const en = EN[he];
  if (!en) { noEn.push(he); continue; }
  let base = slug(en) || 'item';
  let k = base, i = 2;
  while (taken[g].has(k)) k = `${base}${i++}`;
  taken[g].add(k);
  reg[g].keys[k] = { he, en };
  keyOf[he] = `${g}.${k}`;
  added++;
}
if (noEn.length) { console.log(`❌ חסר תרגום אנגלי ל-${noEn.length}:`); console.log(noEn.slice(0, 10)); }

// 5. כתיבת ה-registry (ממוין)
for (const [g, d] of Object.entries(reg)) {
  d.keys = Object.fromEntries(Object.entries(d.keys).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(REG, `${g}.json`), JSON.stringify(d, null, 2) + '\n');
}
console.log(`נוספו ל-registry: ${added} | שימוש חוזר במפתח קיים: ${reused}`);

// 6. המרת הקוד:  tr("עברית") → tr('group.key')
let repl = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  s = s.replace(RAW, (m, lit) => {
    let he; try { he = JSON.parse(lit); } catch { return m; }
    const k = keyOf[he];
    if (!k) return m;
    repl++;
    return `tr('${k}')`;
  });
  if (s !== before) fs.writeFileSync(f, s);
}
console.log(`הוחלפו בקוד: ${repl}`);
