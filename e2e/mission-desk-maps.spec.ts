import { test, expect } from '@playwright/test';
import { identifyViaMirage, loginToWorkstation, setScreenSize } from './helpers';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

// ─── דסק משימה עם חלונות מפה ─────────────────────────────────────────────────
// הדרישה: עמדת דסק משימה שאחד מרכיביה הוא **מפה**, ולצידה חלון פ"ממים משלה.
// זו החוליה היחידה שאין דרך לאמת סטטית: המפה של עמדת הבקר - על כל שכבותיה -
// מרונדרת בתוך אזור בפריסת הדסק, ולא במקומה הרגיל. אם ההרכבה הזו נופלת בזמן
// ריצה, tsc ובדיקות היחידה יעברו והמסך בעמדה יישאר ריק.
//
// ההקמה נעשית **ישירות ב-DB** ולא דרך ה-API, כי שרת ה-e2e (פורט 3001) יכול
// להיות של ענף אחר שאינו מכיר עדיין את סוגי השירות החדשים.

const STAMP = '__MDMAP_E2E';

test.describe.configure({ timeout: 300000 });

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.resolve(process.cwd(), '.env');
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL לא נמצא ב-.env');
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
}

test.describe('דסק משימה עם חלונות מפה', () => {
  let pool: pg.Pool;
  let deskId: number | null = null;
  let presetId: number | null = null;
  let mapServiceId: number | null = null;
  const stationName = `${STAMP} דסק מפות`;

  test.beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl() });

    // מפה אמיתית עם תמונה - בלעדיה אין מה לרנדר
    const { rows: maps } = await pool.query(
      `SELECT id, name FROM maps WHERE image_data IS NOT NULL AND parent_map_id IS NULL ORDER BY id LIMIT 1`
    );
    expect(maps.length, 'אין במסד מפה עם תמונה - אי אפשר לבדוק חלון מפה').toBeGreaterThan(0);
    const mapId = Number(maps[0].id);

    const { rows: desk } = await pool.query(
      `INSERT INTO mission_desks (name) VALUES ($1) RETURNING id`, [`${STAMP} דסק`]
    );
    deskId = Number(desk[0].id);

    const { rows: mapSvc } = await pool.query(
      `INSERT INTO mission_desk_services (desk_id, service_type, name, config, sort_order)
       VALUES ($1, 'map', $2, '{}'::jsonb, 0) RETURNING id`, [deskId, 'מפה מבצעית']
    );
    mapServiceId = Number(mapSvc[0].id);

    const { rows: stripsSvc } = await pool.query(
      `INSERT INTO mission_desk_services (desk_id, service_type, name, config, sort_order)
       VALUES ($1, 'strips', $2, $3::jsonb, 1) RETURNING id`,
      [deskId, 'פ"ממים של המפה', JSON.stringify({ map_service_id: mapServiceId })]
    );
    const stripsServiceId = Number(stripsSvc[0].id);

    // פריסה: מפה משמאל, חלון הפ"ממים שלה מימין
    const layout = {
      id: 'root', type: 'split', direction: 'h', sizes: [70, 30],
      children: [
        { id: 'l-map', type: 'leaf', service_id: mapServiceId },
        { id: 'l-strips', type: 'leaf', service_id: stripsServiceId },
      ],
    };
    await pool.query(`UPDATE mission_desks SET layout_json = $1::jsonb WHERE id = $2`, [JSON.stringify(layout), deskId]);

    const mapConfig = { [String(mapServiceId)]: { map_id: mapId, transfer_points: [], sector_maps_enabled: false, sector_map_ids: [] } };
    const { rows: preset } = await pool.query(
      `INSERT INTO workstation_presets (name, preset_type, mission_desk_id, mission_desk_map_config, relevant_sectors)
       VALUES ($1, 'mission_desk', $2, $3::jsonb, '[]'::jsonb) RETURNING id`,
      [stationName, deskId, JSON.stringify(mapConfig)]
    );
    presetId = Number(preset[0].id);

    // תוכן ל"חלון הכללי" (סרגל העזרים). בלעדיו הסרגל מוסתר בכל עמדה - ואז
    // הבדיקה שהוא מוצג גם בדסק משימה לא הייתה אומרת דבר.
    await pool.query(
      `INSERT INTO preset_links (preset_id, url, name, category, sort_order)
       VALUES ($1, 'https://example.invalid', $2, 'כללי', 0)`,
      [presetId, `${STAMP} קישור`]
    );
  });

  test.afterAll(async () => {
    if (!pool) return;
    if (presetId != null) await pool.query(`DELETE FROM preset_links WHERE preset_id = $1`, [presetId]).catch(() => {});
    if (presetId != null) await pool.query(`DELETE FROM workstation_presets WHERE id = $1`, [presetId]).catch(() => {});
    if (deskId != null) await pool.query(`DELETE FROM mission_desks WHERE id = $1`, [deskId]).catch(() => {});
    await pool?.end().catch(() => {});
  });

  test('המפה וחלון הפ"ממים שלה מרונדרים בתוך פריסת הדסק', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await loginToWorkstation(page, { preset: stationName });

    // 1. קנבס הדסק עלה
    const canvas = page.locator('[data-testid="mission-desk-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 30000 });

    // 2. פאנל המפה - אותו רכיב של עמדת הבקר - יושב **בתוך** הקנבס
    const panel = canvas.locator('[data-map-panel]');
    await expect(panel).toHaveCount(1, { timeout: 30000 });
    await expect(panel).toBeVisible();

    // 3. תמונת המפה עצמה נטענה (ולא רק המסגרת)
    const img = panel.locator('img').first();
    await expect(img).toBeVisible({ timeout: 30000 });
    const loaded = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
    expect(loaded, 'תמונת המפה לא נטענה בתוך חלון הדסק').toBe(true);

    // 4. הפאנל ממלא את האזור שהוקצה לו בפריסה, ולא גולש על כל המסך
    const canvasBox = await canvas.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(panelBox!.width).toBeLessThan(canvasBox!.width * 0.9);   // 70% מהרוחב לפי הפריסה

    // 5. חלון הפ"ממים של אותה מפה מרונדר לצידה
    await expect(canvas.getByText('פ"ממים של המפה')).toBeVisible();

    // 6. סרגל העזרים ("החלון הכללי") נשאר בצד, כמו בכל עמדה - הדברים הגנריים
    //    (בד"חים, עזרים, קישורים) אינם שייכים למפה מסוימת ולכן אינם בפריסת הדסק
    await expect(page.locator('[data-help="aidsPanel"]')).toHaveCount(1);

    expect(errors, `שגיאות ריצה בדף: ${errors.join(' | ')}`).toHaveLength(0);

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk-maps.png', fullPage: false });
  });

  test('מסך הניהול: קטגוריות מכווצות + קבוצת הגדרות לכל חלון מפה', async ({ page }) => {
    test.setTimeout(180000);
    await setScreenSize(page);
    await page.goto('/');
    await identifyViaMirage(page);
    await page.getByRole('button', { name: /ניהול מערכת/ }).click();
    await page.getByRole('button', { name: '🖥 עמדות', exact: true }).click();

    const row = page.locator('[data-testid="admin-preset-row"]').filter({ hasText: stationName });
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await row.getByRole('button', { name: /^עריכה$|^Edit$/ }).click();

    // 1. הקטגוריות של הטופס קיימות ו**מכווצות** - זו ברירת המחדל שנדרשה.
    //    התוכן נשאר mounted בכוונה (שומר state של עורכים), ולכן נבדקת נראות
    //    ולא קיום ב-DOM.
    const mapCat = page.getByRole('button', { name: /מפה, גזרות ותפקיד/ });
    await expect(mapCat).toBeVisible({ timeout: 20000 });
    const roleLabel = page.getByText('תפקיד עמדה:', { exact: false }).first();
    await expect(roleLabel).toBeHidden();

    // 2. פתיחה של קטגוריה חושפת את תוכנה
    await mapCat.click();
    await expect(roleLabel).toBeVisible();

    // 3. קבוצת ההגדרות של חלון המפה - קבוצה נפרדת לכל מפה בדסק, מכווצת אף היא
    const mapGroup = page.getByRole('button', { name: /קבוצת מפה 1/ });
    await expect(mapGroup).toBeVisible();
    const tpLabel = page.getByText('נקודות העברה בחלון זה').first();
    await expect(tpLabel).toBeHidden();
    await mapGroup.click();
    await expect(tpLabel).toBeVisible();

    await page.screenshot({ path: 'e2e/__screenshots__/mission-desk-admin-groups.png', fullPage: false });
  });
});
