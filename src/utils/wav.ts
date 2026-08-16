// קידוד WAV (PCM 16 ביט, מונו) עבור מנוע התמלול המקומי בעמדה.
//
// למה זה קיים: whisper.cpp מקבל **רק** WAV של PCM 16 ביט מונו ב-16kHz. הדפדפן,
// לעומת זאת, מקליט ב-webm/opus בקצב של כרטיס הקול (בד"כ 48kHz) ומפענח ל-Float32.
// הקובץ הזה הוא החוליה שביניהם - ובכוונה פונקציות טהורות בלבד, בלי תלות ב-DOM,
// כדי שאפשר יהיה לבדוק אותן ביחידה (הדגימה הראשונה שנגזרת לא נכון = תמלול רועש).
//
// המרת הקצב עצמה נעשית ב-OfflineAudioContext של הדפדפן (ראה speech.ts) - איכות
// ההמרה שלו טובה מכל resampler ידני שנכתוב כאן.

/** גודל ה-header הקנוני של WAV/PCM: RIFF + fmt + data. */
export const WAV_HEADER_BYTES = 44;

/** קצב הדגימה היחיד ש-whisper.cpp מקבל. */
export const WHISPER_SAMPLE_RATE = 16000;

/**
 * Float32 (טווח 1.0- עד 1.0) → PCM 16 ביט.
 * גזירה (clamp) ולא גלישה: ערך של 2.0 שגולש היה הופך לדגימה שלילית קיצונית,
 * כלומר נפץ ברצועה - ו-whisper מתמלל נפץ כרעש או כמילה שגויה.
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const v = input[i];
    const s = Number.isNaN(v) ? 0 : Math.max(-1, Math.min(1, v));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

/**
 * דגימות Float32 → באפר WAV שלם (header + נתונים), מונו PCM 16 ביט.
 */
export function encodeWav(samples: Float32Array, sampleRate: number = WHISPER_SAMPLE_RATE): ArrayBuffer {
  const pcm = floatTo16BitPCM(samples);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const channels = 1;
  const bytesPerSample = 2;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES + dataBytes - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                                   // אורך בלוק fmt
  view.setUint16(20, 1, true);                                    // 1 = PCM לא דחוס
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);            // blockAlign
  view.setUint16(34, bytesPerSample * 8, true);                   // bitsPerSample
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(WAV_HEADER_BYTES + i * 2, pcm[i], true);
  }
  return buffer;
}

/**
 * באפר → base64.
 *
 * למה base64 ולא להעביר את הבאפר עצמו: הגשר ל-Electron (contextBridge) מבטיח
 * בתיעוד הרשמי רק "Cloneable Types" בלי לציין ArrayBuffer/TypedArray במפורש.
 * מחרוזת נתמכת חד-משמעית, והמחיר זניח - קליפ של 3 שניות הוא ~128KB.
 *
 * הפיצול לקטעים הכרחי: btoa על מערך שלם ב-apply קורס ב-stack overflow
 * על הקלטות ארוכות.
 */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
