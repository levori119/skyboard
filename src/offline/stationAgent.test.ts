// סוכן העמדה - הכללים שמחליטים לאן הולכת בקשה, ומה נשאר בחוץ.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rewriteToAgent, targetMatches, installStationAgentFetch, discoverStationAgent,
  __setAgentForTests, getAgentState, DEFAULT_AGENT_ORIGIN,
} from './stationAgent';

const AGENT = DEFAULT_AGENT_ORIGIN;
const PAGE = 'https://sky-king.up.railway.app';

const withAgent = () => __setAgentForTests({
  agent: { origin: AGENT, apiTarget: PAGE, localReady: true },
});

describe('targetMatches - סוכן שמכוון לשרת אחר אינו משמש', () => {
  it('אותו שרת - מותר', () => {
    expect(targetMatches(PAGE, `${PAGE}/`)).toBe(true);
  });

  // הבדיקה הזו היא ההגנה על מידע השדה: סוכן שהוגדר מול שרת אחר היה מקבל את
  // כל תעבורת העמדה ושולח אותה לשם, בלי שאיש יראה זאת.
  it('שרת אחר - נדחה', () => {
    expect(targetMatches(PAGE, 'https://other.example.com')).toBe(false);
  });

  it('בלי יעד מוצהר - נדחה', () => {
    expect(targetMatches(PAGE, null)).toBe(false);
  });

  it('דף על לוקלהוסט - כל יעד מתקבל, כי שם ה-API ממילא על פורט אחר', () => {
    expect(targetMatches('http://localhost:5000', 'http://127.0.0.1:3001')).toBe(true);
  });
});

describe('rewriteToAgent', () => {
  beforeEach(withAgent);
  afterEach(() => __setAgentForTests({ agent: null }));

  it('נתיב API יחסי עובר לסוכן, עם ה-query', () => {
    expect(rewriteToAgent('/api/strips?airfield_id=3', PAGE))
      .toBe(`${AGENT}/api/strips?airfield_id=3`);
  });

  it('נתיבי התשתית של העמדה עוברים גם הם - שם יושב המאגר המקומי', () => {
    expect(rewriteToAgent('/api/__station/status', PAGE)).toBe(`${AGENT}/api/__station/status`);
    expect(rewriteToAgent('/api/__local/sync/state', PAGE)).toBe(`${AGENT}/api/__local/sync/state`);
  });

  // הסוכן מגיש dist משלו. נכס שיימשך דרכו יריץ בעמדה גרסה אחרת מזו שהשרת
  // המרכזי הגיש - שתי גרסאות שמתחלפות לפי מי ענה ראשון.
  it('נכסים סטטיים **אינם** עוברים', () => {
    expect(rewriteToAgent('/assets/index.js', PAGE)).toBeNull();
    expect(rewriteToAgent('/', PAGE)).toBeNull();
  });

  it('נתיב שרק מתחיל באותן אותיות אינו API', () => {
    expect(rewriteToAgent('/apifoo', PAGE)).toBeNull();
  });

  it('שירות חיצוני אינו עובר', () => {
    expect(rewriteToAgent('https://tiles.example.com/api/x', PAGE)).toBeNull();
  });

  it('בקשה שכבר אצל הסוכן אינה משוכתבת שוב', () => {
    expect(rewriteToAgent(`${AGENT}/api/strips`, PAGE)).toBeNull();
  });

  it('בלי סוכן - אין שכתוב כלל', () => {
    __setAgentForTests({ agent: null });
    expect(rewriteToAgent('/api/strips', PAGE)).toBeNull();
  });
});

describe('installStationAgentFetch', () => {
  let restore: (() => void) | null = null;
  let seen: string[] = [];

  beforeEach(() => {
    seen = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      seen.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    restore = installStationAgentFetch();
  });
  afterEach(() => { restore?.(); __setAgentForTests({ agent: null }); });

  it('עם סוכן - הבקשה יוצאת לכתובת שלו', async () => {
    withAgent();
    await fetch(`${PAGE}/api/strips`);
    expect(seen).toEqual([`${AGENT}/api/strips`]);
  });

  it('בלי סוכן - הבקשה יוצאת כמו שהיא', async () => {
    __setAgentForTests({ agent: null });
    await fetch(`${PAGE}/api/strips`);
    expect(seen).toEqual([`${PAGE}/api/strips`]);
  });
});

describe('discoverStationAgent', () => {
  afterEach(() => { __setAgentForTests({ agent: null }); vi.restoreAllMocks(); });

  it('סוכן שמכוון לאותו שרת - נמצא', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ apiTarget: `${PAGE}/`, localReady: true }), { status: 200 })) as unknown as typeof fetch;
    const info = await discoverStationAgent(PAGE);
    expect(info?.origin).toBe(AGENT);
    expect(getAgentState().reason).toBeNull();
  });

  it('סוכן שמכוון לשרת אחר - נדחה, והסיבה נשמרת לתצוגה', async () => {
    globalThis.fetch = vi.fn(async () => new Response(
      JSON.stringify({ apiTarget: 'https://other.example.com', localReady: true }), { status: 200 })) as unknown as typeof fetch;
    expect(await discoverStationAgent(PAGE)).toBeNull();
    expect(getAgentState().reason).toBe('mismatch');
  });

  // פורט סגור, כרום שחוסם, proxy שבולע - כולם "אין סוכן", והדף ממשיך לעבוד
  // מול השרת המרכזי בדיוק כמו קודם.
  it('כשל רשת אינו שובר - פשוט אין סוכן', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await discoverStationAgent(PAGE)).toBeNull();
    expect(getAgentState().reason).toBe('none');
  });

  it('הדף עצמו מוגש מהסוכן - אין מה לשכתב', async () => {
    expect(await discoverStationAgent(AGENT)).toBeNull();
    expect(getAgentState().reason).toBe('self');
  });
});
