# SKY-KING — ביקורת קוד מקיפה #2 (יעילות · אבטחה · ביצועים)

> מעבר עומק שני על כל הקוד, מבוסס **מדידות אמיתיות** מול ה-DB והקוד (לא הערכות).
> בוצע: 2026-06-23. 🔗 [REFACTOR_LOG.md](REFACTOR_LOG.md) · [MAP_SERVICES.md](MAP_SERVICES.md)

---

## תקציר מנהלים

| תחום | מצב | הממצא הכי חשוב |
|------|-----|----------------|
| 🔒 אבטחה | ⚠️ דורש טיפול | אין **אימות** על ה-API — ה-URL הציבורי ב-Railway חושף את כל 353 ה-endpoints |
| ⚡ ביצועים | ⚠️ דורש טיפול | **64 לולאות polling** + **חוסר indexes** + latency ~250ms ל-Neon = האיטיות |
| 🧹 יעילות | 🟡 סביר | bundle יחיד 2.7MB (אין code splitting), קבצים ענקיים, כפילות מפה |
| 💉 SQL injection | ✅ תקין | פרמטרים + whitelist לשמות עמודות — **לא פגיע** |

---

## 🔒 אבטחה

### 🔴 קריטי — אין אימות על ה-API
- ה-API נטען ב-`app.use(router)` **ללא middleware של auth**. כל מי שמגיע ל-URL הציבורי של Railway יכול לקרוא/לכתוב לכל endpoint (כולל מחיקות).
- ה"אימות" היחיד הוא בחירת עמדה ב-frontend + `authToken` שנוצר עם `Math.random()` (ב-[crew.js:182](server/routes/crew.js#L182)) — **לא קריפטוגרפי, לא נאכף בשרת**.
- **המלצה:** (א) להוריד את ה-Domain הציבורי כשלא בודקים, או (ב) שכבת auth אמיתית (סיסמת עמדה/SSO) + middleware שאוכף על `/api/*`, או (ג) הגבלת IP/VPN. מינימום מיידי: basic-auth env-based על כל `/api`.

### 🟡 CORS פתוח לרווחה
- [app.js:26](server/app.js#L26) `app.use(cors())` — מתיר **כל** origin. **המלצה:** להגביל ל-origin הידוע (`CORS_ORIGIN` env).

### 🟡 חוסר הקשחה (helmet / rate-limit)
- אין `helmet` (security headers) ואין rate limiting. **המלצה:** `helmet()` + `express-rate-limit` על `/api`.

### 🟡 גבול body 50MB
- [app.js:27](server/app.js#L27) `limit: '50mb'` — נחוץ להעלאת מפות base64, אבל וקטור DoS ב-URL ציבורי. **המלצה:** להוריד ל-2-5MB גלובלי, ו-50MB רק על route ההעלאה.

### 🟡 דליפת הודעות שגיאה
- חלק מה-routes מחזירים `err.message` ל-client (info disclosure). **המלצה:** הודעה גנרית ל-client, לוג מפורט בשרת בלבד.

### ✅ מה תקין
- **אין SQL injection** — כל הערכים פרמטריים (`$1`), שמות עמודות מ-whitelist בקוד.
- secrets ב-`.env` (gitignored), לא נדחפו ל-git.

---

## ⚡ ביצועים (מדידות אמיתיות)

### מדידות latency ל-Neon (eu-west-2)
| שאילתה | זמן |
|--------|-----|
| `SELECT 1` (round-trip קר) | 792ms |
| `SELECT 1` (חם) | ~220ms |
| `SELECT * FROM strips` | 305ms |
| `SELECT * FROM maps` (21MB!) | **2153ms** |

### 🔴 polling אגרסיבי — שורש האיטיות
- **64 קריאות `setInterval`** ב-frontend, מתוכן **21 ב-SectorDashboard לבד**. כל אחת מכה בשרת→Neon (~250ms). מוכפל במספר העמדות הפתוחות.
- **המלצה:** מעבר ל-**WebSocket** (push במקום poll) — ראה skill `/realtime`. כפתרון ביניים: לאחד intervals, להאריך זמנים, ולהשתמש ב-ETag/304 כדי לא לשלוף מידע שלא השתנה.

### 🔴 חוסר indexes
- **רק index מפורש אחד** ב-init.js (`vehicle_gps`). שאר ה-indexes הם auto מ-PK/UNIQUE.
- עמודות חמות **ללא index**: `activity_log(timestamp)` (אומת: `Sort` בלי index ב-EXPLAIN), `strips(workstation_preset_id, status)`, `strip_transfers(from/to_preset_id, status)`, `map_zones(map_id)`, `airfield_elements(airfield_id)`, `bdh_alerts(target_preset_id, created_at)`, `workstation_messages(to_preset_id)`, `sticky_note_recipients(preset_id)`.
- **המלצה:** להוסיף `CREATE INDEX IF NOT EXISTS` לכולן (טבלאות קטנות → מיידי, בטוח). **יושם בנפרד ב-branch `feature/perf-indexes`.**

### 🟡 N+1 — שאילתות בתוך לולאות
- מספר מקומות עם `await pool.query(...)` בתוך `for` (למשל reorder של bdh_items, הפצות). כל איטרציה = round-trip נפרד (~250ms).
- **המלצה:** batch — INSERT רב-שורות / `unnest` / transaction אחת.

### 🟡 תמונות מפה ב-DB (21MB base64)
- טבלת `maps` = 21MB (17 שורות, ~1.2MB/מפה). `SELECT *` עליה = 2.1 שניות.
- מצב נוכחי: רשימת `/api/maps` **לא** שולפת `image_data` (טוב); `/api/maps/:id` כן (מקובל לטעינה בודדת).
- **המלצה ארוכת-טווח:** object storage/CDN לתמונות במקום ב-DB.

---

## 🧹 יעילות

### 🟡 Bundle יחיד 2.7MB (אין code splitting)
- כל ה-frontend ב-chunk אחד → טעינה ראשונית כבדה.
- **המלצה:** `React.lazy` + dynamic import לפי view (CTRL/TWR/Admin) — כל עמדה טוענת רק את שלה.

### 🟡 קבצים ענקיים
- `SectorDashboard.tsx` 14,573 ש' · `ManagementPage.tsx` 7,467 · `GroundView.tsx` 4,812. חולצו מ-App אבל בפנים מונוליטים.
- **המלצה:** פיצול פנימי לרכיבים/hooks (במיוחד 21 ה-intervals → hook `useLivePolling`).

### 🟡 כפילות דומיין המפה
- מתועד ב-[MAP_SERVICES.md](MAP_SERVICES.md) — עיגון/פוליגונים/דרכים/haversine כפולים.

---

## 📋 תוכנית פעולה מדורגת (ערך × מאמץ) — הכל דרך `/feature`, לא ל-main ישירות

| עדיפות | פעולה | ערך | מאמץ |
|--------|-------|-----|------|
| 1 ⚡ | **הוספת indexes** (perf-indexes) | גבוה | נמוך → **יושם עכשיו ב-branch** |
| 2 🔒 | **auth על /api** (או הורדת domain ציבורי) | קריטי | בינוני |
| 3 🔒 | helmet + rate-limit + CORS מוגבל + body-limit | גבוה | נמוך |
| 4 ⚡ | WebSocket במקום 64 polling | גבוה מאוד | גבוה |
| 5 🧹 | code splitting (React.lazy) | בינוני | נמוך-בינוני |
| 6 ⚡ | batch ל-N+1 | בינוני | נמוך |
| 7 🧹 | פיצול פנימי + דדופ מפה | בינוני | גבוה |

> כל שינוי: `/arch` (מחקר online) → TDD → VERIFY → `/qa` (כולל QA משתמש) → אישור → merge.
