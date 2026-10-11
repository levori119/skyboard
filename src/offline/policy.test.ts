import { describe, it, expect } from 'vitest';
import { classifyWrite, normalizePath, isApiRequest, isReadMethod } from './policy';

describe('normalizePath', () => {
  it('משאיר נתיב יחסי כמו שהוא', () => {
    expect(normalizePath('/api/strips')).toBe('/api/strips');
  });
  it('מסיר origin', () => {
    expect(normalizePath('http://10.0.0.5:3001/api/strips')).toBe('/api/strips');
    expect(normalizePath('https://sky-king.up.railway.app/api/transfers')).toBe('/api/transfers');
  });
  it('מסיר query ו-hash', () => {
    expect(normalizePath('/api/strokes?crew_member_id=4')).toBe('/api/strokes');
    expect(normalizePath('/api/strips#x')).toBe('/api/strips');
  });
  it('origin בלי path', () => {
    expect(normalizePath('http://host:3001')).toBe('/');
  });
});

describe('isApiRequest', () => {
  it('מזהה בקשות API', () => {
    expect(isApiRequest('/api/strips')).toBe(true);
    expect(isApiRequest('http://host/api/strips')).toBe(true);
  });
  it('מתעלם מנכסים סטטיים', () => {
    expect(isApiRequest('/assets/index.js')).toBe(false);
    expect(isApiRequest('/favicon.svg')).toBe(false);
    expect(isApiRequest('/apifoo')).toBe(false);
  });
});

describe('isReadMethod', () => {
  it('GET/HEAD הן קריאה', () => {
    expect(isReadMethod('GET')).toBe(true);
    expect(isReadMethod('get')).toBe(true);
    expect(isReadMethod('HEAD')).toBe(true);
    expect(isReadMethod('')).toBe(true); // ברירת המחדל של fetch
  });
  it('שאר השיטות אינן קריאה', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isReadMethod(m)).toBe(false);
  });
});

describe('classifyWrite — פעולות משותפות נחסמות בנתק', () => {
  const shared: [string, string][] = [
    ['/api/transfers', 'POST'],
    ['/api/transfers/abc-123/accept', 'PATCH'],
    ['/api/transfers/abc-123/note', 'PATCH'],
    ['/api/strips', 'POST'],
    ['/api/strips/12', 'PUT'],
    ['/api/strips/12', 'DELETE'],
    ['/api/strips/12/block-space', 'PATCH'],
    ['/api/serials', 'POST'],
    ['/api/serials/all', 'DELETE'],
    ['/api/base-statuses/3/notam', 'PATCH'],
    ['/api/closures/4', 'DELETE'],
    ['/api/signals/9', 'DELETE'],
    ['/api/sticky-notes', 'POST'],
    ['/api/provisional-transfer-points', 'POST'],
    ['/api/position-merges', 'POST'],
    ['/api/blocks/2', 'DELETE'],
    ['/api/strip-zone-assignments/7', 'DELETE'],
    ['/api/map-zones/5/operational', 'PATCH'],
    ['/api/workstation-presets/8', 'DELETE'],
    ['/api/maps/2', 'DELETE'],
  ];
  for (const [path, method] of shared) {
    it(`${method} ${path} → shared`, () => {
      expect(classifyWrite(path, method)).toBe('shared');
    });
  }

  it('נתיב לא מוכר נחשב משותף (fail closed)', () => {
    expect(classifyWrite('/api/some-future-endpoint', 'POST')).toBe('shared');
  });
});

describe('classifyWrite — פעולות פרטיות נכנסות ל-outbox', () => {
  const priv: [string, string][] = [
    ['/api/strokes', 'POST'],
    ['/api/strokes?crew_member_id=4', 'DELETE'],
    ['/api/digits', 'DELETE'],
    ['/api/crew-members/12/preferences', 'PATCH'],
    ['/api/workstation-personal-filters', 'POST'],
    ['/api/activity-log', 'POST'],
  ];
  for (const [path, method] of priv) {
    it(`${method} ${path} → private`, () => {
      expect(classifyWrite(path, method)).toBe('private');
    });
  }
});

describe('classifyWrite — מצב רגעי נזרק', () => {
  it('heartbeat אינו נשמר לשחזור', () => {
    expect(classifyWrite('/api/workstations/3/heartbeat', 'PATCH')).toBe('drop');
  });

  it('דופק המשמרת אינו נשמר לשחזור - שחזור שלו היה משקר על עמדה מאוישת', () => {
    expect(classifyWrite('/api/station-sessions/heartbeat', 'PATCH')).toBe('drop');
  });

  it('פתיחת/סגירת משמרת כן נשמרות - הן אירוע אמיתי ולא מצב רגעי', () => {
    expect(classifyWrite('/api/station-sessions', 'POST')).not.toBe('drop');
    expect(classifyWrite('/api/station-sessions/close', 'POST')).not.toBe('drop');
  });
});

describe('classifyWrite — קריאות לעולם אינן נחסמות', () => {
  it('GET על נתיב משותף עדיין מותר (נענה מה-cache)', () => {
    expect(classifyWrite('/api/transfers', 'GET')).toBe('private');
    expect(classifyWrite('/api/strips', 'GET')).toBe('private');
  });
});

describe('classifyWrite — עמידות ל-URL מלא', () => {
  it('מסווג נכון גם כשה-URL כולל origin (מצב עמדה עם dist מקומי)', () => {
    expect(classifyWrite('http://10.0.0.5:3001/api/transfers', 'POST')).toBe('shared');
    expect(classifyWrite('http://10.0.0.5:3001/api/strokes', 'POST')).toBe('private');
  });
});

describe('bypassesOfflineLayer - בתי קובץ של חלון הקריאה', () => {
  // אין מגבלת גודל לקובץ (2026-10-11). שכבת הנתק שומרת כל תשובת GET ל-IndexedDB
  // כטקסט - קובץ של מאות מגה היה ממלא את הדיסק של העמדה, ונשמר משובש (בינארי כטקסט).
  it('הקובץ, גרסת ה-PDF וה-proxy עוקפים את השכבה', async () => {
    const { bypassesOfflineLayer } = await import('./policy');
    expect(bypassesOfflineLayer('/api/reader/docs/7/file')).toBe(true);
    expect(bypassesOfflineLayer('http://x:3001/api/reader/docs/7/file?pdf=1')).toBe(true);
    expect(bypassesOfflineLayer('/api/reader/docs/7/proxy')).toBe(true);
    // המרת מצגת של עשרות מגה נמשכת דקות - אסור שתיספר כנתק
    expect(bypassesOfflineLayer('/api/reader/docs/7/convert')).toBe(true);
  });
  it('שאר נתיבי הקריאה נשארים בשכבה (רשימות קטנות, טובות לנתק)', async () => {
    const { bypassesOfflineLayer } = await import('./policy');
    expect(bypassesOfflineLayer('/api/reader/docs')).toBe(false);
    expect(bypassesOfflineLayer('/api/reader/bookmarks/7')).toBe(false);
  });
});

describe('isFileUpload - העלאת קבצים אינה עדות לנתק', () => {
  // העלאה גדולה נמשכת יותר מ-timeout של שכבת הנתק, בוטלה ונספרה ככשל קשר -
  // והעמדה הכריזה נתק ויצאה (2026-10-11). העלאה עוקפת את השכבה כולה.
  it('גוף בינארי (קובץ / Blob / ArrayBuffer / FormData) - העלאה', async () => {
    const { isFileUpload } = await import('./policy');
    expect(isFileUpload(new Blob(['x']))).toBe(true);
    expect(isFileUpload(new ArrayBuffer(4))).toBe(true);
    expect(isFileUpload(new Uint8Array(4))).toBe(true);
    expect(isFileUpload(new FormData())).toBe(true);
  });
  it('JSON ענק (קובץ מקודד base64, למשל העלאת מפה) - העלאה', async () => {
    const { isFileUpload, UPLOAD_STRING_BYTES } = await import('./policy');
    expect(isFileUpload('x'.repeat(UPLOAD_STRING_BYTES + 1))).toBe(true);
  });
  it('כתיבה רגילה - לא העלאה, נשארת בשכבה', async () => {
    const { isFileUpload } = await import('./policy');
    expect(isFileUpload(JSON.stringify({ a: 1 }))).toBe(false);
    expect(isFileUpload(undefined)).toBe(false);
    expect(isFileUpload(null)).toBe(false);
  });
});
