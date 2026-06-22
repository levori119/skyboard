---
name: feature
description: Workflow לבניית פיצ'ר חדש ב-git worktree מבודד (מאפשר כמה סוכנים במקביל). הפעל בתחילת כל פיצ'ר חדש. דוגמה — /feature transfer-eta-colors.
---

# Feature Workflow — worktree מבודד לכל פיצ'ר

מטרה: כל פיצ'ר נבנה ב-**worktree נפרד** (תיקיית עבודה משלו על branch משלו), כך
שכמה סוכנים/מפתחים עובדים במקביל בלי להתנגש. ה-worktree משתף את אותו repo ו-DB.

## קלט
שם פיצ'ר בקבב-קייס (למשל `transfer-eta-colors`). אם לא ניתן — בקש שם קצר.

---

## שלב 1 — הקמת ה-worktree
צור worktree על branch חדש `feature/<name>`:
```bash
git worktree add ../skyboard-<name> -b feature/<name>
```
> `node_modules` מקושר אוטומטית (symlink) דרך `.claude/settings.json` → אין צורך ב-`npm install`.

**העתק `.env`** (gitignored — לא עובר אוטומטית) מהרפו הראשי:
```bash
cp .env ../skyboard-<name>/.env
```

> **ריצה מקבילה של `npm run dev`:** אם תריץ את האפליקציה גם ב-worktree הזה במקביל
> לאחר — שנה פורטים ב-`.env` של ה-worktree (למשל `PORT=3002`) וב-`vite.config.ts`
> (port 5001 + proxy ל-3002). אם רק כותבים קוד + tsc/tests/build — אין צורך, אין התנגשות פורטים.

---

## שלב 2 — תכנון (לפני קוד)
מה-worktree החדש, הרץ את זרימת התכנון:
1. `/pm` — סטוריית משתמש + acceptance criteria
2. `/arch` — תכנית טכנית + בדיקת DRY מול [SERVICES.md](../../../SERVICES.md)
3. `/before` — gate checklist
4. אם נוגעים בשירות מסוים — ה-context skill שלו (`/transfer-logic`, `/ctrl-view`, `/ground-view`)
5. אם נדרש שינוי DB — `/migrate`

> לפני כתיבת קוד: לזהות את השירות ב-[SHARED_LANGUAGE.md](../../../SHARED_LANGUAGE.md) ולהשתמש בשם שלו.

---

## שלב 3 — TDD: בדיקות לפני קוד (best practice של Anthropic)
> מחקר: TDD הוא הדפוס החזק ביותר לעבודה עם Claude — כל מחזור red→green נותן משוב חד-משמעי.

1. **כתוב בדיקות קודם** לפי ה-acceptance criteria (לוגיקה טהורה → vitest)
2. **ודא שהן נכשלות** (`npm test`) — מאשר שהן באמת בודקות
3. **commit את הבדיקות הנכשלות** כ-checkpoint — רשת ביטחון: אם הקוד "יתקן" בדיקה במקום מימוש, ה-diff יחשוף
4. **ממש עד שהן עוברות** — בלי לשנות את הבדיקות

עקרונות מימוש חובה (מ-CLAUDE.md): כל UI בעברית, dark mode, RTL · DRY (להרחיב קיים) · Event Log לשינוי סטטוס · `TIMESTAMPTZ` בלבד.

---

## שלב 4 — VERIFY (לפי best practice online — לא להמציא)
> כלל קבוע: לחקור online את שיטת האימות הנכונה **לסוג** השינוי, ולהחיל אותה.

מינימום תמיד:
```bash
npx tsc --noEmit     # חייב נקי
npm test             # חייב נקי (כולל הבדיקות החדשות)
npx vite build       # bundle נבנה
```
לפי סוג השינוי (חפש "best practice to verify X"):
- **backend/API** → smoke test ל-endpoints (200 + תוכן), מול נתונים אמיתיים
- **SQL/DB** → בדיקה מול rows אמיתיים (כולל edge cases של נתונים)
- **UI** → `/verify` (הרצה בפועל וצפייה בהתנהגות)
- **ביצועים** → בדיקת עומס (בקשות מקבילות)

ואז `/qa` — מול עקרונות SKY-KING.

---

## שלב 5 — תיעוד
- `/sync-docs` — עדכון SERVICES/ARCHITECTURE/REFACTOR_LOG/SHARED_LANGUAGE
- `/requirements-tracker` — רישום הפיצ'ר ל-xlsx

---

## שלב 6 — סגירה
1. commit על ה-branch `feature/<name>` (הודעה ברורה + Co-Authored-By)
2. הצג ל-CEO: מה נבנה + תוצאות QA
3. אחרי אישור — merge ל-main (או PR), ואז נקה את ה-worktree:
```bash
git worktree remove ../skyboard-<name>
git branch -d feature/<name>   # אחרי merge
```

---

## עבודה עם כמה סוכנים במקביל

> מבוסס על ה-playbook המקובל (2026): *plan → shared contracts → split by ownership →
> isolate each worker in a worktree → test per worker → final merged validation pass.*

**הדפוס:**
1. **תכנן קודם** (`/pm` + `/arch`) — לפני שמפצלים לסוכנים.
2. **חוזים משותפים (shared contracts)** — הגדר מראש ממשקים שעוברים בין הפיצ'רים (צורת API, types ב-`src/types/`) כדי שסוכנים לא יסתרו זה את זה.
3. **חלוקה לפי בעלות (ownership boundaries)** — כל סוכן אחראי על קבצים/שירות אחר. **רק משימות בלתי-תלויות** (אם B תלוי בפלט של A — לא מקבילי).
4. **בידוד ב-worktree** — כל סוכן worktree+branch משלו (בידוד ברמת ה-filesystem, לא רק branch).
5. **בדיקות לכל סוכן** — כל worktree מריץ tsc+tests+build.
6. **validation סופי על המיזוג** — אחרי merge של כולם, ריצת QA אחת על main המאוחד.

**שתי דרכי הרצה:**
- **סוכני משנה:** spawn עם `isolation: "worktree"` — כל סוכן worktree אוטומטי.
- **כמה סשנים:** כל סשן `/feature <name>` על פיצ'ר אחר.

**כללי זהב:**
- **התחל קטן** — 2 worktrees, הגדל רק כשהסקירה עומדת בקצב (תקרה מעשית ~4-8 במקביל).
- כל פיצ'ר = branch+worktree נפרד; אין שני סוכנים על אותו branch.
- **DB משותף (Neon):** תאם migrations (`/migrate`), אל תריץ ALTER מתנגשים במקביל.
- merge אחד-אחד ל-main + build-verify אחרי כל merge.
- שני פיצ'רים שנוגעים באותו קובץ ענק (SectorDashboard) → צפה ל-conflict; תאם מראש.

**מקורות:** Claude Code Docs (Run agents in parallel), Anthropic Skills guide, git-worktree playbooks 2026.
