const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

let mainWindow = null;

function loadConfig() {
  if (isDev) return;

  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.DATABASE_URL) process.env.DATABASE_URL = config.DATABASE_URL;
      if (config.PORT) process.env.PORT = String(config.PORT);
    } catch (e) {
      console.error('Failed to read config.json:', e);
    }
  } else {
    const template = {
      DATABASE_URL: 'postgres://user:password@host:5432/database',
      PORT: 3001
    };
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf8');

    dialog.showMessageBoxSync({
      type: 'info',
      title: 'SKY KING — הגדרה ראשונית',
      buttons: ['אישור'],
      message: 'יש להגדיר את חיבור מסד הנתונים לפני ההפעלה.',
      detail: `נוצר קובץ הגדרות:\n${configPath}\n\nערוך את DATABASE_URL בקובץ ואז הפעל מחדש את התוכנה.`
    });

    shell.openPath(configPath);
    app.quit();
    return false;
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('user:password')) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'SKY KING — שגיאת הגדרות',
      buttons: ['אישור'],
      message: 'DATABASE_URL לא הוגדר.',
      detail: `יש לערוך את הקובץ:\n${configPath}\n\nולהגדיר DATABASE_URL תקין.`
    });
    shell.openPath(configPath);
    app.quit();
    return false;
  }

  return true;
}

async function startServerAndCreateWindow() {
  if (!isDev) {
    const ok = loadConfig();
    if (ok === false) return;

    process.env.PORT = process.env.PORT || '3001';
    process.env.NODE_ENV = 'production';

    try {
      await import('./server.js');
    } catch (err) {
      dialog.showErrorBox('SKY KING — שגיאת שרת', `השרת לא הצליח לעלות:\n${err.message}`);
      app.quit();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  // ── חלון העמדה: kiosk ─────────────────────────────────────────────────────
  // העמדה עולה במסך מלא נעול: בלי שורת כתובת וטאבים, ובלי מסגרת חלון
  // (X / מקסום / מיזעור). גם בפיתוח וגם בגרסת ההפצה — כדי שמה שנבדק הוא
  // מה שרץ בעמדה. הרצה בחלון רגיל לתחזוקה: SKYKING_WINDOWED=1
  const windowed = process.env.SKYKING_WINDOWED === '1';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'SKY KING — לוח שמיים',
    fullscreen: !windowed,
    frame: windowed,      // false = בלי מסגרת חלון כלל
    kiosk: !windowed,     // נועל את המסך המלא (לא ניתן לצאת בטעות)
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  console.log(`[window] kiosk=${mainWindow.isKiosk()} fullscreen=${mainWindow.isFullScreen()} frame=${windowed}`);

  // F11 משחרר/מחזיר את נעילת המסך המלא — שסתום מילוט לתחזוקה בעמדה
  // (ב-kiosk אין X לסגירה; Alt+F4 עדיין סוגר)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      mainWindow.setKiosk(!mainWindow.isKiosk());
    }
  });

  const url = isDev ? 'http://localhost:5000' : `http://localhost:${process.env.PORT || 3001}`;

  mainWindow.loadURL(url);

  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow.loadURL(url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(startServerAndCreateWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow) startServerAndCreateWindow();
});
