---
name: ui-adapt
description: התאמת כל רכיב UI חדש לתמת תצוגה (אור/שחור/כחול) ולסקייל גודל מסך (15.6"/16"/18"/24"). הפעל לפני/אחרי כל פיצ'ר או רכיב תצוגה חדש. דוגמה — /ui-adapt SignalBoard.
---

# UI Adapt — תמה + גודל מסך (חובה לכל רכיב חדש)

ב-SKY-KING **כל רכיב תצוגה** חייב להסתגל לשני צירים. לא "nice to have" — חלק מההגדרה של "done".

## 1. תמת תצוגה (אור/שחור/כחול)

המקור: `themeMode: 'light' | 'dark' | 'ocean'` ב-SectorDashboard (גם `lightMode = themeMode === 'light'`, ואובייקט `T`).
- **שחור (dark):** רקע כהה, טקסט בהיר.
- **אור (light) / כחול (ocean):** רקע בהיר, **טקסט שחור/כהה**.

### כללים
- אסור רקע/טקסט קשיחים (hardcoded) ברכיב — לגזור פלטה מ-`themeMode`.
- **צבעי סטטוס** (ירוק=פעיל, אדום=סגור/חריגה, כתום=עומס) **נשארים קבועים** בכל תמה — הם נושאים משמעות, ויש להם ניגודיות מספקת.
- רכיב שמקבל `themeMode` כ-prop (כמו `SignalBoard`) או יושב ב-scope של SectorDashboard (כמו פאנל המסלולים) — להעביר/לקרוא ולהשתמש.

תבנית:
```ts
const C = themeMode === 'dark'
  ? { panel:'#0f172a', border:'#334155', text:'#e2e8f0', off:'#1e293b' }
  : themeMode === 'ocean'
  ? { panel:'#d6e6f5', border:'#5b8cc0', text:'#0f172a', off:'#c2dbf0' }
  : { panel:'#f1f5f9', border:'#94a3b8', text:'#1e293b', off:'#e2e8f0' };
```

## 2. סקייל גודל מסך

המנגנון: `#root { zoom: var(--s) }`. המשתנה `--s` נקבע על `document.documentElement` לפי גודל המסך הנבחר (15.6/16/18/24) ב-`index.html`/login. **כל מה שיושב בתוך `#root` מתכווץ/גדל אוטומטית** — אין צורך לכפול scale ידני (`src/utils/scale.ts` היא identity בכוונה).

### מלכודת ה-Portal ⚠️
רכיב ש-`createPortal(..., document.body)` יושב **מחוץ ל-`#root`** ולכן **לא** מקבל את ה-zoom.
- אם פתרת בעיית stacking/transform עם portal ל-`body` — הוסף ידנית `style={{ zoom: 'var(--s)' as any }}` למיכל החיצוני.
- אם הרכיב נגרר (`position:fixed`): קואורדינטות `clientX/clientY` הן ב-px לא-מוגדל, אך `left/top` תחת `zoom` הן ב-יחידות מוגדלות → **חלק את הקואורדינטה ב-`--s`**:
```ts
const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
setPos({ x: e.clientX / s, y: e.clientY / s });
```

## Checklist לפני "done" של רכיב חדש
- [ ] עובד ונראה נכון ב-3 התמות (אור/שחור/כחול) — טקסט שחור באור/כחול
- [ ] אין צבעי רקע/טקסט קשיחים (פרט לצבעי סטטוס)
- [ ] מתכווץ/גדל לפי כל גדלי המסך
- [ ] אם portal ל-body → `zoom: var(--s)` + תיקון גרירה ל-`--s`
- [ ] z-index לפי השכבות: הודעות 9000 · דסק חופשי 9500 · מסלולים 8900

> דוגמאות חיות: `SignalBoard.tsx` (מקבל `themeMode`, יושב ב-#root) · פאנל "מסלולים בשימוש" ב-`SectorDashboard.tsx` (portal ל-body + `zoom:var(--s)` + גרירה מתוקנת).
