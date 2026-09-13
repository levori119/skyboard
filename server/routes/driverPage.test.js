// אפליקציית הנהג (public/driver.html) - הדף עצמו.
//
// הדף הוא HTML סטטי עם סקריפט מוטבע של אלפי שורות, בלי build ובלי tsc. **שגיאת
// תחביר אחת מעלה אותו ריק לחלוטין** - הנהג לא יכול להתחבר, וזה לא נתפס בשום
// מקום אחר. הבדיקה הראשונה מקמפלת את הסקריפט באמת.
//
// השאר מקבע את החיווט של מעקב הנסיעה החי (TRIP_LIVE_TRACKING_SPEC.md §2 שלב 2):
// שההתרעות מחושבות בלוגיקה המשותפת ולא בעותק מקומי, שהמיקום נמשך ב-watchPosition,
// ושהשידור והסיום מגיעים לנתיבים הנכונים. אין jsdom - אלה בדיקות על הקוד.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { CSP, DRIVER_CSP } from '../middleware/securityHeaders.js';

const HTML = readFileSync(join(process.cwd(), 'public/driver.html'), 'utf8');

/** הסקריפטים המוטבעים שאינם מודול - אלה שרצים כסקריפט קלאסי */
const classicScripts = [...HTML.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).filter(s => s.trim());
const MODULE = (HTML.match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1] || '';
const SCRIPT = classicScripts.join('\n');

describe('הדף עולה', () => {
  it('יש סקריפט מוטבע', () => {
    expect(classicScripts.length).toBeGreaterThan(0);
  });

  it('כל סקריפט מוטבע מתקמפל - שגיאת תחביר מעלה את האפליקציה ריקה', () => {
    for (const [i, src] of classicScripts.entries()) {
      expect(() => new vm.Script(src, { filename: `driver.html#script${i}` }), `סקריפט ${i}`).not.toThrow();
    }
  });
});

describe('הלוגיקה המשותפת נטענת', () => {
  it('המודול טוען את מעקב הנסיעה וחושף אותו', () => {
    expect(MODULE).toContain("from '/driver/tracking.js'");
    expect(MODULE).toContain('window.TripTracking');
  });

  it('האירוע שמשחרר את הדף נשלח אחרי ששני המודולים זמינים', () => {
    const ev = MODULE.indexOf("dispatchEvent(new Event('driverlogic'))");
    expect(ev).toBeGreaterThan(MODULE.indexOf('window.TripTracking'));
    expect(ev).toBeGreaterThan(MODULE.indexOf('window.DriverLogic'));
  });
});

describe('מסך הנסיעה החי', () => {
  it('הפעלת נסיעה מוצלחת פותחת את המפה', () => {
    const start = SCRIPT.slice(SCRIPT.indexOf('async function startTrip'), SCRIPT.indexOf('function showStartBlocked'));
    expect(start).toContain('openLiveTrip(id)');
  });

  it('נסיעה שהופעלה ולא הסתיימה - כפתור לחזור למפה', () => {
    expect(SCRIPT).toContain("const live = kind === 'approved' && t.driver_started_at && !t.ended_at;");
    expect(SCRIPT).toMatch(/\$\{live \? `<button[^`]*openLiveTrip\(/);
  });

  it('נתוני המפה נטענים מ-/live', () => {
    expect(SCRIPT).toContain('/api/driver-trips/${');
    expect(SCRIPT).toMatch(/\/api\/driver-trips\/\$\{[^}]+\}\/live/);
  });

  // getCurrentPosition בלולאה מחמיץ קריאות ומדליק את ה-GPS מחדש בכל פעם
  it('המיקום נמשך ב-watchPosition, עם דיוק גבוה, ונעצר בסיום', () => {
    expect(SCRIPT).toContain('navigator.geolocation.watchPosition(');
    expect(SCRIPT).toContain('enableHighAccuracy: true');
    expect(SCRIPT).toContain('navigator.geolocation.clearWatch(');
  });

  // נמצא באימות קצה-לקצה: טלפון עומד כמעט לא מפיק קריאות, ורכב שעצר מחוץ לנתיב
  // שלח קריאה אחת בלבד - המגדל לא קיבל התרעת סטייה, וסימן רכב חונה "אות אבד"
  it('הקריאה האחרונה נשלחת שוב כפעימה, רק כל עוד היא טרייה', () => {
    const send = SCRIPT.slice(SCRIPT.indexOf('async function sendPendingFix'), SCRIPT.indexOf('// ── נעילת המסך'));
    expect(send).toContain('live.pendingFix || (fresh ? live.fix : null)');
    expect(send).toContain('TripTracking.STALE_FIX_MS');
    expect(SCRIPT).toContain('live.fixAt = Date.now()');
  });

  it('הקריאות משודרות ל-/gps, והסיום ל-/end', () => {
    expect(SCRIPT).toMatch(/\/api\/driver-trips\/\$\{[^}]+\}\/gps/);
    expect(SCRIPT).toMatch(/\/api\/driver-trips\/\$\{[^}]+\}\/end/);
  });

  // מקור אמת יחיד: עותק מקומי של הספים הוא נהג ומגדל שחלוקים על המציאות
  it('ההתרעות מחושבות בלוגיקה המשותפת - לא בעותק מקומי', () => {
    expect(SCRIPT).toContain('TripTracking.findHazards(');
    expect(SCRIPT).toContain('TripTracking.nextAlertState(');
    expect(SCRIPT).toContain('TripTracking.latLonToPct(');
    expect(SCRIPT.includes('RUNWAY_ALERT_M =')).toBe(false);
    expect(SCRIPT.includes('ELEMENT_ALERT_M =')).toBe(false);
  });

  // D13: דפדפן עוצר GPS כשהמסך נכבה - נעילת המסך היא ההגנה היחידה בדף אינטרנט
  it('המסך נשאר דולק במהלך נסיעה, והנעילה משתחררת בסיום', () => {
    expect(SCRIPT).toContain("navigator.wakeLock.request('screen')");
    expect(SCRIPT).toMatch(/wakeLock[\s\S]{0,40}\.release\(\)/);
  });

  it('שתי המפות - מפת שדה ו-Google', () => {
    expect(HTML).toContain('id="liveTripScreen"');
    expect(SCRIPT).toContain('function setLiveMap(');
    expect(HTML).toContain("setLiveMap('airfield')");
    expect(HTML).toContain("setLiveMap('google')");
    expect(SCRIPT).toContain('/api/google-maps-key');
  });

  // "לא לתת לפקד להידלק בלי שקורה משהו": בלי מפתח - הכפתור כבוי והסיבה כתובה
  it('בלי מפתח Google - המתג כבוי עם הסבר', () => {
    expect(SCRIPT).toMatch(/אין מפתח Google/);
  });

  it('D2/D3: בלי נתיב שמור או בלי עוגן - הודעה מפורשת', () => {
    expect(SCRIPT).toContain('has_route');
    expect(SCRIPT).toContain('has_anchor');
    expect(SCRIPT).toMatch(/לא נשמר נתיב/);
    expect(SCRIPT).toMatch(/המפה אינה מעוגנת/);
  });

  // כל אלמנטי השליטה בשדה מגיעים מהשרת; מי שאינו על הנתיב מוצג קטן, בלי תווית
  it('אלמנט שאינו על הנתיב - מסומן off בשתי המפות, ותווית רק למי שעל הנתיב', () => {
    expect(HTML).toMatch(/\.lt-el\.off\{/);
    expect(SCRIPT).toContain("const onRoute = el.on_route !== false;");
    expect(SCRIPT).toContain("el.blocking && onRoute ?");
    expect(SCRIPT).toMatch(/opacity: el\.on_route === false \? 0\.6 : 1/);
  });

  // מפתח לא תקין אינו מפיל את הסקריפט - Google מציג מפה אפורה וקורא ל-gm_authFailure
  it('D4b: מפתח Google לא תקין - הסבר, מתג כבוי וחזרה למפת השדה', () => {
    const i = SCRIPT.indexOf('window.gm_authFailure = () => {');
    expect(i).toBeGreaterThan(-1);
    const handler = SCRIPT.slice(i, SCRIPT.indexOf('\n};\n', i));
    expect(handler).toContain('gmapsAuthFailed = true');
    expect(handler).toContain("setLiveMap('airfield')");
    expect(SCRIPT).toContain('(מפתח לא תקין)');
  });

  it('D5: אין הרשאת מיקום - הודעה מפורשת', () => {
    expect(SCRIPT).toMatch(/אין הרשאת מיקום/);
  });
});

describe('תבניות נסיעה ושכפול בקשה', () => {
  const fn = name => {
    const i = SCRIPT.indexOf(`function ${name}(`);
    expect(i, name).toBeGreaterThan(-1);
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}\n', i));
  };

  it('טאב תבניות בדף הבית, עם מונה', () => {
    expect(HTML).toMatch(/id="tabTemplates"[^>]*switchTab\('templates'\)/);
    expect(HTML).toContain('id="nTemplates"');
  });

  it('התבניות נטענות מהשרת, ונמחקות דרכו', () => {
    expect(fn('loadTemplates')).toContain('/api/driver-trips/templates');
    expect(fn('deleteTemplate')).toContain("method: 'DELETE'");
    expect(fn('saveTemplate')).toContain("id ? 'PUT' : 'POST'");
  });

  // שכפול ותבנית עוברים באותה המרה משותפת - בלי עותק מקומי של שדות הבקשה
  it('שכפול, בקשה מתבנית ועריכת תבנית - דרך requestFormFrom המשותף', () => {
    for (const name of ['duplicateTrip', 'saveTripAsTemplate', 'requestFromTemplate', 'editTemplate']) {
      expect(fn(name), name).toContain('DriverLogic.requestFormFrom(');
      expect(fn(name), name).toContain('openNewRequest(');
    }
    expect(fn('saveTemplate')).toContain('DriverLogic.buildTemplate(');
    expect(fn('openNewRequest')).toContain('DriverLogic.nextDeparture(');
  });

  it('כל כרטיס נסיעה - כולל נדחה והיסטוריה - מציע שכפול ושמירה כתבנית', () => {
    const card = fn('tripCard');
    for (const call of ['duplicateTrip(', 'saveTripAsTemplate(']) {
      const at = card.indexOf(call);
      expect(at, call).toBeGreaterThan(-1);
      // השורה מתחילה בכפתור עצמו - לא בתוך תנאי ${...} כמו כפתור השינוי
      const line = card.slice(card.lastIndexOf('\n', at), card.indexOf('\n', at));
      expect(line.trim().startsWith('<button'), call).toBe(true);
    }
  });

  it('במצב תבנית בקשה אינה נשלחת למגדל', () => {
    const submit = fn('submitTripRequest');
    const tplBranch = submit.indexOf("reqMode === 'template'");
    const post = submit.indexOf('/api/driver-trips`');
    expect(tplBranch).toBeGreaterThan(-1);
    expect(tplBranch).toBeLessThan(post);
    expect(submit.slice(tplBranch, post)).toContain('return;');
  });

  it('שורה מצומצמת: הכרטיס בנוי משורות tc-, בלי ריפוד גבוה', () => {
    expect(HTML).toMatch(/\.trip-card\{[^}]*padding:6px 10px/);
    expect(fn('tripCard')).toContain('class="tc-l1"');
    expect(fn('templateCard')).toContain('class="tc-l1"');
  });
});

describe('CSP - Google רק באפליקציית הנהג', () => {
  it('הנהג רשאי לטעון את Google Maps', () => {
    expect(DRIVER_CSP).toContain('https://maps.googleapis.com');
    expect(DRIVER_CSP).toContain('https://*.gstatic.com');
  });

  it('המגדל אינו רשאי - ה-CSP שלו לא השתנה', () => {
    expect(CSP.includes('googleapis')).toBe(false);
    expect(CSP.includes('gstatic')).toBe(false);
  });
});
