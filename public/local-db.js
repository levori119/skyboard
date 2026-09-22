// הצצה אל המאגר המקומי שבעמדה.
//
// **למה דף עצמאי ולא חלון באפליקציה:** השאלה "מה יש במאגר המקומי" נשאלת
// בדיוק כשמשהו לא עובד - כשהמראה נפלה, כשהנתק הראה מסך ריק, כשהעמדה לא
// מתחברת. דף שתלוי באפליקציה היה מת יחד איתה.
//
// **איפה הוא שואל:** קודם המקור של הדף עצמו (עמדת Electron, או פתיחה ישירה
// של הסוכן), ואם אין שם מאגר - הסוכן שעל המחשב. כך אותו דף עובד בשני המצבים
// בלי שהמפעיל יצטרך לדעת באיזה מהם הוא נמצא.
//
// ⚠️ **האסימון נקרא מ-sessionStorage של המקור הנוכחי.** לכן כשפותחים את הדף
// מהכתובת של SKY-KING הוא מחזיק את אותה זהות כמו האפליקציה. פתיחה ישירה של
// הסוכן בטאב חדש לא תעבוד ב-WEB - שם אין אסימון לאותו מקור.

const DEFAULT_AGENT = 'http://127.0.0.1:5100';

/**
 * ⚠️ **`/api/__local/` ולא `/api/`.** שרת העמדה מנתב כל בקשת `/api` לפי מצב
 * הקשר, ולכן בקשה רגילה הייתה הולכת דווקא **למרכז** - ומחזירה 404, כי שם
 * הנתיב חסום ב-`localOnly`. התחילית המפורשת כופה את המאגר המקומי, וזו אותה
 * תחילית שבה משתמש מנוע הסנכרון (ראה electron/stationServer.cjs §ניתוב מפורש).
 */
const API = '/api/__local/__localdb';

const el = (id) => document.getElementById(id);
const listEl = el('list');
const detailEl = el('detail');

let base = null;            // המקור שממנו נקרא המאגר
let summary = null;
let selected = null;
let onlyWithData = false;

const agentOrigin = () => {
  try {
    const v = localStorage.getItem('skyking.stationAgent');
    if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  } catch { /* מצב פרטי */ }
  return DEFAULT_AGENT;
};

/** הכותרות שהשרת מצפה להן - אותה זהות ואותה סביבה כמו באפליקציה. */
function headers() {
  const h = { 'Cache-Control': 'no-store' };
  try {
    const token = sessionStorage.getItem('bt-auth-token');
    if (token) h.Authorization = `Bearer ${token}`;
    const env = sessionStorage.getItem('bt-env');
    if (env) h['X-Env'] = env;
  } catch { /* מצב פרטי */ }
  return h;
}

async function ask(origin, path) {
  const res = await fetch(`${origin}${path}`, {
    headers: headers(), cache: 'no-store',
    // כרום דורש הצהרה כשדף ציבורי פונה ל-127.0.0.1 (ראה src/offline/stationAgent.ts)
    targetAddressSpace: 'loopback',
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

/**
 * מאתרת מאיפה לקרוא: המקור של הדף, ואם אין - הסוכן.
 *
 * 404 פירושו "זה לא מאגר מקומי" (הנתיב חסום ב-localOnly), ולכן ממשיכים
 * לסוכן. 401 פירושו שהמאגר שם אבל אין זהות - וזו הודעה אחרת לגמרי.
 */
async function locate() {
  const here = location.origin;
  const candidates = here === agentOrigin() ? [here] : [here, agentOrigin()];
  let unauthorized = false;
  for (const origin of candidates) {
    try {
      const data = await ask(origin, `${API}/summary`);
      return { origin, data };
    } catch (err) {
      if (err.status === 401 || err.status === 403) unauthorized = true;
    }
  }
  const e = new Error('not found');
  e.unauthorized = unauthorized;
  throw e;
}

const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('he-IL'));

function renderList() {
  const q = el('filter').value.trim().toLowerCase();
  const rows = summary.tables
    .filter(t => !onlyWithData || (t.rows || 0) > 0)
    .filter(t => !q || t.table.toLowerCase().includes(q))
    // הכבדות למעלה: זו התשובה לשאלה "האם בכלל יש כאן משהו"
    .sort((a, b) => (b.rows || 0) - (a.rows || 0) || a.table.localeCompare(b.table));

  listEl.textContent = '';
  for (const t of rows) {
    const div = document.createElement('div');
    div.className = 'row' + (t.table === selected ? ' sel' : '');
    const name = document.createElement('span');
    name.textContent = t.table;
    const n = document.createElement('span');
    n.className = 'n ' + ((t.rows || 0) > 0 ? 'has' : 'zero');
    n.textContent = fmt(t.rows);
    div.append(name, n);
    div.addEventListener('click', () => { selected = t.table; renderList(); void openTable(t.table); });
    listEl.append(div);
  }
  if (!rows.length) {
    const m = document.createElement('div');
    m.className = 'msg';
    m.textContent = 'אין טבלאות שתואמות לסינון.';
    listEl.append(m);
  }
}

function renderHeader() {
  el('source').innerHTML = '';
  el('source').append(document.createTextNode('מקור: '));
  const b = document.createElement('b');
  b.textContent = base.replace(/^https?:\/\//, '');
  el('source').append(b);

  const withData = summary.tables.filter(t => (t.rows || 0) > 0).length;
  el('totals').innerHTML = '';
  el('totals').append(document.createTextNode(
    `${summary.tableCount} טבלאות · ${withData} עם נתונים · `));
  const s = document.createElement('b');
  s.textContent = `${fmt(summary.totalRows)} שורות`;
  el('totals').append(s);
  if (summary.dataDir) {
    el('totals').append(document.createTextNode(' · '));
    const d = document.createElement('span');
    d.textContent = summary.dataDir;
    el('totals').append(d);
  }
}

async function openTable(table) {
  detailEl.textContent = '';
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = 'טוען...';
  detailEl.append(msg);
  try {
    const d = await ask(base, `${API}/rows?table=${encodeURIComponent(table)}&limit=200`);
    detailEl.textContent = '';

    const head = document.createElement('div');
    head.className = 'msg';
    head.style.padding = '0 0 10px';
    head.innerHTML = '';
    const title = document.createElement('b');
    title.textContent = d.table;
    head.append(title, document.createTextNode(
      ` — ${fmt(d.total)} שורות${d.total > d.rows.length ? ` (מוצגות ${d.rows.length} הראשונות)` : ''}`));
    detailEl.append(head);

    if (!d.rows.length) {
      const empty = document.createElement('div');
      empty.className = 'msg warn';
      empty.textContent = 'הטבלה ריקה במאגר המקומי.';
      detailEl.append(empty);
      return;
    }

    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    for (const c of d.columns) {
      const th = document.createElement('th');
      th.textContent = c.name;
      th.title = c.type;
      htr.append(th);
    }
    thead.append(htr);
    const tbody = document.createElement('tbody');
    for (const row of d.rows) {
      const tr = document.createElement('tr');
      for (const c of d.columns) {
        const td = document.createElement('td');
        const v = row[c.name];
        if (v === null || v === undefined) { td.className = 'null'; td.textContent = 'NULL'; }
        else {
          const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
          td.textContent = text;
          td.title = text;
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    tbl.append(thead, tbody);
    detailEl.append(tbl);
  } catch (err) {
    detailEl.textContent = '';
    const m = document.createElement('div');
    m.className = 'msg bad';
    m.textContent = `קריאת הטבלה נכשלה: ${err.message}`;
    detailEl.append(m);
  }
}

function showMissing(unauthorized) {
  listEl.textContent = '';
  detailEl.textContent = '';
  const m = document.createElement('div');
  m.className = 'msg';
  if (unauthorized) {
    m.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = 'המאגר המקומי נמצא, אבל אין זהות.';
    m.append(b, document.createElement('br'),
      document.createTextNode('להיכנס ל-SKY-KING באותו דפדפן, ואז לפתוח את הדף הזה שוב מאותה כתובת.'));
  } else {
    const b = document.createElement('b');
    b.textContent = 'לא נמצא מאגר מקומי.';
    m.append(b, document.createElement('br'),
      document.createTextNode('הדף חיפש במקור של העמוד וגם בסוכן העמדה ('),
      Object.assign(document.createElement('code'), { textContent: agentOrigin() }),
      document.createTextNode(').'), document.createElement('br'),
      document.createTextNode('אם הסוכן אינו רץ, להפעיל אותו על מחשב העמדה ולרענן.'));
  }
  detailEl.append(m);
  el('source').textContent = 'אין מאגר';
  el('totals').textContent = '';
}

async function load() {
  el('source').textContent = 'מאתר...';
  try {
    const found = await locate();
    base = found.origin;
    summary = found.data;
    renderHeader();
    renderList();
    if (selected) await openTable(selected);
  } catch (err) {
    showMissing(!!err.unauthorized);
  }
}

el('refresh').addEventListener('click', () => { void load(); });
el('filter').addEventListener('input', () => { if (summary) renderList(); });
el('onlyData').addEventListener('click', () => {
  onlyWithData = !onlyWithData;
  el('onlyData').textContent = onlyWithData ? 'כל הטבלאות' : 'רק טבלאות עם נתונים';
  if (summary) renderList();
});

void load();
