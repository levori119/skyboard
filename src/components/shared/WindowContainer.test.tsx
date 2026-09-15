import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../../i18n';
import WindowContainer from './WindowContainer';
import { __resetDockForTests, dockPut, registerDockable } from '../../utils/windowDock';

// רשת המשבצות היא LTR בכוונה (סדר המשבצות וסמן ההכנסה קבועים), אבל החלון
// שנשלח למשבצת ב-portal יורש את הכיוון מה-DOM שמעליו. חלון שלא מגדיר כיוון
// בעצמו (נקודת הצטרפות, בהקפה) נכתב הפוך בעברית. גוף המשבצת מחזיר את כיוון השפה.

function stubStorage(): void {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => mem.clear(),
  };
}

/** הסגנון של העוטף הישיר של FitScaleBox שמחזיק את יעד ה-portal */
const slotBodyStyle = (html: string): string => {
  const at = html.indexOf('data-dock-portal="w1"');
  const open = html.lastIndexOf('data-dock-body', at);
  expect(open).toBeGreaterThan(-1);
  return html.slice(open, html.indexOf('>', open));
};

beforeEach(() => {
  __resetDockForTests();
  stubStorage();
  registerDockable('w1', 'W1');
  dockPut('w1', 0);
});

afterEach(async () => { await i18n.changeLanguage('he'); });

describe('WindowContainer - כיוון החלון במשבצת', () => {
  it('בעברית גוף המשבצת RTL, גם כשהרשת עצמה LTR', async () => {
    await i18n.changeLanguage('he');
    const html = renderToStaticMarkup(<WindowContainer />);
    expect(html).toContain('direction:ltr');
    expect(slotBodyStyle(html)).toContain('direction:rtl');
  });

  it('באנגלית גוף המשבצת LTR', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<WindowContainer />);
    expect(slotBodyStyle(html)).toContain('direction:ltr');
  });
});
