import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { apiAuthHeaders } from './helpers';

// ─── מסלול מקושר = אותו מסלול פיזי, אותו מצב ──────────────────────────────────
// אותו מסלול מוגדר בשני שדות בשמות שונים, וקישור המסלולים מצהיר שהם אותו דבר.
// מרגע שקושרו: סגירה, קיצור, תאורות והמסלולים שבשימוש מסונכרנים לשני הצדדים.
//
// המלכודות שנבדקות כאן: שמות קצוות שונים ('15L' מול '15'), **סדר הפוך** בין
// השדות (heading_a אצל אחד הוא heading_b אצל השני), ופתיחה בצד אחד שחייבת
// לפתוח גם בשני.

const API = process.env.E2E_API_URL || 'http://localhost:3001/api';
const STAMP = `__e2e_rwsync_${Date.now()}`;

let api: APIRequestContext;
let afA = 0, afB = 0;
let rwA = 0, rwB = 0;
let groupId = 0;

const routesOf = async (afId: number) =>
  (await (await api.get(`${API}/airfield-routes?airfield_id=${afId}`)).json()) as any[];
const notamsOf = async (afId: number) =>
  (await (await api.get(`${API}/runway-notams?airfield_id=${afId}`)).json()) as any[];
const lightingOf = async (afId: number) =>
  (await (await api.get(`${API}/runway-lighting?airfield_id=${afId}`)).json()) as any[];
const grfOf = async (afId: number) =>
  (await (await api.get(`${API}/runway-grf?airfield_id=${afId}`)).json()) as any[];
const endUseOf = async (afId: number) =>
  (await (await api.get(`${API}/runway-end-use?airfield_id=${afId}`)).json()) as any[];

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({ extraHTTPHeaders: await apiAuthHeaders() });

  afA = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_a` } })).json()).id;
  afB = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_b` } })).json()).id;

  // אותו מסלול פיזי, שני שמות ו**סדר הפוך**: אצל A הקצה הראשון הוא 15L, אצל B הוא 33
  rwA = (await (await api.post(`${API}/airfield-runways`, {
    data: { airfield_id: afA, name: '15L/33R', heading_a: '15L', heading_b: '33R', start_x_pct: 20, start_y_pct: 80, end_x_pct: 80, end_y_pct: 20 },
  })).json()).id;
  rwB = (await (await api.post(`${API}/airfield-runways`, {
    data: { airfield_id: afB, name: '33/15', heading_a: '33', heading_b: '15', start_x_pct: 80, start_y_pct: 20, end_x_pct: 20, end_y_pct: 80 },
  })).json()).id;

  // מסלולי הראי נוצרו אוטומטית עם המסלולים - הקישור ביניהם הוא הגשר
  const mirrorA = (await routesOf(afA)).find(r => Number(r.source_runway_id) === rwA);
  const mirrorB = (await routesOf(afB)).find(r => Number(r.source_runway_id) === rwB);
  expect(mirrorA && mirrorB, 'לכל מסלול המראה יש מסלול ראי').toBeTruthy();

  groupId = (await (await api.post(`${API}/route-link-groups`, {
    data: { name: STAMP, airfield_id: afA, members: [{ route_id: mirrorA.id }, { route_id: mirrorB.id }] },
  })).json()).id;
});

test.afterAll(async () => {
  if (groupId) await api.delete(`${API}/route-link-groups/${groupId}`);
  for (const id of [afA, afB]) if (id) await api.delete(`${API}/airfields/${id}`);
  await api.dispose();
});

test('סגירת מסלול בצד אחד סוגרת אותו בצד השני, ופתיחה פותחת בשניהם', async () => {
  const created = await (await api.post(`${API}/runway-notams`, {
    data: { runway_id: rwA, notam_type: 'closed' },
  })).json();

  const closedB = (await notamsOf(afB)).filter(n => n.notam_type === 'closed');
  expect(closedB[0]?.is_linked, 'מסומן שהמידע הגיע מהשדה המקושר').toBe(true);
  expect(closedB[0]?.source_airfield_name, 'ומאיזה שדה בדיוק').toContain(STAMP);
  expect(closedB, 'המסלול המקושר סגור גם הוא').toHaveLength(1);
  expect(closedB[0].runway_id).toBe(rwB);

  // פתיחה בצד A - חייבת לפתוח גם ב-B, אחרת המסלול נשאר "סגור" אצל השכן לנצח
  await api.delete(`${API}/runway-notams/${created.id}`);
  expect((await notamsOf(afB)).filter(n => n.notam_type === 'closed'), 'הפתיחה חלה על שני הצדדים').toHaveLength(0);
  expect((await notamsOf(afA)).filter(n => n.notam_type === 'closed')).toHaveLength(0);
});

test('קיצור מסלול עובר לקצה הנכון גם כשהסדר הפוך', async () => {
  // אצל A הקצה 'a' הוא 15L; אצל B הקצה 15 הוא davka 'b'
  const created = await (await api.post(`${API}/runway-notams`, {
    data: { runway_id: rwA, notam_type: 'shortening', shorten_end: 'a', shorten_amount_m: 300 },
  })).json();
  try {
    const copy = (await notamsOf(afB)).find(n => n.notam_type === 'shortening');
    expect(copy, 'הקיצור הועתק').toBeTruthy();
    expect(copy.shorten_end, 'הקצה מותאם לפי השם ולא לפי המיקום').toBe('b');
    expect(Number(copy.shorten_amount_m)).toBe(300);
  } finally {
    await api.delete(`${API}/runway-notams/${created.id}`);
  }
  expect((await notamsOf(afB)).filter(n => n.notam_type === 'shortening')).toHaveLength(0);
});

test('תאורות מסלול מסונכרנות - אותן נורות פיזיות', async () => {
  await api.put(`${API}/runway-lighting/${rwA}`, {
    data: { centerline_level: 3, edge_level: 2, threshold_lights: 1, end_lights: 0 },
  });
  const b = (await lightingOf(afB)).find(l => Number(l.runway_id) === rwB);
  expect(b, 'למסלול המקושר נוצרה רשומת תאורות').toBeTruthy();
  expect([b.centerline_level, b.edge_level, b.threshold_lights, b.end_lights]).toEqual([3, 2, 1, 0]);

  // שינוי חוזר מתגלגל גם הוא
  await api.put(`${API}/runway-lighting/${rwA}`, { data: { centerline_level: 0, edge_level: 0, threshold_lights: 0, end_lights: 0 } });
  const b2 = (await lightingOf(afB)).find(l => Number(l.runway_id) === rwB);
  expect(b2.centerline_level).toBe(0);
});

test('מסלול בשימוש מסונכרן, כולל התאמת שם הקצה והורדת הכיוון הנגדי', async () => {
  // המראה מ-15L אצל A
  await api.put(`${API}/runway-end-use`, { data: { runway_id: rwA, end_name: '15L', in_takeoff: true, in_landing: false } });
  const b = (await endUseOf(afB)).find(r => String(r.end_name) === '15');
  expect(b, 'הקצה המקביל אצל השכן נקרא 15 ולא 15L').toBeTruthy();
  expect(b.in_takeoff).toBe(true);

  // נחיתה בכיוון הנגדי - הכיוון הקודם יורד, בשני הצדדים
  await api.put(`${API}/runway-end-use`, { data: { runway_id: rwA, end_name: '33R', in_takeoff: false, in_landing: true } });

  const aRows = await endUseOf(afA);
  expect(aRows.find(r => r.end_name === '33R').in_landing).toBe(true);
  expect(aRows.find(r => r.end_name === '15L').in_takeoff, 'הכיוון הנגדי ירד אצלי').toBe(false);

  const bRows = await endUseOf(afB);
  expect(bRows.find(r => r.end_name === '33').in_landing, 'ואצל השכן הופעל הקצה המקביל').toBe(true);
  expect(bRows.find(r => r.end_name === '15').in_takeoff, 'והנגדי ירד גם אצלו').toBe(false);
});

test('GRF מסונכרן, והדיווח האחרון גובר', async () => {
  await api.post(`${API}/runway-grf`, {
    data: { runway_id: rwA, heading: '15L', rwycc_t: 5, coverage_t: 10, notes: 'יבש' },
  });
  const b = (await grfOf(afB)).find(g => String(g.heading) === '15');
  expect(b, 'הקצה המקביל אצל השכן נקרא 15 ולא 15L').toBeTruthy();
  expect(b.rwycc_t).toBe(5);
  expect(b.is_linked).toBe(true);

  // דיווח חדש יותר מהצד השני גובר על שני הצדדים
  await api.post(`${API}/runway-grf`, { data: { runway_id: rwB, heading: '15', rwycc_t: 2, notes: 'רטוב' } });
  const a = (await grfOf(afA)).find(g => String(g.heading) === '15L');
  expect(a.rwycc_t, 'הדיווח האחרון הוא זה שמוצג').toBe(2);
});

// ── התרחיש שהתגלה בשטח ────────────────────────────────────────────────────────
// המימוש הראשון העתיק את המצב בזמן **כתיבה**, ולכן מידע שכבר היה שם לפני
// שהקישור נוצר פשוט לא זז: "אם לא איפסתי את זה אז זה לא מתעדכן".
test('מידע שנרשם לפני הקישור מופיע בצד השני מיד עם יצירת הקישור, בלי לגעת בו', async () => {
  const afX = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_x` } })).json()).id;
  const afY = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_y` } })).json()).id;
  let gid = 0;
  try {
    const rwX = (await (await api.post(`${API}/airfield-runways`, {
      data: { airfield_id: afX, name: '09/27', heading_a: '09', heading_b: '27' },
    })).json()).id;
    const rwY = (await (await api.post(`${API}/airfield-runways`, {
      data: { airfield_id: afY, name: '27/09', heading_a: '27', heading_b: '09' },
    })).json()).id;

    // כל המצב נרשם **לפני** שקיים קישור כלשהו
    await api.post(`${API}/runway-notams`, { data: { runway_id: rwX, notam_type: 'closed' } });
    await api.post(`${API}/runway-grf`, { data: { runway_id: rwX, heading: '09', rwycc_t: 3 } });
    await api.put(`${API}/runway-lighting/${rwX}`, { data: { centerline_level: 2, edge_level: 1 } });
    await api.put(`${API}/runway-end-use`, { data: { runway_id: rwX, end_name: '09', in_takeoff: true, in_landing: false } });

    expect((await notamsOf(afY)), 'לפני הקישור - שום דבר לא עובר').toHaveLength(0);

    // ורק עכשיו מקשרים
    const mirrorX = (await routesOf(afX)).find(r => Number(r.source_runway_id) === rwX);
    const mirrorY = (await routesOf(afY)).find(r => Number(r.source_runway_id) === rwY);
    gid = (await (await api.post(`${API}/route-link-groups`, {
      data: { name: `${STAMP}_xy`, airfield_id: afX, members: [{ route_id: mirrorX.id }, { route_id: mirrorY.id }] },
    })).json()).id;

    // בלי לגעת בשום נתון - הצד השני רואה את הכל
    expect((await notamsOf(afY)).filter(n => n.notam_type === 'closed'), 'סגירה').toHaveLength(1);
    expect((await grfOf(afY)).find(g => String(g.heading) === '09')?.rwycc_t, 'GRF').toBe(3);
    expect((await lightingOf(afY)).find(l => Number(l.runway_id) === rwY)?.centerline_level, 'תאורות').toBe(2);
    expect((await endUseOf(afY)).find(r => String(r.end_name) === '09')?.in_takeoff, 'מסלול בשימוש').toBe(true);
  } finally {
    if (gid) await api.delete(`${API}/route-link-groups/${gid}`);
    for (const id of [afX, afY]) await api.delete(`${API}/airfields/${id}`);
  }
});

test('צירוף שדה שלישי לקבוצה קיימת - הוא מקבל את המצב מיד', async () => {
  const afC = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_third` } })).json()).id;
  try {
    const rwC = (await (await api.post(`${API}/airfield-runways`, {
      data: { airfield_id: afC, name: '15/33', heading_a: '15', heading_b: '33' },
    })).json()).id;
    // מצב קיים בקבוצה A+B
    await api.post(`${API}/runway-notams`, { data: { runway_id: rwA, notam_type: 'closed' } });
    await api.put(`${API}/runway-end-use`, { data: { runway_id: rwA, end_name: '15L', in_takeoff: true, in_landing: false } });
    expect(await notamsOf(afC), 'לפני הצירוף - ריק').toHaveLength(0);

    // מצרפים את C לאותה קבוצה (עדכון הקבוצה, לא יצירת חדשה)
    const mirrorA = (await routesOf(afA)).find(r => Number(r.source_runway_id) === rwA);
    const mirrorB = (await routesOf(afB)).find(r => Number(r.source_runway_id) === rwB);
    const mirrorC = (await routesOf(afC)).find(r => Number(r.source_runway_id) === rwC);
    const upd = await api.put(`${API}/route-link-groups/${groupId}`, {
      data: { name: STAMP, members: [{ route_id: mirrorA.id }, { route_id: mirrorB.id }, { route_id: mirrorC.id }] },
    });
    expect(upd.status()).toBe(200);

    expect((await notamsOf(afC)).filter(n => n.notam_type === 'closed'), 'החדש רואה את הסגירה הקיימת').toHaveLength(1);
    expect((await endUseOf(afC)).find(r => String(r.end_name) === '15')?.in_takeoff, 'ואת המסלול שבשימוש').toBe(true);
  } finally {
    // מחזירים את הקבוצה להרכב המקורי ומנקים
    const mirrorA = (await routesOf(afA)).find(r => Number(r.source_runway_id) === rwA);
    const mirrorB = (await routesOf(afB)).find(r => Number(r.source_runway_id) === rwB);
    await api.put(`${API}/route-link-groups/${groupId}`, {
      data: { name: STAMP, members: [{ route_id: mirrorA.id }, { route_id: mirrorB.id }] },
    });
    await api.delete(`${API}/airfields/${afC}`);
    for (const n of (await notamsOf(afA))) await api.delete(`${API}/runway-notams/${n.id}`);
  }
});

test('בלי קישור אין סנכרון - הבידוד בין שדות נשמר', async () => {
  const afC = (await (await api.post(`${API}/airfields`, { data: { name: `${STAMP}_c` } })).json()).id;
  try {
    const rwC = (await (await api.post(`${API}/airfield-runways`, {
      data: { airfield_id: afC, name: '15L/33R', heading_a: '15L', heading_b: '33R' },
    })).json()).id;
    await api.post(`${API}/runway-notams`, { data: { runway_id: rwA, notam_type: 'closed' } });
    expect((await notamsOf(afC)).filter(n => n.notam_type === 'closed'),
      'שדה עם אותם שמות מסלול אך בלי קישור - לא מושפע').toHaveLength(0);
    expect(rwC).toBeTruthy();
  } finally {
    await api.delete(`${API}/airfields/${afC}`);
    for (const n of (await notamsOf(afA))) await api.delete(`${API}/runway-notams/${n.id}`);
  }
});
