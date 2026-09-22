export interface AlertTone {
  /** גובה הצליל. מערך = צליל עולה (כל צפצוף בגובה הבא) */
  freq: number | number[];
  type: OscillatorType;
  beeps: number;
  /** אורך צפצוף בשניות */
  len: number;
  /** מרווח בין תחילות צפצופים בשניות */
  gap: number;
  gain: number;
}

export type AlertToneName = 'stop' | 'caution' | 'clear' | 'notify';

export interface Beep { at: number; freq: number; len: number; gain: number; type: OscillatorType }

export declare const TONES: Readonly<Record<AlertToneName, AlertTone>>;
export declare const ALERT_TONE_BY_KIND: Readonly<Record<string, AlertToneName>>;
export declare function toneOf(name: string | undefined): AlertTone;
export declare function beepSchedule(tone: AlertTone): Beep[];
/** `unsupported` | `blocked` | `suspended` | `running` */
export declare function audioState(): 'unsupported' | 'blocked' | 'suspended' | 'running';
/** לקרוא מתוך מגע משתמש. בטוח לקריאה חוזרת. */
export declare function unlockAudio(): ReturnType<typeof audioState>;
export declare function playTone(name: string): boolean;
export declare function speakAlert(text: string, opts?: { lang?: string; rate?: number; volume?: number }): boolean;
export declare function alertSound(name: string, text?: string, opts?: { lang?: string; rate?: number; volume?: number }): boolean;
