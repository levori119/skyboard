import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import QuickReadBar from './QuickReadBar';
import { bottomBarSlots, shapeReaderDoc } from '../../utils/reader';

// מה שנבדק כאן הוא מה שהפקח **רואה בתחתית המסך**: שהמדף מציג את העזרים
// ואת מספרם, שכיווץ באמת מוריד אותם, ושחלוקת הרצועה עם סרגל העמדות היא
// מרחבית (שמאל/ימין פיזיים) ולכן אינה מתהפכת כשהממשק עובר לאנגלית.

const docs = [
  shapeReaderDoc({ id: 1, name: 'תדריך בוקר', file_name: 'brief.pdf', has_file: true }),
  shapeReaderDoc({ id: 2, name: 'טבלת גבהים', file_name: 'alt.xlsx', has_file: true }),
];

const render = (props: Partial<Parameters<typeof QuickReadBar>[0]> = {}) =>
  renderToStaticMarkup(
    <QuickReadBar
      items={docs}
      slot={bottomBarSlots(true, false).quick}
      themeMode="dark"
      collapsed={false}
      onToggleCollapsed={() => {}}
      onOpen={() => {}}
      onRemove={() => {}}
      {...props}
    />,
  );

describe('סרגל הקריאה המהירה', () => {
  it('מציג את שמות העזרים ואת מספרם בלשונית', () => {
    const html = render();
    expect(html).toContain('תדריך בוקר');
    expect(html).toContain('טבלת גבהים');
    expect(html).toContain('(2)');
  });

  it('אייקון לפי סוג - PDF וגיליון נבדלים במבט אחד', () => {
    const html = render();
    expect(html).toContain('📕');
    expect(html).toContain('📊');
  });

  it('מכווץ - הלשונית נשארת, העזרים יורדים מהמסך', () => {
    const html = render({ collapsed: true });
    expect(html).toContain('(2)');
    expect(html).not.toContain('תדריך בוקר');
  });

  it('מדף ריק אומר מה לעשות, ולא נשאר ריק בלי הסבר', () => {
    const html = render({ items: [] });
    expect(html).toContain('(0)');
    expect(html).toMatch(/שמור לקריאה מהירה|Save for quick reading/);
  });

  it('לבד ברצועה - כל הרוחב', () => {
    const html = render({ slot: bottomBarSlots(true, false).quick });
    expect(html).toContain('left:0');
    expect(html).toContain('right:0');
  });

  it('עם סרגל העמדות - נצמד לשמאל הפיזי ומפנה את ימין', () => {
    const html = render({ slot: bottomBarSlots(true, true).quick });
    expect(html).toContain('left:0');
    expect(html).toContain('right:66%');
    // לא inset-inline: הסידור מרחבי, ואסור שיתהפך באנגלית
    expect(html).not.toContain('inset-inline');
  });

  it('נגזר-תמה - התמה הבהירה אינה מרנדרת את הרקע הכהה', () => {
    const dark = render({ themeMode: 'dark' });
    const light = render({ themeMode: 'light' });
    const ocean = render({ themeMode: 'ocean' });
    // רקע הרצועה - לא צבע הטקסט, שיכול להיות זהה בין תמות
    expect(dark).toContain('background:#1e293b');
    expect(light).not.toContain('background:#1e293b');
    expect(light).toContain('background:#f1f5f9');
    expect(ocean).toContain('background:#05404e');
  });
});
