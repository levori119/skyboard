// ─── מסלול המראה כמסלול הסעה: "מסלול ראי" ─────────────────────────────────────
//
// בעמדת הניהול מוגדר מסלול המראה פעמיים: פעם ביישות **"מסלולים"**
// (`airfield_runways` - כיוונים, אורך, מרחקי הכרזה) ופעם ב**"מסלולי הסעה"**
// (`airfield_routes` - השרטוט על המפה, שאליו נקשרים קישורי מסלולים, התראות
// המראה וקונפליקטים). ההגדרה הכפולה הייתה ידנית, ולכן גם ניתנת לסתירה: שם או
// קצה שהשתנו במקום אחד נשארו ישנים בשני, בלי שאיש ידע.
//
// מעכשיו מסלול שנוצר ביישות "מסלולים" נכנס אוטומטית ל"מסלולי הסעה" כ**ראי**:
// כל השדות נגזרים ממנו, ההערה אומרת מאיפה הוא הגיע, והוא **אינו ניתן לעריכה**
// שם - עורכים ביישות שממנה הוא הגיע. `source_runway_id` הוא הקשר, ומחיקת
// המסלול מוחקת אותו (CASCADE).

/** צבע אחיד למסלולי הראי - כדי שייראו כקבוצה אחת ברשימה ובמפה. */
export const RUNWAY_ROUTE_COLOR = '#fbbf24';

const txt = (v) => String(v ?? '').trim();

/** שם המסלול הראי: השם מהיישות, ואם אין - הקצוות, ואם גם אין - המזהה. */
export function runwayRouteName(runway) {
  const name = txt(runway?.name);
  if (name) return name;
  const ends = [txt(runway?.heading_a), txt(runway?.heading_b)].filter(Boolean);
  if (ends.length) return ends.join('/');
  return `מסלול ${runway?.id ?? ''}`.trim();
}

/**
 * השרטוט: קו בין תחילת המסלול לסופו.
 * בלי ארבע הקואורדינטות אין שרטוט - **לא** נקודה על (0,0). `0` הוא ערך תקף
 * (פינת המפה), ולכן הבדיקה היא על `null`/`undefined` ולא על falsy.
 */
export function runwayRoutePath(runway) {
  const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const sx = n(runway?.start_x_pct), sy = n(runway?.start_y_pct);
  const ex = n(runway?.end_x_pct), ey = n(runway?.end_y_pct);
  if (sx === null || sy === null || ex === null || ey === null) return [];
  return [{ x: sx, y: sy }, { x: ex, y: ey }];
}

/** ההערה שנשמרת במסלול - כך שהמפעיל רואה ברשימה מאיפה הוא הגיע ולמה נעול. */
export function runwayRouteNote(runway) {
  return `נוצר אוטומטית מיישות "מסלולים" - מסלול ${runwayRouteName(runway)}. עריכה מתבצעת שם.`;
}

/** כל שדות מסלול ההסעה הנגזרים ממסלול ההמראה. */
export function routeFieldsFromRunway(runway) {
  return {
    name: runwayRouteName(runway),
    is_runway: true,
    end_a_name: txt(runway?.heading_a) || null,
    end_b_name: txt(runway?.heading_b) || null,
    route_path: runwayRoutePath(runway),
    notes: runwayRouteNote(runway),
    route_category: 'aircraft',
    color: RUNWAY_ROUTE_COLOR,
  };
}

/**
 * האם מסלול הסעה קיים הוא בעצם אותו מסלול המראה - כלומר יש **לאמץ** אותו
 * במקום ליצור כפילות. נדרש אותו שדה, מסלול המראה, ושעדיין אינו ראי של אחר.
 * ההתאמה לפי שם או לפי **שני** הקצוות: קצה בודד תואם גם בין מסלולים שונים.
 */
export function matchesRunway(route, runway) {
  if (!route || !runway) return false;
  if (Number(route.airfield_id) !== Number(runway.airfield_id)) return false;
  if (!route.is_runway) return false;
  if (route.source_runway_id) return false;
  if (txt(route.name) && txt(route.name) === runwayRouteName(runway)) return true;
  const a = txt(runway.heading_a), b = txt(runway.heading_b);
  return Boolean(a && b && txt(route.end_a_name) === a && txt(route.end_b_name) === b);
}

/**
 * יוצר/מעדכן את מסלול הראי של מסלול המראה אחד.
 * `query` - `pool.query` או `client.query` (בתוך טרנזקציה).
 *
 * השרטוט נדרס רק כשליישות יש קואורדינטות: מסלול שהוגדר בלי מיקום על המפה לא
 * ימחק שרטוט שכבר צויר ידנית לפני האימוץ.
 */
export async function syncRunwayRoute(query, runway) {
  if (!runway?.id || !runway?.airfield_id) return { route: null, action: 'skipped' };
  const f = routeFieldsFromRunway(runway);

  const { rows: mirror } = await query(
    'SELECT id FROM airfield_routes WHERE source_runway_id=$1 ORDER BY id LIMIT 1', [runway.id]);
  let id = mirror[0]?.id ?? null;
  let action = id ? 'updated' : 'created';

  if (!id) {
    const { rows: candidates } = await query(
      'SELECT * FROM airfield_routes WHERE airfield_id=$1 AND is_runway=TRUE AND source_runway_id IS NULL ORDER BY id',
      [runway.airfield_id]);
    const adopted = candidates.find(r => matchesRunway(r, runway));
    if (adopted) { id = adopted.id; action = 'adopted'; }
  }

  if (!id) {
    const { rows } = await query(
      `INSERT INTO airfield_routes
         (airfield_id, name, color, route_path, notes, route_category, is_runway, end_a_name, end_b_name, source_runway_id)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9) RETURNING *`,
      [runway.airfield_id, f.name, f.color, JSON.stringify(f.route_path), f.notes, f.route_category,
       f.end_a_name, f.end_b_name, runway.id]);
    return { route: rows[0], action };
  }

  const setPath = f.route_path.length > 0;
  const params = [f.name, f.color, f.notes, f.route_category, f.end_a_name, f.end_b_name, runway.id, id];
  if (setPath) params.push(JSON.stringify(f.route_path));
  const { rows } = await query(
    `UPDATE airfield_routes
        SET name=$1, color=$2, notes=$3, route_category=$4, is_runway=TRUE,
            end_a_name=$5, end_b_name=$6, source_runway_id=$7${setPath ? ', route_path=$9' : ''}
      WHERE id=$8 RETURNING *`, params);
  return { route: rows[0], action };
}

/**
 * השלמה לכל המסלולים הקיימים (רצה בעליית השרת).
 * אידמפוטנטית: מסלול שכבר יש לו ראי רק מתרענן.
 */
export async function syncAllRunwayRoutes(query) {
  const { rows: runways } = await query('SELECT * FROM airfield_runways ORDER BY id');
  const counts = { created: 0, adopted: 0, updated: 0, skipped: 0 };
  for (const rw of runways) {
    const { action } = await syncRunwayRoute(query, rw);
    counts[action] = (counts[action] || 0) + 1;
  }
  return counts;
}
