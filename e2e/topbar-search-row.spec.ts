import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── חיפוש או"ק בשורה השנייה של הסרגל, בצד ימין (RTL) ──────────────────────────
// בקשה: להעביר את תיבת חיפוש האו"ק לשורה השנייה של הסרגל, מיושרת לימין.
test('חיפוש או"ק בשורה שנייה, מיושר לימין', async ({ page }) => {
  await loginToWorkstation(page);

  const header = page.locator('header.bt-topbar');
  await expect(header).toBeVisible();

  const search = page.getByPlaceholder('חיפוש או"ק...');
  await expect(search).toBeVisible();

  const headerBox = await header.boundingBox();
  const searchBox = await search.boundingBox();
  // הלוגו (קבוצת הזהות) — עוגן לשורה הראשונה
  const logoRow = page.locator('header.bt-topbar > div').first();
  const logoBox = await logoRow.boundingBox();

  expect(headerBox && searchBox && logoBox).toBeTruthy();

  // שורה שנייה: החיפוש נמוך מקבוצת הזהות (שורה 1)
  expect(searchBox!.y, 'חיפוש בשורה שנייה (מתחת לזהות)')
    .toBeGreaterThan(logoBox!.y + logoBox!.height - 2);

  // צד ימין (RTL): מרכז החיפוש בחצי הימני של הסרגל
  const searchCenter = searchBox!.x + searchBox!.width / 2;
  expect(searchCenter, 'חיפוש בצד ימין של הסרגל')
    .toBeGreaterThan(headerBox!.x + headerBox!.width / 2);

  await page.screenshot({ path: 'e2e/__screenshots__/topbar-search-row.png', clip: { x: headerBox!.x, y: headerBox!.y, width: headerBox!.width, height: Math.min(headerBox!.height, 140) } });
});
