import { describe, it, expect } from 'vitest';
import { isLoadRelevant } from './loadRelevance';

describe('isLoadRelevant - דגל "עומס רלוונטי לעמדה?"', () => {
  it('עמדה ותיקה בלי הדגל - העומס נשאר כפי שהיה (דולק)', () => {
    expect(isLoadRelevant({ preset_type: 'normal' })).toBe(true);
    expect(isLoadRelevant({ preset_type: 'normal', load_relevant: null })).toBe(true);
  });

  it('דגל דולק - רלוונטי', () => {
    expect(isLoadRelevant({ preset_type: 'classic', load_relevant: true })).toBe(true);
  });

  it('דגל כבוי - לא רלוונטי', () => {
    expect(isLoadRelevant({ preset_type: 'normal', load_relevant: false })).toBe(false);
  });

  it('עמדת ניהול קרקע - אף פעם לא רלוונטי, גם כשהדגל דולק', () => {
    expect(isLoadRelevant({ preset_type: 'ground_mgmt', load_relevant: true })).toBe(false);
  });

  it('תצורה שטרם נטענה - לא מסתירים (ההתנהגות הקיימת)', () => {
    expect(isLoadRelevant(null)).toBe(true);
    expect(isLoadRelevant(undefined)).toBe(true);
  });
});
