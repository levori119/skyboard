// גשר בין העמוד לתהליך הראשי - תמלול קולי מקומי.
//
// למה זה קיים: ה-Web Speech API לא עובד ב-Electron (הוא נשען על שירות ענן של
// גוגל שהמפתחות אליו קומפלו רק לתוך Chrome). בעמדה מתמללים מקומית עם whisper.cpp,
// והעמוד צריך דרך לקרוא לו.
//
// ⚠️ אבטחה - העמוד נטען מכתובת מרוחקת (Railway), ולכן:
//   1. **מתודה אחת לכל ערוץ IPC** - לא חושפים את ipcRenderer עצמו. עמוד עוין
//      שיושב על ה-origin שלנו לא יכול לשלוח הודעות IPC שרירותיות.
//   2. אין כאן require של fs/child_process ואין nodeIntegration - הכל עובר
//      דרך התהליך הראשי, שמאמת בעצמו את מקור הבקשה.
//   3. אין ערוץ שמקבל נתיב קובץ מהעמוד - גם לא ערוצי ההקלטה.
//      הקלטת המסך כותבת לדיסק, ולכן הנתיב נשאב בתהליך הראשי
//      מ-/api/screen-recording/config לפי **מזהה בסיס** שהעמוד מוסר.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skyking', {
  /** האם מנוע התמלול מותקן ומוכן. { ok, code } */
  sttAvailable: () => ipcRenderer.invoke('stt:available'),

  /**
   * מתמלל WAV (16kHz מונו PCM16) המקודד base64.
   * מחזיר { ok, text } או { ok:false, code }.
   */
  transcribe: (wavBase64) =>
    ipcRenderer.invoke('stt:transcribe', typeof wavBase64 === 'string' ? wavBase64 : ''),

  // ── הקלטת פעולות במסך (SCREEN_RECORDING_SPEC.md) ──────────────────
  // הצילום והקידוד נעשים בעמוד (שם יש MediaRecorder), והכתיבה לדיסק
  // בתהליך הראשי (שם יושב הנתיב).
  //
  // ⚠ אף אחת מהמתודות האלו **אינה מקבלת נתיב** - גם לא שם תיקייה
  // או שם קובץ. העמוד מוסר **מזהה בסיס** ואת האסימון שלו, והתהליך
  // הראשי שואב את הנתיב מהשרת בעצמו. כך עמוד שיגיע לחלון אינו יכול
  // לבחור לאן נכתב בדיסק - הוא יכול לכל היותר להפעיל הקלטה לתיקייה
  // שהניהול הטכני הגדיר.

  /** האם העמדה יכולה להקליט, ומה מצבה כרגע */
  recStatus: () => ipcRenderer.invoke('rec:status'),

  /** פותח קובץ ומחזיר את פרמטרי הקידוד שנקבעו בניהול הטכני */
  recStart: (opts) => ipcRenderer.invoke('rec:start', {
    baseId: opts && opts.baseId,
    presetName: opts && opts.presetName,
    token: opts && opts.token,
    ext: opts && opts.ext,
    manual: opts && opts.manual,
  }),

  /** נתח מקודד (Uint8Array) → נכתב לסוף הקובץ */
  recChunk: (bytes) => ipcRenderer.invoke('rec:chunk', bytes),

  /** סוגר את הקטע הנוכחי ופותח קובץ חדש */
  recRotate: () => ipcRenderer.invoke('rec:rotate'),

  /** "שמור את הקטע הזה" - הנוכחי והקודם לא יימחקו */
  recKeep: () => ipcRenderer.invoke('rec:keep'),

  /** עוצר ומשלים את הקובץ */
  recStop: () => ipcRenderer.invoke('rec:stop'),
});
