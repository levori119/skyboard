---
name: sync-docs
description: סנכרון תיעוד — עדכן את כל מסמכי הפרויקט (SERVICES, ARCHITECTURE, REFACTOR_LOG, data-model, DEV_GUIDE, README, CLAUDE) כך שישקפו את הקוד הנוכחי. הפעל אחרי כל כמה שינויי קוד.
---

# Sync Docs — סנכרון תיעוד SKY-KING

תפקיד הסקיל: לוודא שכל מסמכי התיעוד תואמים את הקוד בפועל. הרץ אותו אחרי כל
batch של שינויים (הוספת/הסרת/הזזת מודול, route, טבלה, מונח, או פיצ'ר).

## מתי להפעיל
- אחרי הוספה/הסרה/שינוי שם של קובץ ב-`src/` או `server/`
- אחרי הוספה/שינוי של API endpoint
- אחרי שינוי סכמת DB
- אחרי הוספת מונח דומיין חדש
- כעניין שבשגרה — כל 3-5 פעולות קוד משמעותיות

## תהליך — עבור על כל בדיקה ועדכן רק מה שהשתנה

### שלב 0 — איסוף מצב נוכחי
הרץ:
```bash
# מודולים frontend
find src/components src/utils src/types -name '*.ts' -o -name '*.tsx' | sort
wc -l src/App.tsx
# מודולים backend + ספירת routes
for f in server/routes/*.js; do echo "$f: $(grep -cE "router\.(get|post|put|delete|patch)\(" "$f") routes"; done
# סך endpoints
grep -rcE "router\.(get|post|put|delete|patch)\(" server/routes/ | awk -F: '{s+=$2} END{print "total routes:", s}'
```

### שלב 1 — SERVICES.md (הקריטי ביותר)
זהו קטלוג המודולים. ודא:
- [ ] כל קובץ ב-`src/components`, `src/utils`, `src/types`, `server/` מופיע עם תפקיד + מה מייצא
- [ ] מודול שנמחק/שונה שם — הוסר/עודכן
- [ ] **נספח א' (Endpoints)** — אם נוספו/הוסרו routes, יצר מחדש:
```bash
{ echo ""; echo "---"; echo ""; echo "## נספח א' — קטלוג Endpoints מלא"; echo "";
  for f in $(ls server/routes/*.js | sort); do
    echo "#### $(basename "$f")"
    grep -oE "router\.(get|post|put|delete|patch)\('[^']*'" "$f" | sed -E "s/router\.(get|post|put|delete|patch)\('(.*)'/\U\1\E \2/" | sort -u
    echo ""
  done; }
```
החלף את החלק של "נספח א'" הקיים בפלט המעודכן.

### שלב 2 — ARCHITECTURE.md
- [ ] עץ המודולים תואם את המבנה בפועל
- [ ] מספר השורות של App.tsx / server.js מעודכן
- [ ] דיאגרמות זרימה עדיין נכונות (אם השתנתה לוגיקה)
- [ ] חוב טכני — סמן מה תוקן (✅) ומה נוסף

### שלב 3 — data-model.md
- [ ] טבלה/עמודה חדשה שנוספה ל-`server/db/init.js` מתועדת כאן
- [ ] שדה שהוסר/שונה — עודכן

### שלב 4 — REFACTOR_LOG.md
- [ ] הוסף רשומת שינוי חדשה (#NNN) עם: תאריך, קבצים, מה נעשה, QA לפני/אחרי
- [ ] עדכן את טבלת "סטטוס כללי"

### שלב 5 — DEV_GUIDE.md
- [ ] מונח דומיין חדש → הוסף למילון המונחים
- [ ] משימה נפוצה חדשה → הוסף ל-How-To
- [ ] בעיה/פתרון חדש → הוסף ל-FAQ

### שלב 6 — README.md
- [ ] שינוי ב-tech stack / פקודות הרצה / דרישות → עדכן

### שלב 7 — CLAUDE.md
- [ ] סקיל חדש → הוסף לטבלת הסקילים
- [ ] עקרון/כלל חדש שהוגדר → הוסף

### שלב 8 — זיכרון (memory)
- [ ] אם המבנה השתנה מהותית → עדכן `code-structure.md` בזיכרון

## כללים
- **עדכן רק מה שבאמת השתנה** — אל תיצור מחדש מסמכים שלמים ללא צורך
- כל מספר (שורות, routes, טבלאות) חייב להיות מדויק — שלוף מהקוד, אל תנחש
- שמור על העברית והפורמט הקיים בכל מסמך
- בסוף — דווח בקצרה: אילו מסמכים עודכנו ומה השתנה בכל אחד

## פלט
```
## Sync Docs — דו"ח
עודכנו:
- SERVICES.md: [מה השתנה]
- ARCHITECTURE.md: [מה השתנה]
- ...
ללא שינוי: [רשימת מסמכים שלא נגעת בהם]
```
