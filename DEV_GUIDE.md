# SKY-KING — מדריך מפתח (Developer Guide)

> מסמך onboarding מלא: כל מה שצריך לדעת כדי לעבוד על הפרויקט.
> עודכן: 2026-06-22.

---

## תוכן עניינים

1. [מה זה SKY-KING ב-30 שניות](#מה-זה-sky-king-ב-30-שניות)
2. [Setup סביבת פיתוח](#setup-סביבת-פיתוח)
3. [איך המערכת עובדת — זרימה](#איך-המערכת-עובדת--זרימה)
4. [מילון מונחים (Glossary)](#מילון-מונחים-glossary)
5. [מוסכמות קוד (Conventions)](#מוסכמות-קוד-conventions)
6. [משימות נפוצות (How-To)](#משימות-נפוצות-how-to)
7. [DB — עבודה עם הסכמה](#db--עבודה-עם-הסכמה)
8. [QA — לפני commit](#qa--לפני-commit)
9. [FAQ ובעיות נפוצות](#faq-ובעיות-נפוצות)
10. [סקילים זמינים](#סקילים-זמינים)

---

## מה זה SKY-KING ב-30 שניות

מערכת שמחליפה לוח רישום פיזי ("סדק") של בקרי טיסה. בקר/פקח מנהל **פ"מים** (פלוגות
מטוסים) — כל פ"מ הוא כרטיס (Strip) עם או"ק, טייסת, גובה, משימה. מעבירים פ"מים בין
עמדות (Transfers), עוקבים על מפה, מנהלים גבהים (בלוקים), שדה קרקעי (מגרש), ועוד.
שתי עמדות עיקריות: **בקר (CTRL)** ו**מגדל/פקח (TWR)** — מסכים שונים, רכיבים משותפים.

---

## Setup סביבת פיתוח

### צעדים ראשונים (יום ראשון)
1. `npm install`
2. צור `.env` עם `DATABASE_URL` + `PORT=3001` (ראה [README.md](README.md))
3. `npm run dev` → פתח `http://localhost:5000`
4. השרת (3001) מריץ `initDb()` (יוצר סכמה) ו-`seedDb()` (נתוני אתחול) אוטומטית בעלייה

### ארכיטקטורת הרצה
```
Browser :5000 (Vite + HMR)
   │  /api/*  ו-/driver  → proxy
   ▼
Express :3001 (server.js)
   │
   ▼
PostgreSQL (Neon, via DATABASE_URL)
```

### פקודות
| פקודה | מה עושה |
|-------|---------|
| `npm run dev` | שרת + Vite במקביל (פיתוח) |
| `npm run server` | רק שרת API |
| `npm run build` | `tsc && vite build` → `dist/` |
| `npm test` | vitest — בדיקות יחידה ל-utils |
| `npx tsc --noEmit` | בדיקת טייפים בלבד (ה-QA gate המהיר) |
| `npm run electron:dev` | הרצה כ-desktop |

---

## איך המערכת עובדת — זרימה

### מחזור חיי פ"מ (Strip)
```
יצירה → POST /api/strips  (status='queued')
  → מופיע בעמדה לפי filter_query / workstation_preset_id
  → עריכה inline (גובה/הערות) → PUT /api/strips/:id → activity_log
  → העברה: POST /api/strips/:id/transfer → strip_transfers (pending)
     → קבלה: /api/transfers/:id/accept   (sector_id מתעדכן)
     → דחייה: /api/transfers/:id/reject  (חוזר לשולח)
```

### פיצול פ"מ (Partial Formation)
פ"מ "חנית" עם 3 מטוסים → חולצים מטוס 1 → נוצר פ"מ חדש עם `aircraft_indices=[1]`,
שניהם מקבלים אותו `parent_strip_id` (root). פרטים מלאים ב-[data-model.md](data-model.md).

### סנכרון בין עמדות
**כרגע: polling** (~5 שניות). WebSocket עדיין לא מומש — ראה סקיל `/realtime`.

---

## מילון מונחים (Glossary)

### מונחי דומיין (legacy → SKY-KING)
| מונח | פירוש |
|------|--------|
| **סדק** | לוח הרישום הפיזי — מה ש-SKY-KING מחליף |
| **צ'ינו** | עט הסימון על הסדק |
| **פלנלית** | מחיקה על הסדק |
| **פ"מ** | פלוגת מטוסים — היחידה המנוהלת (Strip) |
| **או"ק** | אות קריאה (callsign) — שם הפ"מ |
| **דת"ק** | מספר חניה של מטוס בודד |
| **כיפה** | מזהה ויזואלי של מטוס בודד |
| **שקדיה** | מערכת במטוס; 🌰 מוצג אם פעילה |
| **מז"א** | מצב מרחב אווירי (ראייה/התראה/מכשירים/סגור) |
| **יבה** | מערכת הגנה אווירית |
| **בלוק** | טווח גובה מוקצה למשימה |
| **מרחב** | קבוצת בלוקים (block space) |
| **נקודת העברה** | סקטור שאליו מעבירים פ"מ (sector) |
| **מגרש** | עמדת המגדל / תצוגת השדה הקרקעי (GroundView) |
| **בתק** | מצב טבלה (table mode) |
| **זמ"מ** | זמן מעל מטרה |
| **ע"ר / קא** | שדות זהות של הפ"מ |
| **BDH** | מערכת צ'ק-ליסטים מנוהלת ע"י ראש צוות |
| **סיריאל** | מספר סידורי משוייך לפ"מ לפי תחנת בקרה |
| **דסק משימה כללי** | סוג עמדה גנרי לרישום — שירותי אמצעים/טקסט חופשי/טבלה חכמה (MissionDeskView) |

### מונחים טכניים
| מונח | פירוש |
|------|--------|
| **CTRL** | עמדת בקר טיסה (SectorDashboard) |
| **TWR** | עמדת מגדל פיקוח (GroundView) |
| **preset** | תצורת עמדה (workstation_preset) |
| **Query DSL** | מנוע סינון פ"מים (AND/OR/NOT) — `utils/queryBuilder` |
| **SG** | Strip Grid — פריסת תאים בכרטיס סטריפ |
| **SW** | Strip Window — פריסת waypoints |
| **flight zones** | מצב שיוך פ"מ לאזור גובה על מפה |
| **MD** | Mission Desk — עץ פריסה ושירותים של דסק משימה כללי (`types/missionDesk`) |

---

## מוסכמות קוד (Conventions)

### חובה
1. **כל טקסט UI בעברית** (כולל placeholders, errors, tooltips)
2. **RTL + dark mode** — ברירת מחדל
3. **DRY** — לפני יצירת רכיב, לבדוק ב-[SERVICES.md](SERVICES.md) אם קיים
4. **Event Log** — כל שינוי סטטוס → `POST /api/activity-log`
5. **אישור לפני מחיקה** — `customConfirm()` (לא `window.confirm`)

### מבנה מודולים — כלל השכבות
```
Entry → Views → Feature Components → Shared Components → Utils → Types
```
שכבה מייבאת **רק** משכבות מתחתיה. אין תלויות מעגליות.

### קונבנציות קבצים
- רכיב React = `PascalCase.tsx`, מייצא default + named
- util = `camelCase.ts`, מייצא named בלבד
- type = ב-`src/types/`
- API route = `server/routes/<domain>.js`, מייצא `express.Router`

### Backend
- כל route מייבא `pool` מ-`server/db/pool.js`
- שמירת JSONB: `JSON.stringify` בכתיבה
- שגיאות: `res.status(500).json({ error })`

---

## משימות נפוצות (How-To)

### להוסיף API endpoint חדש
1. מצא את הקובץ הנכון ב-`server/routes/` (לפי דומיין)
2. הוסף `router.get/post(...)` — ייבא `pool` אם צריך
3. אם נדרשת טבלה/עמדה חדשה ב-DB → ראה [DB](#db--עבודה-עם-הסכמה)

### להוסיף רכיב frontend
1. בדוק ב-[SERVICES.md](SERVICES.md) שאין רכיב דומה (DRY)
2. צור תחת התיקייה המתאימה ב-`src/components/<area>/`
3. ייבא utils/types משכבות מתחת
4. הוסף לקטלוג ב-SERVICES.md

### לערוך view קיים
- CTRL → `src/components/views/SectorDashboard.tsx`
- TWR → `src/components/views/GroundView.tsx`
- admin → `src/components/admin/ManagementPage.tsx`

### לחפש איפה קוד נמצא
**תמיד להתחיל מ-[SERVICES.md](SERVICES.md)** — קטלוג מלא. אחרת `grep` בתיקייה הרלוונטית.

---

## i18n — דו-לשוניות (עברית/אנגלית)

עברית = **ברירת מחדל**; אנגלית נבחרת. בורר שפה במסך ה-LOGIN, נשמר ב-`localStorage['bt-lang']`.
תשתית: `react-i18next` תחת `src/i18n/` (init: `index.ts`, קבצי תרגום: `locales/he.json` + `locales/en.json`, hook כיווניות: `useDirection.ts`).

### שתי דרכים לתרגם — מתי כל אחת

**1. `tr('טקסט בעברית')` — ברירת המחדל לרוב הקוד.**
המחרוזת העברית **היא המפתח**. הקוד נשאר קריא בעברית לצוות.
```tsx
import { tr } from '../../i18n/tr';
<button>{tr('בטל העברה')}</button>   // he: 'בטל העברה' | en: 'Cancel transfer'
```
- להוספת תרגום: שורה ב-[src/i18n/locales/ui.en.json](src/i18n/locales/ui.en.json) — `"בטל העברה": "Cancel transfer"`.
- **בלי תרגום המחרוזת פשוט נשארת בעברית** — לעולם לא מוצג מפתח גולמי.
- `tr` היא **פונקציה ברמת המודול, לא hook** — בכוונה: יש עשרות רכיבים מקוננים ופונקציות עזר שמרנדרות JSX, ו-hook לא יכול להיות ב-scope בכולם. הריאקטיביות מגיעה מ-`useDirection()` ב-App שמרנדר מחדש את העץ בשינוי שפה.

**2. `t('ns.key')` — למחרוזות עם interpolation או מבנה.**
```tsx
const { t } = useTranslation();
t('login.searchCrew', { total: n })   // "חפש מתוך 5 אנשי צוות..."
```
⚠️ **אל תשתמש במשתנה בשם `count`** — i18next מפרש אותו כטריגר לרבים (plural) ושובר את ה-interpolation. השתמש ב-`total`/`n`.

### 🚨 מה **אסור** לעטוף
**רק טקסט תצוגה.** אין לעטוף **ערכי-נתונים** שמושווים או נשמרים ב-DB:
```tsx
if (s.status === 'עוזב אזור')   // ❌ אסור לעטוף — ישבור את הלוגיקה!
```
סטטוסים כמו `'תקין'`, `'שמיש'`, `'תקול'`, `'באזור'`, `'בדרך לאזור'`, `'עוזב אזור'` הם **ערכי enum**, לא טקסט. ה-codemod מדלג עליהם בכוונה.

### 🛡 שומר ה-i18n (רץ ב-`npm test`)
[src/i18n/i18n-guard.test.ts](src/i18n/i18n-guard.test.ts) **מכשיל את הבדיקות** אם:
1. יש טקסט עברי ב-JSX (`>טקסט<`)
2. יש טקסט עברי ב-`title`/`placeholder`/`aria-label`/`alt`
3. יש `tr('group.key')` שאין לו מפתח ב-registry (מפתח יתום)
4. יש מפתח ב-registry בלי טקסט עברי

**זה מה שמונע מהטבלה להתיישן.** כל שדה/פעולה חדשים חייבים להירשם ב-registry.
חריגים מוצדקים ב-`ALLOWLIST` שבקובץ — כל תוספת דורשת נימוק.

### כלי אוטומציה
```bash
node scripts/i18n-codemod.mjs <file>          # dry-run: מה ייעטף
node scripts/i18n-codemod.mjs <file> --write  # עוטף JSX text + title/placeholder בלבד
node scripts/i18n-build-registry.mjs          # בונה מחדש את קבצי ה-registry
```

### כיווניות (RTL/LTR) — קריטי
- ה-`dir` מנוהל **רק** ב-root (`useDirection` מעדכן `<html dir>`). **אל** תוסיף `direction: 'rtl'` inline — זה ישבור LTR באנגלית. אם צריך כיוון מקומי: `dir={i18n.dir()}`.
- **חובה CSS logical properties:** `marginInlineStart/End`, `paddingInlineStart/End`, `insetInlineStart/End`, `textAlign: 'start'/'end'` — **לא** `marginLeft/Right`, `left/right`, `textAlign:'left'`. כך הפריסה מתהפכת אוטומטית.

### אימות (חובה — bדיקות סטטיות לא מספיקות)
```bash
npm run test:e2e     # Playwright: מוודא dir=rtl/ltr, שהטקסט מתורגם, ושאין גלישה
```
`tsc`/`build`/unit **לא יכולים** לתפוס "המסך לא התהפך". ה-e2e כן.
טיפ: אחרי המרת פריסה ל-logical properties — **הצילום בעברית חייב לצאת זהה פיקסלית**
(ב-RTL, `marginInlineStart` ≡ `marginRight`). כל סטייה = שגיאת מיפוי.

### מצב נוכחי
- **עטופות:** 1,382 מחרוזות ב-16 רכיבים (LOGIN, SectorDashboard, ManagementPage, GroundView, ...).
- **מתורגמות לאנגלית:** 398. היתר מוצגות בעברית עד שיתורגמו (הוסף ל-`ui.en.json`).
- **פריסה:** SectorDashboard הומר במלואו ל-logical properties ומתהפך ל-LTR.
- **עתידי:** שכבת שמות ה-DB (`*_en` לסקטורים/עמדות) — טרם.

---

## DB — עבודה עם הסכמה

- **סכמה** מוגדרת ב-`server/db/init.js` (`CREATE TABLE` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
- **נתוני אתחול** ב-`server/db/seed.js` (`ON CONFLICT DO NOTHING`)
- **טבלה/עמודה חדשה:** הוסף `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ל-`init.js`, ועדכן [data-model.md](data-model.md)
- **לעולם לא** לשנות `CREATE TABLE` קיים — רק להוסיף `ALTER`
- **אין** `DROP COLUMN` / `DELETE` ללא אישור
- ~50 טבלאות. ליבה: `strips`, `strip_aircraft`, `strip_transfers`, `sectors`, `workstation_presets`, `crew_members`, `activity_log`

---

## QA — לפני commit

הרץ תמיד:
```bash
npx tsc --noEmit     # חייב לעבור נקי
npm test             # בדיקות יחידה (vitest) — חייב לעבור נקי
npx vite build       # bundle נבנה (זמן ~10-20ש')
```
> **בדיקות:** קבצי `*.test.ts` ליד הקוד ב-`src/utils/`. כיסוי נוכחי: strips, queryBuilder, geo, notes, aircraft, stripGrid, stripWindow (68 בדיקות). הוסף בדיקות לכל util/לוגיקה טהורה חדשה.
> **טיפ:** ה-bundle המיוצב הוא ~2,699 kB. שינוי משמעותי בגודל = בדוק שלא הוספת import כבד מיותר.

Checklist:
- [ ] tsc + build עוברים
- [ ] כל UI בעברית
- [ ] רכיב חדש לא משכפל קיים
- [ ] Event Log לשינוי סטטוס
- [ ] עודכן SERVICES.md אם נוסף מודול

---

## FAQ ובעיות נפוצות

**ש: השרת לא עולה / "DATABASE_URL not set"**
ת: ודא `.env` קיים עם `DATABASE_URL` תקין.

**ש: `/api` מחזיר 404 בפיתוח**
ת: השרת (3001) לא רץ. `npm run dev` מריץ את שניהם; אם רצת רק `vite`, הוסף `npm run server`.

**ש: שינוי בקוד לא מופיע**
ת: Vite HMR אמור לעדכן אוטומטית. שינוי ב-`server/` דורש restart של השרת.

**ש: tsc נכשל אחרי שהזזתי קוד**
ת: כנראה חסר import של type/helper משותף. tsc יציין את השם — ייבא מהמודול הנכון (ראה SERVICES.md).

**ש: איפה הקוד של X?**
ת: [SERVICES.md](SERVICES.md) — קטלוג מלא לפי תפקיד.

---

## סקילים זמינים

הפרויקט מוגדר עם סקילים של Claude Code (`.claude/skills/`):

| סקיל | מתי |
|------|-----|
| `/pm` | לפני feature — סטוריית משתמש + acceptance criteria |
| `/arch` | תכנון טכני |
| `/before` | gate לפני קוד |
| `/qa` | בדיקה לפני done |
| `/migrate` | שינוי DB |
| `/transfer-logic` | עבודה על מנגנון העברות |
| `/ctrl-view` / `/ground-view` | context לעמדת בקר / מגדל |
| `/realtime` | מעבר ל-WebSocket |
| `/status` | דו"ח מצב |
| `/seed` | נתוני אתחול |

פירוט מלא ב-[CLAUDE.md](CLAUDE.md).
