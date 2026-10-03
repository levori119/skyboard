// הבועית בפינה השמאלית העליונה - מה באמת מתרנדר.
//
// ⚠️ `themeMode` מועבר במפורש: `useBodyTheme` קורא מ-`document.body`, ואין
// jsdom בפרויקט. ה-override הוא השער שמאפשר לבדוק את הרכיב בכלל.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ConnectionBanner from './ConnectionBanner';
import { noteStationServing, markOnline, __resetNetStatus } from '../../offline/netStatus';

const render = () => renderToStaticMarkup(<ConnectionBanner themeMode="dark" />);
const AT = Date.parse('2026-10-03T11:32:00Z');

beforeEach(() => __resetNetStatus());

describe('ConnectionBanner - נתק בעמדה עם סוכן', () => {
  it('הכל תקין - אין בועית, והמסך נקי', () => {
    expect(render()).toBe('');
  });

  // ⚠️ זו התקלה שדווחה: בנתק יזום לא הופיעה שום הודעה. הסוכן מנתב למאגר
  // המקומי ומחזיר 200 עם מידע טרי, ולכן `stale` נשאר שקר - והבאנר, שנבנה
  // סביב כשלי רשת, לא עלה כלל.
  it('נתק יזום - בועית עם הודעה שמזהה אותו כיזום', () => {
    noteStationServing({ serving: 'local', simulated: true }, AT);
    markOnline(AT + 1000);   // הסוכן ממשיך להחזיר 200 - וזה לא מכבה את החיווי
    const html = render();
    expect(html).toContain('נתק יזום');
    expect(html).toContain('המאגר המקומי');
    expect(html).toContain('שיתוף מידע בין עמדות מושבת');
  });

  it('נתק אמיתי - אותה בועית, בלי המילה "יזום"', () => {
    noteStationServing({ serving: 'local', simulated: false }, AT);
    const html = render();
    expect(html).toContain('נתק מהמרכז');
    expect(html.includes('נתק יזום')).toBe(false);
  });

  // הפינה נבחרה מפורשות, ו-`left` פיזי כדי שלא תקפוץ לצד השני באנגלית
  it('יושבת בפינה השמאלית העליונה, בענבר, ופועמת', () => {
    noteStationServing({ serving: 'local', simulated: true }, AT);
    const html = render();
    expect(html).toContain('left:8px');
    expect(html).toContain('inset-block-start:8px');
    expect(html).toContain('#f59e0b');
    expect(html).toContain('conn-bubble-alert');
  });

  it('חזרה למרכז - הבועית נעלמת', () => {
    noteStationServing({ serving: 'local' }, AT);
    expect(render()).not.toBe('');
    noteStationServing({ serving: 'remote' }, AT + 5000);
    expect(render()).toBe('');
  });
});
