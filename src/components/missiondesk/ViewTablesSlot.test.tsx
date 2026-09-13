// משבצת "טבלאות מתצוגה" - לשוניות, הטבלה הפעילה, והפניה למשבצת אחרת.
// אין jsdom בפרויקט: renderToStaticMarkup (localStorage לא קיים ב-node -
// הרכיב חייב לשרוד את זה, כמו במצב פרטי בדפדפן).

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ViewTablesSlot, { resolveActiveTab, type ViewTableTab } from './ViewTablesSlot';
import { useDockableWindow } from '../../hooks/useDockableWindow';

const Marker: React.FC<{ name: string }> = ({ name }) => {
  const dock = useDockableWindow(`m-${name}`, name);
  return <div data-marker={name} data-embedded={String(dock.embedded)} />;
};

const tab = (key: ViewTableTab['key'], node: React.ReactNode | null = <Marker name={key} />): ViewTableTab =>
  ({ key, icon: '•', label: key, node });

describe('resolveActiveTab', () => {
  it('הלשונית השמורה נשארת כשהיא עדיין קיימת', () => {
    expect(resolveActiveTab('messages', ['elements', 'messages'])).toBe('messages');
  });

  it('לשונית שהוסרה בהגדרה - חוזרים לראשונה', () => {
    expect(resolveActiveTab('trips', ['elements', 'messages'])).toBe('elements');
    expect(resolveActiveTab(null, ['messages'])).toBe('messages');
  });

  it('בלי טבלאות - אין לשונית', () => {
    expect(resolveActiveTab('trips', [])).toBeNull();
  });
});

describe('ViewTablesSlot', () => {
  it('בלי טבלאות - הסבר איפה בוחרים אותן', () => {
    const html = renderToStaticMarkup(<ViewTablesSlot presetId={1} serviceId={5} tabs={[]} themeMode="dark" />);
    expect(html).not.toContain('data-marker');
    expect(html).not.toContain('role="tablist"');
  });

  it('טבלה אחת - בלי סרגל לשוניות, מוטמעת', () => {
    const html = renderToStaticMarkup(<ViewTablesSlot presetId={1} serviceId={5} tabs={[tab('trips')]} themeMode="dark" />);
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('data-marker="trips"');
    expect(html).toContain('data-embedded="true"');
  });

  it('כמה טבלאות - לשוניות, ורק הפעילה מורכבת', () => {
    const html = renderToStaticMarkup(
      <ViewTablesSlot presetId={1} serviceId={5} tabs={[tab('elements'), tab('messages')]} themeMode="light" />,
    );
    expect(html).toContain('data-testid="md-vt-tab-elements"');
    expect(html).toContain('data-testid="md-vt-tab-messages"');
    expect(html).toContain('data-marker="elements"');
    expect(html).not.toContain('data-marker="messages"');
  });

  it('טבלה שמוחזקת במשבצת אחרת - לא מורכבת כאן', () => {
    const html = renderToStaticMarkup(<ViewTablesSlot presetId={1} serviceId={5} tabs={[tab('container', null)]} themeMode="ocean" />);
    expect(html).not.toContain('data-marker');
    expect(html).toContain('role="tabpanel"');
  });
});
