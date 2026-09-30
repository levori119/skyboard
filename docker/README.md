# סביבת גיבוי מקומית - Docker + רפליקציה לוגית מ-Neon

PostgreSQL מלא על מחשב העמדה, שמקבל את הנתונים מהמאגר המרכזי ב**רפליקציה
לוגית של Postgres עצמו** - לא בקוד סנכרון שאנחנו מתחזקים.

---

## מה זה מחליף, ומה לא

| | |
|---|---|
| ✅ **מחליף** | את **כיוון המראה** (מרכז → עמדה). במקום `server/sync/daemon.js` שמושך 128 טבלאות בקבוצות, Postgres זורם את השינויים בעצמו |
| ❌ **אינו מחליף** | את **העבודה בנתק ואת הדחיפה חזרה**. ראה למטה |

> ⚠️ **רפליקציה לוגית היא חד-כיוונית, והמנוי הוא קריאה בלבד בפועל.** כתיבה
> מקומית לטבלה מנויה תתנגש כשהרפליקציה תחזור (`duplicate key`), והמנוי
> **יכבה את עצמו** (`disable_on_error`). לכן העבודה בנתק **אינה** נכתבת
> לטבלאות המנויות אלא ממשיכה במסלול הקיים: יומן הסנכרון והדחיפה
> ([ARCHITECTURE.md](../ARCHITECTURE.md) §נתק 4).

**התמונה המלאה:**

```
   מרכז → עמדה   רפליקציה לוגית  (הסטאק הזה)
   עמדה → מרכז   יומן + דחיפה     (server/sync/, ללא שינוי)
```

---

## שלוש השלכות שצריך להכריע עליהן **לפני** ההפעלה

הפעלת רפליקציה לוגית ב-Neon משנה את `wal_level` ל-`logical`. הפעולה
[**בלתי הפיכה**](https://neon.com/docs/guides/logical-replication-neon) ומפעילה
מחדש את כל ה-computes בפרויקט (חיבורים פעילים ינותקו).

| # | ההשלכה | למה זה חשוב דווקא כאן |
|---|---|---|
| 1 | **מנוי מחובר מחזיק את ה-compute ער** | Neon לא יורד ל-scale-to-zero כל עוד המנוי מחובר. מתבטא בחשבון |
| 2 | **סלוט של מנוי מנותק גורם למרכז לצבור WAL** | נתיב רקיע מתנתק **ביודעין**. סלוט נטוש ממלא את דיסק המרכז - ראה §תחזוקה |
| 3 | **מספר הסלוטים מוגבל** | מנוי אחד לכל **מחשב** שמריץ את הסטאק. זה אינו פתרון לעשרות עמדות |

> **ההמלצה שלי:** מנוי אחד **לכל בסיס** (מחשב שמשרת את עמדות הבסיס), ולא
> מנוי לכל עמדה. לעמדה הבודדת, המאגר המוטמע (PGlite) + שירות המראה קלים
> בהרבה ואינם מחזיקים סלוט במרכז.

---

## הרצה

```bash
cp docker/.env.example docker/.env      # ולמלא
cd docker && docker compose --env-file .env up -d
docker compose logs -f app
```

| פקודה | מה |
|---|---|
| `docker compose down` | עצירה. הנתונים נשארים ב-volume |
| `docker compose down -v` | עצירה **ומחיקת הנתונים** |
| `docker compose logs -f db` | לוג המאגר - שם מופיעות שגיאות המנוי |

---

## הקמת הרפליקציה - לפי הסדר

### 1. במרכז: הפעלה, תפקיד ופרסום

ב-Neon Console: **Settings → Postgres → Logical replication → Enable**.

```bash
# תפקיד ייעודי, קריאה בלבד. לא המשתמש של האפליקציה.
neon roles create --name replication_user

# הפרסום נוצר **מהקוד**, לא מרשימה ידנית - אחרת הוא מתיישן בשקט
node scripts/gen-publication-sql.mjs > /tmp/pub.sql
psql "$CENTRAL_DATABASE_URL" -f /tmp/pub.sql
```

```bash
# אימות
psql "$CENTRAL_DATABASE_URL" -c "SHOW wal_level"                      # logical
psql "$CENTRAL_DATABASE_URL" -c \
  "SELECT count(*) FROM pg_publication_tables WHERE pubname='skyking_pub'"
```

> **בדיקה שחוסכת תקלה בייצור:** `node scripts/gen-publication-sql.mjs --check`
> מוודא שלכל טבלה בפרסום יש מפתח ראשי. רפליקציה לוגית דורשת
> `REPLICA IDENTITY`, וטבלה בלעדיו מתפרסמת אבל **כל UPDATE/DELETE עליה נכשל** -
> כשל שמתגלה רק בפעולה הראשונה מסוגה. (נבדק על המאגר הנוכחי: 128/128 עוברות.)

### 2. בעמדה: סכמה, ואז מנוי

```bash
# הסכמה נוצרת ע"י האפליקציה עצמה - ראה §סכמה
docker compose up -d app && docker compose logs -f app   # להמתין ל-Schema initialized

# ואז המנוי
sed "s|REPLICATION_URL|$REPLICATION_URL|" docker/replication/02-subscription.sql \
  | docker compose exec -T db psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME"
```

### 3. אימות

```bash
./docker/scripts/sync-status.sh            # פעם אחת
./docker/scripts/sync-status.sh --watch    # כל 10 שניות
```

---

## §סכמה - איך מטפלים בשינויי מבנה

⚠️ **רפליקציה לוגית מעתיקה DML בלבד.** `CREATE TABLE`, `ADD COLUMN` ו-`DROP`
**אינם** עוברים. טבלה שקיימת במרכז ולא בעמדה פשוט לא תסונכרן, והמנוי ידווח
שגיאה ו**יכבה את עצמו**.

**הפתרון כאן אינו `pg_dump`, אלא האפליקציה עצמה.** `server/db/init.js` בונה את
הסכמה כולה ב-`IF NOT EXISTS`, והוא רץ **בכל עליית שרת** מול המאגר שנבחר. לכן:

| מתי | מה לעשות |
|---|---|
| **גרסה חדשה עם טבלה/עמודה** | `docker compose up -d --build app` - `initDb` יוצר אותן מקומית |
| **טבלה חדשה שצריכה להיות מסונכרנת** | לסווג אותה ב-`server/db/env-tables.js`, ואז להריץ מחדש את `gen-publication-sql.mjs` במרכז |
| **אחרי שינוי בפרסום** | `ALTER SUBSCRIPTION skyking_sub REFRESH PUBLICATION;` בעמדה - בלעדיו הטבלה החדשה לא תתחיל לזרום |

**הסדר קובע:** קודם הסכמה בעמדה (`initDb`), אחר כך הפרסום במרכז, ורק אז
`REFRESH PUBLICATION`. הפוך מזה - המנוי נתקל בטבלה שאינה קיימת אצלו ונכבה.

---

## §תחזוקה - הסכנה האמיתית

**סלוט נטוש ממלא את דיסק המרכז.** כל עוד המנוי רשום אך אינו מחובר, Neon שומר
WAL עבורו. עמדה שכבויה לשבוע = שבוע של WAL.

```bash
# מה הפער שנצבר
psql "$CENTRAL_DATABASE_URL" -c "
  SELECT slot_name, active,
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS lag
    FROM pg_replication_slots"
```

```bash
# עמדה שיוצאת משירות - **חובה** לשחרר את הסלוט
docker compose exec db psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" \
  -c "DROP SUBSCRIPTION skyking_sub"        # מוחק גם את הסלוט במרכז

# אם המנוי כבר לא קיים מקומית, הסלוט נשאר יתום ומוחקים אותו במרכז:
psql "$CENTRAL_DATABASE_URL" -c "SELECT pg_drop_replication_slot('skyking_slot_station')"
```

> `DROP SUBSCRIPTION` בזמן שאין קשר למרכז **נתקע**. במקרה כזה:
> `ALTER SUBSCRIPTION skyking_sub SET (slot_name = NONE); DROP SUBSCRIPTION skyking_sub;`
> ואז למחוק את הסלוט במרכז ידנית.

**שם סלוט לכל מחשב.** `slot_name` ב-`02-subscription.sql` הוא
`skyking_slot_station`. שני מחשבים עם אותו שם יילחמו על אותו סלוט - לתת לכל
אחד שם משלו (`skyking_slot_<בסיס>`).

---

## §נתק - איך האפליקציה מחליפה מאגר

`docker/scripts/pick-database-url.sh` רץ ב-entrypoint, בודק את המרכז ב-`pg_isready`
ובוחר:

| מצב | התוצאה |
|---|---|
| המרכז עונה | `DATABASE_URL` = המרכזי |
| המרכז אינו עונה | `DATABASE_URL` = המקומי |
| `DB_MODE=local` | תמיד המקומי (תרגול, בדיקות) |
| `DB_MODE=remote` | תמיד המרכזי |

⚠️ **ההכרעה היא בעלייה בלבד, וזה מכוון.** החלפת מאגר תוך כדי ריצה פירושה ששתי
בקשות עוקבות של אותו מסך נענות משני מאגרים שונים, והבקר רואה מידע שקופץ. עמדה
שעלתה על המקומי נשארת עליו עד הפעלה מחדש - וזה בדיוק החוזה שמסך הכניסה מציג
([ARCHITECTURE.md](../ARCHITECTURE.md) §שני מצבי עלייה).

`pg_isready` ולא `ping`: ping עונה גם כששער היציאה חי והמאגר מת, וזו הטעות
שמייצרת עמדה שעלתה "מחוברת" ונתקעת על הבקשה הראשונה.

---

## מה **לא** נבדק כאן

הסטאק נכתב ואומת תחבירית, אבל **לא הורץ**: אין Docker על מכונת הפיתוח שעליה
נכתב. מה שכן אומת מול המאגר האמיתי:

- `gen-publication-sql.mjs --check` - 128/128 טבלאות עם מפתח ראשי ✅
- `pick-database-url.sh` - חמשת מסלולי ההכרעה ✅

מה שנשאר לבדוק בהרצה ראשונה: `docker compose up`, ההעתקה הראשונית
(`copy_data`), ו-`sync-status.sh` מול סלוט חי.
