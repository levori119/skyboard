// הצהרות טיפוסים ל-shared/pinDisplay.js - ראה ההסבר בראש המימוש.

export type PinDisplay = 'handwrite' | 'text' | 'tag' | 'block' | 'small' | 'strip' | 'icon';

/** הסדר הוא סדר ההצגה בבורר. */
export declare const PIN_DISPLAY_MODES: readonly PinDisplay[];
export declare const DEFAULT_PIN_DISPLAY: 'handwrite';
export declare function isPinDisplay(v: unknown): v is PinDisplay;
export declare function normalizePinDisplay<F>(v: unknown, fallback: F): PinDisplay | F;
