import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── גרירת פ"מ לנקודת העברה זמנית עובדת גם ב-flight-zones mode ────────────────
// רגרסיה: ב-FZ mode הגרירה עוברת דרך handler נפרד (fzDrag) שלא זיהה .prov-drop-zone.
// הבדיקה מדמה את הגרירה (dispatch של pointer events על שורת הפ"מ) ומוודאת touch.
test('dropping a formation on a provisional point transfers (fz mode too)', async ({ page }) => {
  const presetName = await loginToWorkstation(page);
  const presets = await page.request.get('/api/workstation-presets').then(r => r.json());
  const mine = presets.find((p: any) => String(p.name || '').trim() === String(presetName).trim());
  const partner = presets.find((p: any) => p.id !== mine.id);

  const existing = await page.request.get(`/api/provisional-transfer-points?preset_id=${mine.id}`).then(r => r.json()).catch(() => []);
  for (const p of existing) if (String(p.name).startsWith('E2E')) await page.request.delete(`/api/provisional-transfer-points/${p.id}`).catch(() => {});

  const created = await page.request.post('/api/provisional-transfer-points', {
    data: { name: 'E2E-נק', preset_a: mine.id, preset_b: partner.id, created_by: 'e2e' },
  }).then(r => r.json());
  await page.request.post(`/api/provisional-transfer-points/${created.id}/approve`);

  const chip = page.locator('.prov-drop-zone[data-prov-id]').first();
  await expect(chip).toBeVisible({ timeout: 12000 });
  const cb = await chip.boundingBox();

  const usedAt = async () => (await page.request.get(`/api/provisional-transfer-points?preset_id=${mine.id}`).then(r => r.json())).find((p: any) => p.id === created.id)?.last_used_at;
  const t0 = await usedAt();

  const ok = await page.evaluate(({ chipX, chipY }) => {
    const rows = ([...document.querySelectorAll('div')] as HTMLElement[]).filter(d => {
      const r = d.getBoundingClientRect();
      return r.left > 760 && r.width > 150 && r.width < 280 && r.height > 28 && r.height < 70 && /גובה|:/.test(d.textContent || '') && (d.textContent || '').length < 60;
    });
    const row = rows[0];
    if (!row) return false;
    const rr = row.getBoundingClientRect();
    const sx = Math.round(rr.left + 40), sy = Math.round(rr.top + rr.height / 2);
    const fire = (type: string, x: number, y: number, t: EventTarget) =>
      t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0 }));
    fire('pointerdown', sx, sy, row);
    fire('pointermove', sx - 12, sy, row);
    fire('pointermove', Math.round(chipX), Math.round(chipY), row);
    fire('pointerup', Math.round(chipX), Math.round(chipY), row);
    return true;
  }, { chipX: cb!.x + cb!.width / 2, chipY: cb!.y + cb!.height / 2 });
  expect(ok, 'found a strip row to drag').toBeTruthy();

  await page.waitForTimeout(1500);
  const t1 = await usedAt();
  await page.request.delete(`/api/provisional-transfer-points/${created.id}`).catch(() => {});

  expect(new Date(t1).getTime(), 'drop should transfer + touch the point').toBeGreaterThan(new Date(t0).getTime());
});
