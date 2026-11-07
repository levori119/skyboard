import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StripFieldForm, StripFieldBadge } from './StripControlsEditor';
import { StripControl } from '../classic/StripControl';
import type { StripControl as StripControlDef } from '../../types/stripControls';

// סוג הנתון בטופס "שדה חדש" ובפקד עצמו (CIV_STRIP_CONTROLS.md §2.4).
// אין DOM כאן - renderToStaticMarkup בלבד, ולכן הבדיקות על מאפייני data-*
// ולא על טקסט (הוא עובר escaping ו-not.toContain על טקסט עובר תמיד).

const form = (draft: Partial<StripControlDef>) =>
  renderToStaticMarkup(<StripFieldForm draft={draft} onChange={() => {}} />);

const FIELD: StripControlDef = { id: '4', key: 'fld_4', label: 'שעה', type: 'field', input: 'keyboard', scope: 'global' };

describe('StripFieldForm - בורר סוג נתון', () => {
  it('מוצג בשדה, עם ששת הסוגים', () => {
    const html = form({ type: 'field' });
    expect(html).toContain('data-field-data-type');
    for (const v of ['text', 'integer', 'decimal', 'time', 'date', 'datetime']) {
      expect(html).toContain(`value="${v}"`);
    }
  });

  it('לא מוצג בפקד שאינו שדה', () => {
    expect(form({ type: 'button' })).not.toContain('data-field-data-type');
  });

  it('כתב יד + סוג שאינו טקסט = אזהרה שהסוג לא נאכף, ולא בורר "נדלק" בלי השפעה', () => {
    expect(form({ type: 'field', input: 'handwriting', dataType: 'integer' })).toContain('data-field-data-type-warn');
    expect(form({ type: 'field', input: 'keyboard', dataType: 'integer' })).not.toContain('data-field-data-type-warn');
    expect(form({ type: 'field', input: 'handwriting', dataType: 'text' })).not.toContain('data-field-data-type-warn');
  });

  it('ב"מ של שדה תאריך הוא בורר תאריך, ושל שעה - בורר שעה', () => {
    expect(form({ type: 'field', dataType: 'date', defaultValue: '2026-11-07' })).toContain('type="date"');
    expect(form({ type: 'field', dataType: 'datetime', defaultValue: '2026-11-07 14:30' })).toContain('value="2026-11-07T14:30"');
    expect(form({ type: 'field', dataType: 'time' })).toContain('type="time"');
  });

  it('ב"מ של שדה מספרי - הקלדה מספרית', () => {
    expect(form({ type: 'field', dataType: 'integer' })).toContain('inputMode="numeric"');
    expect(form({ type: 'field', dataType: 'decimal' })).toContain('inputMode="decimal"');
  });
});

describe('StripFieldBadge', () => {
  it('שדה עם סוג נתון מציג את הסוג בתג', () => {
    expect(renderToStaticMarkup(<StripFieldBadge field={{ ...FIELD, dataType: 'time' }} />)).toContain('data-badge-data-type="time"');
  });

  it('שדה טקסט - בלי תג סוג, כמו היום', () => {
    expect(renderToStaticMarkup(<StripFieldBadge field={FIELD} />)).not.toContain('data-badge-data-type');
  });
});

describe('StripControl - סוג הנתון על הפקד', () => {
  const render = (control: StripControlDef) =>
    renderToStaticMarkup(<StripControl control={control} value="" onChange={() => {}} />);

  it('שדה ותיק בלי סוג מתנהג כטקסט', () => {
    expect(render(FIELD)).toContain('data-strip-control-type="text"');
  });

  it('שדה שעה מסומן בסוגו', () => {
    expect(render({ ...FIELD, dataType: 'time' })).toContain('data-strip-control-type="time"');
  });
});
