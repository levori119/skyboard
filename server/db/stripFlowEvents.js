// ─── FLOW של פ"מ - רישום וקריאה ───────────────────────────────────────────────
//
// טבלה ייעודית ולא activity_log, משלוש סיבות שהתגלו בחקירה:
//   1. activity_log נכתב ברובו מהלקוח (fire-and-forget) - קבלה שהלקוח לא דיווח
//      עליה פשוט לא קיימת, וקבלה אוטומטית אין לה לקוח בכלל.
//   2. strip_id שם הוא מחרוזת בשתי צורות ('s123' ו-'123'), בלי אינדקס.
//   3. אדמין יכול למחוק אותו כולו.
//
// ובלי FK ל-strips בכוונה: מיזוג פ"מ מוחק את החלק שמוזג, ו-CASCADE היה מוחק
// איתו בדיוק את ההיסטוריה שה-FLOW צריך להציג. ראה STRIP_FLOW_SPEC.md.

import { flowCurrent, mergeLineageEvents, referencedStripIds } from '../utils/stripFlow.js';

export const STRIP_FLOW_EVENTS_DDL = [
  `CREATE TABLE IF NOT EXISTS strip_flow_events (
    id BIGSERIAL PRIMARY KEY,
    strip_id INTEGER NOT NULL,
    kind VARCHAR(32) NOT NULL,
    callsign VARCHAR(64),
    preset_id INTEGER,
    preset_name VARCHAR(128),
    point_label VARCHAR(128),
    crew_member_id INTEGER,
    crew_member_name VARCHAR(128),
    details JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_strip_flow_events_strip ON strip_flow_events(strip_id, occurred_at)`,
];

/** תקרת פ"מים לבקשה מרוכזת אחת */
export const MAX_FLOW_STRIPS = 500;

const intOrNull = (v) => {
  const n = parseInt(String(v ?? '').replace(/^s/, ''), 10);
  return Number.isFinite(n) ? n : null;
};

const INSERT_SQL = `
  INSERT INTO strip_flow_events
    (strip_id, kind, callsign, preset_id, preset_name, point_label, crew_member_id, crew_member_name, details)
  VALUES (
    $1::int, $2,
    COALESCE($3::text, (SELECT callsign FROM strips WHERE id = $1::int)),
    $4::int,
    COALESCE($5::text, (SELECT name FROM workstation_presets WHERE id = $4::int)),
    $6, $7::int, $8, $9::jsonb)`;

/**
 * רישום אירוע FLOW. **לעולם אינו זורק** - פעולה תפעולית (קבלה, הסעה) לא נכשלת
 * בגלל יומן.
 *
 * `inTx`: הקורא בתוך טרנזקציה פתוחה. אז הרישום עטוף ב-SAVEPOINT, כי ב-Postgres
 * שגיאה אחת מבטלת את כל הטרנזקציה - ו-INSERT שנכשל היה מבטל את הקבלה עצמה.
 *
 * `prepare` (אופציונלי): שאילתות עזר לפני הרישום (שמות נקודה ועמדה), שרצות בתוך אותו
 * מגן. מחזירה אובייקט שממוזג לאירוע.
 */
export async function recordFlowEvent(db, ev, { inTx = false, user = null, prepare = null } = {}) {
  const sp = 'strip_flow_event';
  try {
    if (inTx) await db.query(`SAVEPOINT ${sp}`);
    const extra = prepare ? (await prepare()) || {} : {};
    const e = { ...ev, ...extra, details: { ...(ev.details || {}), ...(extra.details || {}) } };
    const stripId = intOrNull(e.strip_id);
    if (stripId === null || !e.kind) {
      if (inTx) await db.query(`RELEASE SAVEPOINT ${sp}`);
      return;
    }
    await db.query(INSERT_SQL, [
      stripId, e.kind, e.callsign ?? null, intOrNull(e.preset_id), e.preset_name ?? null,
      e.point_label ?? null, user?.crewMemberId ?? null, user?.name ?? null,
      JSON.stringify(e.details || {}),
    ]);
    if (inTx) await db.query(`RELEASE SAVEPOINT ${sp}`);
  } catch (err) {
    if (inTx) {
      try { await db.query(`ROLLBACK TO SAVEPOINT ${sp}`); } catch { /* הטרנזקציה כבר לא שמישה - הקורא יגלה */ }
    }
    console.error(`[strip-flow] רישום ${ev?.kind} נכשל:`, err.message);
  }
}

/** שם נקודת העברה של העברה: תווית תת-הנקודה, ואם אין - שם הסקטור. */
export async function transferNames(db, t) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COALESCE(label_he, name) FROM sectors WHERE id = $1::int) AS sector_label,
       (SELECT name FROM workstation_presets WHERE id = $2::int) AS from_name,
       (SELECT name FROM workstation_presets WHERE id = $3::int) AS to_name`,
    [intOrNull(t.to_sector_id), intOrNull(t.from_preset_id ?? t.from_workstation_id), intOrNull(t.to_preset_id ?? t.to_workstation_id)],
  );
  const r = rows[0] || {};
  return {
    pointLabel: (t.sub_sector_label && String(t.sub_sector_label).trim()) || r.sector_label || null,
    fromName: r.from_name || null,
    toName: r.to_name || null,
  };
}

/**
 * קבלה - מכל מסלולי הקבלה (קבל, קבלה למפה, קבלה אוטומטית).
 * נקרא **לפני** מיזוג עם אח: המיזוג מוחק את הפ"מ הנכנס, ואז לא היה ממנו או"ק.
 */
export async function recordAcceptedFlow(db, transfer, assignedPresetId, { mode, user }) {
  await recordFlowEvent(db, { strip_id: transfer.strip_id, kind: 'accepted', preset_id: assignedPresetId }, {
    inTx: true,
    user,
    prepare: async () => {
      const n = await transferNames(db, transfer);
      return { point_label: n.pointLabel, details: { mode, fromPresetName: n.fromName, transferId: transfer.id } };
    },
  });
}

/** מיזוג: האירוע נרשם על הפ"מ **שנשאר**, ומפנה לחלק שנמחק כדי שה-FLOW יירש אותו. */
export async function recordMergedFlow(db, targetId, sourceId, presetId, { user, inTx = true } = {}) {
  await recordFlowEvent(db, {
    strip_id: targetId, kind: 'merged', preset_id: presetId, details: { sourceStripId: intOrNull(sourceId) },
  }, { inTx, user });
}

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

function normalizeEvent(r) {
  let details = r.details;
  if (typeof details === 'string') { try { details = JSON.parse(details); } catch { details = {}; } }
  return {
    id: Number(r.id),
    kind: r.kind,
    strip_id: Number(r.strip_id),
    callsign: r.callsign ?? null,
    preset_id: r.preset_id ?? null,
    preset_name: r.preset_name ?? null,
    point_label: r.point_label ?? null,
    crew_member_name: r.crew_member_name ?? null,
    details: details || {},
    occurred_at: iso(r.occurred_at),
  };
}

/** "נוצר" נגזר מהפ"מ עצמו - כך גם פ"מ שנוצר לפני הפיצ'ר מקבל נקודת התחלה. */
function createdEvent(s) {
  return {
    id: `c${s.id}`, kind: 'created', strip_id: Number(s.id), callsign: s.callsign ?? null,
    preset_id: s.creator_preset_id ?? null, preset_name: s.creator_preset_name ?? null,
    point_label: null, crew_member_name: s.creator_crew_name ?? null, details: {}, occurred_at: iso(s.created_at),
  };
}

/**
 * FLOW מלא לרשימת פ"מים: פרטי הפ"מ, "נמצא עכשיו" והאירועים (כולל מה שירש).
 * פ"מ שאינו קיים לא מוחזר.
 */
export async function loadFlows(db, rawIds) {
  const want = [...new Set((rawIds || []).map(intOrNull).filter(n => n !== null && n > 0))].slice(0, MAX_FLOW_STRIPS);
  if (want.length === 0) return [];

  const STRIP_COLS = `id, callsign, sq, number_of_formation, created_at, creator_preset_id, creator_preset_name, creator_crew_name,
                      landed, airborne, status, aircraft_positions`;
  const strips = (await db.query(`SELECT ${STRIP_COLS} FROM strips WHERE id = ANY($1::int[])`, [want])).rows;
  if (strips.length === 0) return [];

  // אירועי הפ"מים + המקורות שמהם ירשו (פיצול/מיזוג), בשכבות. התקרה על העומק
  // שומרת מנתונים מעגליים.
  const eventsByStrip = {};
  const loaded = new Set();
  let pending = strips.map(s => Number(s.id));
  for (let depth = 0; depth < 6 && pending.length; depth++) {
    pending.forEach(id => { loaded.add(id); eventsByStrip[id] = eventsByStrip[id] || []; });
    const rows = (await db.query(
      'SELECT * FROM strip_flow_events WHERE strip_id = ANY($1::int[]) ORDER BY occurred_at, id', [pending],
    )).rows.map(normalizeEvent);
    for (const e of rows) eventsByStrip[e.strip_id].push(e);
    pending = referencedStripIds(rows).filter(id => !loaded.has(id));
  }

  const lineageIds = [...loaded].filter(id => !strips.some(s => Number(s.id) === id));
  const lineageStrips = lineageIds.length
    ? (await db.query(`SELECT ${STRIP_COLS} FROM strips WHERE id = ANY($1::int[])`, [lineageIds])).rows
    : [];
  for (const s of [...strips, ...lineageStrips]) {
    const own = eventsByStrip[Number(s.id)] || [];
    // חלק שנולד בפיצול - אירוע הפיצול הוא ה"נולד" שלו, והיצירה עצמה יורשת מהמקור
    if (s.created_at && !own.some(e => e.kind === 'split')) own.unshift(createdEvent(s));
    eventsByStrip[Number(s.id)] = own;
  }

  const pendingRows = (await db.query(
    `SELECT DISTINCT ON (t.strip_id) t.strip_id,
            COALESCE(NULLIF(TRIM(t.sub_sector_label), ''), sec.label_he, sec.name) AS point_label,
            p_to.name AS to_preset_name, p_from.name AS from_preset_name
     FROM strip_transfers t
     LEFT JOIN sectors sec ON sec.id = t.to_sector_id
     LEFT JOIN workstation_presets p_to ON p_to.id = COALESCE(t.to_preset_id, t.to_workstation_id)
     LEFT JOIN workstation_presets p_from ON p_from.id = COALESCE(t.from_preset_id, t.from_workstation_id)
     WHERE t.strip_id = ANY($1::int[]) AND t.status IN ('pending','acknowledged')
     ORDER BY t.strip_id, t.created_at DESC`,
    [strips.map(s => Number(s.id))],
  )).rows;
  const pendingByStrip = new Map(pendingRows.map(r => [Number(r.strip_id), r]));

  return strips.map(s => {
    const events = mergeLineageEvents(Number(s.id), eventsByStrip);
    return {
      strip: {
        id: Number(s.id),
        callsign: s.callsign ?? null,
        sq: s.sq ?? null,
        number_of_formation: s.number_of_formation ?? null,
        created_at: iso(s.created_at),
        landed: s.landed === true,
        airborne: s.airborne === true,
        status: s.status ?? null,
      },
      current: flowCurrent({ strip: s, pendingTransfer: pendingByStrip.get(Number(s.id)) || null, events }),
      events,
    };
  });
}
