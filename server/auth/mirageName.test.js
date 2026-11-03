import { describe, it, expect } from 'vitest';
import { mirageFullName, withMirageName } from './mirageName.js';

describe('withMirageName - השם ממיראז\' גובר על השם השמור', () => {
  const member = { id: 7, name: 'אורן בן דור', first_name: 'אורן', last_name: 'בן דור', personal_id: '123' };
  it('שם ששונה במיראז\' - מתעדכן', () => {
    const r = withMirageName(member, { fullName: 'אורן בן-דור', firstName: 'אורן', lastName: 'בן-דור' });
    expect(r.changed).toBe(true);
    expect(r.member.name).toBe('אורן בן-דור');
    expect(r.member.last_name).toBe('בן-דור');
    expect(r.member.id).toBe(7);
  });
  it('אותו שם - בלי שינוי', () => {
    expect(withMirageName(member, { fullName: 'אורן בן דור', firstName: 'אורן', lastName: 'בן דור' }).changed).toBe(false);
  });
  it('בלי שם ממיראז\' - נשאר השם הקיים', () => {
    const r = withMirageName(member, {});
    expect(r.changed).toBe(false);
    expect(r.member.name).toBe('אורן בן דור');
  });
  it('fullName חסר - פרטי + משפחה', () => {
    expect(mirageFullName({ firstName: 'דנה', lastName: 'כהן' })).toBe('דנה כהן');
    expect(mirageFullName(null)).toBe('');
  });
});
