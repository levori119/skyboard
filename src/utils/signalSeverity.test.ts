// חומרת הודעה בלוח ההודעות - רגיל (ירוק) / חמור (אדום) / קריטי (אדום מהבהב).
import { describe, it, expect } from 'vitest';
import {
  SIGNAL_SEVERITIES, normSeverity, severityPaint, severityDot, CRITICAL_BLINK_CLASS,
  type SignalSeverity,
} from './signalSeverity';

describe('normSeverity - נורמליזציה', () => {
  it('מחזיר את שלוש החומרות המוכרות כמו שהן', () => {
    for (const sev of SIGNAL_SEVERITIES) expect(normSeverity(sev)).toBe(sev);
  });

  it("הודעה ישנה מלפני הפיצ'ר (בלי severity) נופלת לרגיל - ולא נשארת בלי צבע", () => {
    expect(normSeverity(undefined)).toBe('normal');
    expect(normSeverity(null)).toBe('normal');
  });

  it('ערך זר מה-DB או מלקוח ישן נופל לרגיל ולא מחלחל לתצוגה', () => {
    expect(normSeverity('URGENT')).toBe('normal');
    expect(normSeverity(3)).toBe('normal');
    expect(normSeverity({ severity: 'critical' })).toBe('normal');
  });
});

describe('severityPaint - הצבעים התפעוליים', () => {
  it('רגיל ירוק, חמור וקריטי אדומים', () => {
    expect(severityPaint('normal').bg).toBe('#5cb85c');
    expect(severityPaint('severe').bg).toBe('#dc2626');
    expect(severityPaint('critical').bg).toBe('#dc2626');
  });

  it('לכל חומרה יש רקע, מסגרת וטקסט - כלומר cell() לעולם לא מקבל undefined', () => {
    for (const sev of SIGNAL_SEVERITIES) {
      const p = severityPaint(sev);
      expect(p.bg).toMatch(/^#/);
      expect(p.border).toMatch(/^#/);
      expect(p.text).toMatch(/^#/);
    }
  });

  it('חומרה לא חוקית (JS ללא טיפוסים) נצבעת ירוק ולא קורסת', () => {
    expect(severityPaint('nope' as SignalSeverity).bg).toBe(severityPaint('normal').bg);
  });

  it('נקודת החיווי זהה לרקע הכפתור - אותו קוד צבע בלוח ובהגדרת העמדה', () => {
    for (const sev of SIGNAL_SEVERITIES) expect(severityDot(sev)).toBe(severityPaint(sev).bg);
  });
});

describe('הבהוב "קריטי"', () => {
  it('שם המחלקה תואם ל-keyframes ב-App.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../App.css'), 'utf8');
    expect(CRITICAL_BLINK_CLASS).toBe('sig-critical-blink');
    expect(css).toContain(`.${CRITICAL_BLINK_CLASS}`);
    expect(css).toContain('@keyframes signal-critical-blink');
  });

  it('ההבהוב אינו מוריד את הטקסט ל-opacity 0 - הכיתוב חייב להישאר קריא', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../App.css'), 'utf8');
    const block = css.slice(css.indexOf('@keyframes signal-critical-blink'));
    expect(block.slice(0, block.indexOf('}\n}')).replace(/\s/g, '')).not.toContain('opacity:0');
  });
});
