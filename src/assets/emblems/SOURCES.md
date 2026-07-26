# סמלי בסיסים + מיח"ה — מקורות ורישוי

הסמלים הורדו מ-Wikimedia Commons / ויקיפדיה העברית והוטמעו ברכיב `RotatingEmblems`.
המפתח ב-`emblems.tsx` הוא **שם הבסיס** (`aviation_bases.name`), כי עמודת `code` ריקה.

> ⚠️ **דיוק** — הסמלים אותרו לפי זיהוי הבסיס בוויקיפדיה. יש לאמת שכל סמל תואם
> לבסיס הנכון לפני שימוש מבצעי.

| קובץ | שם במערכת | בסיס | מקור | רישוי |
|------|-----------|------|------|-------|
| `ramat-david.png` | כנף 1 | רמת דוד | [בסיס רמת דוד](https://he.wikipedia.org/wiki/בסיס_רמת_דוד) | CC BY-SA 3.0 |
| `hatzor.png` | כנף 4 | חצור | [בסיס חצור](https://he.wikipedia.org/wiki/בסיס_חצור) | CC BY-SA 3.0 |
| `ramon.png` | כנף 25 | רמון | [בסיס רמון](https://he.wikipedia.org/wiki/בסיס_רמון) | ⚠️ **שימוש הוגן** (לא חופשי) |
| `hatzerim.png` | בחא 6 | חצרים | [בסיס חצרים](https://he.wikipedia.org/wiki/בסיס_חצרים) | CC BY-SA 3.0 |
| `tel-nof.png` | בחא 8 | תל נוף | [בסיס תל נוף](https://he.wikipedia.org/wiki/בסיס_תל_נוף) | CC BY-SA 3.0 |
| `ovda.png` | בחא 10 | עובדה | [בסיס עובדה](https://he.wikipedia.org/wiki/בסיס_עובדה) | CC BY-SA 3.0 |
| `nevatim.png` | בחא 28 | נבטים | [בסיס נבטים](https://he.wikipedia.org/wiki/בסיס_נבטים) | ⚠️ **שימוש הוגן** (לא חופשי) |
| `palmachim.png` | בחא 30 | פלמחים | [בסיס פלמחים](https://he.wikipedia.org/wiki/בסיס_פלמחים) | CC BY-SA 3.0 |
| `iaf-coat.svg` | — (מיח"ה) | חיל האוויר | [Coat of arms](https://commons.wikimedia.org/wiki/File:Israeli_Air_Force_-_Coat_of_arms.svg) | נחלת הכלל (PD) |

## הערות רישוי
- **CC BY-SA 3.0** (6 סמלים + הבסיסים): מחייב **ייחוס** (קרדיט למקור) ו-share-alike בהפצה מחדש. מקור: דובר צה"ל דרך Wikimedia Commons.
- **שימוש הוגן** (רמון, נבטים): מתארחים מקומית בוויקיפדיה העברית תחת "שימוש הוגן בסמלי צה"ל" — **לא** רישוי חופשי. להחלטת שימוש פנימי.
- **מיח"ה**: כרגע מוצג **סמל חה"א הכללי** (נחלת הכלל) כ-placeholder ל-slot של מיח"ה. אם יש את סמל מיח"ה הרשמי — החלף את `iaf-coat.svg`.

## החלפת סמל
1. הורד/החלף קובץ ב-`files/`.
2. עדכן את הייבוא + הרישום ב-`emblems.tsx` (לפי שם הבסיס המדויק כפי שמופיע ב-`aviation_bases.name`).
