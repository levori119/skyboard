#!/usr/bin/env node
// מחליף  t('group.key')  →  tr('group.key')
// למה: השם `t` מוצל (shadowed) ע"י `const { t } = useTranslation()` וע"י קולבקים
// כמו `.map(t => ...)`. במקרה כזה t('ctrl.x') קורא למשתנה המקומי ומחזיר מפתח גולמי,
// **בלי ש-tsc יתפוס**. `tr` ייחודי.
import fs from 'fs';
import path from 'path';

const GROUPS = ['admin','blocks','classic','common','ctrl','dashboard','ground','map','misc','query','strips','transfers','vertical'];
const CALL = new RegExp(String.raw`\bt\(\s*'((?:${GROUPS.join('|')})\.[A-Za-z0-9_]+)'\s*\)`, 'g');

const walk = d => fs.readdirSync(d, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

let total = 0, files = 0;
for (const f of walk('src/components').filter(f => f.endsWith('.tsx'))) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  let n = 0;
  s = s.replace(CALL, (_m, key) => { n++; return `tr('${key}')`; });
  if (s !== before) { fs.writeFileSync(f, s); files++; total += n; console.log(`${path.basename(f).padEnd(28)} ${String(n).padStart(4)}`); }
}
console.log(`\nסה"כ: ${total} קריאות ב-${files} קבצים`);
