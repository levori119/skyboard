import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// התראת שורה בטבלה (קונפליקט גובה / חריגה מבלוק) חייבת להיראות זהה
// בחלק המקובע (.frozen-col) ובחלק הנגלל. המלכודת: לעמודות המקובעות
// ולשורות הטבלה יש background עם !important פר-תמה (יום/אוקיינוס), ו-!important
// גובר על אנימציה ב-cascade של CSS - ולכן צביעה ב-background השאירה את
// החלק המקובע בצבע התמה בזמן שהחלק הנגלל התריע. הפתרון: box-shadow פנימי.
const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');

describe('התראת שורה בטבלה - קונפליקט וחריגה מבלוק', () => {
  for (const [name, cls] of [
    ['קונפליקט גובה', 'alt-conflict-flash'],
    ['חריגה מבלוק', 'block-deviation-flash'],
  ] as const) {
    it(`${name} - ההתראה נצבעת על התאים (> td) ולא רק על השורה`, () => {
      expect(css).toMatch(new RegExp(`tr\\.${cls}\\s*>\\s*td\\s*\\{[^}]*animation:`));
    });

    it(`${name} - הצביעה ב-box-shadow פנימי, שלא נדרס ע"י background עם !important`, () => {
      const rule = css.match(new RegExp(`tr\\.${cls}\\s*>\\s*td\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      const keyframeName = rule.match(/animation:\s*([\w-]+)/)?.[1] ?? '';
      expect(keyframeName).not.toBe('');
      const frames = css.match(new RegExp(`@keyframes\\s+${keyframeName}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
      expect(frames).toContain('box-shadow: inset');
      expect(frames).not.toContain('background');
    });

    it(`${name} - לתמת היום יש גרסה בהירה, כי הטקסט בטבלה כהה`, () => {
      expect(css).toMatch(new RegExp(`body\\.light-mode\\s+tr\\.${cls}\\s*>\\s*td\\s*\\{[^}]*animation-name:`));
    });
  }
});
