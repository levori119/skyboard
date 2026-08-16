import { describe, it, expect, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Pattern3DScene from './Pattern3DScene';
import RunwayLayer from '../map/RunwayLayer';
import { DEFAULT_CAMERA } from '../../utils/pattern3d';
import { airPictureStore } from '../../airPicture/store';
import { DEFAULT_PREFS } from '../../airPicture/prefs';
import type { AirTrack } from '../../../shared/airTrafficApi';
import type { MapGeoAnchor } from '../../utils/geo';
import type { PatternRow } from '../map/TrafficPatternLayer';
import type { PatternAircraftRow } from './PatternAircraftLayer';
import type { JoiningPointView } from './JoiningPointPanel';

// המתמטיקה נבדקת ב-pattern3d.test.ts. כאן נבדק מה שהפקח **רואה בפועל** בסצנה:
// שבלוק מאויש נראה אחרת מבלוק פנוי (ולא רק בצבע), שקונפליקט מסומן ב-⚠, שמטוס
// בלי הקפה אינו מקבל קו חיבור מנוחש, ושמטוס יושב בגובה ולא על הקרקע.

const PATTERN: PatternRow = {
  id: 7, runway_ident: '33', color: '#38bdf8',
  geometry: { anchor: { x: 50, y: 62 }, bearing: 0, side: 'left', rwyLen: 14, upwind: 7, width: 14, baseExt: 7 },
};

const POINT: JoiningPointView = {
  id: 3, name: 'בור', alt_min_ft: 4000, alt_max_ft: 6000, default_step_ft: 1000, steps: [],
  color: '#f59e0b', x_pct: 30, y_pct: 40,
};

const base = {
  patterns: [PATTERN],
  aircraft: [] as PatternAircraftRow[],
  joiningPoints: [POINT],
  joiningStrips: [] as any[],
  joiningAircraft: [] as any[],
  runways: [{ id: 1, start_x_pct: 50, start_y_pct: 76, end_x_pct: 50, end_y_pct: 62 }],
  aspect: 1,
  elevFt: 0,
  camera: DEFAULT_CAMERA,
  pan: { x: 0, y: 0 },
  onCameraChange: () => {},
  onPanChange: () => {},
  themeMode: 'dark' as const,
};

type SceneProps = ComponentProps<typeof Pattern3DScene>;

const render = (over: Partial<SceneProps> = {}) =>
  renderToStaticMarkup(<Pattern3DScene {...base} {...over} />);

/** קטע ה-markup של בלוק גובה מסוים. */
const blockOf = (m: string, ft: number) =>
  (m.match(/<g data-testid="p3d-block"[\s\S]*?<\/g>/g) || [])
    .find(g => g.includes(`data-block-ft="${ft}"`)) || '';

describe('Pattern3DScene - מה שנראה על המסך', () => {
  it('ההקפה מצוירת עם צל על הקרקע ועם תוויות צלעות', () => {
    const m = render();
    expect(m).toContain('data-testid="p3d-pattern"');
    expect(m).toContain('data-testid="p3d-leg-label"');
    expect(m).toContain('data-leg="downwind"');
    // הצל מקווקו ובצבע כהה - לא בצבע ההקפה
    expect(m).toContain('stroke-dasharray');
  });

  it('כל בלוק גובה של הנקודה מצויר, ופנוי אינו נושא תווית פ"מ', () => {
    const m = render();
    for (const ft of [4000, 5000, 6000]) {
      const b = blockOf(m, ft);
      expect(b).not.toBe('');
      expect(b).toContain('data-occupied="0"');
      // גובה הבלוק נקרא כמספר גם כשהוא פנוי
      expect(b).toContain('040'.slice(0, 1));
    }
    // אין שם פ"מ בשום בלוק
    expect(m).not.toContain('בננה');
  });

  it('בלוק מאויש מקבל תווית עם ה-או"ק, ונבדל גם ב**מילוי** ולא רק בצבע', () => {
    const m = render({
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 2 }],
    });
    const occupied = blockOf(m, 5000);
    expect(occupied).toContain('data-occupied="1"');
    expect(occupied).toContain('בננה');
    expect(occupied).toContain('fill="#f59e0b55"');   // מילוי בצבע הנקודה
    const vacant = blockOf(m, 6000);
    expect(vacant).toContain('data-occupied="0"');
    expect(vacant).toContain('fill="none"');          // מתאר בלבד
    expect(vacant).toContain('stroke-dasharray');     // ומקווקו - לא צבע בלבד
  });

  it('שני פ"ממים באותו בלוק = קונפליקט, מסומן ב-⚠ ובאדום הקבוע', () => {
    const m = render({
      joiningStrips: [
        { strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 1 },
        { strip_id: 12, joining_point_id: 3, callsign: 'תפוז', alt: '050', number_of_formation: 1 },
      ],
    });
    const b = blockOf(m, 5000);
    expect(b).toContain('data-conflict="1"');
    expect(b).toContain('⚠');
    expect(b).toContain('#dc2626');
    expect(blockOf(m, 4000)).toContain('data-conflict="0"');
  });

  it('מטוס על ההקפה מקבל תווית או"ק, גובה כמספר וקו הורדה לקרקע', () => {
    const m = render({
      aircraft: [{ strip_id: 11, aircraft_idx: 1, pattern_id: 7, in_pattern: true, pattern_frac: 0.5, label: 'בננה1', flight_status: 'downwind' }],
    });
    expect(m).toContain('data-testid="p3d-aircraft"');
    expect(m).toContain('בננה1');
    // גובה עם-הרוח בברירת מחדל = 3000 רגל → "030"
    expect(m).toContain('>030<');
  });

  it('מטוס בבלוק **בלי** pattern_id אינו מקבל קו חיבור - לא מנחשים הקפה', () => {
    const m = render({
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 1 }],
      joiningAircraft: [{ strip_id: 11, aircraft_idx: 1, joining_point_id: 3, pattern_id: null }],
    });
    expect(m).not.toContain('data-testid="p3d-link"');
  });

  it('מטוס בבלוק **עם** pattern_id מקבל קו חיבור אל ההקפה שנבחרה לו', () => {
    const m = render({
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 1 }],
      joiningAircraft: [{ strip_id: 11, aircraft_idx: 1, joining_point_id: 3, pattern_id: 7 }],
    });
    expect(m).toContain('data-testid="p3d-link"');
    expect(m).toContain('data-strip-id="11"');
  });

  it('גובה השדה מזיז את הבלוקים - אותו בלוק מוחלט יושב נמוך יותר מעל שדה גבוה', () => {
    // הקפה גבוהה קובעת את קנה המידה האנכי, כך שהבלוקים נמדדים מולה ולא מול
    // עצמם (הבלוק הגבוה תמיד נוגע בתקרה, ולכן בלעדיה אין מה להשוות).
    const tall = [{ ...PATTERN, downwind_alt_ft: 20000, base_alt_ft: 10000 }];
    const y = (m: string) => Number(/points="[-\d.]+,([-\d.]+)/.exec(blockOf(m, 6000))![1]);
    expect(y(render({ patterns: tall, elevFt: 2000 })))
      .toBeGreaterThan(y(render({ patterns: tall, elevFt: 0 })));
  });

  it('ציר הגבהים מוצג בהטיה, ונעלם במבט-על - שם אי אפשר לקרוא גובה', () => {
    expect(render()).toContain('data-testid="p3d-alt-axis"');
    expect(render({ camera: { ...DEFAULT_CAMERA, tilt: 90 } })).not.toContain('data-testid="p3d-alt-axis"');
  });

  it('תווית צלע ותווית מטוס על אותה צלע אינן נערמות זו על זו', () => {
    // בתחתית ההקפה (בסיס/פיינל) הפקח קורא את סדר הנחיתה. ההזחה של תווית הצלע
    // נמדדת ביחידות הטקסט ולא ביחידות עולם, ולכן היא גדלה יחד עם הכתב - אחרת
    // "בסיס 33" נבלע מתחת ל-"ברק02" ומה שנשאר נראה כמו שיבוש תצוגה.
    for (const leg of ['base', 'final'] as const) {
      const m = render({
        aircraft: [{
          strip_id: 21, aircraft_idx: 2, pattern_id: 7, in_pattern: true,
          pattern_frac: 0.5, label: 'ברק02', flight_status: leg,
        }],
      });
      const [x, y, w, h] = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/
        .exec(m)!.slice(1).map(Number);
      const tag = (m.match(/<text data-testid="p3d-leg-label"[^>]*>/g) || [])
        .find(t => t.includes(`data-leg="${leg}"`))!;
      const lx = Number(/ x="([-\d.]+)"/.exec(tag)![1]);
      const ly = Number(/ y="([-\d.]+)"/.exec(tag)![1]);
      // מרכז תווית הצלע יושב **מחוץ** לתיבת המטוס, בשוליים של חצי תיבה מסביבה
      const clear = lx < x - w * 0.5 || lx > x + w * 1.5 || ly < y - h * 0.5 || ly > y + h * 1.5;
      expect(clear, `תווית ${leg} ב-(${lx},${ly}) נופלת על תיבת המטוס (${x},${y},${w}x${h})`).toBe(true);
    }
  });

  it('במבט-על הבלוקים נופלים זה על זה - והעליון מצויר **אחרון**, לא לפי סדר המערך', () => {
    // ב-tilt=90 ההיטל מוחק את ההפרש בין הבלוקים במישור; זה נכון גאומטרית, והטבלה
    // היא המקום לקרוא אותם. מה שחייב להישמר הוא שהחפיפה **דטרמיניסטית**: העומק
    // במבט-על הוא הגובה עצמו (near = z), ולכן הבלוק הגבוה תמיד אחרון בסדר הציור -
    // גם ש-buildBlocks מחזיר מהגבוה למטה, כלומר בסדר ההפוך.
    const m = render({
      camera: { ...DEFAULT_CAMERA, tilt: 90 },
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '040', number_of_formation: 1 }],
    });
    const order = (m.match(/data-block-ft="(\d+)"/g) || []).map(s => Number(/\d+/.exec(s)![0]));
    expect(order).toEqual([4000, 5000, 6000]);
    expect(order[order.length - 1]).toBe(Math.max(...order));
  });

  it('חץ הצפון נקרא כחץ - ראש חץ ואות, ולא קו ונקודה', () => {
    const m = render();
    expect(m).toContain('data-testid="p3d-north-head"');
    expect(m).toMatch(/data-testid="p3d-north"[\s\S]*?>צ</);
  });

  it('אין הקפה - נאמר למה, ולא מסך ריק', () => {
    const m = render({ patterns: [] });
    expect(m).toContain('data-testid="p3d-empty"');
  });

  it('המסלול והרשת מצוירים - רמזי העומק שבלעדיהם ההיטל דו-משמעי', () => {
    const m = render();
    expect(m).toContain('data-testid="p3d-runway"');
    expect(m).toContain('data-testid="p3d-north"');
  });

  it('מטוס שהוקצה להקפה שאינה מוצגת יורד בשקט - בלי מטוס מרחף בלי הקפה', () => {
    // בחירת המסלול בשימוש היא שמגדירה מה מוצג. מטוס על הקפה אחרת אינו מקבל
    // מיקום מנוחש על ההקפה הפעילה - הוא פשוט אינו בסצנה, בלי שגיאה ובלי ריחוף.
    const m = render({
      aircraft: [{ strip_id: 11, aircraft_idx: 1, pattern_id: 999, in_pattern: true, label: 'בננה1', flight_status: 'downwind' }],
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 1 }],
      joiningAircraft: [{ strip_id: 11, aircraft_idx: 1, joining_point_id: 3, pattern_id: 999 }],
    });
    expect(m).not.toContain('data-testid="p3d-aircraft"');
    expect(m).not.toContain('data-testid="p3d-link"');
    expect(m).toContain('data-testid="p3d-pattern"');   // ההקפה הפעילה נשארת
  });
});

// ── שם המסלול, מתגי הפאנל השמאלי, ותמונ"א ────────────────────────────────────

const NAMED_RW = { id: 1, start_x_pct: 50, start_y_pct: 76, end_x_pct: 50, end_y_pct: 62, name: '15/33', heading_a: '15', heading_b: '33' };

describe('Pattern3DScene - שם המסלול', () => {
  it('מספרי הכיוון נכתבים על המסלול, **אותו טקסט** של המפה השטוחה', () => {
    const m = render({ runways: [NAMED_RW] });
    const flat = renderToStaticMarkup(<RunwayLayer runways={[NAMED_RW as any]} aspect={1} sz={1} />);
    expect(m).toContain('data-testid="p3d-runway-designator"');
    for (const t of ['>15<', '>33<']) {
      expect(flat).toContain(t);
      expect(m).toContain(t);
    }
  });

  it('הכיתוב מקביל למסך ואינו מסובב אל מישור הקרקע', () => {
    const m = render({ runways: [NAMED_RW] });
    const tag = /<text data-testid="p3d-runway-designator"[^>]*>/.exec(m)![0];
    expect(tag).not.toContain('rotate(');
  });

  it('שם המסלול מופיע רק כש"הצג שמות" דלוק - כמו כל שם ישות אחר', () => {
    expect(render({ runways: [NAMED_RW] })).not.toContain('data-testid="p3d-runway-name"');
    const m = render({ runways: [NAMED_RW], display: { showNames: true } });
    expect(m).toContain('data-testid="p3d-runway-name"');
    expect(m).toContain('15/33');
  });
});

describe('Pattern3DScene - פאנל השכבות שולט גם כאן', () => {
  it('"שמות הקפות" כבוי - אין תוויות צלעות בתלת מימד', () => {
    expect(render()).toContain('data-testid="p3d-leg-label"');
    expect(render({ display: { showPatternNames: false } })).not.toContain('data-testid="p3d-leg-label"');
  });

  it('שכבת מסלולים כבויה - אין מסלול ואין מספרי כיוון', () => {
    const m = render({ runways: [NAMED_RW], layers: { runways: false } });
    expect(m).not.toContain('data-testid="p3d-runway"');
    expect(m).not.toContain('data-testid="p3d-runway-designator"');
  });

  it('שכבת הקפות כבויה - ההקפה נעלמת, אבל **המטוס שעליה נשאר**', () => {
    // בדיוק כמו במפה השטוחה: PatternAircraftLayer אינו תלוי במתג ההקפות -
    // מטוס באוויר אינו נעלם כי כיבו שכבת שרטוט.
    const m = render({
      layers: { patterns: false },
      aircraft: [{ strip_id: 11, aircraft_idx: 1, pattern_id: 7, in_pattern: true, pattern_frac: 0.5, label: 'בננה1', flight_status: 'downwind' }],
    });
    expect(m).not.toContain('data-testid="p3d-pattern"');
    expect(m).toContain('data-testid="p3d-aircraft"');
  });

  it('שכבת נקודות כבויה - אין נקודות הצטרפות ואין קווי חיבור', () => {
    const m = render({
      layers: { points: false },
      joiningStrips: [{ strip_id: 11, joining_point_id: 3, callsign: 'בננה', alt: '050', number_of_formation: 1 }],
      joiningAircraft: [{ strip_id: 11, aircraft_idx: 1, joining_point_id: 3, pattern_id: 7 }],
    });
    expect(m).not.toContain('data-testid="p3d-joining-point"');
    expect(m).not.toContain('data-testid="p3d-block"');
    expect(m).not.toContain('data-testid="p3d-link"');
  });
});

describe('Pattern3DScene - תמונ"א בגובה אמיתי', () => {
  const ANCHOR: MapGeoAnchor = { x1: 0, y1: 0, lat1: 33, lon1: 34, x2: 100, y2: 100, lat2: 32, lon2: 35 };
  const TRACK: AirTrack = {
    id: 'a1', cs: 'תפוז', lat: 32.5, lon: 34.5, alt: 5000, spd: 200, hdg: 90,
    cls: 'friend', typ: 'jet', resp: '',
  };
  const seed = (tracks: AirTrack[] = [TRACK]) =>
    airPictureStore.setSnapshot(Date.now(), 1, tracks, Date.now());
  const withAp = (over: Partial<SceneProps> = {}) =>
    render({ airPicture: { anchor: ANCHOR, prefs: DEFAULT_PREFS }, ...over });
  /** ה-y של סמל המטוס - מרכז הסיבוב של המשולש. */
  const trackY = (m: string) =>
    Number(/<polygon transform="rotate\([-\d.]+ [-\d.]+ ([-\d.]+)\)"/.exec(m)![1]);

  afterEach(() => airPictureStore.reset());

  it('המטוס מצויר, עם התווית של המבט מלמעלה וקו הורדה לקרקע', () => {
    seed();
    const m = withAp();
    expect(m).toContain('data-testid="p3d-track"');
    expect(m).toContain('data-track-id="a1"');
    expect(m).toContain('תפוז');
    // גובה במאות רגל ומהירות - **אותה תווית** של הקנבס השטוח
    expect(m).toContain('50  200');
    // צבע הסיווג, לא צבע ההקפה
    expect(m).toContain('data-cls="friend"');
  });

  it('בלי עוגן אין תמונ"א - ולא ניחוש מיקום', () => {
    seed();
    expect(render({ airPicture: { anchor: null, prefs: DEFAULT_PREFS } }))
      .not.toContain('data-testid="p3d-track"');
    expect(render()).not.toContain('data-testid="p3d-track"');
  });

  it('כיבוי התמונ"א מכבה אותה גם כאן', () => {
    seed();
    expect(withAp({ airPicture: { anchor: ANCHOR, prefs: { ...DEFAULT_PREFS, on: false } } }))
      .not.toContain('data-testid="p3d-track"');
  });

  it('מטוס שסונן במבט מלמעלה אינו מופיע בתלת מימד', () => {
    seed();
    const m = withAp({ airPicture: { anchor: ANCHOR, prefs: { ...DEFAULT_PREFS, classes: ['hostile'] } } });
    expect(m).not.toContain('data-testid="p3d-track"');
  });

  // ── קנה המידה האנכי מול תנועה חולפת ──────────────────────────────────────
  // המעטפת התפעולית (הקפה + בלוקי גבהים) היא הפס שבו הפקח עובד, והיא **לבדה**
  // קובעת את הציר. טרק אחד ב-FL300 היה מותח את הציר פי חמישה ומועך את ההקפה,
  // את הבלוקים ואת הפ"מים לעשירית התחתונה של המסגרת - ומכיוון של-`DEFAULT_PREFS`
  // אין מסנן גובה, זה היה המצב **הרגיל** ולא מקרה קצה.

  it('טרק מעל המעטפת **אינו משנה את ציר הגבהים** - ההקפה נשארת קריאה', () => {
    const axis = (m: string) => /<g data-testid="p3d-alt-axis"[\s\S]*?<\/text><\/g>/.exec(m)![0];
    const clean = axis(withAp());                       // בלי דגימה כלל
    seed([{ ...TRACK, alt: 30000 }]);                   // FL300 חולף מעל
    expect(axis(withAp())).toBe(clean);
  });

  it('טרק מעל המעטפת אינו מצויר - **ונספר**, לא נעלם בשקט', () => {
    seed([{ ...TRACK, id: 'hi1', alt: 30000 }, { ...TRACK, id: 'hi2', alt: 25000 }]);
    const m = withAp();
    expect(m).not.toContain('data-testid="p3d-track"');
    expect(m).toContain('data-testid="p3d-above-scale"');
    expect(m).toContain('data-count="2"');
    expect(m).toMatch(/data-testid="p3d-above-scale"[\s\S]*?2/);
  });

  it('טרק **בתוך** המעטפת מצויר כרגיל, ואינו נספר כמעל', () => {
    seed([{ ...TRACK, alt: 5000 }]);                    // המעטפת כאן: בלוקים עד 6000
    const m = withAp();
    expect(m).toContain('data-testid="p3d-track"');
    expect(m).not.toContain('data-testid="p3d-above-scale"');
  });

  it('הכל בתוך המעטפת - אין מונה בכלל, ולא "0 מעל הסקאלה"', () => {
    seed([{ ...TRACK, alt: 1000 }, { ...TRACK, id: 'b', alt: 6000 }]);
    const m = withAp();
    expect(m).not.toContain('data-testid="p3d-above-scale"');
    expect((m.match(/data-testid="p3d-track"/g) || []).length).toBe(2);
  });

  it('המונה מוצג גם במבט-על, שבו ציר הגבהים נעלם', () => {
    // דווקא שם אין שום דרך אחרת לדעת שיש תנועה גבוהה יותר
    seed([{ ...TRACK, alt: 30000 }]);
    const m = withAp({ camera: { ...DEFAULT_CAMERA, tilt: 90 } });
    expect(m).not.toContain('data-testid="p3d-alt-axis"');
    expect(m).toContain('data-testid="p3d-above-scale"');
  });

  it('אין תוכן תפעולי כלל - התמונ"א קובעת את הסקאלה בעצמה', () => {
    // בלי הקפה ובלי נקודות אין מה להגן עליו, ו"הכול מעל הסקאלה" היה דיווח
    // מטעה על סצנה שכל תוכנה הוא התמונ"א.
    seed([{ ...TRACK, alt: 30000 }]);
    const m = withAp({ patterns: [], joiningPoints: [] });
    expect(m).toContain('data-testid="p3d-track"');
    expect(m).not.toContain('data-testid="p3d-above-scale"');
  });

  it('הגובה הוא **רגל מוחלטת מול פני השדה** - מטוס גבוה יותר מצויר גבוה יותר', () => {
    // הקפה גבוהה מקבעת את קנה המידה האנכי, כך שהשוואה בין שני הגבהים אפשרית
    const tall = [{ ...PATTERN, downwind_alt_ft: 20000, base_alt_ft: 10000 }];
    seed([{ ...TRACK, alt: 2000 }]);
    const low = trackY(withAp({ patterns: tall }));
    airPictureStore.reset();
    seed([{ ...TRACK, alt: 12000 }]);
    const high = trackY(withAp({ patterns: tall }));
    expect(high).toBeLessThan(low);     // y במסך גדל כלפי מטה

    // גובה השדה מוריד את המטוס: אותו גובה מוחלט הוא פחות רגל מעל השדה
    airPictureStore.reset();
    seed([{ ...TRACK, alt: 12000 }]);
    expect(trackY(withAp({ patterns: tall, elevFt: 5000 }))).toBeGreaterThan(high);
  });
});
