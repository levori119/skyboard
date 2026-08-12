// מרסטר את סמל SKY King לגרסאות ה-PNG של המערכת.
//
// מקור אמת יחיד: public/favicon.svg (ה-favicon של הדפדפן, בשימוש ישיר כ-SVG).
// מכאן נגזרים:
//   build/icon.png    (1024) - אייקון אפליקציית העמדה; electron-builder בונה ממנו את ה-.ico
//   public/favicon.png (192) - אייקון התראות הדפדפן (Notification.icon לא מקבל SVG)
//
// למה Chromium ולא ספריית המרה: אין בפרויקט ספריית רסטר, ו-Playwright כבר מותקן
// כ-devDependency ומרנדר SVG בדיוק כמו הדפדפן. הרצה: npm run icon:build
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'public', 'favicon.svg');
const sizes = [
  { size: 1024, out: path.join(root, 'build', 'icon.png') },
  { size: 192, out: path.join(root, 'public', 'favicon.png') },
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
