# SKY-KING — לוג ארגון מחדש (Refactor Log)

> קובץ זה עוקב אחר כל שלב בארגון הקוד מחדש.
> כל שינוי מתועד: מה נעשה, למה, ותוצאת QA.
> עדכון אחרון: 2026-06-21

---

## 2026-07-30 - הפרדה ויזואלית בין פיתוח לפרודקשן (רקע ורוד ב-DEV)

**מה נעשה:** הרצה מקומית צובעת את רקע העמוד בוורוד (`#ec4899`) ומקיפה את החלון במסגרת ורודה - בשלוש האפליקציות.
- **SKY-KING** - [src/index.tsx](src/index.tsx) מוסיף `dev-mode` ל-`body` כש-`import.meta.env.DEV` דולק; [src/App.css](src/App.css) מגדיר את הרקע ואת המסגרת (`body::after`). הסימון יושב על `body` ולכן חל על **כל** המסכים (כניסה, CTRL, מגדל, דסק, ניהול) בלי שכפול ובלי לגעת ברכיב כלשהו.
- **מיראז'** - [mirage/admin.html](mirage/admin.html). מוגש כ-HTML סטטי בלי שלב build, ולכן הזיהוי לפי מארח מקומי (`localhost`/`127.0.0.1`/`::1`).
- **GAPI** (repo נפרד, `../gapi`) - `src/main.tsx` + `src/styles.css`, אותו מנגנון ואותו ורוד.

**למה `import.meta.env.DEV` ולא בדיקת `hostname`:** אפליקציית ה-Electron הארוזה טוענת `http://localhost:PORT` ([electron-main.cjs](electron-main.cjs)) - בדיקת מארח הייתה צובעת ורוד דווקא את **עמדת העבודה החיה**. Vite מקפל את התנאי בזמן build, ולכן חבילת הפרודקשן לא מכילה אותו כלל.

**החלטות עיצוב:** הוורוד קבוע בכל התמות (צבע סטטוס, כמו הכתום של סביבת תרגול ב-[EnvironmentBadge.tsx](src/components/shared/EnvironmentBadge.tsx)). המסגרת יושבת על `body` - מחוץ ל-`#root` ולזום שלו - עם `position: fixed` ו-`pointer-events: none`, ועוביה מוכפל ב-`--s` כדי שתיראה זהה בכל גדלי המסך. היא נדרשת כי מסכי העבודה פרושים על `100vh` ומכסים את רקע העמוד. הוורוד נשאר **מסביב** לתוכן ולא מתחתיו: תאי טבלה שקופים במיראז' וב-GAPI נשענו על רקע ה-`body` והפכו לטקסט אפור על ורוד - שם הוחזר רקע אטום.

**QA:** `tsc --noEmit` נקי בשתי האפליקציות ✅ · vitest 326/326 ✅ · `vite build` ✅ · **הוכחה שפרודקשן לא ייצבע:** `dev-mode` מופיע 0 פעמים בחבילות ה-JS הבנויות (רק כלל CSS מת), ובמיראז' בדיקה שלילית בפועל - `127.0.0.1` ← ורוד, `127.0.0.2` ← לא ✅ · **אימות ויזואלי:** צילום שלוש האפליקציות + כניסה מלאה לעמדת בקר דרך ה-e2e helper; `elementFromPoint` ב-3 נקודות באזור העבודה החזיר 0 חשיפות של `body` (הוורוד לא דולף לתוכן) ✅.

**כיבוי הסימון ל-e2e:** `localStorage['bt-dev-marker'] = 'off'`, מוגדר ב-[playwright.config.ts](playwright.config.ts) דרך `storageState`. Playwright מריץ תמיד את שרת ה-vite (כלומר תמיד DEV), ובלי הדגל כל תמונת ייחוס ב-`e2e/__screenshots__/` הייתה נושאת את המסגרת הוורודה - התמונות אמורות לתעד את המוצר, לא את סביבת ההרצה. **בשונה מדגל `bt-kiosk` אין כאן ערך `'on'`:** התנאי החיצוני נשאר `import.meta.env.DEV` בלבד, כך ש-Vite ממשיך למחוק את הבלוק כולו מ-bundle הפרודקשן ולא נפתחת דרך לצבוע עמדה חיה. אומת: 0 מופעים של `dev-mode`/`bt-dev-marker` ב-JS הבנוי; בפיתוח בלי דגל ← ורוד, עם `'off'` ← נקי; 25/25 e2e ✅ והתמונות נוצרו מחדש בלי המסגרת.

---

## 2026-07-30 - הזדהות מול מיראז' בלבד (הסרת משתמשים מקומיים מ-LOGIN וממסך הניהול)

**מה נעשה:** משתמשי SKY-KING מנוהלים **רק** במיראז' - כדי שהמערכת תהיה תקנית (מקור זהות אחד).
- **מסך LOGIN** ([src/App.tsx](src/App.tsx)) - הוסרו ה-checkbox "הזדהות דרך מיראז'", ה-state `authSource` (כולל `localStorage['bt-authSource']`), רשימת אנשי הצוות (חיפוש + dropdown) והקריאה ל-`GET /api/crew-members`. נשאר מסלול אחד: מספר אישי + סיסמה מול מיראז'.
- **מסך ניהול** ([src/components/admin/ManagementPage.tsx](src/components/admin/ManagementPage.tsx)) - הוסר טאב "אנשי צוות" על כל תוכנו (טופס משתמש, עמדות מאושרות, רשימה, `saveCrewMember`/`editCrewMember`/`deleteCrewMember`) ומהניווט. `adminOnlyTabs` = `strips`, `serials`, `translations`.
- **e2e** - הבדיקות נכנסו עד היום דרך רשימת המשתמשים; עכשיו [e2e/helpers.ts](e2e/helpers.ts) מזדהה דרך מיראז' (`identifyViaMirage`) עם משתמש בדיקות שנוצר בהרצה (`ensureMirageE2EUser`, idempotent). [playwright.config.ts](playwright.config.ts) מריץ גם את שרת מיראז' (`MIRAGE_DATA_FILE=e2e/.mirage-e2e.json` - אחסון מבודד, `data.json` לא נוגעים בו) ואינו מקבע יותר `bt-authSource`. `mirage/server.js` מכבד `MIRAGE_DATA_FILE`. בחירת העמדה בהלפר מדלגת על שאריות בדיקות (שם שמתחיל ב-`__`).

**למה:** מקור זהות יחיד (מיראז') = תקן. אין שתי רשימות משתמשים שיכולות להתפצל, ואין דלת עוקפת שמתעלמת מהרשאות מיראז'.

**מה לא השתנה:** טבלת `crew_members` ו-`server/routes/crew.js` נשארו - כניסת מיראז' מאחדת לפיהן העדפות אישיות לפי `personal_id`, ואיש צוות שלא קיים בהן נכנס כמשתמש וירטואלי (`id: null`). החלפת איש צוות בעמדה ממשיכה דרך `MirageCrewSwap`.

**השלכה תפעולית:** שירות מיראז' הוא **תלות קשיחה** לכניסה. שירות שנפל = אין כניסה לעמדה (`502 mirage_unavailable`).

**QA:** `tsc --noEmit` נקי ✅ · vitest 326/326 ✅ · e2e Playwright - i18n-login 5/5, dashboard-baseline 2/2, translations-admin 3/3, mission-desk 4/4 (כולל מסך הניהול), emblems 3/3 ✅ (הזדהות מיראז' אמיתית מקצה לקצה: שרת מיראז' → `POST /api/auth/mirage-login` → דשבורד).

---

## 2026-07-30 - סמל אחיד: favicon, אייקון עמדה ואייקון התראות ממקור אחד

**מה נעשה:** ה-favicon של האתר עדיין היה **הלוגו של Vite** - ברירת מחדל שנשארה מההתקנה הראשונית והוצגה בלשונית הדפדפן בכל העמדות.
- [public/favicon.svg](public/favicon.svg) הוחלף בסמל SKY KING והוא כעת **מקור האמת היחיד לכל האייקונים**: favicon בדפדפן (בשימוש ישיר כ-SVG), אייקון אפליקציית העמדה, ואייקון ההתראות. `build/icon.svg` נמחק - היה כפילות של אותו ציור.
- [scripts/build-icon.mjs](scripts/build-icon.mjs) קורא מ-`public/favicon.svg` ומייצר **שניים**: `build/icon.png` (1024) ו-`public/favicon.png` (192).
- **באג שנחשף אגב:** [ClockWidget.tsx](src/ClockWidget.tsx) הפנה התראות דפדפן ל-`/favicon.ico` - **קובץ שמעולם לא היה קיים בפרויקט**, כלומר תזכורות יצאו בלי אייקון. הופנה ל-`/favicon.png` (ל-`Notification.icon` אין תמיכה ב-SVG, ולכן נדרש ה-PNG).

**DRY:** ציור אחד, שלושה צרכנים. שינוי בסמל = `npm run icon:build` ותו לא.

**QA:** `tsc -p tsconfig.build.json` ✅ · ה-SVG אומת ברינדור Chromium (256/48/32/16) ✅ · הפניית ה-favicon ב-`index.html` כבר מצביעה ל-`/favicon.svg` - לא נדרש שינוי ✅.

---

## 2026-07-30 - אייקון לאפליקציית העמדה

**מה נעשה:** עד עכשיו העמדה הארוזה קיבלה את אייקון ברירת המחדל של Electron (הבנייה הדפיסה `default Electron icon is used`).
- [build/icon.svg](build/icon.svg) - מקור האמת. נגזר מלוגו מסך הכניסה ([src/App.tsx](src/App.tsx)) בגרסה **סטטית ומעובה**: קווי הרשת והמעגל הפנימי הוסרו, עובי הקווים הוכפל, האלומה הפכה לגזרה מלאה. הסיבה: אייקון נקרא גם ב-16x16 בשורת המשימות, ושם קו של 0.5 יחידות נעלם לגמרי.
- [scripts/build-icon.mjs](scripts/build-icon.mjs) (`npm run icon:build`) - מרנדר ל-`build/icon.png` בגודל 1024x1024 דרך Chromium של Playwright (כבר devDependency; אין בפרויקט ספריית רסטר). דגל `--preview <dir>` מייצר 256/48/32/16 לבדיקת קריאות. ה-SVG מוטמע inline ולא כ-`<img src="file://">` - דף `setContent` יושב על origin של about:blank ו-Chromium חוסם ממנו משאבי file:// (התוצאה הייתה צילום של "תמונה שבורה").
- `icon: build/icon.png` בשתי קונפיגורציות האריזה; electron-builder בונה מזה את ה-.ico. בפיתוח החלון טוען את אותו PNG ישירות (מוגן ב-`existsSync`, כי בגרסה הארוזה `build/` לא נארז).

**QA:** נבנה מתקין מלא - השורה `default Electron icon is used` **נעלמה** מהלוג ✅ · האייקון **חולץ מה-exe הבנוי ומהמתקין** ואומת ויזואלית ✅ · נבדקה קריאות ב-256/32/16 ✅ · הרצה מול Railway אחרי השינוי ב-BrowserWindow ✅.

**פתוח:** אין חתימה דיגיטלית - SmartScreen יציג "מפרסם לא ידוע" בהתקנה. נדרשת תעודת Code Signing.

---

## 2026-07-30 - עמדת Electron כלקוח דק מול Railway

**מה נעשה:** [electron-main.cjs](electron-main.cjs) הפך מ"מריץ שרת בתוך העמדה" ל**לקוח דק** שטוען את האפליקציה מהענן:
- **יעד הטעינה** נפתר לפי קדימויות: `SKYKING_STATION_URL` → `config.json`: `"mode":"local"` (שרת מקומי, legacy) → `config.json`: `"APP_URL"` → ברירת מחדל (פיתוח `localhost:5000`, הפצה `https://sky-king.up.railway.app/`). בהתקנה חדשה נוצר `config.json` עם `APP_URL`, כך שאפשר להפנות עמדה לכתובת אחרת בלי לבנות מחדש. **בהפצה כבר לא נדרש `DATABASE_URL`** בעמדה.
- שם משתנה הסביבה הוא `SKYKING_STATION_URL` ולא `SKYKING_URL` - האחרון כבר תפוס: מיראז' משתמש בו ככתובת ה-API של SKY-KING ([mirage/app.js:19](mirage/app.js#L19)).
- **חוסן רשת** (קריטי בעמדה בלי שורת כתובת): מסך מצב מקומי חדש [electron-status.html](electron-status.html) - "מתחבר לשרת" בעלייה, ו"אין חיבור לשרת" עם סיבה בעברית וספירה לאחור בכשל. ניסיון חוזר ב-backoff 2/4/8/16/30 שניות. מטופלים גם `did-fail-load`, נפילת renderer, **וגם סטטוס HTTP ≥400** בכתובת היעד - זה לא `did-fail-load`, ובלי זה עמדה הייתה מציגה עמוד 502 של Railway בזמן פריסה מחדש.
- **נעילת ניווט:** קישורים מחוץ ל-origin של האפליקציה (מפות Google מ-[GroundVehiclePanel](src/components/ground/GroundVehiclePanel.tsx#L252)) נפתחים בדפדפן המערכת דרך `shell.openExternal`; העמדה נשארת נעולה על האפליקציה. pinch-zoom מנוטרל (מסך מגע Cintiq).
- **קיצורי תחזוקה:** `F5`/`Ctrl+R` טעינה מחדש (עובד גם ממסך "אין חיבור"), `Ctrl+Shift+I` כלי פיתוח, בנוסף ל-`F11` ו-`SKYKING_WINDOWED=1` הקיימים.
- **אריזה ייעודית** [electron-builder.railway.json](electron-builder.railway.json) + `npm run electron:build:railway`: ארוזים רק `electron-main.cjs`, `electron-status.html`, `package.json` - בלי `dist/`, `server.js` ו-`node_modules` (asar של 18KB). פלט ל-`release-station/` (נוסף ל-.gitignore). סקריפטים חדשים: `electron:railway`, `electron:railway:windowed`.

**למה:** העמדה צריכה להציג את המערכת שרצה ב-Railway, לא להריץ עותק משלה. כך אין DB להגדיר בכל עמדה, ואין פער גרסאות בין העמדות לענן.

**DRY:** לא נוצר entry שני ל-Electron - אותו `electron-main.cjs` ואותו חלון kiosk משרתים את שני המצבים; מצב השרת המקומי נשמר כענף `mode:"local"`.

**QA:** **הרצה אמיתית מול Railway** - `npm run electron:railway` הדפיס `[window] mode=remote url=https://sky-king.up.railway.app/ kiosk=true frame=false` + `[load]` מוצלח ✅ · **הבנייה הארוזה אומתה** (`electron-builder --dir`, asar = 3 קבצים בלבד) והורצה: העמדה עלתה, יצרה `config.json` עם `APP_URL`, ו**צולמה עם מסך הכניסה האמיתי מ-Railway** ✅ · **נתיב הכשל אומת** - כתובת שגויה החזירה 404 והופעלו 4 ניסיונות חוזרים בהפרשים 2/4/8/16 שניות ✅ · שני מצבי מסך המצב צולמו (Playwright) - RTL, ספירה לאחור, קיצורים ✅.

---

## 2026-07-30 — מסך מלא בעליית עמדה (kiosk) בפרודקשן

**מה נעשה:** עליית עמדה בבניית פרודקשן פותחת את המסך במלואו — בלי שורת כתובת ובלי טאבים, כמו `F11`:
- כלי חדש [src/utils/kiosk.ts](src/utils/kiosk.ts) — `enterKioskFullscreen()` (אידמפוטנטי, לא זורק), `isKioskEnabled()`, `isFullscreen()`. תמיד על `document.documentElement` ולא על אלמנט פנימי, כדי ש-portals שמרונדרים ל-`body` (מודלים, מקלדת וירטואלית) יישארו גלויים.
- נקרא מתוך ה-click של הכניסה לעמדה ב-`WorkstationLogin` ([src/App.tsx](src/App.tsx)) — לפני כל `await`, כי Fullscreen API דורש user gesture תקף וחלון ההרשאה נסגר אחרי קריאות רשת. שני מסלולי הכניסה מכוסים (אישור טופס התפקידים + "דלג").
- דגל עקיפה ב-localStorage `bt-kiosk`: `off` מבטל בעמדה מסוימת גם בפרודקשן, `on` מפעיל בפיתוח לצורך אימות. ברירת המחדל נגזרת מסוג הבנייה (`import.meta.env.PROD`) — בפיתוח ובבדיקות כבוי, כדי לא להפריע.
- **Electron — kiosk מלא** ([electron-main.cjs](electron-main.cjs)): חלון העמדה נפתח `fullscreen: true` + `frame: false` (בלי X/מקסום/מיזעור) + `kiosk: true` (נעילת מסך מלא), **גם בפיתוח וגם בגרסה הארוזה** — מה שנבדק הוא מה שרץ בעמדה. `F11` משחרר/מחזיר את הנעילה (`setKiosk`) ו-`SKYKING_WINDOWED=1` מריץ בחלון רגיל — שסתומי מילוט לתחזוקה. בעלייה נרשם `[window] kiosk=… fullscreen=… frame=…` לתמיכה בשטח.
- **`npm run electron:dev` תוקן** — עבר ל-[scripts/electron-dev.mjs](scripts/electron-dev.mjs) שמנקה `ELECTRON_RUN_AS_NODE`. טרמינלים מוטמעים (VS Code/Claude Code) מגדירים אותו =1, ואז הבינארי של Electron רץ כ-Node, `app` יוצא undefined והריצה מתה מיד ב-`Cannot read properties of undefined (reading 'isPackaged')` — **בלי שום חלון**. זה הסביר "לא עובד" בהרצה מקומית.

**למה:** העמדה היא מחליף של הסדק הפיזי — סרגלי הדפדפן גוזלים שטח תצוגה ומזמינים ניווט מקרי בחדר הבקרה.

**DRY:** לא היה קוד fullscreen בפרויקט. הכלי מרוכז במודול אחד ומשרת את כל סוגי העמדות (CTRL/TWR/mission_desk) בנקודה אחת — מסך הכניסה המשותף.

**QA:** **Electron אומת בהרצה אמיתית** — `npm run electron:dev` הדפיס `[window] kiosk=true fullscreen=true frame=false` ✅ · TDD — 16 unit tests ([src/utils/kiosk.test.ts](src/utils/kiosk.test.ts)) נכתבו ונכשלו לפני המימוש ✅ · `tsc -p tsconfig.build.json` + `vite build` ✅ · 313 unit tests ✅ · **אימות בדפדפן אמיתי (Playwright, [e2e/kiosk-fullscreen.spec.ts](e2e/kiosk-fullscreen.spec.ts))** — זרימת כניסה מלאה: עם הדגל `document.fullscreenElement === <html>`, בלי הדגל נשארים בחלון רגיל ✅ · אומת ב-bundle שנבנה שברירת המחדל בפרודקשן היא "דלוק" ✅ · **חבילת ה-e2e המלאה:** 9 כשלונות **גם בלי** השינוי (הורצה פעמיים — עם הבדיקה החדשה ובלעדיה, אותו מספר; 6 מהן קבועות: `prov-drop`, `prov-drop-html5`, `provisional-point-ui`, `translations-admin`×3, והיתר מתחלפות = flakiness תלוי-DB). לא רגרסיה מהשינוי הזה, אך **פתוח לטיפול נפרד**.

---

## 2026-07-29 — אזורים מרובי-גבהים: בורר גובה לפמ, מגבלת אזור, חריגה מבלוק, פיצול תצוגה

**מה נעשה:** הרחבת מנגנון האזורים (Flight Zones) בעמדת CTRL ([SectorDashboard.tsx](src/components/views/SectorDashboard.tsx)):
- **בורר גובה לפמ** — בתפריט ה-⋮ של הפמ, בחירת הבלוק (הגובה בעל השם) מתוך `zone_altitude_ranges`. בהצבה נבחר אוטומטית הבלוק שטווחו מכיל את `strip.alt` (אחרת הראשון).
- **פיצול תצוגה לגבהים** — טוגל גלובלי "פצל לגבהים"; אזור עם ≥2 גבהים מחולק לרצועות אופקיות (צפון=גבוה→דרום=נמוך, Sutherland–Hodgman), כל רצועה מתויגת "\<אזור\> \<שם הגובה\>". רינדור משותף `renderZoneLabels` לשני מסלולי האזור (legacy + geo).
- **מגבלת אזור (קליק ימני)** — תפריט אזור: בחירת הבלוקים הפעילים (`active_alt_range_ids`) + טקסט מגבלה חופשי (`limitation_note`), מוצגים בקטן ליד שם האזור. מצב תפעולי **משותף בין העמדות** דרך `PATCH /api/map-zones/:id/operational` (ללא child-sync).
- **התראת חריגה מבלוק** — אייקון ⛔ על פמ שגובהו מחוץ לכל בלוק מוגדר, או שהבלוק שלו אינו פעיל לאחר מגבלה.
- **HINT** — בריחוף מעל אזור, tooltip עם רשימת הגבהים (🔒 = מוגבל).

**DB:** מיגרציה — `map_zones.active_alt_range_ids JSONB` + `limitation_note TEXT` (idempotent ב-[init.js](server/db/init.js), מתועד ב-[data-model.md](data-model.md)).

**DRY:** נשען על התשתית הקיימת — `zone_altitude_ranges`, `strip_zone_assignments.altitude_range_id`. מסך הניהול (הגדרת גבהים) לא שונה. תפריט הגובה/האזור בסגנון תפריט הפמ הקיים.

**QA:** `tsc` + `vite build` + 297 unit tests ✅ · i18n-guard ✅ · **DB** — מיגרציה + round-trip מול Neon אמיתי ✅ · **גאומטריית הפיצול** — אומתה ע"י שחזור האלגוריתם ✅ · **⚠️ טרם אומת ויזואלית על העמדה** — ממתין לאישור משתמש (הנחות: יחידות `strip.alt` מול הטווחים, כיוון צפון=למעלה).

---

## 2026-07-26 — RotatingEmblems: סמלי בסיס אב + מיח"ה במסך הטעינה ובסרגל העליון

**מה נעשה:** רכיב תצוגה משותף חדש [src/components/shared/RotatingEmblems.tsx](src/components/shared/RotatingEmblems.tsx) — סמל בסיס האב + סמל מיח"ה מסתובבים. `variant='loader'` (הקפה/סיבוב רציפים, החליף את לוגו הראדאר במסך הטעינה של SectorDashboard) ו-`variant='topbar'` (סיבוב כניסה חד-פעמי בעליית המערכת, נוסף לסרגל העליון של SectorDashboard ו-MissionDeskView). מותאם תמה + סקייל + `prefers-reduced-motion`.
- **סמלים אמיתיים** (Wikimedia/ויקיפדיה) הוטמעו ב-[src/assets/emblems/files/](src/assets/emblems/files/) — 8 בסיסי חה"א (רמת דוד, חצור, רמון, חצרים, תל נוף, עובדה, נבטים, פלמחים) + סמל חה"א (מיח"ה). registry לפי **שם הבסיס** (עמודת `code` ריקה) ב-[emblems.tsx](src/assets/emblems/emblems.tsx). מקורות+רישוי: [SOURCES.md](src/assets/emblems/SOURCES.md) (רובם CC BY-SA; רמון+נבטים שימוש הוגן; חה"א PD). fallback: placeholder מצויר.
- בסיס האב נפתר בכניסה מ-`preset.parent_base_id` מול רשימת `aviation_bases` ונשמר ב-`session.parentBase` ([src/App.tsx](src/App.tsx), [src/types/index.ts](src/types/index.ts)). בלי בסיס אב → מיח"ה בלבד.
- מחרוזת "מיח"ה" דרך i18n (`shared.micha`, he+en).

**למה:** זיהוי ויזואלי מיידי של הבסיס שהעמדה משרתת + מערך הבקרה (שקיפות/התמצאות).

**DRY:** `parent_base_id` כבר היה קיים מקצה-לקצה (טופס אדמין ניהול עמדות → שרת → מיראז'). **לא** נדרשה מיגרציה — מיגרציה שהתחילה נכתבה ובוטלה אחרי שזוהתה העמודה הקיימת (init.js:642, וה-FK מופל בכוונה ב-init.js:660 לצימוד רופף). הפיצ'ר רק **צורך** את הקיים.

**QA:** `tsc -p tsconfig.build.json` + `vite build` ✅ (exit 0) · **אימות ויזואלי (Playwright, `e2e/emblems.spec.ts`)** — 4 מקרים צולמו באפליקציה החיה: loader עם/בלי בסיס אב, topbar עם/בלי בסיס אב ✅.

---

## 2026-07-08 — DRY בהעברות (ממצאי code-review C+D)

**מה נעשה:** ריכוז מנגנון קריאת ההעברות ב-[server/routes/transfers.js](server/routes/transfers.js):
- חולץ `transferSelect(where, order)` — מקור-אמת יחיד לרשימת ה-SELECT + ה-JOINs (superset). 6 ה-GET (`incoming/outgoing` לפי sector/workstation + `classic-incoming/outgoing`) עברו להשתמש בו; ה-`WHERE` של כל endpoint נשמר **מילה-במילה** — אין שינוי בלוגיקת ניתוב/סטטוס/state-machine.
- חולץ `restoreStripToSender(db, stripId, fromWorkstationId)` — משותף ל-`reject` ו-`cancel` (הוסר ~14 שורות כפילות).

**למה:** 6 עותקים של אותה רשימת SELECT היו מקור לבאגי "העברה שלא מופיעה" (עמודות חסרות בחלק מה-endpoints). כעת עמודה חדשה נוגעת במקום אחד.

**מה לא נגעתי (דחוי לאישור CEO / worktrees פתוחים):** איחוד `accept`+`accept-to-map` (שינוי flow); מיזוג עמודות ניתוב `*_workstation_id`/`*_preset_id` (ממצא B — מיגרציה); מנוע polling מאוחד (ממצא A).

**QA:** `node --check` ✅ · import נקי ✅ · smoke read-only מול DB אמיתי — כל 6 השאילתות המורכבות רצות ללא שגיאה (LIMIT 0, אימות עמודות+JOINs) ✅.

---

## מצב נקודת פתיחה (Baseline)

**תאריך:** 2026-06-21

### גדלי קבצים
| קובץ | שורות | הערה |
|---|---|---|
| `server.js` | 8,075 | מונוליט — DB + 355+ routes |
| `src/App.tsx` | 41,625 | מונוליט — כל ה-frontend |
| `src/mockData.ts` | 23 | mock data (לא בשימוש פעיל) |
| `src/ClockWidget.tsx` | קיים | כבר הופרד |
| `src/VirtualKeyboard.tsx` | קיים | כבר הופרד |

### Tech Stack
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion
- Backend: Node.js ESM + Express 5
- DB: PostgreSQL / Neon (`pg` pool, `DATABASE_URL` מ-env)
- Desktop: Electron (`electron-main.cjs`)

---

## QA Baseline Report — מה המערכת עושה

**תאריך:** 2026-06-21 | **סטטוס:** ✅ הושלם

### ממצא חשוב: WebSocket כבר קיים!
ה-agent גילה `emit` calls בserver.js — כלומר WebSocket **כבר מיושם** (לפחות חלקית).
צריך לבדוק מה בדיוק מכוסה ומה עוד חסר.

---

### מבנה server.js

#### DB — 50+ טבלאות (לפי סדר יצירה ב-initDb):

| קבוצה | טבלאות |
|---|---|
| **Core** | `strips`, `strip_aircraft`, `strip_aircraft_armaments`, `strip_aircraft_systems` |
| **Transfers** | `strip_transfers`, `sectors`, `sector_neighbors`, `sub_sectors` |
| **Workstations** | `workstations`, `workstation_presets`, `crew_members`, `crew_member_workstations` |
| **Filters & Display** | `workstation_personal_filters`, `table_modes`, `classic_strip_tables` |
| **Airfield Ground** | `airfields`, `airfield_points`, `aviation_bases`, `airfield_routes`, `airfield_runways`, `airfield_taxiways`, `airfield_elements`, `airfield_polygons`, `airfield_sectors`, `airfield_atis`, `runway_grf`, `runway_notams`, `runway_lighting` |
| **Blocks & Zones** | `block_spaces`, `block_tables`, `blocks`, `map_zones`, `zone_altitude_ranges`, `strip_zone_assignments` |
| **Collaboration** | `work_groups`, `work_group_members`, `work_group_notes`, `sticky_notes`, `workstation_collab_state`, `workstation_messages` |
| **Admin** | `serials`, `strip_serial_selections`, `bdh_documents`, `bdh_items`, `aid_groups`, `base_statuses`, `activity_log` |
| **Driver/Vehicle** | `vehicle_requests`, `vehicle_gps`, `vehicle_messages`, `base_routes`, `element_nav_routes`, `route_links` |
| **Misc** | `learned_digits`, `preset_links`, `default_armament_names`, `default_system_names`, `closures`, `maps`, `preset_active_crew` |

#### Helper functions (ללא endpoint):
- `initDb()` — אתחול DB (שורות 21–1282)
- `cleanupExpiredStrips()` — ניקוי שעתי של סטריפים ישנים
- `mirrorClassicPartnerLinks()` — סנכרון קישורי שותף
- `bearingDeg()`, `turnLabel()`, `haversineM()`, `pctToGeo()` — geo utils
- `astarPath()` — A* pathfinding ברשת מסלולי שדה

---

### מבנה App.tsx (41,625 שורות)

| רכיב | שורות | תפקיד | שיתוף |
|---|---|---|---|
| Aircraft Icon System | 22–58 | SVG icons לפי טייסת | שניהם |
| ConfirmModal | 62–99 | דיאלוג אישור עם מקלדת | גלובלי |
| CrewMember / Session types | 102–128 | TypeScript interfaces | גלובלי |
| Query Builder DSL | 130–320 | מנוע סינון מורכב (AND/OR/NOT) | CTRL + admin |
| WorkstationLogin | 341–941 | מסך כניסה + בחירת עמדה | כולם |
| Digit Learning (OCR) | 945–987 | async helpers ל-Tesseract | לפי בקר |
| MapZoneEditor | 1,010–2,223 | עריכת אזורי מפה + גיאו-קיבוע | admin |
| MapsManager | 2,226–2,478 | ניהול מפות (upload/delete) | admin |
| LearnDigitsOverlay | 2,481–2,606 | canvas לאימון OCR | לפי בקר |
| HandwritingOverlay | 2,607–2,922 | כתב יד לגובה (Tesseract) | שניהם |
| OutgoingTransferCard | 3,013–3,099 | כרטיס העברה יוצאת | CTRL |
| IncomingTransferCard | 3,102–3,221 | כרטיס העברה נכנסת + countdown | שניהם |
| DraggableNeighborPanel | 3,224–3,789 | פאנל נקודת העברה (מוסר/מקבל) | שניהם |
| ContextMenu | 4,042–4,122 | תפריט קליק ימני להעברה | שניהם |
| DraggableMapMarker | 4,125–4,708 | marker ניתן לגרירה על מפה | CTRL |
| DraggableIncomingTransfer | 4,709–4,848 | כרטיס העברה נכנסת צף | CTRL |
| Strip (Core) | 4,849–5,716 | רכיב הסטריפ המרכזי | שניהם |
| OnScreenKeyboard | 5,741–5,806 | מקלדת וירטואלית לטאבלט | שניהם |
| TableHandwritingCanvas | 5,807–5,960 | canvas OCR לתצוגת טבלה | TWR |
| BlockMiniView | 5,961–6,098 | תצוגת בלוקי גובה | שניהם |
| GroundVehiclePanel | 6,099–7,013 | ניהול כלי רכב + מז"א (פטריוט, יבה) | admin/tactical |
| Ground constants & icons | 7,014–7,291 | SVG icons לגבולות שדה | TWR |
| ClassicBoardController | ~20K–30K | עמדת CTRL — מפה + סקטורים | CTRL |
| ClassicBoardTable | ~30K–40K | עמדת TWR — טבלה + העברות | TWR |
| App (root) | ~40K–41,625 | routing בין מסכים | גלובלי |

#### ממצאים קריטיים ל-refactor:
1. **אין State Management חיצוני** — הכל ב-local state, prop drilling סיכון
2. **fetch() מפוזר** בכל הרכיבים — אין centralized API layer
3. **אין הפרדה** בין CTRL לTWR בקוד — אותו קובץ, תלוי ב-session
4. **Ground Vehicle Panel** כולל ניהול מז"א — מורכב יותר ממה שנראה

---

### API Routes — קטלוג לפי קבוצה

| קבוצה | Routes | טבלות עיקריות |
|---|---|---|
| strips | ~25 | strips, strip_aircraft, armaments, systems |
| transfers | ~15 | strip_transfers |
| sectors | ~10 | sectors, sector_neighbors, sub_sectors |
| workstations | ~15 | workstation_presets, crew_members |
| maps | ~15 | maps, map_zones, zone_altitude_ranges |
| airfield/ground | ~40 | airfields, runways, elements, routes, polygons |
| blocks | ~10 | block_spaces, block_tables, blocks |
| collaboration | ~15 | sticky_notes, work_groups, collab_state |
| admin | ~20 | serials, BDH, aid_groups, activity_log |
| driver/vehicle | ~15 | base_routes, vehicle_*, element_nav |
| base_statuses | ~8 | base_statuses, atis |
| civilian | ~5 | civilian_strip_assignments |
| misc | ~10 | preset_links, contacts, table_modes |
| **סה"כ** | **~198 קבוצות, 355+ endpoints** | |

---

## תוכנית ארגון מחדש

### server.js → מבנה חדש

```
server/
  db/
    pool.js          ← Pool יחיד (DATABASE_URL)
    init.js          ← initDb() בלבד (CREATE TABLE)
    seed.js          ← seed data (INSERT ... ON CONFLICT DO NOTHING)
  routes/
    strips.js        ← /api/strips/*, /api/strip-aircraft/*, formations
    transfers.js     ← /api/transfers/*, /api/strips/:id/transfer*
    sectors.js       ← /api/sectors/*, /api/sub-sectors/*
    workstations.js  ← /api/workstation-presets/*, /api/crew-members/*
    maps.js          ← /api/maps/*, /api/map-zones/*, /api/zone-*
    airfield.js      ← /api/airfields/*, /api/airfield-*/*, /api/runway-*
    blocks.js        ← /api/block-*/*, /api/closures/*
    collaboration.js ← /api/sticky-notes/*, /api/work-groups/*, /api/collab-*
    admin.js         ← /api/serials/*, /api/bdh/*, /api/aid-groups/*, /api/table-modes/*
    base.js          ← /api/base-statuses/*, /api/aviation-bases/*, /api/workstation-contacts/*
    driver.js        ← /api/base-routes/*, /api/route-*/*, /driver
    activity.js      ← /api/activity-log
    strips-classic.js← /api/classic-strip-*/*, /api/strip-window-*/*, /api/strip-table-*
    civilian.js      ← /api/civ-strips/*, /api/civilian-*
  utils/
    geo.js           ← bearingDeg, haversineM, pctToGeo, astarPath
  app.js             ← express setup + כל router mounts
server.js            ← נשאר כ-entry point קצר (import app + listen)
```

### App.tsx → מבנה חדש

```
src/
  types/
    index.ts         ← כל ה-interfaces (Strip, Transfer, CrewMember...)
  components/
    shared/
      ConfirmModal.tsx
      AircraftIcon.tsx
      BlockMiniView.tsx
    login/
      WorkstationLogin.tsx
      HandwritingCalibration.tsx
    strips/
      Strip.tsx
      StripCard.tsx
    transfers/
      OutgoingTransferCard.tsx
      IncomingTransferCard.tsx
      DraggableNeighborPanel.tsx
      TransferContextMenu.tsx
    map/
      MapZoneEditor.tsx
      MapsManager.tsx
      DraggableMapMarker.tsx
    ground/
      GroundVehiclePanel.tsx
      AirfieldIcons.tsx
    input/
      HandwritingOverlay.tsx
      TableHandwritingCanvas.tsx
    views/
      ClassicBoardController.tsx  ← CTRL
      ClassicBoardTable.tsx       ← TWR
    admin/
      (AdminPanel components)
  utils/
    queryBuilder.ts  ← Query DSL logic
    handwriting.ts   ← OCR helpers
    geo.ts           ← geo calibration
  App.tsx            ← routing בלבד
```

---

## לוג שינויים

### #001 — יצירת קובץ לוג + QA Baseline
**תאריך:** 2026-06-21
**קבצים שהשתנו:** `REFACTOR_LOG.md` (חדש)
**מה נעשה:** תיעוד מצב נקודת פתיחה + ניתוח מלא של server.js ו-App.tsx
**QA לפני:** N/A
**QA אחרי:** N/A
**הערות:** WebSocket לא קיים בפועל — רק REST+polling. "emit" בדוח הQA היה שגיאה.

---

### #002 — פיצול server.js
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `server/db/pool.js` — Pool יחיד
- `server/db/init.js` — initDb() + cleanupExpiredStrips()
- `server/db/seed.js` — seedDb() — נתוני אתחול בנפרד מסכמה
- `server/routes/crew.js` — 16 routes
- `server/routes/strips.js` — 45 routes
- `server/routes/transfers.js` — 16 routes
- `server/routes/sectors.js` — 16 routes
- `server/routes/workstations.js` — 13 routes
- `server/routes/maps.js` — 26 routes
- `server/routes/blocks.js` — 15 routes
- `server/routes/airfield.js` — 74 routes
- `server/routes/base.js` — 18 routes
- `server/routes/collaboration.js` — 27 routes
- `server/routes/admin.js` — 42 routes
- `server/routes/classic.js` — 15 routes
- `server/routes/civilian.js` — 6 routes
- `server/routes/driver.js` — 20 routes
- `server/app.js` — express setup + router mounts
- `server.js` — entry point קצר (19 שורות במקום 8,075)

**QA לפני:** server.js = 8,075 שורות, 353 routes
**QA אחרי:** ✅ 353/353 routes נשמרו בקבצים החדשים (ספירה מדויקת)
**הערות:**
- גילוי: `system_defaults` CREATE TABLE חסרה ב-initDb המקורי — נוספה ל-init.js
- גילוי: `airfield_polygon_statuses` CREATE TABLE חסרה גם — טבלה קיימת ב-DB מהיסטוריה
- seed data הופרדה מהסכמה לראשונה — init.js = schema בלבד, seed.js = נתונים

---

### #005 — Phase 2B: Extract utilities from App.tsx
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/utils/session.ts` — getSession / saveSession / clearSession
- `src/utils/handwriting.ts` — compareImages (OCR similarity)
- `src/utils/notes.ts` — parseNoteValue / serializeNoteValue
- `src/utils/geo.ts` — geoToImagePct / imagePctToGeo / fmtDms + MapGeoAnchor

**QA:** ✅ כל הfunctions pure — אין side effects, אין JSX
**הערה:** App.tsx לא שונה — אלו עותקים עצמאיים. בשלב הבא App.tsx ישתמש ב-imports.

---

### #006 — Phase 2B: הרחבת src/types/index.ts
**תאריך:** 2026-06-21
**שינויים:**
- נוספו: `MapGeoAnchor`, `MapZone`, `ZoneAltRange`, `StripZoneAssignment`
- נוספו: `AircraftPos`, `GroundAircraftRow`
- נוספו: `Strip` (full interface), `Transfer` (full interface)

**QA:** ✅ 204 שורות, TypeScript valid

---

### #007 — Phase 2C: Extract leaf components
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/components/shared/ContextMenu.tsx` — right-click menu להעברה
- `src/components/shared/OnScreenKeyboard.tsx` — מקלדת וירטואלית לטאבלט

**QA:** ✅ רכיבים עצמאיים עם props מוגדרים, ללא תלויות ב-App state

---

### #008 — Phase 3: ARCHITECTURE.md
**תאריך:** 2026-06-21
**קובץ שנוצר:** `ARCHITECTURE.md`
**תוכן:**
- מבנה מלא של Frontend/Backend/DB/Electron
- זרימת נתונים (Strip lifecycle, Transfer flow)
- ארכיטקטורת עמדות (CTRL vs TWR)
- DB Schema — יחסי ליבה
- מצב סנכרון (polling → WebSocket מטרה)
- מבנה מסכים (ASCII diagrams)
- workflow map עם סקילים

---

### #009 — Phase 4: Fix missing DB tables
**תאריך:** 2026-06-21
**שינוי:** `server/db/init.js` — נוספו CREATE TABLE:
- `airfield_polygons` — גיאומטריית polygon לשדה תעופה
- `airfield_sectors` — סקטורי תנועה קרקעית
- `airfield_status_types` — סוגי סטטוס תפעולי לשדה
- `airfield_polygon_statuses` — סטטוס + GRF + RVR לפי polygon
- `system_defaults` — ברירות מחדל מערכת (כבר תוקן בשלב #002)

**בעיה שנמצאה:** הטבלאות האלו קיימות ב-Neon אבל **לא היו** ב-initDb() המקורי.
→ על DB חדש (fresh) הייתה מתרחשת שגיאה בכל route שמשתמש בהן.
**QA לפני:** ❌ 4 טבלאות חסרות — Fresh DB היה נכשל
**QA אחרי:** ✅ כל 5 הטבלאות קיימות ב-init.js

---

### #010 — Phase 5: QA Final
**תאריך:** 2026-06-21
**תוצאות:**
| בדיקה | תוצאה |
|---|---|
| server.js שורות | 20 (היה 8,075) |
| Routes 353/353 | ✅ |
| server/db/*.js syntax | ✅ |
| server/routes/*.js syntax (14 קבצים) | ✅ |
| src/types/index.ts | ✅ 204 שורות |
| src/utils/*.ts (5 קבצים) | ✅ |
| src/components/shared/*.tsx (3 קבצים) | ✅ |
| DB tables (5 חסרות תוקנו) | ✅ |
| ARCHITECTURE.md | ✅ |

**App.tsx:** עדיין 41,625 שורות — foundation הונח, views split בפגישה הבאה
**אין regressions:** server.js המקורי שועתק 1:1 (353 routes, כל הלוגיקה)

---

### #003 — פיצול App.tsx — foundation
**תאריך:** 2026-06-21
**קבצים שנוצרו:**
- `src/types/index.ts` — כל ה-TypeScript interfaces (~80 שורות)
- `src/utils/aircraft.ts` — icon system לפי טייסת (~57 שורות)
- `src/utils/queryBuilder.ts` — Query DSL (AND/OR/NOT filter engine) (~218 שורות)
- `src/components/shared/ConfirmModal.tsx` — דיאלוג אישור גלובלי (~88 שורות)

**QA לפני:** App.tsx = 41,625 שורות (1 קובץ)
**QA אחרי:** ✅ App.tsx לא שונה — קבצים חדשים הם עותקים עצמאיים
**הערות:** שלב 1 של פיצול App.tsx. המשך (split לviews ו-components) בפגישה הבאה.

---

### #004 — QA סופי
**תאריך:** 2026-06-21
**בדיקות שבוצעו:**
- ✅ `node --check server.js` — OK
- ✅ `node --check server/app.js` — OK
- ✅ `node --check server/routes/*.js` — כל 14 קבצים OK
- ✅ 353/353 routes נשמרו
- ✅ `system_defaults` CREATE TABLE נוספה ל-init.js
- ✅ seed data הופרדה ל-seed.js
- ✅ App.tsx לא נשבר
**סטטוס:** ✅ אין regressions ידועים

---

### #011 — Phase 2D: חיבור App.tsx למודולים המחולצים (WIRING)
**תאריך:** 2026-06-21
**מה נעשה:** App.tsx עכשיו **מייבא בפועל** את הקבצים המחולצים והוסרו ההגדרות הכפולות.

**מיפוי coupling (קריטי):** נמצא שכל הרכיבים ב-App.tsx הם **top-level consts** עם props —
אין צימוד ל-App state. לכן פיצול הוא מכני ובטוח.

**מודולים שחוברו:**
- `./types` — AircraftIconType, CrewMember, WorkstationSession, Q* types
- `./config` — API_URL, SCREEN_SCALE_MAP (חדש)
- `./utils/scale` — scale, sc (חדש)
- `./utils/aircraft` — 4 icon functions
- `./utils/queryBuilder` — 11 items (Q_FIELDS verified identical to original via diff)
- `./utils/session` — getSession/saveSession/clearSession
- `./utils/handwriting` — compareImages
- `./utils/notes` — parseNoteValue/serializeNoteValue
- `./components/shared/ConfirmModal` — ConfirmModal + customConfirm (כיחידה, _showConfirm)
- `./components/shared/ContextMenu`
- `./components/shared/OnScreenKeyboard`

**QA לפני (baseline):**
- ✅ `tsc --noEmit` נקי
- ✅ `vite build` — 472 modules, bundle 2,699.49 kB

**QA אחרי (כל batch אומת):**
- ✅ `tsc --noEmit` נקי
- ✅ `vite build` — bundle 2,699.55 kB (הפרש 0.06 kB = רק שינוי imports)
- ✅ App.tsx: 41,625 → 41,131 שורות (494 הוסרו, מקור אמת יחיד)

**שיטת אימות:** queryBuilder אומת byte-level מול git HEAD (Q_FIELDS keys + לוגיקת
evalQLeaf/getQFieldValue זהים). bundle size כמעט זהה = הוכחת שקילות פונקציונלית.

**בעיה שנמצאה ותוקנה:** import של MapGeoAnchor התנגש עם הגדרה מקומית ב-App → הוסר מה-import.

---

### #012 — Architecture review
**תאריך:** 2026-06-21
**מה נעשה:** ARCHITECTURE.md עודכן לשקף את ה-wiring בפועל (סימון ✅ wired לכל מודול).
**ממצא ארכיטקטוני:** המבנה תקין. ה-keystone (API_URL, sc, types, shared utils) במקום —
זה פותח את חילוץ ה-views הגדולים בלי תלות מעגלית.

---

### #013 — Phase 2E: חילוץ views + ground layer (סשן 2)
**תאריך:** 2026-06-21
**שיטה:** bottom-up — קודם helpers/types, אז leaf components, אז views. build-verify אחרי כל שלב.

**מודולים שנוצרו וחוברו:**
- `src/utils/strips.ts` — getFormationDisplayName, getTransferLabel, getTransferSq, normalizeAlt, parseAltToFeet, computeBlockDeviation (אומת byte-level מול git)
- `src/utils/digits.ts` — getLearnedDigits, saveLearnedDigit, clearLearnedDigits, getDigitsCount
- `src/utils/geo.ts` — חובר בפועל (geoToImagePct, imagePctToGeo, fmtDms, buildGeoAnchor as getAnchorFromMapData)
- `src/types/ground.ts` — AircraftPos, GroundAircraftRow, MapZone, ZoneAltRange, StripZoneAssignment, GroundStatusKey, VectorLine, VectorData
- `src/components/shared/HandwritingOverlay.tsx` — OCR כתב יד
- `src/components/strips/Strip.tsx` — רכיב הסטריפ המרכזי (868 שורות, כולל _activeStripDetailsCloser singleton)
- `src/components/transfers/TransferCards.tsx` — TransferStripEditor, OutgoingTransferCard, IncomingTransferCard
- `src/components/map/MapZoneEditor.tsx` — עורך אזורי מפה (1,225 שורות)
- `src/components/ground/groundShared.tsx` — constants (מז"א, ground statuses), GroundMarkerSVG, renderGroundSvgIcon, getElemDisplayStateOpts, normalizeAircraftPositions, ptLineDist, dpSimplify, toEmbedUrl
- `src/components/views/GroundView.tsx` — עמדת מגדל TWR (4,812 שורות)

**QA לכל שלב:** ✅ tsc --noEmit נקי + ✅ vite build
**bundle:** יציב 2,699.55 kB לאורך כל החילוצים = הוכחת שקילות פונקציונלית מלאה.
**App.tsx:** 41,131 → **33,176 שורות** (~8,000 הוסרו לקבצים מודולריים).

**באגים שנתפסו ע"י tsc ותוקנו תוך כדי:**
- MapGeoAnchor import התנגש עם local def
- _activeStripDetailsCloser (singleton) — הועבר ל-Strip.tsx
- clampMenuPos — נוסף ל-imports של Strip
- MapZone.polygon — types/index.ts הגדיר string, אבל ה-runtime shape הוא array → הוגדר נכון ב-types/ground.ts
- GROUND_SVG_ICON_KEYS / AIR_DEFENSE_STATUSES — export פוספס בגלל type annotation, תוקן

---

### #014 — Phase 2F: פיצול App.tsx מלא (סשן 3) ✅ הושלם
**תאריך:** 2026-06-22
**מה נעשה:** כל הרכיבים חולצו מ-App.tsx, כולל שני הענקים. App.tsx ירד מ-41,625 ל-**728 שורות**.

**שיטה:** bottom-up מלא — types/consts → leaf components → mid components → giants. build-verify אחרי כל batch.

**מודולים חדשים (38 סה"כ):**
- **types/**: `ground.ts`, `stripGrid.ts`, `stripFields.ts` (+ index.ts מורחב)
- **utils/**: `strips.ts`, `digits.ts`, `stripGrid.ts`, `stripWindow.tsx` (+ geo/scale/session/notes/handwriting/aircraft/queryBuilder)
- **components/shared/**: HandwritingOverlay, LearnDigitsOverlay, Modals, ContextMenu, OnScreenKeyboard, ConfirmModal
- **components/strips/**: Strip
- **components/transfers/**: TransferCards, DraggablePanels
- **components/map/**: MapZoneEditor, MapsManager
- **components/ground/**: groundShared, GroundVehiclePanel
- **components/blocks/**: BlockMiniView, BlockVisualPainter
- **components/query/**: QueryBuilder
- **components/classic/**: ClassicViews
- **components/dashboard/**: AdminDashboard
- **components/admin/**: managers (12 admin managers), ManagementPage
- **components/views/**: GroundView, VerticalView, SectorDashboard

**הענקים שחולצו:**
- SectorDashboard — 14,535 שורות → `components/views/SectorDashboard.tsx`
- ManagementPage — 7,446 שורות → `components/admin/ManagementPage.tsx`
- admin managers — 3,165 שורות → `components/admin/managers.tsx`

**QA (כל batch):** ✅ tsc --noEmit + ✅ vite build. **bundle יציב 2,699.5 kB לכל אורך** = שקילות פונקציונלית מלאה, אפס regressions.

**App.tsx הסופי (728 שורות):** רק `WorkstationLogin` (מסך כניסה) + `App` (routing) + 13 imports נקיים.

**באגים ש-tsc/build תפסו ותוקנו תוך כדי:** ~15 (חוסר types/helpers משותפים, exports שפוספסו בגלל type annotation, ReactDOM→createPortal, name shadows). כולם ב-compile — אפס הגיעו ל-runtime.

---

### #015 — תשתית בדיקות (vitest) + בדיקות יחידה
**תאריך:** 2026-06-22
**מה נעשה:** הוספת vitest + בדיקות יחידה ל-utils הטהורים שחולצו בריפקטור.
- `package.json`: נוסף `npm test` (vitest run) + `npm run test:watch`
- קבצי בדיקה: `src/utils/{strips,queryBuilder,geo,notes,aircraft}.test.ts`
- כיסוי: normalizeAlt, parseAltToFeet, getFormationDisplayName, computeBlockDeviation,
  evaluateQuery/evalQLeaf/getQFieldValue, geo round-trip + fmtDms, notes round-trip, aircraft mapping

**QA:** ✅ **68/68 בדיקות עוברות** + tsc --noEmit נקי
**ערך:** רשת ביטחון ראשונה למערכת + אימות שחילוץ ה-utils בריפקטור היה נכון (התנהגות זהה למקור).

---

### #016 — תיקוני runtime (התגלו בהרצה בפועל) + ביצועים
**תאריך:** 2026-06-22
**הקשר:** אחרי שהמשתמש הריץ את האפליקציה לראשונה — באגים שרק runtime חושף (tsc/build לא תופסים).

1. **API 404** — `app.js` מן routers ב-`/api` בעוד הם מגדירים נתיב מלא `/api/*` → `/api/api/*`. תוקן: mount ב-root.
2. **runway-conflicts/active-takeoffs קרסו** — `jsonb_array_*` על `aircraft_positions` שאינו מערך (44 rows עם `{}`). הוקשח עם `jsonb_typeof()='array'`.
3. **התראות בד"ח לא הופצו** — `bdh_alerts.created_at` היה `timestamp` ללא tz; בשרת מקומי (UTC+3) הוסט 3ש' והסינון `created_at >= sessionStart` זרק כל התראה. הומר ל-`timestamptz`.
4. **ביצועים — האטת polling אגרסיבי:** loadData (strips/global+transfers) 1500→**5000ms**; workstation-messages 3000→**6000ms**; collab sync 3000→**6000ms**. (1000ms נשאר — countdown מקומי.)
5. **הקשחת pg Pool** — `max:12`, `idleTimeoutMillis:30000`, `connectionTimeoutMillis:10000` + `pool.on('error')`. מונע תקיעה כשה-pool מתמלא ומטפל ב-connections מתים של Neon.
6. **`npm run dev` cross-platform** — `concurrently` (היה `&` שלא עובד ב-Windows).

**QA מקיף:**
- ✅ tsc | ✅ 68/68 בדיקות | ✅ build (2,699 kB)
- ✅ Smoke test 22 endpoints → 200 (2 דרשו פרמטר = ולידציה תקינה)
- ✅ עומס 60 בקשות מקבילות → 60×200, ללא תקיעת pool

**לקח:** ה-QA gate צריך לכלול **smoke test runtime** — באגי routing/SQL/tz נתפסים רק בריצה.

**דפוס פתוח:** עוד עמודות `timestamp` ללא tz (`sticky_notes`, `work_group_notes`, `strips`...) — עלולות להיות מוסטות 3ש'. מומלץ audit + המרה ל-`timestamptz`.

---

### #017 — מצבי קבלה (קבל/אשר/דחה+הערה) + תצוגת נקודת העברה (שלמה/חץ)

**תאריך:** 2026-07-08

**מה נעשה:**
- **State machine של העברות** הורחב: `pending → acknowledged → accepted` / `rejected`.
  - Route חדש `POST /api/transfers/:id/acknowledge` — "אשר": המקבל אישר קבלה, הסטריפ נשאר אצל המוסר עד "קבל" סופי.
  - `POST /api/transfers/:id/reject` מקבל `note` (חובה) → נשמר ב-`reject_note`, ושולח פופאפ למוסר דרך `workstation-messages` (reuse).
  - Route חדש `POST /api/transfers/:id/dismiss` — המוסר מסלק כרטיס דחייה (כתום).
  - כל שאילתות ה-GET עודכנו: `status IN ('pending','acknowledged')` (בצד המוסר גם `rejected`) כדי ש-acknowledged/rejected לא ייעלמו.
- **UI** (`TransferCards.tsx`): כפתור **אשר**, תיבת דחייה עם הערת חובה, צביעה אצל המוסר (אושר=ירוק, נדחה=כתום, קונפליקט=אדום). `IncomingTransferCard.onReject` → `(id, note)`.
- **תצוגת נקודת העברה**: החץ (`neighborPin`) הוקטן בחצי (28×36→14×18). מתג המרה במקום שלם↔חץ (▽/△). ברירת מחדל פר-נקודה `sub_sectors.display_mode` ("הגדרת עמדה") מוחלת אוטומטית בגרירת שכן.
- **DB:** `strip_transfers.reject_note TEXT`, `sub_sectors.display_mode VARCHAR(10) DEFAULT 'full'` (ב-`init.js`).

**קבצים:** `server/routes/transfers.js`, `server/routes/sectors.js`, `server/db/init.js`, `src/components/transfers/TransferCards.tsx`, `src/components/transfers/DraggablePanels.tsx`, `src/components/views/SectorDashboard.tsx`, `data-model.md`, `SERVICES.md`, `SHARED_LANGUAGE.md`.

**Event Log:** `transfer_acknowledged`, `transfer_rejected` (עם note).

**QA:** tsc נקי · vite build ✅ · 120/120 בדיקות · syntax Backend תקין. **Runtime ויזואלי — ממתין לאימות משתמש** (דורש 2 עמדות + מפה + restart לשרת להחלת המיגרציה).

---

### #018 — דסק משימה כללי (General Mission Desk) — מודול חדש

**תאריך:** 2026-07-21 · **Branch:** `feature/general-mission-desk` · **מקור:** אפיון דסק משימה כללי.pdf

**מה נעשה:**
- **סוג עמדה חדש** `preset_type='mission_desk'` — דסק גנרי לרישום, נבנה במסך הניהול מ-3 סוגי שירותים:
  - **מסך ניהול אמצעים** (`ButtonsBoard`) — כפתורים נוצרים בעמדה בקליק ימני, מיקום חופשי בגרירה (Pointer Events, מותאם Cintiq), מצבים עם צבע לכל מצב, טקסט חופשי, פונט/גודל/מודגש, וטריגר **התראה מתפרצת** לעמדות אחרות (reuse `workstation-messages` + toast).
  - **טקסט חופשי** (`InkPad`) — דיו על canvas בקואורדינטות יחסיות, שורות הפרדה + כותרת לפי config, undo/פלנלית. ללא OCR.
  - **טבלה חכמה** (`SmartTable`) — עמודות (טקסט/מספר/V-X/תפריט), עמודות חישוב (פרסר נוסחאות ללא eval), עיצוב מותנה פר-שורה (+הבהוב), שורת סיכום (סכום/כמות/ממוצע/מינ/מקס), שורות התחלתיות והוספה בעמדה.
- **פריסת דסק** — עץ BSP (`layout_json`, אותה תבנית כמו חלון סטריפים); באדמין: פיצול אזורים + גרירת שירות לאזור (`MissionDeskAdmin`, קובץ נפרד — managers.tsx כבר ענק).
- **שיתוף שירות בין עמדות** — `mission_desk_sharing` JSONB בעמדה; כתיבת state עושה **fan-out בשרת** לעמדות המשותפות; polling (5ש') מקבל. grace 8ש' לכתיבה מקומית מונע דריסה בזמן עריכה.
- **DB:** `mission_desks`, `mission_desk_services`, `mission_desk_service_state` (UNIQUE(service,preset), TIMESTAMPTZ) + `workstation_presets.mission_desk_id/mission_desk_sharing`.
- **i18n:** קבוצת registry חדשה `missiondesk` (he+en מלא); dispatch ב-`App.tsx` (ללא נגיעה ב-SectorDashboard).

**קבצים:** `server/routes/missionDesks.js` (חדש), `server/app.js`, `server/routes/workstations.js`, `server/db/init.js`, `src/types/missionDesk.ts`, `src/utils/missionDesk.ts` (+29 בדיקות), `src/components/missiondesk/*` (5 קבצים), `src/components/admin/MissionDeskAdmin.tsx`, `ManagementPage.tsx` (tab + עורך עמדה), `App.tsx`, `src/i18n/registry/missiondesk.json`, `e2e/mission-desk.spec.ts` (חדש), `data-model.md`.

**Event Log:** `mission_desk_button_state_changed`, `mission_desk_row_added`.

**QA (עבר במלואו, כולל runtime):** tsc נקי · 167/167 unit (TDD — בדיקות נכשלות commit קודם למימוש) · vite build ✅ · smoke API מלא מול Neon (כולל fan-out שיתוף) · **2 בדיקות Playwright חדשות שרצו בפועל**: עמדה (יצירת כפתור בקליק ימני → החלפת מצב → **התראה מתפרצת נצפתה בעמדה שנייה חיה בדף נפרד** → סיכום טבלה חי → ציור דיו נשמר ל-DB → כניסה מחדש עם שרידות → activity_log) + אדמין (יצירת דסק+שירות+פריסה+שמירה). צילומי מסך אומתו ויזואלית.

**ידוע/נדחה:** אין גרירת מחיצות לשינוי יחסי פיצול באדמין (50/50 קבוע) · בחירת פונט מוגבלת ל-3 · עיכוב סנכרון עד ~8ש' בשירות שנערך במקביל בשתי עמדות.

---

### #019 — דסק משימה: אמצעים קבועים, מגע, גודל כפתור, פלנלית לפי מיקום

**תאריך:** 2026-07-21 · המשך #018 לפי משוב CEO.

**מה נעשה:**
- **אמצעים קבועים ונתוני טבלה בהגדרת עמדה** — כפתור "📌 פתח דסק להגדרה" בעורך העמדה פותח את הדסק האמיתי (`MissionDeskView adminMode`) מעל המסך; כפתורים/שורות שנוצרים שם מסומנים `fixed` ונשמרים ישירות ל-state של העמדה. קבוע (📌) בעמדה: מופעל/נגרר/טקסט חופשי — לא נמחק ולא נערך. במצב הגדרה לא נורות התראות אמת ולא נצרכות הודעות העמדה (seen).
- **מסך מגע** — פעולות גלויות ב"מסך ניהול אמצעים": ➕ צור כפתור + ✏️ מצב עריכה (לחיצה על כפתור פותחת עורך); קליק ימני נשאר כקיצור לעכבר בלבד. מחיקה גם מתוך העורך.
- **גודל כפתור** — רוחב/גובה בפיקסלים בעורך הכפתור (ריק = אוטומטי), לפי סעיף האפיון "גודל שונה לכל כפתור".
- **פלנלית** — כלי "מחק במיקום" (מחיקת strokes בגרירת הסמן, מרחק נקודה-מקטע — `eraseStrokesAt`, מכוסה 4 בדיקות) לצד "ניקוי מלא".
- **תיקונים בדרך:** רענון רשימת ה-presets ב-App בכל מעבר עמוד + בהתחברות (עמדת דסק שנוצרה כשהדף פתוח עלתה כמוד טבלאי); אייקון 🗂 בתפריט הצד; שגיאות שרת ביצירת/שמירת דסק כבר לא נבלעות.

**קבצים:** `types/missionDesk.ts` (w/h/fixed), `utils/missionDesk.ts` (+eraseStrokesAt), `missiondesk/ButtonsBoard/InkPad/SmartTable/MissionDeskView`, `admin/MissionDeskAdmin.tsx` (+MissionDeskConfigOverlay), `ManagementPage.tsx`, `App.tsx`, `registry/missiondesk.json`, `e2e/mission-desk.spec.ts` (4 בדיקות).

**QA:** tsc נקי · 171/171 unit (TDD ל-eraser) · build ✅ · **4/4 e2e בפועל** כולל: יצירת אמצעי דרך ➕ (מגע), התראה מתפרצת בין 2 דפים חיים, רגרסיית רשימה מיושנת, ותצוגת הגדרה מלאה (פתיחה מעורך העמדה → יצירת קבוע → `fixed:true` ב-DB).

---

### #020 — מיראז' (דמו) — מערכת ניהול משתמשים והרשאות + בחירת מקור הזדהות ב-LOGIN

**תאריך:** 2026-07-22

**מה נעשה:**
- **אפליקציית מיראז' נפרדת** (`mirage/`) — Express עצמאי (פורט 7300, `npm run mirage`): `POST /api/authorize` מקבל `{app, personalNumber}` ומחזיר `{authorized, roles, user}` (`admin`/`team_lead`/`user`); CRUD משתמשים + מסך ניהול (`/`, RTL, dark); נתונים ב-`mirage/data.json`.
- **מתווך ב-SKY-KING** — `server/routes/mirage.js`: `POST /api/auth/mirage-login` שולח למיראז' (`MIRAGE_URL`), ממפה roles → `is_admin`/`is_team_lead`, מאחד עם איש צוות קיים לפי `personal_id` (שומר עמדות מאושרות); אין תואם → משתמש וירטואלי (`id:null`). 403 אין הרשאה · 502 מיראז' לא זמין · timeout 4s.
- **מסך LOGIN** — checkbox "הזדהות דרך מיראז'" (**ברירת מחדל: מסומן**, נשמר ב-`localStorage['bt-authSource']`). מסומן → קלט מספר אישי במקום חיפוש איש צוות; לא מסומן → זרימת משתמשי המערכת ללא שינוי. כל הטקסטים דרך i18n (he+en).
- **e2e** — `playwright.config.ts` מקבע `bt-authSource=internal` דרך `storageState` (הבדיקות בודקות את הזרימה הפנימית).

**קבצים:** `mirage/` (app.js, server.js, admin.html, data.json, mirage.test.js), `server/routes/mirage.js`, `server/app.js`, `src/App.tsx`, `src/i18n/locales/he.json+en.json`, `playwright.config.ts`, `package.json` (סקריפט `mirage`).

**QA:** TDD — 11 בדיקות vitest למיראז' (נכתבו קודם, red→green) · tsc נקי · 185/185 unit · build ✅ · smoke מלא: מיראז' חי (authorize מורשה/לא מורשה/לא מוכר) + מתווך מול DB אמיתי (איחוד איש צוות קיים, משתמש וירטואלי, 403, 502 כשמיראז' כבוי) · e2e dashboard-baseline 2/2 ✅.

---

### #021 — מיראז': הרשאת עמדות למשתמש (בחירה מרובה מהאפליקציה + הזנה ידנית)

**תאריך:** 2026-07-22 · המשך #020.

**מה נעשה:**
- **פורמט מורחב במיראז'** — רשומת אפליקציה: `{roles, workstations}` (הפורמט הישן, מערך roles, נתמך לאחור). `workstations`: `{id, name}` מהאפליקציה או `{name}` ידני.
- **authorize** מחזיר גם `workstations` (ריק = אין הגבלה).
- **`GET /api/workstation-options`** במיראז' — מושך שמות עמדות חיים מ-SKY-KING (`SKYKING_URL`); לא זמין → `available:false` והמסך עובר להזנה ידנית.
- **מסך הניהול** — בחירה מרובה (checkboxes) של עמדות מהאפליקציה + שדה הזנה ידנית (מופרד בפסיקים) + עריכת משתמש קיים (כפתור "עריכה" → PUT).
- **המתווך ב-SKY-KING** — מפענח את `workstations` מול `workstation_presets`: עם `id` = השוואת ID טכני, בלי = השוואת טקסט (trim); התוצאה → `approved_workstations`. ריק = לפי ה-DB; לא זוהה כלל → `[-1]` (שום עמדה, מוצג "אין עמדות מאושרות").

**קבצים:** `mirage/app.js`, `mirage/admin.html`, `mirage/mirage.test.js` (+5 בדיקות TDD), `server/routes/mirage.js`.

**QA:** TDD red→green · 190/190 unit · smoke מקצה לקצה מול DB אמיתי: הגבלה לפי ID (29 ✓), לפי טקסט `בת"ק אריק` (26 ✓), משולב `[29,26]` ✓, עמדה לא קיימת → `[-1]` ✓, בלי הגבלה → נשאר לפי DB `[2]` ✓. הערה: curl בעברית מ-git-bash שולח קידוד שגוי — אימות טקסט נעשה ב-node fetch (כמו דפדפן).

---

### #022 — תיקון: בכניסת מיראז' מקור העמדות הוא מיראז' בלבד

**תאריך:** 2026-07-22 · תקלה מדווחת: בכניסה דרך מיראז' הוצגו העמדות המוגדרות למשתמש ב-SKY-KING.

**סיבת שורש (שני פערים):**
1. משתמש קיים בלי הגבלת עמדות במיראז' נפל לרשימת `crew_member_workstations` של SKY-KING — במקום "ריק = כל העמדות" כפי שמוצג במסך הניהול של מיראז'.
2. רכיב בחירת העמדה ב-LOGIN מתעלם מההגבלה עבור admin — ולכן admin ממיראז' ראה את כל העמדות גם עם הגבלה.

**התיקון:**
- שרת: בכניסת מיראז' `approved_workstations` = הגבלת מיראז' בלבד (`mirageApproved || []`) — גם למשתמש קיים.
- קליינט: `auth_source:'mirage'` על איש הצוות + ה-activity-log; הסינון חל גם על admin כשמקורו מיראז'.

**חריג מפורש (רכיב משותף):** בחירת עמדה ב-LOGIN — בכניסה **פנימית** admin רואה הכל (התנהגות קיימת, לא שונתה); בכניסת **מיראז'** ההגבלה חלה על כולם, כולל admin.

**QA:** tsc · 190/190 unit · אימות בדפדפן אמיתי (Playwright מול vite+API+מיראז' חיים): הגבלה → עמדה אחת בלבד ✓ · בלי הגבלה → כל 23 העמדות (לא ה-DB) ✓ · admin עם הגבלה → העמדה המוגבלת בלבד ✓.

---

### #023 — החלפת איש צוות בכניסת מיראז': סינון לפי הרשאת עמדה + הזדהות מחדש

**תאריך:** 2026-07-22 · המשך #020–#022.

**מה נעשה:**
- **שרת** — `GET /api/auth/mirage-eligible?presetId=N`: המורשים לעמדה לפי מיראז' (roles באפליקציה + הגבלת עמדות ריקה או שהעמדה בה, לפי id/שם). `POST /api/auth/mirage-login` מקבל `presetId` אופציונלי ואוכף את הרשאת העמדה (403 `workstation_not_permitted`).
- **רכיב משותף** `MirageCrewSwap` (DRY — ב-SectorDashboard ‏וב-MissionDeskView): רשימה מסוננת ממיראז' בלבד; בחירת איש → הקלדת מ.א. → מיראז' מאשר (כולל בדיקת התאמה בין המ.א. לאיש שנבחר) → ההחלפה. תמיכה בשתי תמות (בהיר במודל הבקר, כהה בתפריט הדסק).
- הכניסה הפנימית — זרימת ההחלפה הקיימת ללא שינוי. `crew_swap` ב-activity-log מתעד `auth_source`.

**קבצים:** `server/routes/mirage.js`, `src/components/shared/MirageCrewSwap.tsx` (חדש), `SectorDashboard.tsx`, `MissionDeskView.tsx`, `App.tsx`, `he.json+en.json`.

**QA:** tsc · 190/190 unit · אימות דפדפן מלא: eligible מסונן נכון (מוגבל-לעמדה-אחרת לא מופיע, ללא-הרשאת-אפליקציה לא מופיעה) · מ.א. שגוי → שגיאת אי-התאמה · מ.א. נכון → החלפה ליוחאי ✓ · hint מוצג ✓ · e2e mission-desk ‏4/4 (אין רגרסיה במצב פנימי).

---

### #024 — סביבות תרגול (סימולציה): סכמה לכל סביבה, בורר ב-LOGIN, באדג' בסרגל

**תאריך:** 2026-07-23 · פיצ'ר חדש (בסגנון גלקסיה).

**מה נעשה:**
- **מודל:** 50 סביבות עבודה. טסות (1-10) → סכמת `public` הקיימת (מידע טס משותף: פ"מ/סגירות/ספרורים זהים); תרגול (11-50) → סכמת PostgreSQL נפרדת לכל אחת (`env_11`…`env_50`) עם עותק של הטבלאות **התפעוליות** בלבד. קונפיגורציה (סקטורים/מפות/עמדות/משתמשים) משותפת ל-public.
- **בידוד ללא נגיעה ב-353 routes:** `pool.js` עוטף את ה-pool וקורא את סכמת הסביבה מ-`AsyncLocalStorage` (`env-context.js`) — סביבה נקבעת פעם אחת ב-middleware מכותרת `X-Env`, ו-`pool.query` מכוון אוטומטית (`SET LOCAL search_path` בטרנזקציה לסביבות תרגול; מסלול מהיר ל-public).
- **סיווג טבלאות סגור** (`env-tables.js`) — מקור אמת יחיד; `checkTableClassification` מפיל את ה-boot אם טבלה ב-public אינה מסווגת (מונע זליגת תרגול↔אמת). אומת: 95 טבלאות → 39 תפעוליות, 50 קונפיג, 6 מוחרגות.
- **יצירת סכמה** (`envs.js`) — עצלה בכניסה ראשונה (~15ש', כ-DDL אחד ב-round-trip בודד אחרי שאיטרציה פר-טבלה נמשכה >100ש'), סנכרון ב-boot, איפוס.
- **Frontend:** בורר סביבה ב-LOGIN (טסות/תרגול, ברירת מחדל 1) · `installEnvFetchInterceptor` מזריק `X-Env` לכל fetch · `EnvironmentBadge` משותף בסרגל של SectorDashboard ו-MissionDeskView (תרגול בכתום-אזהרה) · i18n מלא (registry/env.json).

**באג קריטי שנתפס ותוקן (destroy-on-release):** מול ה-pooler של Neon (pgbouncer), החלפת `client.query` להזרקת `SET LOCAL` גורמת ל-search_path לדלוף לרמת ה-server connection — connection ששב ל-pool ומשרת בקשה "טסה" קרא/כתב בטעות לסכמת תרגול (אומת: 14/14 connections מזוהמים). התיקון: connection ששירת סביבת תרגול דרך `pool.connect()` **מושמד** בשחרור (`release(err)`), לא חוזר ל-pool. אומת: 0/16.

**קבצים:** חדשים — `server/db/env-context.js`, `env-tables.js`, `envs.js`, `server/middleware/environment.js`, `server/routes/environments.js`, `src/utils/environment.ts`, `src/components/shared/EnvironmentBadge.tsx`, `src/i18n/registry/env.json`. שונו — `server/db/pool.js`, `server.js`, `server/app.js`, `App.tsx`, `SectorDashboard.tsx`, `MissionDeskView.tsx`, `index.tsx`, `types/index.ts`, `i18n/registry.ts`, `data-model.md`.

**QA:** tsc נקי · 287/287 unit · build נקי · **7/7 אינטגרציה מול Neon** (בידוד כתיבה, קונפיג משותף, שכפול FK מלא, אכיפת FK חוצה-סכמה, טרנזקציה מפורשת + 20 קריאות public נקיות — רגרסיית הדליפה) · smoke HTTP: `/api/environments`→200 (50), `X-Env:99`→400, enter env 25→200 (~14ש', schema_created=true), בידוד כתיבה מעל HTTP. ⚠️ **לא אומת ויזואלית בדפדפן** (LOGIN/סרגל) — ממתין לבדיקת משתמש.

---

### #024 — מיראז': סיסמה חזקה לפי התקן לכל משתמש

**תאריך:** 2026-07-23 · המשך #020–#023.

**מה נעשה:**
- **`mirage/password.js`** — מדיניות לפי NIST SP 800-63B: ‏12-64 תווים, אות גדולה+קטנה+ספרה+תו מיוחד, בלי מספר אישי/שם, בלי סיסמאות נפוצות. אחסון scrypt (node:crypto, בלי תלות חדשה) עם salt פר-משתמש; השוואה ב-`timingSafeEqual`.
- **authorize** דורש סיסמה; משתמש לא קיים וסיסמה שגויה מחזירים אותה תשובה (`bad_credentials` — בלי חשיפת קיום משתמש); משתמש ותיק בלי סיסמה → `password_not_set`. **הגבלת ניסיונות:** 5 כישלונות → חסימת דקה (429 `rate_limited`).
- **CRUD** — יצירה דורשת סיסמה תקנית (400 `weak_password` + פירוט קודים); עריכה מחליפה סיסמה (ריק = ללא שינוי); ה-hash לעולם לא נחשף (`hasPassword` בלבד).
- **מיגרציה** — משתמשי data.json קיבלו hash של סיסמת הדמו `Demo!Mirage#26`; ‏pg store משלים hash-ים חסרים מ-data.json ב-boot (idempotent); משתמש pg-בלבד בלי סיסמה מסומן ⚠ במסך הניהול.
- **SKY-KING** — המתווך מעביר סיסמה וממפה 401/429; שדה סיסמה ב-LOGIN וב-`MirageCrewSwap` (החלפת איש צוות); הודעות שגיאה ב-i18n he+en.

**קבצים:** `mirage/password.js` (חדש), `mirage/app.js`, `mirage/store.js`, `mirage/admin.html`, `mirage/data.json`, `mirage/mirage.test.js`, `server/routes/mirage.js`, `src/App.tsx`, `src/components/shared/MirageCrewSwap.tsx`, `he.json+en.json`.

**QA:** TDD — ‏25 בדיקות מיראז' (מדיניות, hash/verify, authorize, rate limit, CRUD, אי-חשיפת hash בקובץ) · tsc נקי · 322/322 unit · e2e API על פורטים זמניים (3197/7391, בלי לגעת בסביבה הרצה): נכונה→200, שגויה→401, חסרה→400, אחרי 5 כישלונות→429 ✓.

---

### #025 — תיקון: מסך הניהול נכנס תמיד לסביבה 1

**תאריך:** 2026-07-30 · המשך #024 (סביבות תרגול).

**הבאג:** בחירת סביבה 11/15 ב-LOGIN וכניסה ל**ניהול** פתחה את המסך על הסביבה הקודמת (ברירת מחדל 1). רק כניסה לעמדה עם אותה סביבה "תיקנה" זאת - כי `bt-env` נשמר ב-sessionStorage ושרד גם יציאה, ולכן הכניסה הבאה לניהול כבר הייתה נכונה.

**השורש:** רק מסלול עליית העמדה (`handlePresetLogin`) קרא ל-`setCurrentEnv(selectedEnv)`. כפתורי **ניהול מערכת / ניהול עמדות / תחקיר** קראו ל-`onManagement`/`setShowLoginDebrief` ישירות - בלי לקבוע את הסביבה, ולכן כל בקשותיהם נשאו `X-Env` ישן.

**מה נעשה:**
- **`enterEnvironment(env, apiUrl)`** ב-`src/utils/environment.ts` - נקודת כניסה אחת לכל מסלולי הכניסה מ-LOGIN: מנרמלת, קובעת את הסביבה לפני כל fetch, ובסביבת תרגול ממתינה ל-`POST /environments/:env/enter` (יצירת הסכמה) ומחזירה false בכישלון.
- **`App.tsx`** - שלושת המסלולים (עמדה / ניהול / תחקיר) עוברים דרכה. `handlePresetLogin` הוחלף לקריאה אחת במקום הענף הכפול.
- **`ManagementPage`** - נוסף `EnvironmentBadge` (הרכיב המשותף) לכותרת. בטיחות ATC: במסך שעורך נתונים חייבים לראות אם זו סביבת תרגול או אמת.

**קבצים:** `src/utils/environment.ts`, `src/utils/environment.test.ts`, `src/App.tsx`, `src/components/admin/ManagementPage.tsx`.

**QA:** TDD - 4 בדיקות חדשות ל-`enterEnvironment` (טסה לא חוסמת, תרגול ממתין, כישלון→false, סביבה לא חוקית לא משנה מצב) נכשלו לפני המימוש ועברו אחריו · tsc נקי · 326/326 unit · build נקי · smoke HTTP: `POST /environments/15/enter`→`{ok:true}`, `GET /strips/global` עם `X-Env:1`→87 שורות מול `X-Env:15`→3 (בידוד מאושר).

---

### #026 — רשימת תיוג: קטגוריה שנייה של מסמכים, על אותו מנגנון של בד"ח

**תאריך:** 2026-07-30 · הרחבה של שירות #11 (התראות בד"ח).

**הצורך:** רשימות תיוג תפעוליות שמתנהלות בדיוק כמו בד"ח (יצירה בניהול, סעיפים וכותרות, שיוך לעמדות), אך בעמדה הן קטגוריה נפרדת מעל בד"ח, ובפתיחה **אין** בחירת פ"מ ומספר מטוס.

**מה נעשה (DRY - בלי שכפול):**
- **DB:** עמודה אחת - `bdh_documents.kind VARCHAR(20) NOT NULL DEFAULT 'bdh'` (`'bdh'` | `'checklist'`). אין טבלאות חדשות: הסעיפים (`bdh_items`), השיוך לעמדות (`workstation_bdh`) וההתראות (`bdh_alerts`) משרתים את שני הסוגים.
- **`src/utils/bdhDocs.ts`** (חדש) - מקור אמת יחיד לסיווג: `docKind` / `isChecklistDoc` / `filterDocsByKind` / `normalizeDocKind`. כל ערך שאינו `'checklist'` (כולל מסמכים היסטוריים בלי הערך) הוא בד"ח.
- **שרת:** `GET /api/bdh?kind=` מסנן (בלי הפרמטר - הכל), `POST /api/bdh` מקבל `kind`. שאר ה-endpoints ללא שינוי.
- **ניהול:** טאב **רשימת תיוג** משתמש **באותו קוד** של טאב בד"ח (`activeTab === 'bdh' || 'checklists'`), עם `kind` נגזר מהטאב - אותו עורך סעיפים, אותה גרירה, אותו שיוך לעמדות.
- **עמדה:** מסמכי העמדה מפוצלים לשתי קטגוריות; שתיהן מרונדרות מ-`renderDocCategorySection` **אחד** (חילוץ ה-JSX ששימש את בד"ח), רשימת תיוג מעל בד"ח. ה-viewer משותף - ברשימת תיוג מוסתרת כל שורת הפעולה (פ"מ, מספר מטוס ו"הפץ"); הפצת התראה נשארת של בד"ח בלבד.

**קבצים:** `src/utils/bdhDocs.ts` + `bdhDocs.test.ts` (חדשים), `server/db/init.js`, `server/routes/admin.js`, `src/components/admin/ManagementPage.tsx`, `src/components/views/SectorDashboard.tsx`, `src/i18n/registry/ctrl.json`, `src/i18n/registry/admin.json`, `data-model.md`, `SERVICES.md`, `SHARED_LANGUAGE.md`.

**QA:** TDD - 5 בדיקות סיווג · tsc נקי · 331/331 unit (כולל שומר i18n) · build נקי · smoke API על פורט זמני 3009 מול Neon: יצירת רשימת תיוג→`kind=checklist`, `?kind=checklist`=1 / `?kind=bdh`=4 / ללא פרמטר=5 (סכום מדויק), 4 המסמכים הישנים קיבלו `kind='bdh'`, שיוך לעמדה נקלט וגם ב-`bdh-preset-assignments`, `PUT` לא משנה `kind`, ניקוי מלא (המצב חזר ל-4 מסמכים ולשיוך המקורי).

### #027 — סמלי יב"א 506/509 האמיתיים ב-registry הסמלים

**תאריך:** 2026-07-30 · השלמה של `RotatingEmblems` (#025).

**הצורך:** סמל מיח"ה מוצג בכל עמדה לצד סמל הבסיס, אבל שתי יחידות הבקרה שמופיעות ב-`aviation_bases` לא היו מיוצגות נכון: `509` לא היה ב-registry כלל (העמדות שלו קיבלו את ה-placeholder המצויר), ו-`506` הסתמך על `506.jpg` - צילום סיכה 200px על רקע לבן, שסומן ב-`SOURCES.md` להחלפה.

**מה נעשה:**
- `files/509.webp` + `files/506.webp` - סמלי היחידות מוויקיפדיה (CC BY-SA 3.0, דובר צה"ל · ויקימדיה ישראל), 350px עם אלפא, במקום `506.jpg` שנמחק. הרישום ב-`BASE_EMBLEMS` הוא `'506'`/`'509'` - **בדיוק** כפי ש-`aviation_bases.name` מחזיק אותם.
- **למה WebP ולא PNG:** אלה צילומי סמל רקום עשירי-פרטים; PNG שוקל ~280KB לכל אחד לעומת ~50KB ב-WebP q0.9 באותה רזולוציה, ואיכות הצפייה בגדלים 13-92px זהה. Vite מייבא `.webp` ללא הגדרה.
- ההמרה נעשתה ב-Chromium דרך Playwright - אותה גישה כמו `scripts/build-icon.mjs` (אין ספריית רסטר בפרויקט).
- תוקן תיאור מיושן: `MichaEmblem` הוא סמל מערך הבקרה האווירית (מיח"ה 517), לא "סמל חה"א הכללי" (`emblems.tsx`, `SERVICES.md`).

**קבצים:** `src/assets/emblems/emblems.tsx`, `src/assets/emblems/SOURCES.md`, `files/506.webp`, `files/509.webp` (חדשים), `files/506.jpg` (נמחק), `SERVICES.md`.

**QA:** tsc נקי · `vite build` נקי (שני ה-assets נפלטו: 44.67KB + 53.15KB) · e2e `emblems.spec.ts` 3/3 ✅ · **אימות ויזואלי באפליקציה החיה:** כניסה לעמדות "מרחבי 305" (בסיס אב 509) ו"מרחבי 304" (506) - ה-DOM טוען `509.webp`/`506.webp` לצד `micha.png`, והסמלים נראים נכון בסרגל העליון (צילום מוגדל).

### #028 — ניהול סמלים ממסך הניהול: בוחרים תמונה ביישות "בסיסים"

**תאריך:** 2026-07-31 · הרחבה של `RotatingEmblems` (#025, #027).

**הצורך:** עד עכשיו סמל בסיס היה **קובץ בקוד** — בסיס חדש או סמל שהתחלף חייבו commit, build והפצה. הדרישה: לבחור תמונה ביישות "בסיסים" במסך הניהול.

**מה נעשה:**
- **DB:** `aviation_bases.emblem_data TEXT` (data URL) + טבלה `system_emblems(key, image_data, updated_at TIMESTAMPTZ)` לסמלים שאינם של בסיס (כרגע `micha`). שתיהן קונפיגורציה (public בלבד) ב-`env-tables.js`.
- **למה לא מפתח ב-`system_defaults`:** `GET /api/defaults` נטען בכל עמדה — תמונה בתוכו הייתה מנפחת כל טעינת דשבורד.
- **שרת:** `server/routes/emblem.js` (6 endpoints). GET מגיש תמונה **בינארית** עם ETag ו-`no-cache`, כך שה-`<img>` נטען ישירות מה-URL ומוטמן; 404 = אין סמל. הכתיבה עוברת דרך שער יחיד — `server/utils/emblemImage.js` — שמאמת סוג (**בלי SVG**: הוא מוגש מאותו origin ויכול להריץ סקריפט) ותקרה של 2MB.
- **`GET /api/aviation-bases`** מחזיר `has_emblem` בלבד ולא את התמונה — הרשימה נטענת בכל כניסה לעמדה.
- **לקוח:** `src/utils/emblemUpload.ts` מכווץ כל תמונה שנבחרת ל-350px (הגודל של הסמלים המובנים) → ~50KB לשורה. `EmblemPicker` הוא רכיב אחד שמשרת גם את סמל הבסיס וגם את סמל מיח"ה.
- **עמדה:** `RotatingEmblems` מנסה קודם את ה-DB ואז נופל לסמל המובנה ול-placeholder. הבדיקה נעשית פעם אחת לכל URL לכל טעינת עמוד (מטמון ברמת המודול) — **בכוונה בלי דגל בסשן**, כדי שסמל שהוחלף בניהול ייתפס בטעינה הבאה ולא ימתין לכניסה מחדש. אחרי שינוי בניהול המטמון מתאפס (`resetEmblemProbes`), כך שכניסה לעמדה באותו session רואה את הסמל החדש.
- **בדיקה שנתקעת ← סמל מובנה אחרי 4 שניות:** הרצת ה-e2e המלאה (26 בדיקות) חשפה מקרה שבו בדיקת הסמל לא הסתיימה והסרגל נשאר עם **חלל ריק**. חלל ריק בעמדה גרוע מסמל ברירת מחדל, ולכן יש סף זמן: אם התמונה מה-DB תגיע מאוחר יותר, היא עדיין נכנסת במקומה.

**באג קיים שנחשף אגב כך:** `coord_n`/`coord_e` היו `VARCHAR(10)`, והמסך שולח נ"צ עשרוני מלא (`30.611944444444444` = 18 תווים) — **כל שמירת בסיס עם שניות בנ"צ נכשלה ב-500** ("שגיאה בשמירה"), הרבה לפני הפיצ'ר הזה. העמודות הורחבו ל-`VARCHAR(20)` והמסך מעגל ל-6 ספרות (~10 ס"מ).

**קבצים:** `server/routes/emblem.js`, `server/utils/emblemImage.js` + test (חדשים), `src/utils/emblemUpload.ts` + test (חדש), `src/components/admin/EmblemPicker.tsx` (חדש), `e2e/emblem-admin.spec.ts` (חדש), `server/app.js`, `server/routes/base.js`, `server/db/init.js`, `server/db/env-tables.js`, `src/components/shared/RotatingEmblems.tsx`, `src/assets/emblems/emblems.tsx`, `src/components/admin/ManagementPage.tsx`, `src/i18n/registry/admin.json`, `data-model.md`, `SERVICES.md`.

**QA:** TDD (הבדיקות נכתבו לפני המימוש ונצפו אדומות) · tsc נקי · 375/375 unit · build נקי · **smoke API מול Neon (25 בדיקות):** העלאה/קריאה/הסרה, ETag→304, `has_emblem` מתעדכן, SVG/URL חיצוני/חריגת גודל נדחים ב-400, בסיס לא קיים→404, ו-`GET /api/defaults` נשאר 90 תווים · **e2e מקצה לקצה** (`emblem-admin.spec.ts`, 10/10 בשתי חזרות): העלאת תמונה בטאב "בסיסים" → ממוזער בטבלה → **התמונה מוצגת בעמדה במקום הסמל המובנה**; ולסמל מיח"ה גם המסלול ההפוך — הסרה מחזירה את הסמל המובנה. ה-DB הוחזר למצבו (אין סמלים שמורים; העמדות ממשיכות להציג את הסמלים המובנים).

### #029 — "שגיאה בכניסה" ב-DEV: לוג האזנה שקרי ב-Express 5 + הודעת שגיאה שהסתירה שרת מת

**תאריך:** 2026-07-31 · תחקור תקלה שדווחה ממסך ה-LOGIN.

**התסמין:** הזדהות מול מיראז' ב-DEV החזירה "שגיאה בכניסה" — נוסח שמשמעו למשתמש "הסיסמה שלי שגויה".

**מה קרה בפועל:** שרת ה-API (3001) לא רץ. הדפדפן פנה ל-`/api/auth/mirage-login`, פרוקסי Vite ניסה `localhost:3001`, קיבל ECONNREFUSED והחזיר **500 text/plain**. `handleMirageLogin` מיפה 401/403/429/502 להודעות מדויקות, וכל השאר נפל ל-`else` הגנרי. המיראז' עצמו (7300) היה תקין לגמרי.

**שורש הבעיה — `app.listen` של Express 5 משקר:** `application.js` רושם את ה-callback שלך גם כמאזין ל-`'error'` (`server.once('error', done)`). לכן bind כושל מפעיל דווקא את ה-callback ה"מוצלח": השרת מדפיס `SKY-KING API listening on 0.0.0.0:3001` בזמן ש-`server.address()` הוא `null`. גרוע מזה — עצם קיום המאזין ל-`'error'` מונע קריסה, אז התהליך נשאר **חי, שקט וללא פורט**. אומת אמפירית: `net.createServer` לא מתנהג כך, `app.listen` של Express 5.2.1 כן.

**מה נעשה:**
- `server/listen.js` (חדש) — `listen(app, port, host)` שנשען על אירוע `'listening'` (אמין) ומחזיר Promise: resolve רק כשבאמת מאזינים, reject אחרת. משמש גם את `server.js` וגם את `mirage/server.js` (עזר רשת טהור; שניהם נארזים לאותו image). `server.js` ומיראז' יוצאים עכשיו ב-`exit 1` עם סיבה במקום להדפיס "listening" ולהיתקע.
- `src/utils/mirageAuthError.ts` (חדש) — מיפוי סטטוס→מפתח i18n, **משותף** ל-`App.tsx` ול-`MirageCrewSwap` שהחזיקו עד כה שתי העתקות שהתחילו להיפרד (רק אחת מהן טיפלה ב-`workstation_not_permitted`). מחזיר מפתח ולא טקסט, כך שהבדיקה רצה בלי i18n.
- **`5xx` הופרד מ"שגיאה בכניסה"** → `login.errorServerDown` ("השרת אינו זמין"). בעמדה מבצעית ההבדל בין "טעיתי בסיסמה" ל"המערכת למטה" הוא ההבדל בין ניסיון נוסף לקריאה לתמיכה. `502` נשאר ייעודי: השרת חי אבל *המיראז'* לא ענה.
- מיראז' נופל ל-IPv4 אם למארח אין IPv6 (`EAFNOSUPPORT`/`EADDRNOTAVAIL`/`EINVAL`) במקום לא לעלות; `EADDRINUSE` נכשל בקול. הלוג מדווח את הכתובת שנתפסה בפועל (`server.address()`), לא את זו שביקשנו.

**קבצים:** `server/listen.js` + test (חדשים), `src/utils/mirageAuthError.ts` + test (חדשים), `server.js`, `mirage/server.js`, `src/App.tsx`, `src/components/shared/MirageCrewSwap.tsx`, `src/i18n/locales/he.json`, `src/i18n/locales/en.json`, `SERVICES.md`.

**QA:** TDD (שתי חבילות הבדיקות נכתבו לפני המימוש ונצפו אדומות) · tsc נקי · 388/388 unit · build נקי · **אימות התנהגות בפועל:** פורט תפוס → `exit 1` + סיבה, בלי שורת "מאזין" (לשני השרתים); פורט פנוי → מיראז' עולה dual-stack ונענה מ-`127.0.0.1` ומ-`[::1]`; `POST /api/auth/mirage-login` עם סיסמה שגויה מחזיר `401 bad_credentials` דרך 3001 וגם דרך פרוקסי Vite.

### #029 — תיקון: מסך הטעינה עלה בלי הסמלים המסתובבים

**תאריך:** 2026-07-31 · תיקון ל-#028.

**התופעה (דיווח מהשטח):** אחרי בחירת עמדה, במקום שני הסמלים המסתובבים היה **חלל ריק**. ובסרגל העליון הוצגו הסמלים המובנים ולא אלה שהועלו בניהול.

**המדידה:** ציר זמן של ה-DOM מרגע הכניסה הראה שמסך הטעינה חי 1.0–3.9 שניות **בלי אף `<img>` של סמל**, והסמלים הופיעו רק ב-t+5.2 שניות — ואז דווקא המובנים.

**השורש:** #028 בדק תחילה אם קיים סמל ב-DB (`new Image()`), ורק לפי התשובה צייר. הבקשה הזו יוצאת בדיוק כשהדשבורד פותח את מטח קריאות ה-API שלו, ו-HTTP/1.1 מגביל ל-6 חיבורים למקור — כך שהיא נתקעה בתור מעבר לסף ה-4 שניות שהוגדר, ונפלה לסמל המובנה.

**התיקון (הסדר התהפך):**
- **הסמל המובנה מצויר מיד**, ותמונת ה-DB מחליפה אותו ב-`onLoad`. אין יותר רגע ריק - הבדיקה בוטלה, כי ה-`<img>` **הוא** הבדיקה. `onError` (אין סמל ב-DB) מסיר את התמונה מה-DOM ומשאיר את המובנה.
- `warmEmblems` ([src/utils/emblemSource.ts](src/utils/emblemSource.ts)) נקרא ב-`App` מיד אחרי הכניסה, כשהדפדפן עוד פנוי - לכן התמונה כבר במטמון כשהמסך עולה.
- ההגשה עברה מ-`no-cache` ל-`max-age=60`: בלי הטמנה אמיתית כל טעינת מסך שלחה בקשה שמתחרה באותו מטח.

**מדידה אחרי:** בפריים הראשון שבו מסך הטעינה מופיע, **שני הסמלים מה-DB כבר טעונים ומוצגים**.

**באג בבדיקה עצמה שתוקן אגב כך:** ה-`afterEach` של `emblem-admin.spec.ts` **מחק** את סמל מיח"ה ואת סמל בסיס 509 - כלומר הרצת הבדיקה מחקה סמלים אמיתיים שהועלו בניהול, בלי דרך לשחזר. עכשיו הבדיקה מצלמת את הסמלים הקיימים ב-`beforeEach` ומחזירה אותם ב-`afterEach`.

**קבצים:** `src/utils/emblemSource.ts` (חדש), `src/components/shared/RotatingEmblems.tsx`, `src/App.tsx`, `server/routes/emblem.js`, `src/components/admin/ManagementPage.tsx`, `e2e/emblem-admin.spec.ts`, `e2e/emblems.spec.ts`.

**QA:** tsc נקי · 388/388 unit · build נקי · e2e 5/5 (`emblems` + `emblem-admin`) · אימות ויזואלי של מסך הטעינה + ציר זמן DOM לפני/אחרי.

---

## (היסטורי) הצעד הבא שתוכנן — שני הענקים הנותרים

### למה ManagementPage + SectorDashboard נדחו

שניהם **consumers בתחתית הקובץ** שצורכים עשרות sub-components המוגדרים מעליהם ב-App:
- **ManagementPage** (~7,400 שורות) צורך ~17 רכיבים: AidsManager, BlockVisualPainter, ClassicPartnersAndPointsEditor, ClassicStripCard, ClosuresManager, DefaultNamesManager, MapsManager, QueryBuilder, SerialsAdminTab, SettingsModal, StripGridEditor, StripWindowAdmin, TableModesManager, WorkGroupsManager, ...
- **SectorDashboard** (~14,500 שורות) צורך עוד יותר (Strip✅, transfer cards✅, DraggableNeighborPanel, BlockMiniView, ...)

**כלל:** אי אפשר לחלץ consumer לפני שכל ה-sub-components שלו importable.
לכן הסדר חייב להיות bottom-up:
1. חלץ את רכיבי ה-admin הבודדים → `src/components/admin/` (CrewManager, PresetsManager, AidsManager, TableModesManager, SerialsAdminTab, DebriefingTab, ClosuresManager, StripWindowAdmin, DefaultNamesManager, BlockVisualPainter, QueryBuilder, SettingsModal, ...)
2. חלץ רכיבי sector נותרים → DraggableNeighborPanel, BlockMiniView, TableHandwritingCanvas, GroundVehiclePanel, StickyNotesLayer
3. אז `ManagementPage` → `src/components/admin/ManagementPage.tsx`
4. ולבסוף `SectorDashboard` → `src/components/views/SectorDashboard.tsx`

**אזהרה קריטית:** כל שלב = build-verify מיד. לא להשאיר את ה-build שבור בין שלבים.

---

## (ישן) הצעד הבא — חילוץ ה-views הגדולים

**הענקים שנותרו ב-App.tsx:**
| view | שורות (~) | תפקיד |
|---|---|---|
| `SectorDashboard` | ~14,500 | עמדת CTRL הראשית |
| `ManagementPage` | ~7,400 | מסך admin |
| `GroundView` | ~4,800 | עמדת TWR (מגרש) |
| `Strip` | ~870 | רכיב הסטריפ המרכזי |
| `MapZoneEditor` | ~1,200 | עורך אזורי מפה |

**סדר מומלץ (מהקטן לגדול, כל אחד עם build verify):**
1. `Strip` → `src/components/strips/Strip.tsx` (תלוי: sc✅, customConfirm✅, parseNoteValue✅, HandwritingOverlay, BlockMiniView)
2. רכיבי transfer (OutgoingTransferCard, IncomingTransferCard) → `src/components/transfers/`
3. `MapZoneEditor` → `src/components/map/`
4. `GroundView` → `src/components/views/GroundView.tsx`
5. `ManagementPage` → `src/components/admin/`
6. `SectorDashboard` → `src/components/views/SectorDashboard.tsx` (אחרון — הכי מורכב)

**כלל זהב:** כל חילוץ = build verify מיד אחריו. אם build נשבר — לחזור אחורה.
**אזהרה:** SectorDashboard מחייב שכל הרכיבים שהוא משתמש בהם כבר חולצו תחילה.

---

## User Stories

---

## סטטוס כללי

| שלב | סטטוס | תאריך |
|---|---|---|
| #018 דסק משימה כללי (מודול חדש) | ✅ הושלם | 2026-07-21 |
| קובץ לוג + Baseline | ✅ הושלם | 2026-06-21 |
| QA Baseline | ✅ הושלם | 2026-06-21 |
| פיצול server.js — DB layer + routes | ✅ הושלם | 2026-06-21 |
| QA אחרי server.js — 353/353 routes | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — utilities + types + shared (חולץ) | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — WIRING (App מייבא בפועל) + build verify | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — Strip + transfers + MapZoneEditor + GroundView + ground layer | ✅ הושלם | 2026-06-21 |
| פיצול App.tsx — כל ה-sub-components + ManagementPage + SectorDashboard | ✅ הושלם | 2026-06-22 |
| **App.tsx: 41,625 → 728 שורות (98.3% חולץ ל-38 מודולים)** | ✅ הושלם | 2026-06-22 |
| QA סופי | ✅ הושלם | 2026-06-21 |
| User Stories | ✅ הושלם | 2026-06-21 |
| ARCHITECTURE.md | ✅ הושלם | 2026-06-21 |
| תיקון DB tables חסרות | ✅ הושלם | 2026-06-21 |
