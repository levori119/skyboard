import { describe, it, expect, afterAll } from 'vitest';
import i18n, { setAppLanguage } from './index';

describe('i18n', () => {
  afterAll(() => setAppLanguage('he'));

  it('ברירת המחדל היא עברית', () => {
    expect(i18n.language).toBe('he');
  });

  it('כיווניות: עברית=rtl, אנגלית=ltr', () => {
    expect(i18n.dir('he')).toBe('rtl');
    expect(i18n.dir('en')).toBe('ltr');
  });

  it('setAppLanguage מחליף שפה ומעדכן כיווניות ל-ltr', () => {
    setAppLanguage('en');
    expect(i18n.language).toBe('en');
    expect(i18n.dir()).toBe('ltr');
  });

  it('חזרה לעברית מחזירה rtl', () => {
    setAppLanguage('he');
    expect(i18n.language).toBe('he');
    expect(i18n.dir()).toBe('rtl');
  });

  it('מפתחות תרגום קיימים בשתי השפות (login.selectWorkstation)', () => {
    expect(i18n.getFixedT('he')('login.selectWorkstation')).toBe('בחירת עמדה');
    expect(i18n.getFixedT('en')('login.selectWorkstation')).toBe('Select Workstation');
  });

  it('interpolation עובד (searchCrew עם total — לא count, כדי לא לטריגר plural)', () => {
    expect(i18n.getFixedT('en')('login.searchCrew', { total: 5 })).toBe('Search 5 crew members...');
    expect(i18n.getFixedT('he')('login.searchCrew', { total: 3 })).toBe('חפש מתוך 3 אנשי צוות...');
  });
});
