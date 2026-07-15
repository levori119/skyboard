import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── פריסת עמדת הבקר (RTL): עזרים מימין · פ"מ · נקודות העברה משמאל ──────────────
// באג שדווח: הצדדים התהפכו (נקודות ימין, עזרים שמאל). השורש: ה-order של העמודות
// (נקודות=1 … עזרים=5) תוכנן ל-LTR, אבל מְכל התוכן ירש RTL מהשורש והפך אותם.
// התיקון: המְכל המבני LTR (הטקסט בכל פאנל נשאר RTL).

test('נקודות ההעברה משמאל לעזרים (פריסת RTL נכונה)', async ({ page }) => {
  await loginToWorkstation(page);

  const neighbor = page.locator('#neighbor-panel');
  await expect(neighbor).toBeVisible();

  const nbRect = await neighbor.boundingBox();
  // פאנל העזרים — לפי הכותרת "עזרים" בסיידבר הימני
  const aids = page.getByText('עזרים', { exact: false }).last();
  const aidsRect = await aids.boundingBox();

  expect(nbRect, 'neighbor panel visible').toBeTruthy();
  expect(aidsRect, 'aids panel visible').toBeTruthy();

  // נקודות ההעברה חייבות להיות **משמאל** לעזרים
  expect(nbRect!.x, 'נקודות ההעברה צריכות להיות משמאל לעזרים')
    .toBeLessThan(aidsRect!.x);
});
