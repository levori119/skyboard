import { test, expect, Page } from '@playwright/test';
import { loginToWorkstation } from './helpers';

// קובץ עזר זמני לאימות ויזואלי של בועית הנתק - נמחק בסוף.
const cutCable = async (page: Page) => {
  await page.route('**/api/**', route => route.abort('connectionfailed'));
  await page.evaluate(() => fetch('/api/sectors').catch(() => {}));
};

for (const mode of ['dark', 'light'] as const) {
  test(`scratch: בועית נתק ${mode}`, async ({ page }) => {
    await page.addInitScript(m => localStorage.setItem('bt-themeMode', m), mode);
    await loginToWorkstation(page);
    await cutCable(page);

    const banner = page.getByRole('status').filter({ hasText: /עבודה מקומית|Local mode/ });
    await expect(banner).toBeVisible({ timeout: 30000 });

    // האם הצומת מוחלף? מסמנים אותו ובודקים אם הסימון שורד
    for (let i = 0; i < 4; i++) {
      const info = await banner.evaluate(el => {
        const h = el as HTMLElement & { __mark?: number };
        const s = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        const marked = h.__mark != null;
        h.__mark = 1;
        return {
          connected: h.isConnected, marked,
          bg: s.backgroundColor, fg: s.color, cls: h.className,
          box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          all: document.querySelectorAll('[role="status"]').length,
          anim: s.animationName,
        };
      });
      const probe = await page.evaluate(() => {
        const w = window as any;
        return { renders: w.__cbRenders, mounts: w.__cbMounts, unmounts: w.__cbUnmounts, bodyCls: document.body.className };
      });
      console.log(`[${mode}#${i}]`, JSON.stringify(info), JSON.stringify(probe));
      await page.waitForTimeout(700);
    }

    await page.screenshot({ path: `test-results/scratch-offline-${mode}.png`, clip: { x: 0, y: 0, width: 700, height: 200 } });

    await page.unroute('**/api/**');
    const restored = page.getByRole('status').filter({ hasText: /הקשר לשרת חזר/ });
    await expect(restored).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: `test-results/scratch-restored-${mode}.png`, clip: { x: 0, y: 0, width: 700, height: 200 } });
  });
}
