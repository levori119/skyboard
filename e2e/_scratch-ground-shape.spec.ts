import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders, loginToWorkstation } from './helpers';

// מדידה חד-פעמית: איפה נוחתת הצורה בעמדת שדה אמיתית מול איפה שהעט נגרר.
// קובץ scratch - נמחק אחרי האבחון.

const API = 'http://localhost:3001/api';
let api: APIRequestContext;

test.describe.configure({ timeout: 240000 });

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });
});

test('מדידת היסט הצורה בעמדת שדה', async ({ page }) => {
  const presets = await (await api.get(`${API}/workstation-presets`)).json();
  const preset = (presets as any[]).find(p => p.preset_type === 'ground' && !String(p.name || '').startsWith('__'));
  test.skip(!preset, 'אין עמדת שדה ב-DB');

  await loginToWorkstation(page, { preset: preset!.name });
  await expect(page.locator('#ground-map-area')).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(2500);

  // מצב הסביבה: --s, גדלי המכולה מול הקנבס
  const env = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-draw-canvas]');
    const parent = canvas?.parentElement ?? null;
    const r = canvas?.getBoundingClientRect();
    return {
      s: getComputedStyle(document.documentElement).getPropertyValue('--s').trim(),
      drawCanvases: document.querySelectorAll('[data-draw-canvas]').length,
      parentClient: parent ? { w: parent.clientWidth, h: parent.clientHeight } : null,
      parentRect: parent ? { w: +parent.getBoundingClientRect().width.toFixed(1), h: +parent.getBoundingClientRect().height.toFixed(1) } : null,
      parentTransform: parent ? getComputedStyle(parent).transform : null,
      parentStyle: parent ? (parent.getAttribute('style') || '').slice(0, 90) : null,
      canvasBitmap: canvas ? { w: canvas.width, h: canvas.height } : null,
      canvasRect: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
    };
  });
  console.log('ENV:', JSON.stringify(env, null, 2));

  const chain = await page.evaluate(() => {
    const c = document.querySelector('[data-draw-canvas]');
    const out = [];
    let el = c;
    for (let i = 0; el && i < 8; i++) {
      out.push({
        tag: el.tagName.toLowerCase(), id: el.id || null,
        pos: getComputedStyle(el).position,
        style: (el.getAttribute('style') || '').slice(0, 70),
      });
      el = el.parentElement;
    }
    return out;
  });
  console.log('CHAIN:', JSON.stringify(chain, null, 1));

  // הפעלת ציור + כלי מלבן
  await page.locator('button[title="הפעל ציור על המפה"]').first().click({ force: true });
  await page.getByRole('button', { name: '▭ מלבן' }).click({ force: true });

  const canvas = page.locator('[data-draw-canvas]').first();
  const box = (await canvas.boundingBox())!;
  const from = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.30 };
  const to = { x: box.x + box.width * 0.65, y: box.y + box.height * 0.70 };

  const base = { pointerId: 1, pointerType: 'pen', isPrimary: true, bubbles: true, button: 0, buttons: 1 };
  await canvas.dispatchEvent('pointerdown', { ...base, clientX: from.x, clientY: from.y });
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await canvas.dispatchEvent('pointermove', { ...base, clientX: from.x + (to.x - from.x) * t, clientY: from.y + (to.y - from.y) * t });
  }
  await canvas.dispatchEvent('pointerup', { ...base, buttons: 0, clientX: to.x, clientY: to.y });
  await page.waitForTimeout(300);

  const rect = await page.locator('[data-draw-shapes] rect').last().boundingBox();
  console.log('DRAG :', JSON.stringify({ from, to, w: to.x - from.x, h: to.y - from.y }));
  console.log('SHAPE:', JSON.stringify(rect));
  if (rect) {
    console.log('DELTA:', JSON.stringify({
      dx: +(rect.x - from.x).toFixed(1), dy: +(rect.y - from.y).toFixed(1),
      dw: +(rect.width - (to.x - from.x)).toFixed(1), dh: +(rect.height - (to.y - from.y)).toFixed(1),
    }));
  }
  await page.screenshot({ path: 'e2e/__screenshots__/_scratch-ground-shape.png' });
});
