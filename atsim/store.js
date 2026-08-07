// ATSIM - אחסון תרחישים.
//
// **קובץ מקומי בלבד. לא Neon, לא Postgres, לא ענן** (AIR_PICTURE_SPEC.md §9).
// זו לא פשרה אלא דרישה: מאגר התמונ"א אינו חלק מ-SKY-KING, ואילו הוא היה יושב
// על אותו DB מנוהל - נפילת מכסה אחת הייתה מפילה גם את העמדה וגם את התמונה.
// אפס תלות בענן היא גם מה שמאפשר לו לרוץ ברשת מבודדת.
//
// בניגוד למיראז' (שיש לו נתיב Postgres לפרודקשן), כאן יש מסלול אחד. הנתונים
// הם **הגדרות תרחיש** - לא מידע מבצעי ולא מידע אישי - ולכן קובץ מספיק.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_FILE = path.join(__dirname, 'data.json');
// הזרע הסינתטי - הקובץ **היחיד** מבין השניים שעוקב ב-git. data.json הוא מקומי
// לכל סביבה, בדיוק כמו mirage/data.json (ממצא SK-43).
const EXAMPLE_DATA_FILE = path.join(__dirname, 'data.example.json');

const EMPTY = { scenarios: [] };

export function createStore({ dataFile } = {}) {
  const file = dataFile || process.env.ATSIM_DATA_FILE || DEFAULT_DATA_FILE;

  const load = () => {
    for (const f of [file, EXAMPLE_DATA_FILE]) {
      try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (Array.isArray(data?.scenarios)) return data;
      } catch { /* אין קובץ / קובץ פגום - ננסה את הבא */ }
    }
    return { ...EMPTY };
  };

  // כתיבה אטומית: קובץ זמני ואז rename. כתיבה ישירה שנקטעת באמצע משאירה JSON
  // חתוך, וההפעלה הבאה נופלת לזרע - כלומר **כל התרחישים נמחקים בשקט**.
  const save = (data) => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  };

  const nextId = (prefix, taken) => {
    let n = 1;
    while (taken.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  };

  return {
    file,
    list() { return load().scenarios; },
    get(id) { return load().scenarios.find(s => s.id === id) || null; },

    create(scenario) {
      const data = load();
      const id = scenario.id && !data.scenarios.some(s => s.id === scenario.id)
        ? scenario.id
        : nextId('sc', new Set(data.scenarios.map(s => s.id)));
      const created = { ...scenario, id, startAt: scenario.startAt ?? null };
      data.scenarios.push(created);
      save(data);
      return created;
    },

    /** עדכון חלקי. `id` לעולם לא נדרס - הוא הזהות ולא שדה. */
    update(id, patch) {
      const data = load();
      const idx = data.scenarios.findIndex(s => s.id === id);
      if (idx < 0) return null;
      data.scenarios[idx] = { ...data.scenarios[idx], ...patch, id };
      save(data);
      return data.scenarios[idx];
    },

    remove(id) {
      const data = load();
      const before = data.scenarios.length;
      data.scenarios = data.scenarios.filter(s => s.id !== id);
      if (data.scenarios.length === before) return false;
      save(data);
      return true;
    },

    /**
     * שכפול. העותק נוצר **עצור** (`startAt: null`) גם אם המקור רץ: שכפול הוא
     * פעולת עריכה, ותרחיש שמתחיל לרוץ מעצמו ברגע השכפול היה מזריק מטוסים
     * לתמונה בלי שמישהו ביקש.
     */
    duplicate(id) {
      const data = load();
      const src = data.scenarios.find(s => s.id === id);
      if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = nextId('sc', new Set(data.scenarios.map(s => s.id)));
      copy.name = `${src.name || src.id} - עותק`;
      copy.startAt = null;
      data.scenarios.push(copy);
      save(data);
      return copy;
    },
  };
}
