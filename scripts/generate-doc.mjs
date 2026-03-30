import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, TableOfContents, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, convertInchesToTwip,
  PageOrientation, Header, Footer, PageNumber, NumberFormat,
  LevelFormat, UnderlineType
} from 'docx';
import { writeFileSync } from 'fs';

const RTL = true;

const h1 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 400, after: 200 },
  shading: { type: ShadingType.SOLID, color: '1e3a5f', fill: '1e3a5f' },
  run: { color: 'FFFFFF', bold: true, size: 32 },
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 320, after: 160 },
  children: [new TextRun({ text, bold: true, size: 26, color: '1d4ed8' })],
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, bold: true, size: 22, color: '0f172a' })],
});

const p = (text, opts = {}) => new Paragraph({
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 60, after: 60 },
  children: [new TextRun({ text, size: 20, ...opts })],
});

const bullet = (text, level = 0) => new Paragraph({
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 60, after: 60 },
  indent: { right: 360 * (level + 1) },
  children: [
    new TextRun({ text: level === 0 ? '◀ ' : '• ', bold: true, size: 20, color: '1d4ed8' }),
    new TextRun({ text, size: 20 }),
  ],
});

const boldLine = (label, value) => new Paragraph({
  bidirectional: RTL,
  alignment: AlignmentType.RIGHT,
  spacing: { before: 60, after: 60 },
  children: [
    new TextRun({ text: label + ': ', bold: true, size: 20 }),
    new TextRun({ text: value, size: 20 }),
  ],
});

const divider = () => new Paragraph({
  border: { bottom: { color: '93c5fd', size: 6, value: BorderStyle.SINGLE } },
  spacing: { before: 200, after: 200 },
  children: [],
});

const pageBreak = () => new Paragraph({ pageBreakBefore: true, children: [] });

const tableRow2 = (col1, col2, isHeader = false) => new TableRow({
  tableHeader: isHeader,
  children: [
    new TableCell({
      width: { size: 30, type: WidthType.PERCENTAGE },
      shading: isHeader ? { type: ShadingType.SOLID, color: '1e3a5f', fill: '1e3a5f' } : {},
      children: [new Paragraph({
        bidirectional: RTL, alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: col1, bold: isHeader, size: 18, color: isHeader ? 'FFFFFF' : '0f172a' })],
      })],
    }),
    new TableCell({
      width: { size: 70, type: WidthType.PERCENTAGE },
      shading: isHeader ? { type: ShadingType.SOLID, color: '1e3a5f', fill: '1e3a5f' } : {},
      children: [new Paragraph({
        bidirectional: RTL, alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: col2, bold: isHeader, size: 18, color: isHeader ? 'FFFFFF' : '334155' })],
      })],
    }),
  ],
});

const makeTable = (rows) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: rows.map(([c1, c2], i) => tableRow2(c1, c2, i === 0)),
});

// ─── Document Content ───────────────────────────────────────────────
const sections = [

  // Cover
  new Paragraph({ children: [], spacing: { before: 1200 } }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'SKYBOARD', bold: true, size: 72, color: '1d4ed8' })],
  }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'לוח שמיים', bold: true, size: 56, color: '1e3a5f' })],
  }),
  new Paragraph({ children: [], spacing: { before: 200 } }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'מסמך אפיון מערכת — Aviation Strip Management System', size: 26, color: '64748b' })],
  }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'גרסה 1.0  |  מרץ 2026', size: 22, color: '94a3b8' })],
  }),
  new Paragraph({ children: [], spacing: { before: 1600 } }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'סווג: שימוש פנימי בלבד', bold: true, size: 22, color: 'dc2626' })],
  }),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 1. OVERVIEW
  // ═══════════════════════════════════════════════════════
  h1('1. סקירה כללית'),
  p('SKYBOARD (לוח שמיים) הוא מערכת ניהול פסי תעופה (Flight Strips) דיגיטלית, שפותחה עבור מרכז שליטה ובקרה של חיל האוויר הישראלי (יב"א). המערכת מחליפה את לוחות הפסים הפיזיים המסורתיים ומספקת ממשק מגע אינטואיטיבי לניהול תעבורה אווירית מבצעית בזמן אמת.'),
  p(''),
  boldLine('שם המערכת', 'SKYBOARD / לוח שמיים'),
  boldLine('לקוח', 'חיל האוויר הישראלי — מרכז שליטה תעופתי (יב"א)'),
  boldLine('שפת ממשק', 'עברית (RTL) — מלא'),
  boldLine('פלטפורמת יעד', 'טאבלט + מסך מגע (Desktop תומך)'),
  boldLine('ארכיטקטורה', 'Web App — React TypeScript + Node.js + PostgreSQL'),
  boldLine('גרסה', '1.0 — מרץ 2026'),

  divider(),
  h2('1.1 מטרות עסקיות'),
  bullet('מעבר מלוח פסים פיזי לממשק דיגיטלי מלא עם כל יכולות הניהול המבצעיות'),
  bullet('שיפור מהירות ודיוק מעברי הפסים בין עמדות שליטה'),
  bullet('ניהול גבהים ומרחב אוויר חכם — זיהוי קונפליקטים אוטומטי'),
  bullet('מתן כלים לראש צוות ומנהל לניהול וניטור בזמן אמת'),
  bullet('תמיכה מלאה בספרורים (Serials) וניהול סטטוס לכל עמדה'),
  bullet('ממשק פשוט, מהיר ויעיל לאנשי צוות בזמן לחץ מבצעי'),

  divider(),
  h2('1.2 הגדרות ומושגים מרכזיים'),
  makeTable([
    ['מושג', 'הגדרה'],
    ['פס תעופה (Strip)', 'רשומה דיגיטלית המייצגת מטוס/גיחה בודדת עם כל נתוניה: זהות, גובה, נ"צ, שעה, מצב הפסת'],
    ['עמדה (Workstation)', 'עמדת שליטה בודדת המוגדרת בפרסט הכולל סקטורים, גבהים, ומסנני ספרורים'],
    ['סקטור (Sector)', 'אזור גיאוגרפי מוגדר בפוליגון על מפה, מקושר לעמדות'],
    ['העברה (Transfer)', 'מעבר פס בין שתי עמדות — מגדיר נקודת מפגש ומכיל נתוני גובה'],
    ['ספרור (Serial)', 'מזהה ייחודי ממוספר לאירוע בקרה — כל עמדה מסמנת את הספרור שהיא מכירה'],
    ['בלוק חכם (Smart Block)', 'טווח גובה מוגדר עם תווית משימה וצבע, מאורגן בטבלאות ומרחבים'],
    ['פ"מ (Control Point)', 'נקודת בקרה — עמדת שליטה שמנהלת סקטור ספציפי'],
    ['ראש צוות', 'תפקיד ביניים עם הרשאות ניהול מוגבלות'],
    ['מנהל', 'תפקיד עם הרשאות מלאות לכל הגדרות המערכת'],
  ]),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 2. REQUIREMENTS
  // ═══════════════════════════════════════════════════════
  h1('2. דרישות המערכת'),

  h2('2.1 דרישות פונקציונליות'),

  h3('2.1.1 ניהול פסי תעופה'),
  bullet('יצירה, עריכה ומחיקה של פסי תעופה'),
  bullet('גרירה ושחרור (Drag & Drop) של פסים בין סקטורים ועמדות'),
  bullet('עמודות פס: זהות מטוס, גובה (Alt), מהירות, נ"צ, שעת המראה, קוטרת, מבצע, ערקה, מסדר, מספר מסדר'),
  bullet('תצוגת כרטיס (Card) ותצוגת טבלה (Table) — מעבר דינמי'),
  bullet('מיון וסינון בתצוגת הטבלה לפי כל שדה'),
  bullet('קיבוץ פסים לפי סקטור בתצוגת טבלה'),
  bullet('ממשק OCR לקריאת ספרות ידניות (Tesseract.js) — אישית לכל אנשי צוות'),
  bullet('זיהוי צבע וסטטוס פסים (רגיל / מועבר / ממתין)'),

  h3('2.1.2 העברות בין עמדות (Transfers)'),
  bullet('יצירת העברת פס מעמדה אחת לאחרת עם נתוני גובה ונ"צ'),
  bullet('תצוגת חץ/אינדיקטור מובהק לפס בהעברה'),
  bullet('קליטת פס מועבר בעמדת היעד'),
  bullet('זיהוי קונפליקטים גובה בנקודת ההעברה — השוואת גובה כניסה/יציאה'),
  bullet('סף קונפליקט גובה מוגדר לכל סקטור (ברירת מחדל: 500 רגל)'),
  bullet('הדגשה חזותית אדומה + תג אזהרה על פסים עם קונפליקט גובה'),

  h3('2.1.3 ניהול עמדות (Workstations)'),
  bullet('פרסטים לעמדות: שם, מפה, סקטורים רלוונטיים, מצב טבלה, ספי עומס'),
  bullet('עמדות מרובות — כל עמדה טוענת את ההגדרות שלה מ-Session Storage'),
  bullet('מעבר מהיר בין הגדרות עמדה (פרסט)'),
  bullet('הגדרת עמדות בקרה רלוונטיות לכל פרסט לצורך סינון ספרורים'),
  bullet('הגדרת טבלאות בלוק חכם לכל פרסט'),
  bullet('תצוגת עומס עמדה (Load Mode) עם סף עומס חלקי ומלא'),

  h3('2.1.4 ספרורים (Serials)'),
  bullet('יבוא ספרורים עם שדות: תחנת בקרה, מספר ספרור, שעה'),
  bullet('שיוך ספרור לפס לפי תחנת בקרה'),
  bullet('תצוגה בתצוגת טבלה ובפאנל ייעודי'),
  bullet('פעולות: "הועבר לפ"מ" (אישור), "לא רלוונטי" (דחייה)'),
  bullet('גילוי ספרורים מיושנים — הדגשה אוטומטית'),
  bullet('פופ-אפ ספרורים עם טעינת מצב קיים בפתיחה חוזרת'),
  bullet('ביטול סימון "לא רלוונטי" ואיפוס בחירה'),
  bullet('פילטור ספרורים לפי תחנות בקרה רלוונטיות לפרסט'),
  bullet('תגיות צבע אחיד (כחול) לכל מצבי הספרור בתצוגה מכווצת'),

  h3('2.1.5 ניהול אנשי צוות'),
  bullet('שלושה תפקידים: רגיל / ראש צוות / מנהל'),
  bullet('פרופיל אישי לכל איש צוות — OCR מותאם אישית'),
  bullet('כניסה מהירה (Hot-swap) — החלפת איש צוות ללא הפסקת עבודה'),
  bullet('ניהול הרשאות: מנהל גישה לכל ההגדרות, ראש צוות לחלק מהן'),

  h3('2.1.6 הערות דביקות (Sticky Notes)'),
  bullet('יצירת פתקים צפים, גרירים, צבעוניים על הלוח'),
  bullet('הפצת פתקים לעמדות בקבוצת עבודה'),
  bullet('קבוצות עבודה — הגדרת עמדות לשיתוף פתקים'),
  bullet('מחיקה ועריכה מהירה'),

  h3('2.1.7 עזרים (Aids)'),
  bullet('פריטי עזר — טקסט/תמונה — מוצגים בפאנל עזרים'),
  bullet('קבוצות עזרים מקושרות לפרסטים'),
  bullet('שכפול קבוצות עזרים לעמדות'),
  bullet('קישור (Link) — עמדות מרובות מצביעות על אותה קבוצה'),

  h3('2.1.8 בלוקים חכמים (Smart Blocks)'),
  bullet('מרחבי בלוק (Block Spaces) — קיבוץ טבלאות בלוק'),
  bullet('טבלאות בלוק — קטגוריה, שם, הערה, תאריך עדכון'),
  bullet('בלוקים — טווח גובה (alt_from/alt_to), תווית משימה, צבע, עמדות, הערה'),
  bullet('שיוך פס למרחב בלוק — עמודה בטבלה + עריכה ב-dropdown'),
  bullet('זיהוי סטייה — פס שגובהו מחוץ לטווח הבלוק מהבהב כתום'),
  bullet('אישור סטייה בלחיצה ימנית — הבהוב עובר לצביעה סטטית'),
  bullet('בחירת צבע חכמה — בלוק חדש מקבל צבע שונה מכל הבלוקים הקיימים'),
  bullet('שכפול טבלת בלוק — מעתיק את כל הבלוקים כולל הערות, עם פוקוס אוטומטי'),
  bullet('ויזואליזציה גרפית בתצוגת הפצה לפי עמדה'),

  h3('2.1.9 מפה וויזואליזציה'),
  bullet('מפה עם שכבות פוליגון לסקטורים'),
  bullet('אזור קרב (Battle Zone) — שכבת פוליגון נפרדת'),
  bullet('בחירת מפה לפי פרסט עמדה'),

  h3('2.1.10 סינון וחיפוש'),
  bullet('Query Builder — בניית שאילתות עץ חזותי'),
  bullet('סינון ברמת מנהל (גלובלי) וברמה אישית'),
  bullet('סינון לפי כל שדה של הפס'),

  divider(),
  h2('2.2 דרישות לא-פונקציונליות'),

  h3('2.2.1 ביצועים'),
  bullet('טעינה ראשונה: מתחת ל-3 שניות'),
  bullet('עדכון נתונים: polling כל 3 שניות — עדכון שקוף למשתמש'),
  bullet('Optimistic Updates — עדכונים אופטימיסטיים ללא שיהוי חזותי'),
  bullet('תמיכה בעשרות פסים במקביל ללא ירידה בביצועים'),

  h3('2.2.2 זמינות'),
  bullet('מערכת Web — מושק ברשת פנימית / ענן'),
  bullet('עובד בכל דפדפן מודרני (Chrome, Firefox, Edge)'),
  bullet('תמיכה בטאבלט (Android/iOS) ודפדפן מגע'),

  h3('2.2.3 אבטחה'),
  bullet('ניהול הרשאות לפי תפקיד (RBAC) — 3 רמות'),
  bullet('Session Storage בצד לקוח — ללא שמירת סיסמאות'),
  bullet('הגנה על פעולות מנהל/ראש צוות בפרונטאנד'),

  h3('2.2.4 נוחות שימוש'),
  bullet('ממשק מלא בעברית RTL — כולל כיווניות טקסט נכונה'),
  bullet('מצב בהיר (Light) ומצב כהה (Dark) — מעבר דינמי'),
  bullet('תמיכה מלאה במגע — drag, tap, long-press'),
  bullet('אנימציות Framer Motion — חלקות ומקצועיות'),
  bullet('פידבק חזותי לכל פעולה (הדגשות, תגיות, אנימציות)'),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 3. ARCHITECTURE
  // ═══════════════════════════════════════════════════════
  h1('3. ארכיטקטורה'),

  h2('3.1 ארכיטקטורה כללית'),
  p('המערכת בנויה כאפליקציית Web מונוליתית עם הפרדה ברורה בין:'),
  bullet('פרונטאנד (React SPA) — כל לוגיקת התצוגה וה-UX'),
  bullet('בקאנד (Node.js/Express REST API) — לוגיקת עסקים ותקשורת DB'),
  bullet('מסד נתונים (PostgreSQL) — כל המידע הפרסיסטנטי'),

  divider(),
  h2('3.2 סטאק טכנולוגי'),
  makeTable([
    ['שכבה', 'טכנולוגיה ותפקיד'],
    ['פרונטאנד', 'React 18 + TypeScript — SPA, hooks, context'],
    ['Build Tool', 'Vite — HMR מהיר, bundling לפרודקשן'],
    ['עיצוב', 'Tailwind CSS + CSS מותאם אישית, Light/Dark mode'],
    ['אנימציות', 'Framer Motion — Drag & Drop, transitions'],
    ['אייקונים', 'Lucide React'],
    ['OCR', 'Tesseract.js — זיהוי ספרות בדפדפן'],
    ['בקאנד', 'Node.js + Express 5 — REST API על פורט 3001'],
    ['DB Client', 'pg (node-postgres) — חיבור ישיר ל-PostgreSQL'],
    ['Database', 'PostgreSQL 16 — מסד נתונים ראשי'],
    ['CORS', 'cors middleware — תמיכה בפיתוח מרובה פורטים'],
  ]),

  divider(),
  h2('3.3 מבנה קבצים'),
  makeTable([
    ['קובץ/תיקייה', 'תפקיד'],
    ['src/App.tsx', 'רכיב ראשי — כל ה-state, ה-logic וה-JSX (12,000+ שורות)'],
    ['src/App.css', 'עיצוב גלובלי, אנימציות CSS, RTL overrides'],
    ['server.js', 'Express REST API — כל נקודות הקצה ואתחול DB'],
    ['vite.config.js', 'הגדרות Vite — proxy ל-API, dev server'],
    ['package.json', 'תלויות ו-scripts: dev, build'],
    ['.replit', 'הגדרות Replit — workflows, deployment, modules'],
    ['scripts/post-merge.sh', 'סקריפט post-merge — npm install'],
  ]),

  divider(),
  h2('3.4 מודל נתונים — טבלאות DB'),
  makeTable([
    ['טבלה', 'תפקיד ושדות מרכזיים'],
    ['workstations', 'עמדות שליטה: name, sector_ids, map_id, load_thresholds, block_table_ids'],
    ['sectors', 'סקטורים: name, polygon_coords, conflict_alt_delta'],
    ['strips', 'פסי תעופה: identity, altitude, speed, coords, formation, erka, koteret, mivtza, block_space_id, block_deviation'],
    ['transfers', 'העברות: strip_id, from_station, to_station, alt, coords, status'],
    ['crew_members', 'אנשי צוות: name, is_admin, is_team_lead'],
    ['learned_digits', 'OCR מותאם אישית: crew_member_id, digit_data'],
    ['serials', 'ספרורים: control_station, serial_number, time'],
    ['strip_serial_selections', 'שיוך פס-ספרור: strip_id, control_station, serial_id, dismissed (UNIQUE per pair)'],
    ['sticky_notes', 'פתקים: content, color, x, y, workstation_id, work_group_id'],
    ['aid_groups', 'קבוצות עזרים: name, workstation_id'],
    ['aid_items', 'פריטי עזר: aid_group_id, type(image/text), content, order'],
    ['block_spaces', 'מרחבי בלוק: name, description'],
    ['block_tables', 'טבלאות בלוק: name, block_space_id, note, category, updated_at'],
    ['blocks', 'בלוקים: block_table_id, alt_from, alt_to, mission, color, workstations, platforms, note, sort_order, updated_at'],
  ]),

  divider(),
  h2('3.5 תקשורת Client-Server'),
  bullet('REST API על /api — כל endpoint מחזיר JSON'),
  bullet('Polling כל 3 שניות — loadData() מרכזי שמושך את כל הנתונים'),
  bullet('Optimistic Updates — State מתעדכן מיד, ה-API רץ ברקע'),
  bullet('pendingStripUpdatesRef — מגן מפני override של עדכונים אופטימיסטיים'),
  bullet('UPSERT לפי conflict — strip_serial_selections מוגן מ-duplicates'),

  divider(),
  h2('3.6 Session Management'),
  bullet('sessionStorage בצד לקוח — שמירת מזהה עמדה ואיש צוות'),
  bullet('כל עמדה טוענת את ה-state שלה עצמאית'),
  bullet('אין אותנטיקציה שרת-צד — ניהול הרשאות בפרונטאנד לפי role'),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 4. DETAILED SPEC
  // ═══════════════════════════════════════════════════════
  h1('4. אפיון מפורט'),

  h2('4.1 מסך ראשי — Dashboard'),
  p('המסך הראשי מורכב מ-4 אזורים:'),
  bullet('Header — שם מערכת, עמדה פעילה, שם איש צוות, כפתורי מצב (עומס, לילה)'),
  bullet('Sidebar שמאלי — רשימת סקטורים, פאנל עמדות שכנות, פאנל עזרים, פאנל ספרורים'),
  bullet('אזור מרכזי — לוח הפסים (כרטיסים או טבלה) / מפה'),
  bullet('Sticky Notes — פתקים צפים גרירים על כל המסך'),

  h2('4.2 ניהול פסים — Card View'),
  bullet('כרטיס פס: כותרת (Identity + Callsign), גובה, מהירות, קואורדינטות, שדות נוספים'),
  bullet('צבע כרטיס לפי סטטוס בלוק: רגיל / מהבהב כתום (סטייה) / כתום סטטי (אושרה סטייה)'),
  bullet('כפתורי פעולה: העברה, מחיקה, עריכה מהירה'),
  bullet('Drag & Drop — גרירת כרטיסים בין סקטורים ועמדות'),
  bullet('אנדיקטור העברה — חץ/תג מובהק בכרטיסים בהעברה'),
  bullet('Context Menu בקליק ימני — אפשרויות מהירות כולל אישור סטייה'),

  h2('4.3 תצוגת טבלה (Table View)'),
  bullet('עמודות דינמיות — כל שדה ניתן להצגה/הסתרה'),
  bullet('עמודת ספרור — תג כחול + תת-טקסט מצב, כפתור 📋 לפופ-אפ'),
  bullet('עמודת בלוק — dropdown לשיוך מרחב בלוק'),
  bullet('מיון לפי עמודות, קיבוץ לפי סקטור'),
  bullet('בחירת שורות מרובות (Multi-select)'),
  bullet('עמודת Drag Handle — גרירה ידנית לסדר'),
  bullet('Context Menu על שורה — ניהול מהיר'),

  h2('4.4 פופ-אפ ספרורים'),
  p('הפופ-אפ נפתח בלחיצה על 📋 ומציג את הספרורים הרלוונטיים לפס ולתחנת הבקרה:'),
  bullet('רשימת ספרורים ממוספרת עם שעה ועדכון אחרון'),
  bullet('צ\'קבוקס "הועבר לפ"מ" — מסמן שהפס עבר לתחנת הבקרה'),
  bullet('צ\'קבוקס "לא רלוונטי" — דוחה ספרור זה'),
  bullet('טעינת מצב קיים בפתיחה — V מסומן היכן שסומן בעבר'),
  bullet('ביטול "לא רלוונטי" — גורם לניקוי הסטטוס בלחיצת "אשר"'),
  bullet('כפתור "אשר" — שומר את כל הסימונים ב-DB'),
  bullet('ספרורים מיושנים — מסומנים באדום עם אזהרה'),
  bullet('ספרורים כבר-ידועים — מוצגים כ"כבר ידוע" ועם ✓ ירוק'),

  h2('4.5 בלוקים חכמים — Smart Blocks'),
  p('מודול הבלוקים החכמים מנהל את חלוקת מרחב הגובה האווירי:'),
  h3('מבנה היררכי:'),
  bullet('מרחב בלוק (Block Space) — מיכל עליון, ניתן לשיוך לפסים'),
  bullet('טבלת בלוק (Block Table) — שייכת למרחב, מוגדרת לפי קטגוריה'),
  bullet('בלוק (Block) — שורה בטבלה: גובה מ-עד, משימה, צבע, עמדות'),
  h3('ויזואל הפינטר (Block Visual Painter):'),
  bullet('סרגל גובה אינטראקטיבי (100-420 רגל)'),
  bullet('גרירה להוספת בלוק חדש בטווח גובה'),
  bullet('Resize — גרירת קצוות בלוק לשינוי טווח גובה'),
  bullet('Move — גרירת בלוק שלם לגובה אחר'),
  bullet('בחירת צבע אוטומטית — מקסימלי שונה מהבלוקים הקיימים'),
  h3('זיהוי סטייה:'),
  bullet('Auto-detect — כל פעם שפס מתעדכן, נבדק אם גובהו בתוך הבלוק'),
  bullet('הבהוב כתום — פס עם סטייה לא מאושרת'),
  bullet('אישור סטייה — קליק ימני → מגדיר block_deviation=acknowledged'),
  bullet('Auto-clear — כשהפס חוזר לטווח הנכון, הסטייה מתאפסת אוטומטית'),
  bullet('שכפול טבלה — מעתיק את כל השדות (name, category, note, כל הבלוקים)'),
  bullet('פוקוס אוטומטי — אחרי שכפול, הדף גולל ומדגיש את הטבלה החדשה'),

  h2('4.6 ניהול העברות וקונפליקטים'),
  bullet('יצירת העברה — בחירת עמדת יעד, גובה, נ"צ'),
  bullet('אינדיקטור "ממתין" — פס מסומן בברור כ"בהעברה"'),
  bullet('קליטה — עמדת היעד מקבלת/דוחה את הפס'),
  bullet('בדיקת קונפליקט גובה — השוואת alt כניסה/יציאה בנקודה משותפת'),
  bullet('הדגשה אדומה — פסים עם קונפליקט גובה מסומנים אדום עם תג אזהרה'),
  bullet('סף קונפליקט — ניתן להגדרה לכל סקטור (ברירת מחדל: 500 רגל)'),

  h2('4.7 מצב עומס (Load Mode)'),
  bullet('כל עמדה מגדירה סף עומס חלקי ומלא'),
  bullet('מדד חזותי — Bar/תג בראש העמדה'),
  bullet('צבע ירוק/כתום/אדום לפי מספר פסים פעילים'),
  bullet('מוצג לכל עמדות הרשת — ניטור מנהלתי'),

  h2('4.8 Query Builder — סינון מתקדם'),
  bullet('ממשק עץ — OR/AND groups עם תנאים'),
  bullet('תנאי: שדה + אופרטור + ערך'),
  bullet('אופרטורים: שווה, מכיל, גדול מ-, קטן מ-, בין'),
  bullet('שמירת סינון אישי לאיש צוות'),
  bullet('סינון גלובלי על ידי מנהל — משפיע על כל העמדות'),
  bullet('הפעלה/כיבוי דינמי'),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 5. ROLES & PERMISSIONS
  // ═══════════════════════════════════════════════════════
  h1('5. הרשאות ותפקידים'),
  makeTable([
    ['פעולה', 'רגיל', 'ראש צוות', 'מנהל'],
    ['צפייה בפסים', '✓', '✓', '✓'],
    ['עריכת פסים', '✓', '✓', '✓'],
    ['יצירת/מחיקת פסים', '✓', '✓', '✓'],
    ['ניהול ספרורים', '✓', '✓', '✓'],
    ['הגדרת עמדה (פרסט)', '—', '✓', '✓'],
    ['ניהול קבוצות עבודה', '—', '✓', '✓'],
    ['ניהול עזרים', '—', '✓', '✓'],
    ['סינון גלובלי (Query)', '—', '—', '✓'],
    ['ניהול בלוקים חכמים', '—', '—', '✓'],
    ['ניהול סקטורים', '—', '—', '✓'],
    ['ניהול אנשי צוות', '—', '—', '✓'],
    ['הגדרות מערכת', '—', '—', '✓'],
  ]),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 6. API ENDPOINTS
  // ═══════════════════════════════════════════════════════
  h1('6. נקודות קצה API'),
  makeTable([
    ['Method + Path', 'תפקיד'],
    ['GET /api/strips', 'שליפת כל הפסים'],
    ['POST /api/strips', 'יצירת פס חדש'],
    ['PUT /api/strips/:id', 'עדכון פס'],
    ['DELETE /api/strips/:id', 'מחיקת פס'],
    ['GET /api/transfers', 'שליפת העברות'],
    ['POST /api/transfers', 'יצירת העברה'],
    ['PUT /api/transfers/:id', 'עדכון העברה'],
    ['GET /api/workstations', 'שליפת עמדות'],
    ['POST /api/workstations', 'יצירת עמדה'],
    ['PUT /api/workstations/:id', 'עדכון עמדה'],
    ['GET /api/sectors', 'שליפת סקטורים'],
    ['GET /api/serials', 'שליפת ספרורים'],
    ['POST /api/serials', 'יצירת ספרור'],
    ['GET /api/strip-serial-selections', 'שליפת שיוכי ספרור'],
    ['POST /api/strip-serial-selections', 'UPSERT שיוך ספרור'],
    ['GET /api/block-spaces', 'שליפת מרחבי בלוק'],
    ['GET /api/block-tables', 'שליפת טבלאות בלוק'],
    ['POST /api/block-tables/:id/duplicate', 'שכפול טבלת בלוק'],
    ['GET /api/blocks', 'שליפת בלוקים'],
    ['POST /api/blocks', 'יצירת בלוק'],
    ['PUT /api/blocks/:id', 'עדכון בלוק'],
    ['DELETE /api/blocks/:id', 'מחיקת בלוק'],
    ['GET /api/sticky-notes', 'שליפת פתקים'],
    ['POST /api/sticky-notes', 'יצירת פתק'],
    ['PUT /api/sticky-notes/:id', 'עדכון פתק'],
    ['DELETE /api/sticky-notes/:id', 'מחיקת פתק'],
    ['GET /api/aid-groups', 'שליפת קבוצות עזרים'],
    ['POST /api/aid-groups/:id/duplicate', 'שכפול קבוצת עזרים'],
    ['GET /api/crew-members', 'שליפת אנשי צוות'],
  ]),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 7. DEPLOYMENT
  // ═══════════════════════════════════════════════════════
  h1('7. תשתית ופריסה'),
  boldLine('פלטפורמה', 'Replit — Autoscale Deployment'),
  boldLine('Build Command', 'npm run build (Vite)'),
  boldLine('Run Command', 'NODE_ENV=production node server.js'),
  boldLine('פורטים', '3001 (API) → 80 (External) | 5000 (Dev)'),
  boldLine('Database', 'PostgreSQL 16 — DATABASE_URL env variable'),
  boldLine('Modules', 'nodejs-20, postgresql-16'),
  boldLine('Post-merge', 'scripts/post-merge.sh — npm install'),
  boldLine('GitHub', 'ממוזגן — Integration מוגדרת'),
  p(''),
  h2('7.1 משתני סביבה'),
  makeTable([
    ['משתנה', 'תפקיד'],
    ['DATABASE_URL', 'מחרוזת חיבור PostgreSQL'],
  ]),

  pageBreak(),

  // ═══════════════════════════════════════════════════════
  // 8. HISTORY
  // ═══════════════════════════════════════════════════════
  h1('8. היסטוריית פיתוח — Changelog'),
  makeTable([
    ['גרסה / פיצ\'ר', 'תיאור'],
    ['ניהול פסים בסיסי', 'Drag & Drop, Card View, שדות מטוס'],
    ['תצוגת טבלה', 'Table View, מיון, קיבוץ לפי סקטור'],
    ['העברות', 'Transfer flow, אינדיקטורים, קליטה'],
    ['OCR', 'Tesseract.js — זיהוי ספרות מותאם אישית'],
    ['מפה', 'שכבות פוליגון, Battle Zone, בחירת מפה'],
    ['Load Mode', 'ספי עומס, אינדיקטורים חזותיים'],
    ['Query Builder', 'עץ סינון, ברמת מנהל ואישית'],
    ['שדות חדשים', 'number_of_formation, erka, koteret, mivtza'],
    ['קבוצות עבודה', 'Work Groups לשיתוף פתקים'],
    ['Sticky Notes', 'פתקים צפים, גרירים, צבעוניים, הפצה'],
    ['עזרים', 'Aid Groups/Items, שכפול, קישור'],
    ['ספרורים', 'יבוא, שיוך, גילוי מיושנים, פופ-אפ'],
    ['קונפליקט גובה', 'זיהוי אוטומטי, הדגשה, סף לפי סקטור'],
    ['תחנות בקרה רלוונטיות', 'פילטור ספרורים לפי פרסט עמדה'],
    ['בלוקים חכמים', 'Block Spaces/Tables/Blocks, Painter, סטייה'],
    ['פופ-אפ ספרורים', 'טעינת מצב קיים, ביטול "לא רלוונטי"'],
    ['שכפול בלוקים', 'העתקת כל השדות + פוקוס אוטומטי'],
    ['תיקוני TypeScript', 'PainterDragOp, aidExpandedIds, presetForm'],
  ]),

  new Paragraph({ children: [], spacing: { before: 600 } }),
  new Paragraph({
    bidirectional: RTL, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '— סוף המסמך —', size: 20, color: '94a3b8', italics: true })],
  }),
];

const doc = new Document({
  sections: [
    {
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            bidirectional: true, alignment: AlignmentType.RIGHT,
            border: { bottom: { color: '1e3a5f', size: 6, value: BorderStyle.SINGLE } },
            children: [
              new TextRun({ text: 'SKYBOARD — לוח שמיים  |  מסמך אפיון מערכת', size: 18, color: '64748b' }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            bidirectional: true, alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'עמוד ', size: 16, color: '94a3b8' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94a3b8' }),
              new TextRun({ text: ' מתוך ', size: 16, color: '94a3b8' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '94a3b8' }),
            ],
          })],
        }),
      },
      children: sections,
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('SKYBOARD_Specification.docx', buffer);
console.log('Done! File saved as SKYBOARD_Specification.docx');
