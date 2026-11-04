/**
 * **צבע כותרת הקיבוץ במוד טבלה.** הפקח/בקר בוחר צבע עד שהכותרת בולטת מספיק
 * על הלוח שלו. הצבע חל על הכותרת **ועל תיבת הקבוצה** (הפס והרצפה), כך שהקבוצה
 * נשארת יחידה אחת בצבע אחד. נשמר פר-עמדה ב-localStorage (העדפת תצוגה, לא נתון).
 *
 * אדום לא בפלטה בכוונה - הוא שמור לקונפליקט גבהים בשורות שמתחת לכותרת.
 */
export type ThemeMode = 'dark' | 'light' | 'ocean' | string;

export const GROUP_HEADER_COLORS = ['violet', 'blue', 'cyan', 'green', 'amber', 'pink', 'white'] as const;
export type GroupHeaderColor = typeof GROUP_HEADER_COLORS[number];

export interface GroupHeaderStyle {
  /** הפס, הרצפה ומסגרת הכותרת */
  solid: string;
  /** רקע שורת הכותרת */
  bg: string;
  /** טקסט על הרקע (שם הקבוצה, החץ, הידית) */
  fg: string;
  /** רקע תג שם הקבוצה */
  chipBg: string;
  /** רקע תג המונה */
  countBg: string;
}

const P: Record<Exclude<GroupHeaderColor, 'violet'>, { solid: string; dark: string; light: string; ink: string }> = {
  blue: { solid: '#3b82f6', dark: '#1e3a8a', light: '#dbeafe', ink: '#1e3a8a' },
  cyan: { solid: '#06b6d4', dark: '#155e75', light: '#cffafe', ink: '#164e63' },
  green: { solid: '#22c55e', dark: '#14532d', light: '#dcfce7', ink: '#14532d' },
  amber: { solid: '#f59e0b', dark: '#78350f', light: '#fef3c7', ink: '#78350f' },
  pink: { solid: '#ec4899', dark: '#831843', light: '#fce7f3', ink: '#831843' },
  white: { solid: '#e2e8f0', dark: '#e2e8f0', light: '#334155', ink: '#0f172a' },
};

export function isGroupHeaderColor(v: unknown): v is GroupHeaderColor {
  return typeof v === 'string' && (GROUP_HEADER_COLORS as readonly string[]).includes(v);
}

export function groupHeaderStyle(color: GroupHeaderColor, themeMode: ThemeMode): GroupHeaderStyle {
  const light = themeMode === 'light';
  if (color === 'violet') {
    // ברירת המחדל - בדיוק הצבעים שהיו לפני הבחירה
    const ocean = themeMode === 'ocean';
    return {
      solid: light ? '#7c3aed' : ocean ? '#0ea5e9' : '#6d28d9',
      bg: light ? '#ede9fe' : ocean ? '#0369a1' : '#1e1b4b',
      fg: light ? '#2e1065' : '#fff',
      chipBg: light ? '#fff' : 'rgba(255,255,255,0.18)',
      countBg: light ? '#7c3aed' : 'rgba(255,255,255,0.22)',
    };
  }
  const p = P[color];
  // "לבן" הפוך: רקע בהיר בתמה כהה, רקע כהה בתמת יום - תמיד הניגוד הגבוה ביותר
  if (color === 'white') {
    return light
      ? { solid: '#334155', bg: '#334155', fg: '#fff', chipBg: 'rgba(255,255,255,0.18)', countBg: 'rgba(255,255,255,0.25)' }
      : { solid: p.solid, bg: p.dark, fg: p.ink, chipBg: '#fff', countBg: '#0f172a' };
  }
  return light
    ? { solid: p.solid, bg: p.light, fg: p.ink, chipBg: '#fff', countBg: p.solid }
    : { solid: p.solid, bg: p.dark, fg: '#fff', chipBg: 'rgba(255,255,255,0.18)', countBg: 'rgba(255,255,255,0.22)' };
}

const key = (presetId: unknown) => `sk.grpHeaderColor.${presetId ?? 'none'}`;

export function loadGroupHeaderColor(presetId: unknown): GroupHeaderColor {
  try {
    const v = localStorage.getItem(key(presetId));
    return isGroupHeaderColor(v) ? v : 'violet';
  } catch { return 'violet'; }
}

export function saveGroupHeaderColor(presetId: unknown, color: GroupHeaderColor): void {
  try { localStorage.setItem(key(presetId), color); } catch { /* העדפה בלבד */ }
}
