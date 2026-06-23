// Handwriting templates: the character set, the one-time calibration paragraph,
// and helpers to build an offline recognizer from stored stroke samples.
// Storage (DB table `learned_strokes`) and the API are wired in a later phase;
// these types define the contract.
import { DollarPRecognizer } from './dollarRecognizer';

/** A stored handwriting sample: a label and the raw strokes the user drew. */
export interface StrokeSample {
  label: string;                       // the character/token, e.g. "א", "7"
  strokes: { x: number; y: number }[][];
  source: 'seed' | 'user';             // base set vs learned-per-user
  crewMemberId?: number;
}

/** Full character set the recognizer should cover. */
export const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
export const HEBREW_FINALS = 'ךםןףץ'.split('');
export const DIGITS = '0123456789'.split('');
export const SYMBOLS = ['°', '/', '-', "'", '"'];
export const FULL_CHARSET = [...HEBREW_LETTERS, ...HEBREW_FINALS, ...DIGITS, ...SYMBOLS];

/**
 * One-time calibration paragraph. The user writes this once; because the
 * expected text is known, every stroke-group is auto-labeled — no manual
 * "write each letter N times". Covers all 22 letters (Hebrew pangram) + the
 * final forms, digits and symbols on separate lines.
 * NOTE: verify the pangram covers all letters before shipping.
 */
export const CALIBRATION_TEXT = [
  'דג סקרן שט בים מאוכזב ולפתע מצא חברה',  // pangram — all 22 letters
  'ךםןףץ',                                  // final forms
  '0 1 2 3 4 5 6 7 8 9',                     // digits
  "° / - ' \"",                              // symbols
];

/**
 * Build an offline recognizer from stored samples. User samples are added after
 * seed samples so that, for equal scores, personal handwriting is represented.
 */
export function buildRecognizer(samples: StrokeSample[]): DollarPRecognizer {
  const r = new DollarPRecognizer();
  const ordered = [...samples].sort((a, b) => (a.source === 'seed' ? 0 : 1) - (b.source === 'seed' ? 0 : 1));
  for (const s of ordered) {
    if (s.strokes && s.strokes.length) r.add(s.label, s.strokes);
  }
  return r;
}
