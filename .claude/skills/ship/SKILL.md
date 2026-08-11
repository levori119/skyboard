---
name: ship
description: קימוט ודחיפה לגיט - מריץ npm run version:bump אוטומטית לפני כל commit+push, מוודא שהעץ שלך, ודוחף. הפעל בכל בקשה מסוג "תקמט", "תעלה לגיט", "תדחוף".
---

# ship - קימוט ודחיפה עם bump גרסה

> **הכלל:** כל בקשת קימוט + העלאה לגיט מתחילה ב-`npm run version:bump`.
> בלי יוצא מן הכלל, ובלי לשאול. הגרסה והתאריך מוצגים ב**מסך הכניסה**
> וב**חלון העזרה** - קוד שנדחף בלי bump מציג למשתמש גרסה שקרית.

---

## שלב 1 - לוודא שהעץ שלך

```bash
git status --short
git branch --show-current
```

קובץ בעץ שאינו שלך = **מישהו אחר עובד כאן**. לא לקמט אותו, לא "לנקות" -
לדווח למשתמש ולעצור. ראה `/worktree`.

---

## שלב 2 - bump גרסה (חובה, ראשון)

```bash
npm run version:bump          # patch + חותמת זמן נוכחית (1.0.26 -> 1.0.27)
npm run version:bump 1.1.0    # גרסה מפורשת (minor / major)
```

מעדכן את [`src/version.ts`](../../../src/version.ts) - מקור-אמת יחיד:
`APP_VERSION` + `APP_VERSION_DATE` (`YYYY-MM-DD HH:MM`).

**מתי מדלגים:** רק כשהמשתמש אמר במפורש "בלי bump", או בקימוט מקומי שאינו
נדחף (`git commit` בלבד, בלי push, על branch פיצ'ר). בכל מקרה אחר - מבמפים.

---

## שלב 3 - קימוט

```bash
git add <הקבצים שלי> src/version.ts
git commit -m "<type>(<scope>): <תיאור בעברית>"
```

- `git add` נקודתי לקבצים שלך. **לא** `git add -A` בעץ משותף.
- `src/version.ts` נכנס **לאותו קומיט** - כדי שההיסטוריה תראה איזה קוד יצא באיזו גרסה.
- הודעת קומיט: `feat` / `fix` / `chore` / `refactor` + scope + תיאור בעברית.

---

## שלב 4 - דחיפה

```bash
git push origin <branch>                          # ענף פיצ'ר
git push origin feature/i18n-bilingual:main       # ל-main (production)
```

---

## שלב 5 - אימות

```bash
git log origin/main -1 --oneline
grep APP_VERSION src/version.ts
```

לדווח למשתמש: **מה נדחף, לאיזה ענף, ובאיזו גרסה.**

---

## אכיפה - שלוש שכבות

| שכבה | איפה | מה עושה |
|---|---|---|
| **הסקיל הזה** | `/ship` | הזרימה המלאה, bump ראשון |
| **PreToolUse hook** | `.claude/hooks/version-bump-reminder.mjs` | מזהה `git commit`/`git push` בלי bump ומזריק תזכורת מחייבת ל-Claude |
| **git pre-push hook** | [`.githooks/pre-push`](../../../.githooks/pre-push) | בדחיפה ל-main בלי bump: מבמפ, יוצר קומיט `chore(version): vX.Y.Z`, ו**עוצר את הדחיפה** (הרצה שנייה עוברת) |

**עקיפה חד-פעמית:** `SKIP_VERSION_BUMP=1 git push origin feature/i18n-bilingual:main`
(מדלג על שתי שכבות ההוקים).

> ה-pre-push עוצר את הדחיפה בכוונה: git מקבע את ה-SHA *לפני* שההוק רץ, ולכן
> קומיט שנוצר בתוך ההוק לא יכול להצטרף לאותה דחיפה.

---

## מלכודות

| מלכודת | מה קורה | פתרון |
|---|---|---|
| קימטת ואז בימפת | הגרסה בקומיט נפרד מהקוד | bump **לפני** `git add` |
| בימפת ולא הוספת את `src/version.ts` ל-`git add` | הדחיפה נעצרת ב-pre-push | `git add src/version.ts` באותו קומיט |
| `git add -A` בעץ משותף | קימטת עבודה של סוכן אחר באמצע | `git add` נקודתי, ו-`/worktree` |
| דחפת ל-main בלי bump | pre-push עצר - **זה תקין** | להריץ את הדחיפה שוב |
| מספר גרסה מקודד ב-JSX | מסכים מציגים גרסאות שונות | תמיד `import { APP_VERSION } from '.../version'` |

---

## קשור

- `/worktree` - worktree נפרד לכל סוכן (לפני שמקמטים)
- `/qa` - לפני "done"
- `/sync-docs` - סנכרון תיעוד אחרי batch שינויים
- CLAUDE.md §גרסת המערכת
