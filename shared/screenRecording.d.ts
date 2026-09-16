// הצהרות טיפוסים ל-shared/screenRecording.js - ראה ההסבר בראש המימוש.

export type RecordingQuality = 'low' | 'medium' | 'high';
/** *למה* ההקלטה אינה רצה. null = היא יכולה לרוץ. */
export type RecordingBlockReason = null | 'disabled' | 'noPath' | 'badPath';

export interface RecordingConfig {
  enabled: boolean;
  path: string;
  segmentMinutes: number;
  retentionDays: number;
  fps: number;
  quality: RecordingQuality;
}

export declare const RECORDING_PREFIX: string;
export declare const KEEP_DIR: string;
export declare const QUALITY_BITRATE: Record<RecordingQuality, number>;
export declare const RECORDING_DEFAULTS: RecordingConfig;
export declare const RECORDING_LIMITS: Record<'segmentMinutes' | 'retentionDays' | 'fps', { min: number; max: number }>;

/** שם בסיס/עמדה → רסיס בטוח בשם קובץ (עברית נשמרת, גרשיים נמחקים) */
export declare function sanitizeFileToken(v: unknown): string;

/** שורת `aviation_bases` (או אובייקט מנורמל) → תצורה מוגבלת לגבולות */
export declare function normalizeRecordingConfig(row: unknown): RecordingConfig;

/** למה ההקלטה לא רצה - להצגה למפעיל, לא רק לכיבוי שקט */
export declare function recordingBlockReason(cfg: Partial<RecordingConfig> | null | undefined): RecordingBlockReason;

/** אורך קטע באלפיות שנייה */
export declare function recordingSegmentMs(cfg: Partial<RecordingConfig> | null | undefined): number;

/** קצב הסיביות לפי האיכות */
export declare function recordingBitrate(cfg: Partial<RecordingConfig> | null | undefined): number;

/** `SKYKING_<בסיס>_<עמדה>_<תאריך>_<שעה מקומית>[_manual].<סיומת>` */
export declare function recordingFileName(p: {
  baseName?: unknown;
  presetName?: unknown;
  startedAt?: Date;
  ext?: 'webm' | 'mp4' | string;
  manual?: boolean;
}): string;

/** האם הקובץ נוצר על ידי המערכת (המחיקה האוטומטית נשענת על זה) */
export declare function isRecordingFile(name: unknown): boolean;

/** זמן ההתחלה מתוך שם הקובץ (שעה מקומית), או null */
export declare function recordingStartedAt(name: unknown): Date | null;

/** הקבצים שעברו את תקופת השמירה. `retentionDays: 0` = לא מוחקים כלום */
export declare function expiredRecordingFiles(
  names: unknown,
  opts?: { now?: Date; retentionDays?: number },
): string[];

/** נתיב יעד קביל: תיקייה מוחלטת, נתיב רשת (UNC) או POSIX. **שורש כונן נפסל** */
export declare function isSafeRecordingPath(p: unknown): boolean;

/** שורש הנתיב: `D:\` · `\\srv\share` · `/`. '' לקלט שאינו נתיב */
export declare function recordingPathRoot(p: unknown): string;

/** קוד שגיאה של מערכת ההפעלה → סיבה שאפשר להציג למפעיל */
export declare function recordingPathErrorKey(
  codeOrMessage: unknown,
): 'perm' | 'missing' | 'network' | 'space' | 'other';

/** הקודק להקלטה לפי תמיכה בפועל. MP4/H264 מועדף - נפתח בנגן של Windows */
export declare function pickRecordingMime(
  isSupported: (mimeType: string) => boolean,
): { mimeType: string; ext: 'mp4' | 'webm' } | null;

/** אומדן נפח בדיסק להצגה בניהול הטכני */
export declare function estimateRecordingBytes(p?: {
  quality?: RecordingQuality | string;
  hoursPerDay?: number;
  retentionDays?: number;
}): number;
