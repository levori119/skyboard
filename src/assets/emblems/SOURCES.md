# סמלי בסיסים + מיח"ה - מקורות ורישוי

הסמלים הורדו מ-Wikimedia Commons / ויקיפדיה העברית והוטמעו ברכיב `RotatingEmblems`.
המפתח ב-`emblems.tsx` הוא **שם הבסיס** (`aviation_bases.name`), כי עמודת `code` ריקה.

> ⚠️ **דיוק** - הסמלים אותרו לפי זיהוי הבסיס בוויקיפדיה. יש לאמת שכל סמל תואם
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
| `506.webp` | 506 | יב"א 506 (הר מירון) | [יב"א 506](https://he.wikipedia.org/wiki/יב%22א_506) · [קובץ ב-Commons](https://commons.wikimedia.org/wiki/File:IAF_aerial_regional_control_unit_506.png) | CC BY-SA 3.0 |
| `509.webp` | 509 | יב"א 509 (הר אריכא) | [יב"א 509](https://he.wikipedia.org/wiki/יב%22א_509) · [קובץ בוויקיפדיה](https://he.wikipedia.org/wiki/קובץ:IAF_aerial_regional_control_unit_509.png) | CC BY-SA 3.0 |
| `micha.png` | - (מיח"ה) | מערך הבקרה האווירית (מיח"ה 517) | [IAF Air Control Command](https://he.wikipedia.org/wiki/קובץ:IAF_Air_Control_Command_517.png) | ויקיפדיה עברית |

## הערות רישוי
- **CC BY-SA 3.0** (8 סמלים + הבסיסים): מחייב **ייחוס** (קרדיט למקור) ו-share-alike בהפצה מחדש. מקור: דובר צה"ל דרך Wikimedia Commons.
- **שימוש הוגן** (רמון, נבטים): מתארחים מקומית בוויקיפדיה העברית תחת "שימוש הוגן בסמלי צה"ל" - **לא** רישוי חופשי. להחלטת שימוש פנימי.
- **מיח"ה**: סמל מערך הבקרה האווירית הרשמי (`micha.png`), מוצג בכל עמדה לצד סמל הבסיס.
- **יב"א 506 / 509**: ייחוס נדרש - "ויקיפדיה העברית, Yar, CC BY-SA 3.0" (שוחררו בשיתוף דובר צה"ל - ויקימדיה ישראל).

## פורמט הקבצים
רוב הסמלים הם PNG שקוף 330-500px. `506.webp`/`509.webp` הם **WebP** באיכות 0.9,
350px, אלפא שמור: הם צילומי סמל רקום עשירי-פרטים, וב-PNG הם שוקלים ~280KB כל אחד
לעומת ~50KB ב-WebP באותה רזולוציה. Vite מייבא `.webp` כ-asset ללא הגדרה נוספת.

## החלפת סמל
1. הורד/החלף קובץ ב-`files/` (רזולוציית מקור; לרסטור/המרה - Chromium דרך Playwright, כמו `scripts/build-icon.mjs`).
2. עדכן את הייבוא + הרישום ב-`emblems.tsx` (לפי שם הבסיס המדויק כפי שמופיע ב-`aviation_bases.name`).
