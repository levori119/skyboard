@echo off
rem פתיחת SKY-KING באתר (Railway) כחלון אפליקציה - בלי שורת כתובת ולשוניות.
rem
rem למה חלון אפליקציה (--app) ולא לשונית רגילה: הדפדפן מרשה לאתר לסגור
rem רק חלון שאין בו היסטוריית ניווט. חלון שנפתח ישירות על הכתובת עומד בזה,
rem ולכן כפתור "יציאה" במסך הכניסה סוגר אותו בפועל.
rem
rem שימוש: לחיצה כפולה, או קיצור דרך לקובץ על שולחן העבודה.
rem כתובת אחרת: open-skyking.cmd https://...

set "URL=https://sky-king.up.railway.app/"
if not "%~1"=="" set "URL=%~1"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --app="%URL%" --start-maximized
) else if exist "%CHROME%" (
  start "" "%CHROME%" --app="%URL%" --start-maximized
) else (
  rem בלי Edge/Chrome - דפדפן ברירת המחדל (כאן היציאה לא תסגור את הלשונית)
  start "" "%URL%"
)
