import { describe, it, expect } from 'vitest';
import { encodeWav, floatTo16BitPCM, bytesToBase64, WAV_HEADER_BYTES } from './wav';

// קורא מחרוזת ASCII מתוך ה-header
const ascii = (buf: ArrayBuffer, offset: number, len: number) =>
  String.fromCharCode(...new Uint8Array(buf, offset, len));

const u32 = (buf: ArrayBuffer, offset: number) => new DataView(buf).getUint32(offset, true);
const u16 = (buf: ArrayBuffer, offset: number) => new DataView(buf).getUint16(offset, true);

describe('floatTo16BitPCM', () => {
  it('ממפה 0 לאפס, +1 לשיא החיובי, -1 לשיא השלילי', () => {
    const out = floatTo16BitPCM(new Float32Array([0, 1, -1]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
  });

  it('גוזר ערכים מחוץ לתחום במקום לגלוש (clipping ולא wrap-around)', () => {
    // בלי גזירה, 2.0 היה גולש למספר שלילי ויוצר רעש נפץ בתמלול
    const out = floatTo16BitPCM(new Float32Array([2, -2, 1.0001]));
    expect(out[0]).toBe(32767);
    expect(out[1]).toBe(-32768);
    expect(out[2]).toBe(32767);
  });

  it('שומר על אורך הקלט', () => {
    expect(floatTo16BitPCM(new Float32Array(128)).length).toBe(128);
  });

  it('NaN הופך לאפס ולא ל-undefined (מיקרופון מנותק מחזיר NaN)', () => {
    const out = floatTo16BitPCM(new Float32Array([NaN]));
    expect(out[0]).toBe(0);
  });
});

describe('encodeWav', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1]);

  it('כותב RIFF/WAVE/fmt/data - מה ש-whisper.cpp דורש', () => {
    const buf = encodeWav(samples, 16000);
    expect(ascii(buf, 0, 4)).toBe('RIFF');
    expect(ascii(buf, 8, 4)).toBe('WAVE');
    expect(ascii(buf, 12, 4)).toBe('fmt ');
    expect(ascii(buf, 36, 4)).toBe('data');
  });

  it('גודל הבאפר = header + 2 בתים לכל דגימה', () => {
    const buf = encodeWav(samples, 16000);
    expect(buf.byteLength).toBe(WAV_HEADER_BYTES + samples.length * 2);
  });

  it('מצהיר PCM מונו 16 ביט - whisper.cpp דוחה סטריאו או float', () => {
    const view = encodeWav(samples, 16000);
    expect(u16(view, 20)).toBe(1);   // audioFormat = PCM
    expect(u16(view, 22)).toBe(1);   // channels = mono
    expect(u16(view, 34)).toBe(16);  // bitsPerSample
  });

  it('כותב את קצב הדגימה שנמסר, ואת byteRate/blockAlign הנגזרים ממנו', () => {
    const buf = encodeWav(samples, 16000);
    expect(u32(buf, 24)).toBe(16000);       // sampleRate
    expect(u32(buf, 28)).toBe(16000 * 2);   // byteRate = rate * channels * bytesPerSample
    expect(u16(buf, 32)).toBe(2);           // blockAlign
  });

  it('שדות האורך ב-header עקביים עם גודל הבאפר בפועל', () => {
    const buf = encodeWav(samples, 16000);
    expect(u32(buf, 4)).toBe(buf.byteLength - 8);              // RIFF chunk size
    expect(u32(buf, 40)).toBe(samples.length * 2);             // data chunk size
  });

  it('הדגימות נכתבות little-endian אחרי ה-header', () => {
    const buf = encodeWav(new Float32Array([1]), 16000);
    const view = new DataView(buf);
    expect(view.getInt16(WAV_HEADER_BYTES, true)).toBe(32767);
  });

  it('קלט ריק מייצר WAV תקין עם 0 דגימות (ולא קורס)', () => {
    const buf = encodeWav(new Float32Array(0), 16000);
    expect(buf.byteLength).toBe(WAV_HEADER_BYTES);
    expect(u32(buf, 40)).toBe(0);
  });

  it('ברירת המחדל היא 16kHz - הקצב היחיד ש-whisper.cpp מקבל', () => {
    expect(u32(encodeWav(samples), 24)).toBe(16000);
  });
});

describe('bytesToBase64', () => {
  const roundTrip = (b64: string) => Buffer.from(b64, 'base64');

  it('מקודד באפר קצר בדיוק כמו Buffer של Node (הצד שמפענח ב-Electron)', () => {
    const buf = new Uint8Array([0, 1, 127, 128, 255]).buffer;
    expect(roundTrip(bytesToBase64(buf)).equals(Buffer.from([0, 1, 127, 128, 255]))).toBe(true);
  });

  it('שורד הקלטה ארוכה בלי stack overflow - זה מה שהפיצול לקטעים מונע', () => {
    // 10 שניות ב-16kHz PCM16 ≈ 320KB, הרבה מעבר לגבול ש-apply קורס בו
    const bytes = new Uint8Array(320_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const decoded = roundTrip(bytesToBase64(bytes.buffer));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.equals(Buffer.from(bytes))).toBe(true);
  });

  it('שומר על גבול הקטעים - בית 0x8000 בדיוק לא נחתך', () => {
    const bytes = new Uint8Array(0x8000 + 5);
    bytes.fill(0xab);
    expect(roundTrip(bytesToBase64(bytes.buffer)).equals(Buffer.from(bytes))).toBe(true);
  });

  it('באפר ריק מחזיר מחרוזת ריקה', () => {
    expect(bytesToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('WAV מקודד עובר הלוך-חזור ושומר על ה-header', () => {
    const wav = encodeWav(new Float32Array([0.25, -0.25]), 16000);
    const back = roundTrip(bytesToBase64(wav));
    expect(back.length).toBe(wav.byteLength);
    expect(back.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });
});
