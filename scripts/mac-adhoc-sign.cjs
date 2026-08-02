// חתימת ad-hoc ל-.app אחרי האריזה (hook: afterPack).
//
// למה: אין לנו תעודת Apple Developer בתשלום, ולכן electron-builder מקבל
// identity=null ומדלג על חתימה. אבל macOS על Apple Silicon *מחייב* שכל בינארי
// arm64 יישא חתימה תקפה - ו-electron-builder שובר את החתימה המקורית של Electron
// כשהוא משנה שם לבינארי, מזריק app.asar ועורך את Info.plist. בלי חתימה מחדש
// המק מסרב להריץ ("האפליקציה פגומה"). חתימת ad-hoc ("-") אינה עולה כסף,
// אינה מזוהה מול Apple - ומספיקה כדי שהבינארי ירוץ.
//
// שים לב: היא *לא* פותרת את Gatekeeper בהורדה מהאינטרנט. שם עדיין צריך
// לפתוח בפעם הראשונה עם קליק ימני → Open, או להסיר את סימון ההסגר:
//   xattr -dr com.apple.quarantine "/Applications/SKY KING Station.app"
//
// הפעלה: רק ב-mac. בבנייה ל-Windows/Linux ה-hook יוצא מיד.

const { execFileSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  // --force  להחליף את החתימה השבורה שנשארה מהאריזה
  // --deep   כולל ה-Frameworks וה-Helpers שבתוך החבילה
  // --sign - חתימת ad-hoc (בלי תעודה)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  // אימות: אם החתימה לא תפסה, עדיף להיכשל כאן ולא אצל המשתמש במק
  execFileSync('codesign', ['--verify', '--verbose=2', appPath], { stdio: 'inherit' });

  // appOutDir נושא את הארכיטקטורה בשמו (mac / mac-arm64) - די בו לזיהוי בלוג
  console.log(`[mac-adhoc-sign] נחתם ad-hoc: ${appPath}`);
};
