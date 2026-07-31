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
//   3. אין ערוץ שמקבל נתיב קובץ מהעמוד.

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
});
