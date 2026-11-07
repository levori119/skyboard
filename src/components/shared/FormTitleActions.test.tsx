// שמירה גם בכותרת הטופס - מה באמת מתרנדר (אין jsdom: renderToStaticMarkup בלבד).
//
// ⚠️ בדיקות "לא מכיל" נשענות על data-testid ולא על טקסט עם גרשיים -
// renderToStaticMarkup בורח מגרשיים, ו-not.toContain על מחרוזת כזו עובר תמיד.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { FormTitleBar, TitleSaveButton, ADMIN_STICKY_TOP } from './FormTitleActions';
import { SettingsModal, MaybeSettingsModal } from './Modals';

const noop = () => {};

describe('TitleSaveButton - כפתור השמירה שבכותרת', () => {
  it('מציג את התווית שהועברה (אותה תווית כמו הכפתור התחתון)', () => {
    const html = renderToStaticMarkup(<TitleSaveButton onSave={noop} label="עדכון" />);
    expect(html).toContain('עדכון');
    expect(html).toContain('data-testid="form-title-save"');
    expect(html).not.toContain('disabled');
  });

  it('נעול כשהטופס נעול (שומר / לא תקין)', () => {
    const html = renderToStaticMarkup(<TitleSaveButton onSave={noop} label="שמור" disabled />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('cursor:not-allowed');
  });

  it('type="button" - לא שולח טופס עוטף בטעות', () => {
    expect(renderToStaticMarkup(<TitleSaveButton onSave={noop} label="שמור" />)).toContain('type="button"');
  });
});

describe('FormTitleBar - שורת הכותרת של טופס בדף', () => {
  it('כותרת + כפתור שמירה, דביקה מתחת לכותרת מסך הניהול', () => {
    const html = renderToStaticMarkup(<FormTitleBar title="מוד חדש" save={{ onSave: noop, label: 'שמירה' }} />);
    expect(html).toContain('מוד חדש');
    expect(html).toContain('data-testid="form-title-save"');
    expect(html).toContain('position:sticky');
    expect(html).toContain(`top:${ADMIN_STICKY_TOP}px`);
  });

  it('בלי save - שורת כותרת בלבד, בלי כפתור', () => {
    const html = renderToStaticMarkup(<FormTitleBar title="עריכה" />);
    expect(html).toContain('עריכה');
    expect(html).not.toContain('form-title-save');
  });

  it('sticky={false} - לא דביקה (למשל בתוך מודל שהכותרת שלו כבר קבועה)', () => {
    const html = renderToStaticMarkup(<FormTitleBar title="עריכה" sticky={false} save={{ onSave: noop, label: 'שמור' }} />);
    expect(html).not.toContain('position:sticky');
  });
});

describe('SettingsModal - שמור בכותרת המודל', () => {
  it('עם save - הכפתור בכותרת, לפני גוף המודל הנגלל', () => {
    const html = renderToStaticMarkup(
      <SettingsModal title="עריכת מרחב" onClose={noop} save={{ onSave: noop, label: 'שמור' }}>
        <div data-testid="form-body">x</div>
      </SettingsModal>
    );
    const header = html.indexOf('data-testid="settings-modal-header"');
    const btn = html.indexOf('data-testid="form-title-save"');
    const body = html.indexOf('data-testid="settings-modal-body"');
    expect(header).toBeGreaterThan(-1);
    expect(btn).toBeGreaterThan(header);
    expect(body).toBeGreaterThan(btn);
    expect(html.indexOf('data-testid="form-body"')).toBeGreaterThan(body);
  });

  it('הכותרת מחוץ לאזור הגלילה - רק הגוף נגלל', () => {
    const html = renderToStaticMarkup(<SettingsModal title="t" onClose={noop}><span /></SettingsModal>);
    const bodyTag = html.slice(html.indexOf('data-testid="settings-modal-body"'));
    expect(bodyTag.slice(0, bodyTag.indexOf('>'))).toContain('overflow-y:auto');
    const headerTag = html.slice(html.indexOf('data-testid="settings-modal-header"'));
    expect(headerTag.slice(0, headerTag.indexOf('>'))).not.toContain('overflow-y');
  });

  it('בלי save - אין כפתור בכותרת (מודל שאינו טופס)', () => {
    const html = renderToStaticMarkup(<SettingsModal title="t" onClose={noop}><span /></SettingsModal>);
    expect(html).not.toContain('form-title-save');
  });

  it('MaybeSettingsModal מעביר את save למודל, ובמצב בדף לא מוסיף כלום', () => {
    const shown = renderToStaticMarkup(<MaybeSettingsModal show title="t" onClose={noop} save={{ onSave: noop, label: 'עדכון' }}><span /></MaybeSettingsModal>);
    expect(shown).toContain('data-testid="form-title-save"');
    const inline = renderToStaticMarkup(<MaybeSettingsModal show={false} title="t" onClose={noop} save={{ onSave: noop, label: 'עדכון' }}><span /></MaybeSettingsModal>);
    expect(inline).toBe('<span></span>');
  });
});
