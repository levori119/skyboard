import { describe, it, expect } from 'vitest';
import {
  parseRoadRelevance, hasRoadRelevance, routeSequenceOf, elementAppliesToPath, relevanceLabel,
} from './elementRoadRelevance.js';

describe('parseRoadRelevance', () => {
  it('מערך תקין נשמר, cross_route_id חסר הופך ל-null', () => {
    expect(parseRoadRelevance([{ route_id: 3 }])).toEqual([{ route_id: 3, cross_route_id: null }]);
  });
  it('מחרוזת JSON מפורסרת', () => {
    expect(parseRoadRelevance('[{"route_id":3,"cross_route_id":7}]')).toEqual([{ route_id: 3, cross_route_id: 7 }]);
  });
  it('ערך פגום או ריק - מערך ריק, ולא זריקה', () => {
    expect(parseRoadRelevance(null)).toEqual([]);
    expect(parseRoadRelevance('לא JSON')).toEqual([]);
    expect(parseRoadRelevance({ route_id: 3 })).toEqual([]);
    expect(parseRoadRelevance([{ cross_route_id: 7 }])).toEqual([]);
  });
  it('כפילויות מסוננות', () => {
    expect(parseRoadRelevance([{ route_id: 3, cross_route_id: 7 }, { route_id: 3, cross_route_id: 7 }]))
      .toEqual([{ route_id: 3, cross_route_id: 7 }]);
  });
  it('צומת עם עצמו אינו צומת', () => {
    expect(parseRoadRelevance([{ route_id: 3, cross_route_id: 3 }])).toEqual([{ route_id: 3, cross_route_id: null }]);
  });
});

describe('hasRoadRelevance', () => {
  it('אלמנט בלי הגדרה', () => {
    expect(hasRoadRelevance({ road_relevance: [] })).toBe(false);
    expect(hasRoadRelevance({})).toBe(false);
  });
  it('אלמנט עם הגדרה', () => {
    expect(hasRoadRelevance({ road_relevance: [{ route_id: 1 }] })).toBe(true);
  });
});

describe('routeSequenceOf', () => {
  it('רצף הנתיבים של הנתיב המתוכנן - בלי כפילויות רצופות', () => {
    const wps = [{ routeId: 1 }, { routeId: 1 }, { routeId: 2 }, { routeId: 2 }, { routeId: 1 }];
    expect(routeSequenceOf(wps)).toEqual([1, 2, 1]);
  });
  it('נקודות בלי routeId (נתיב ישן) מדולגות', () => {
    expect(routeSequenceOf([{ routeId: null }, { routeId: 4 }, {}])).toEqual([4]);
  });
  it('מערך ריק', () => {
    expect(routeSequenceOf(null)).toEqual([]);
  });
});

describe('elementAppliesToPath', () => {
  const path = [1, 2, 5];   // הנסיעה: נתיב 1 -> נתיב 2 -> נתיב 5

  it('אלמנט בלי הגדרה - null (נופלים לכלל הגאומטרי)', () => {
    expect(elementAppliesToPath({}, path)).toBe(null);
  });
  it('נתיב מוצהר שהנסיעה לא עוברת בו - לא רלוונטי', () => {
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 9 }] }, path)).toBe(false);
  });
  it('רמזור באמצע נתיב (בלי צומת) - רלוונטי כשהנסיעה על הנתיב', () => {
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 2 }] }, path)).toBe(true);
  });
  it('רמזור בצומת - רלוונטי רק כשהנסיעה עוברת מנתיב לנתיב', () => {
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 1, cross_route_id: 2 }] }, path)).toBe(true);
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 2, cross_route_id: 1 }] }, path)).toBe(true);
  });
  it('שני הנתיבים בנסיעה אבל לא נפגשים בה - לא רלוונטי', () => {
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 1, cross_route_id: 5 }] }, path)).toBe(false);
  });
  it('די בהגדרה אחת מתוך כמה', () => {
    const el = { road_relevance: [{ route_id: 9 }, { route_id: 5 }] };
    expect(elementAppliesToPath(el, path)).toBe(true);
  });
  it('נסיעה בלי רצף נתיבים (נתיב ישן) - null, כדי שלא ייעלם בשקט', () => {
    expect(elementAppliesToPath({ road_relevance: [{ route_id: 1 }] }, [])).toBe(null);
  });
});

describe('relevanceLabel', () => {
  const names = new Map([[1, 'ציר צפון'], [2, 'ציר מערב']]);
  it('בלי צומת', () => {
    expect(relevanceLabel({ route_id: 1, cross_route_id: null }, names)).toBe('ציר צפון');
  });
  it('עם צומת', () => {
    expect(relevanceLabel({ route_id: 1, cross_route_id: 2 }, names)).toBe('ציר צפון × ציר מערב');
  });
  it('נתיב שנמחק', () => {
    expect(relevanceLabel({ route_id: 8, cross_route_id: null }, names)).toBe('נתיב שנמחק');
  });
});
