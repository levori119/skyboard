// מייצר את אייקון האפליקציה של עמדת Electron: build/icon.svg -> build/icon.png (1024x1024).
// electron-builder לוקח משם ובונה בעצמו את ה-.ico לחלונות (דורש 256x256 לפחות).
//
// למה Chromium ולא ספריית המרה: אין בפרויקט ספריית רסטר, ו-Playwright כבר מותקן
// כ-devDependency ומרנדר SVG בדיוק כמו הדפדפן. הרצה: node scripts/build-icon.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'build', 'icon.svg');
const sizes = [
  { size: 1024, out: path.join(root, 'build', 'icon.png') },
];
// גדלים נוספים לבדיקת קריאות (ארגומנטים: --preview <dir>)
const previewDir = process.argv.includes('--preview')
  ? process.argv[process.argv.indexOf('--preview') + 1]
  : null;
if (previewDir) {
  for (const size of [256, 48, 32, 16]) {
    sizes.push({ size, out: path.join(previewDir, `icon-${size}.png`) });
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

// ה-SVG מוטמע inline ולא כ-<img src="file://">: דף שנוצר ב-setContent יושב על
// origin של about:blank, ו-Chromium חוסם ממנו טעינת משאבי file:// (התוצאה היא
// אייקון "תמונה שבורה" בצילום).
const svg = readFileSync(src, 'utf8');

for (const { size, out } of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">
       <style>svg { display: block; width: ${size}px; height: ${size}px; }</style>
       ${svg}
     </body>`,
    { waitUntil: 'load' }
  );
  await page.locator('svg').screenshot({ path: out, omitBackground: true });
  console.log(`${size}x${size} -> ${out}`);
}

await browser.close();
