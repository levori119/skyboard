import { test, expect } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// ─── עכבר במצב אזורי-טיסה: גרירת HTML5 (draggable/onDragStart) אל נקודה זמנית ──
test('html5 drag (mouse, fz mode) onto provisional chip transfers', async ({ page }) => {
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

  await expect(page.locator('.prov-drop-zone[data-prov-id]').first()).toBeVisible({ timeout: 12000 });

  const usedAt = async () => (await page.request.get(`/api/provisional-transfer-points?preset_id=${mine.id}`).then(r => r.json())).find((p: any) => p.id === created.id)?.last_used_at;
  const t0 = await usedAt();

  const ok = await page.evaluate(() => {
    const rows = ([...document.querySelectorAll('div')] as HTMLElement[]).filter(d => {
      const r = d.getBoundingClientRect();
      return r.left > 760 && r.width > 150 && r.width < 280 && r.height > 28 && r.height < 70 && /גובה|:/.test(d.textContent || '') && (d.textContent || '').length < 60;
    });
    // מצא את השורה עם draggable=true (מצב fz)
    const row = rows.find(r => (r.closest('[draggable="true"]') as HTMLElement) || r.getAttribute('draggable') === 'true')?.closest('[draggable="true"]') as HTMLElement || rows[0];
    const chip = document.querySelector('.prov-drop-zone[data-prov-id]') as HTMLElement;
    if (!row || !chip) return false;
    const rr = row.getBoundingClientRect(); const cr = chip.getBoundingClientRect();
    const dt = new DataTransfer();
    const fire = (type: string, x: number, y: number, target: EventTarget) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      target.dispatchEvent(ev);
    };
    fire('dragstart', rr.left + 40, rr.top + rr.height / 2, row);
    fire('dragover', cr.left + 10, cr.top + 10, chip);
    fire('drop', cr.left + 10, cr.top + 10, chip);
    return dt.getData('text/plain').length > 0;
  });
  expect(ok, 'dragstart set dataTransfer').toBeTruthy();

  await page.waitForTimeout(1500);
  const t1 = await usedAt();
  await page.request.delete(`/api/provisional-transfer-points/${created.id}`).catch(() => {});
  expect(new Date(t1).getTime(), 'html5 drop should transfer + touch').toBeGreaterThan(new Date(t0).getTime());
});
