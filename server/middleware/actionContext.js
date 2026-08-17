// פותח **פעולה** לכל בקשת כתיבה של מפעיל — יחידת הביטול של CTRL+Z.
//
// יושב אחרי middleware הסביבה (צריך את `currentEnv()`) ולפני כל ה-routers,
// מאותו טעם שבגללו האימות גלובלי: router חדש מקבל ביטול **אוטומטית**, בלי
// שאיש יזכור להוסיף אותו. ראה UNDO_SPEC.md §3.
//
// זרימה:
//   כתיבה של מפעיל מזוהה  →  שורת פעולה  →  runWithAction  →  הטריגר ב-DB רושם
//   כל שאר הבקשות          →  next() בלבד, אפס תקורה
import { randomUUID } from 'node:crypto';
import pool from '../db/pool.js';
import { currentEnv } from '../db/env-context.js';
import { runWithAction, withoutAction } from '../db/action-context.js';
import { pruneSql } from '../db/undoJournal.js';
import { labelFor } from '../undo/labels.js';

/** הכותרת שנושאת את מזהה העמדה. אותה תבנית כמו X-Env. */
export const STATION_HEADER = 'X-Station';
/** הכותרת שבה השרת מודיע ללקוח שנפתחה פעולה שניתן לבטלה. */
export const ACTION_HEADER = 'X-Undo-Action';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * נתיבים שאינם "פעולה של מפעיל" גם כשהם כתיבה.
 * הביטול עצמו בראש הרשימה: אחרת כל ביטול היה נרשם כפעולה חדשה שאפשר לבטל,
 * וזו כבר חזרה קדימה (redo) — פיצ'ר אחר שלא נתבקש (UNDO_SPEC.md §8).
 */
const SKIP_PATHS = [
  /^\/api\/undo(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/station-sessions(\/|$)/,
  /^\/api\/environments\/\d+\/(enter|reset)$/,
  /^\/api\/gapi(\/|$)/,
  /^\/api\/air-picture(\/|$)/,
  /^\/api\/vehicle-gps(\/|$)/,   // זרם מיקום רציף של הנהג, לא פעולה
];

/** תפקידים שיש להם עמדה ומסך — ולכן גם CTRL+Z. */
const UNDOABLE_ROLES = new Set(['admin', 'team_lead', 'user']);

// גיזום עצל: פעם ב-30ש' לכל היותר, ולא בכל כתיבה. אין cron ואין תהליך רקע.
let lastPruneAt = 0;
const PRUNE_EVERY_MS = 30_000;

async function pruneIfDue() {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  try {
    for (const sql of pruneSql()) await pool.query(sql);
  } catch (err) {
    // גיזום שנכשל אינו סיבה להפיל פעולה תפעולית
    console.warn('[undo] גיזום היומן נכשל:', err.message);
  }
}

/** האם הבקשה הזו היא פעולה שניתן לבטלה. */
export function isUndoableRequest(req) {
  if (!WRITE_METHODS.has(String(req.method || '').toUpperCase())) return false;
  const path = req.path || '/';
  if (!path.startsWith('/api')) return false;
  if (SKIP_PATHS.some(p => p.test(path))) return false;
  if (!UNDOABLE_ROLES.has(req.user?.role)) return false;
  return true;
}

export function actionContextMiddleware(req, res, next) {
  if (!isUndoableRequest(req)) return next();

  // בלי מזהה עמדה אין מחסנית לשייך אליה. לקוח ישן שאינו שולח את הכותרת
  // ממשיך לעבוד רגיל — פשוט בלי ביטול, ולא נופל.
  const stationKey = String(req.get(STATION_HEADER) || '').slice(0, 64);
  if (!stationKey) return next();

  const actionId = randomUUID();
  const label = labelFor(req.method, req.path);

  // הכותרת נשלחת **לפני** ה-handler, כי אחריו כבר אי אפשר. היא רמז בלבד:
  // מקור האמת למחסנית הוא GET /api/undo/stack, שמסנן פעולות ריקות וחסומות.
  res.setHeader(ACTION_HEADER, actionId);

  // ניקוי הפעולה כשלא נשאר ממנה דבר: PUT שלא שינה כלום, או בקשה שנפלה לפני
  // הכתיבה. בלי זה המחסנית מתמלאת ב"פעולות" ש-CTRL+Z עליהן לא יעשה כלום.
  // פעולה שכן הספיקה לכתוב **נשארת** גם אם הבקשה החזירה שגיאה — השינוי
  // בוצע בפועל, ולמפעיל מגיע להחזירו.
  res.on('finish', () => {
    withoutAction(async () => {
      try {
        await pool.query(
          `DELETE FROM public.undo_actions a
            WHERE a.id = $1
              AND NOT EXISTS (SELECT 1 FROM public.undo_journal j WHERE j.action_id = a.id)`,
          [actionId],
        );
      } catch { /* שורה יתומה תיגזם ממילא בגיזום הבא */ }
    });
  });

  withoutAction(async () => {
    await pruneIfDue();
    await pool.query(
      `INSERT INTO public.undo_actions
         (id, env, station_key, crew_member_id, crew_name, method, path, label_key, label_params)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actionId, currentEnv(), stationKey,
        req.user?.crewMemberId ?? null, req.user?.name ?? null,
        req.method, req.path, label.key, JSON.stringify(label.params),
      ],
    );
  }).then(
    () => runWithAction(actionId, () => next()),
    (err) => {
      // פתיחת פעולה שנכשלה לא תעצור בקר באמצע עבודה. הבקשה ממשיכה בלי ביטול.
      console.warn('[undo] פתיחת פעולה נכשלה:', err.message);
      next();
    },
  );
}
