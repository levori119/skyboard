import React from 'react';

/**
 * שמירה גם בכותרת הטופס - ולא רק בתחתיתו.
 *
 * טופס עריכה ארוך (נקודת העברה עם עמדות, מוד טבלה, ב"ד) מחייב לגלול עד
 * התחתית רק כדי ללחוץ "שמור". הכפתור כאן יושב בשורת הכותרת, שנשארת גלויה
 * בגלילה, ו**מכפיל** את הכפתור התחתון - לא מחליף אותו.
 *
 * כלל: אותו handler, אותה נעילה (שומר / לא תקין) ואותה תווית ("שמור" ביצירה,
 * "עדכון" בעריכה) כמו הכפתור שבתחתית. לכן הקורא מחשב אותם פעם אחת ומעביר
 * לשניהם - שני כפתורים שמתנהגים אחרת הם באג שמחכה לקרות.
 */
export interface TitleSaveProps {
  onSave: () => void;
  label: string;
  disabled?: boolean;
  /** צבע הכפתור התחתון של אותו טופס, כדי שיזוהה במבט כאותה פעולה */
  color?: string;
  testId?: string;
}

export const TitleSaveButton = ({ onSave, label, disabled = false, color = '#059669', testId = 'form-title-save' }: TitleSaveProps) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onSave}
    disabled={disabled}
    style={{
      padding: '5px 14px', background: disabled ? '#334155' : color, color: 'white', border: 'none',
      borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'bold',
      opacity: disabled ? 0.6 : 1, flexShrink: 0, whiteSpace: 'nowrap', lineHeight: 1.3,
    }}
  >
    {label}
  </button>
);

/**
 * גובה הכותרת הדביקה של מסך הניהול (`header` ב-ManagementPage, כ-68px).
 * שורת כותרת דביקה של טופס בתוך מסך הניהול נעצרת מתחתיה, אחרת היא נבלעת מאחוריה.
 */
export const ADMIN_STICKY_TOP = 72;

/**
 * שורת הכותרת של טופס עריכה שאינו במודל: כותרת + כפתור שמירה בקצה.
 * דביקה כברירת מחדל - נשארת בראש הטופס בזמן שגוללים את גופו, ועוזבת יחד
 * איתו כשהטופס כולו יוצא מהמסך (sticky מוגבל לבלוק שמכיל אותה).
 */
export const FormTitleBar = ({
  title, save, sticky = true, top = ADMIN_STICKY_TOP, background = '#0f172a', titleStyle, marginBottom = 14,
}: {
  /** בלי כותרת - השורה מציגה רק את הכפתור, בקצה */
  title?: React.ReactNode;
  /** בלי save - שורת כותרת רגילה (למשל כשהכפתור כבר בכותרת המודל שעוטף את הטופס) */
  save?: TitleSaveProps;
  sticky?: boolean;
  top?: number;
  /** רקע אטום בצבע הטופס - אחרת השדות שנגללים מתחת נראים דרך השורה */
  background?: string;
  titleStyle?: React.CSSProperties;
  marginBottom?: number;
}) => (
  <div
    data-testid="form-title-bar"
    style={{
      display: 'flex', alignItems: 'center', gap: '10px', marginBottom,
      ...(sticky ? { position: 'sticky' as const, top, zIndex: 5, background, paddingBlock: '6px' } : {}),
    }}
  >
    <div style={{ flex: 1, minWidth: 0, margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#94a3b8', ...titleStyle }}>{title}</div>
    {save && <TitleSaveButton {...save} />}
  </div>
);
