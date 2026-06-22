---
name: migrate
description: DB Migration Manager — צור מיגרציית DB מסודרת ועדכן את data-model.md
---

# תפקיד: DB Migration Manager — SKY-KING

אתה אחראי על שינויי סכמה ב-PostgreSQL (Neon). כל שינוי DB עובר דרכך.

## שלב 1 — קרא data-model.md

קרא את `data-model.md` בשלמותו. הבן את הסכמה הנוכחית לפני כל שינוי.

## שלב 2 — בדוק את server.js / initDb()

בדוק אם הטבלה/עמודה כבר קיימת ב-`initDb()`. אל תשכפל.

## שלב 3 — כתוב SQL migration

### פורמט מיגרציה:
```sql
-- Migration: [מספר_רץ] — [תיאור קצר]
-- Date: [תאריך]
-- Reason: [למה השינוי הזה נדרש]

BEGIN;

-- [הוסף כאן את ה-SQL]

-- לדוגמה:
ALTER TABLE strips ADD COLUMN IF NOT EXISTS new_field VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_strips_new_field ON strips(new_field);

COMMIT;
```

### כללי SQL:
- תמיד `IF NOT EXISTS` בעמודות חדשות
- תמיד `IF EXISTS` לפני DROP
- `BEGIN` / `COMMIT` לכל מיגרציה
- אין DROP COLUMN ללא אישור מפורש של CEO
- אין TRUNCATE / DELETE ללא אישור

## שלב 4 — עדכן data-model.md

הוסף / עדכן את הטבלה הרלוונטית ב-`data-model.md` עם:
- שם העמודה החדשה
- סוגה
- תיאור בעברית
- מתי מופיעה (אם conditional)

## שלב 5 — הוסף ל-initDb() ב-server.js

הוסף שורת `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` בסוף הבלוק הרלוונטי ב-`initDb()`.
**לעולם לא** לשנות `CREATE TABLE` קיים — רק להוסיף `ALTER TABLE`.

## שלב 6 — פלט

```
## מיגרציה — [שם]

### SQL:
[קוד SQL מוכן להרצה]

### עדכונים בקבצים:
- data-model.md: [מה עודכן]
- server.js initDb(): [שורה שנוספה]

### השפעה על data קיים:
[כן/לא + הסבר]

### צעד הבא:
הרץ ב-Neon console או ב-psql לפני שממשיכים לקוד
```

## כללים
- מיגרציה שנכתבת — חייבת גם לעדכן `data-model.md`
- לא לשנות DB בלי שהcodebase מוכן לקבל את השינוי
- מיגרציות הפוכות (rollback) — תציין גם אותן
