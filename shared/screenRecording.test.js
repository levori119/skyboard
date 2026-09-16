// בדיקות הלוגיקה הטהורה של הקלטת המסך. אפיון: SCREEN_RECORDING_SPEC.md
import { describe, it, expect } from 'vitest';
import {
  RECORDING_PREFIX,
  KEEP_DIR,
  sanitizeFileToken,
  normalizeRecordingConfig,
  recordingBlockReason,
  recordingSegmentMs,
  recordingFileName,
  isRecordingFile,
  recordingStartedAt,
  expiredRecordingFiles,
  isSafeRecordingPath,
  pickRecordingMime,
  estimateRecordingBytes,
} from './screenRecording.js';

describe('sanitizeFileToken', () => {
  it('מסלק תווים אסורים בשם קובץ של Windows', () => {
    expect(sanitizeFileToken('בח"א 8')).toBe('בחא-8');
    expect(sanitizeFileToken('מרחבי/305')).toBe('מרחבי-305');
    expect(sanitizeFileToken('a\\b:c*d?e')).toBe('a-b-c-d-e');
  });

  it('חוסם מעבר תיקייה', () => {
    expect(sanitizeFileToken('../../etc')).toBe('etc');
    expect(sanitizeFileToken('..')).toBe('');
  });

  it('מחזיר ריק על קלט שאינו מחרוזת', () => {
    expect(sanitizeFileToken(null)).toBe('');
    expect(sanitizeFileToken(undefined)).toBe('');
    expect(sanitizeFileToken(42)).toBe('');
  });

  it('גוזר שם ארוך', () => {
    expect(sanitizeFileToken('א'.repeat(200)).length).toBeLessThanOrEqual(40);
  });
});

describe('normalizeRecordingConfig', () => {
  it('ברירות מחדל כשהשורה ריקה', () => {
    const c = normalizeRecordingConfig(null);
    expect(c).toMatchObject({ enabled: false, path: '', segmentMinutes: 15, retentionDays: 7, fps: 5, quality: 'medium' });
  });

  it('קורא את השורה מה-DB', () => {
    const c = normalizeRecordingConfig({
      recording_enabled: true, recording_path: 'D:\\SKYKING\\REC',
      recording_segment_minutes: 30, recording_retention_days: 14,
      recording_fps: 10, recording_quality: 'high',
    });
    expect(c).toMatchObject({ enabled: true, path: 'D:\\SKYKING\\REC', segmentMinutes: 30, retentionDays: 14, fps: 10, quality: 'high' });
  });

  it('מגביל ערכים חורגים במקום לקבל אותם', () => {
    const c = normalizeRecordingConfig({ recording_segment_minutes: 9999, recording_fps: 0, recording_retention_days: -5, recording_quality: 'ultra' });
    expect(c.segmentMinutes).toBe(120);
    expect(c.fps).toBe(1);
    expect(c.retentionDays).toBe(0);
    expect(c.quality).toBe('medium');
  });
});

describe('recordingBlockReason', () => {
  const ok = { enabled: true, path: 'C:\\REC' };
  it('null כשהכל מוגדר', () => {
    expect(recordingBlockReason(normalizeRecordingConfig({ recording_enabled: true, recording_path: 'C:\\REC' }))).toBe(null);
    expect(recordingBlockReason(ok)).toBe(null);
  });
  it('מפריד בין כבוי, בלי נתיב ונתיב פסול', () => {
    expect(recordingBlockReason({ enabled: false, path: 'C:\\REC' })).toBe('disabled');
    expect(recordingBlockReason({ enabled: true, path: '' })).toBe('noPath');
    expect(recordingBlockReason({ enabled: true, path: 'REC\\video' })).toBe('badPath');
  });
});

describe('recordingSegmentMs', () => {
  it('דקות לאלפיות', () => {
    expect(recordingSegmentMs({ segmentMinutes: 15 })).toBe(900000);
  });
});

describe('recordingFileName', () => {
  const startedAt = new Date(2026, 8, 16, 14, 32, 5); // 2026-09-16 14:32:05 מקומי

  it('בונה שם עם בסיס, עמדה וחותמת זמן מקומית', () => {
    expect(recordingFileName({ baseName: 'בח"א 8', presetName: 'תל נוף אווירי', startedAt, ext: 'mp4' }))
      .toBe('SKYKING_בחא-8_תל-נוף-אווירי_2026-09-16_143205.mp4');
  });

  it('מסמן הקלטה ידנית', () => {
    expect(recordingFileName({ baseName: '509', presetName: 'מרחבי 305', startedAt, ext: 'webm', manual: true }))
      .toBe('SKYKING_509_מרחבי-305_2026-09-16_143205_manual.webm');
  });

  it('נופל לשם חלופי כששם הבסיס או העמדה ריק', () => {
    const n = recordingFileName({ baseName: '', presetName: null, startedAt, ext: 'webm' });
    expect(n.startsWith(`${RECORDING_PREFIX}_`)).toBe(true);
    expect(isRecordingFile(n)).toBe(true);
  });

  it('שם הקובץ שנבנה לעולם אינו נושא מפריד נתיב', () => {
    const n = recordingFileName({ baseName: '..\\..\\windows', presetName: 'a/b', startedAt, ext: 'webm' });
    expect(n).not.toMatch(/[\\/]/);
  });
});

describe('isRecordingFile / recordingStartedAt', () => {
  it('מזהה רק קבצים שלנו', () => {
    expect(isRecordingFile('SKYKING_509_מרחבי-305_2026-09-16_143205.webm')).toBe(true);
    expect(isRecordingFile('SKYKING_509_x_2026-09-16_143205_manual.mp4')).toBe(true);
    expect(isRecordingFile('חומר-תחקיר-של-מישהו.mp4')).toBe(false);
    expect(isRecordingFile('SKYKING_509_x_2026-09-16_143205.txt')).toBe(false);
    expect(isRecordingFile('SKYKING_no_timestamp.webm')).toBe(false);
  });

  it('שולף את זמן ההתחלה', () => {
    const d = recordingStartedAt('SKYKING_509_מרחבי-305_2026-09-16_143205.webm');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(16);
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(32);
    expect(recordingStartedAt('אחר.webm')).toBe(null);
  });
});

describe('expiredRecordingFiles', () => {
  const now = new Date(2026, 8, 16, 12, 0, 0);
  const f = (day) => `SKYKING_509_x_2026-09-${String(day).padStart(2, '0')}_100000.webm`;

  it('מחזיר רק קבצים שעברו את תקופת השמירה', () => {
    const out = expiredRecordingFiles([f(1), f(8), f(10), f(16)], { now, retentionDays: 7 });
    expect(out).toEqual([f(1), f(8)]);
  });

  it('לא נוגע בקובץ שאינו שלנו, גם אם הוא עתיק', () => {
    expect(expiredRecordingFiles(['תחקיר-2019.mp4', 'random.webm'], { now, retentionDays: 1 })).toEqual([]);
  });

  it('0 ימים = לא מוחקים כלום', () => {
    expect(expiredRecordingFiles([f(1)], { now, retentionDays: 0 })).toEqual([]);
  });
});

describe('isSafeRecordingPath', () => {
  it('מאשר נתיב מוחלט ונתיב רשת', () => {
    expect(isSafeRecordingPath('D:\\SKYKING\\REC')).toBe(true);
    expect(isSafeRecordingPath('D:/SKYKING/REC')).toBe(true);
    expect(isSafeRecordingPath('\\\\srv01\\skyking$\\rec')).toBe(true);
    expect(isSafeRecordingPath('/var/skyking/rec')).toBe(true);
  });

  it('פוסל נתיב יחסי, מעבר תיקייה, הרחבת משתנים ותווים אסורים', () => {
    expect(isSafeRecordingPath('')).toBe(false);
    expect(isSafeRecordingPath('rec')).toBe(false);
    expect(isSafeRecordingPath('D:\\rec\\..\\..\\windows')).toBe(false);
    expect(isSafeRecordingPath('%APPDATA%\\rec')).toBe(false);
    expect(isSafeRecordingPath('D:\\rec\\a|b')).toBe(false);
    expect(isSafeRecordingPath('D:\\rec\\a\0b')).toBe(false);
    expect(isSafeRecordingPath(null)).toBe(false);
  });
});

describe('pickRecordingMime', () => {
  it('מעדיף MP4/H264 - נפתח בנגן של Windows בלי קודק', () => {
    expect(pickRecordingMime(() => true)).toMatchObject({ ext: 'mp4' });
  });

  it('נופל ל-VP9 ואז ל-VP8', () => {
    expect(pickRecordingMime(m => m.includes('vp9') || m.includes('vp8'))).toMatchObject({ ext: 'webm', mimeType: expect.stringContaining('vp9') });
    expect(pickRecordingMime(m => m.includes('vp8'))).toMatchObject({ mimeType: expect.stringContaining('vp8') });
  });

  it('null כשאין קודק נתמך', () => {
    expect(pickRecordingMime(() => false)).toBe(null);
  });
});

describe('estimateRecordingBytes', () => {
  it('אומדן נפח לפי איכות, שעות ביום וימי שמירה', () => {
    const b = estimateRecordingBytes({ quality: 'medium', hoursPerDay: 8, retentionDays: 7 });
    // 1.5Mbps / 8 * 3600 * 8 * 7
    expect(b).toBe((1_500_000 / 8) * 3600 * 8 * 7);
  });

  it('0 ימי שמירה = אומדן יום אחד, כדי שלא יוצג 0', () => {
    expect(estimateRecordingBytes({ quality: 'low', hoursPerDay: 8, retentionDays: 0 })).toBe((600_000 / 8) * 3600 * 8);
  });
});

describe('קבועים', () => {
  it('תיקיית השמורים ותחילית השם קבועות', () => {
    expect(RECORDING_PREFIX).toBe('SKYKING');
    expect(KEEP_DIR).toBe('keep');
  });
});
