#!/usr/bin/env node
// מריץ את ה-codemod על כל הקבצים ומאחד את רשימת המחרוזות לתרגום.
import { execSync } from 'child_process';
import fs from 'fs';

const FILES = [
  'src/components/admin/ManagementPage.tsx',
  'src/components/views/GroundView.tsx',
  'src/components/admin/managers.tsx',
  'src/components/classic/ClassicViews.tsx',
  'src/components/strips/Strip.tsx',
  'src/components/transfers/DraggablePanels.tsx',
  'src/components/transfers/TransferCards.tsx',
  'src/components/ground/GroundVehiclePanel.tsx',
  'src/components/dashboard/AdminDashboard.tsx',
  'src/components/map/MapZoneEditor.tsx',
  'src/components/views/VerticalView.tsx',
  'src/components/query/QueryBuilder.tsx',
  'src/components/blocks/BlockVisualPainter.tsx',
  'src/components/map/MapsManager.tsx',
  'src/components/ground/groundShared.tsx',
  'src/components/shared/MyScriptTestPanel.tsx',
];

const all = new Set(JSON.parse(fs.readFileSync('src/i18n/locales/ui.en.json', 'utf8')) ? [] : []);
// מתחילים מהמחרוזות שכבר תורגמו (SectorDashboard)
Object.keys(JSON.parse(fs.readFileSync('src/i18n/locales/ui.en.json', 'utf8'))).forEach(k => all.add(k));
const before = all.size;

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log(`דילוג (לא קיים): ${f}`); continue; }
  execSync(`node scripts/i18n-codemod.mjs "${f}" --write`, { stdio: 'pipe' });
  JSON.parse(fs.readFileSync('scripts/.i18n-extracted.json', 'utf8')).forEach(s => all.add(s));
}

const sorted = [...all].sort();
fs.writeFileSync('scripts/.i18n-all.json', JSON.stringify(sorted, null, 1));
console.log(`מחרוזות שכבר תורגמו: ${before}`);
console.log(`סה"כ מחרוזות אחרי הבatch: ${sorted.length}`);
console.log(`חדשות לתרגום: ${sorted.length - before}`);
console.log('רשימה מאוחדת: scripts/.i18n-all.json');
