// אייקון מטבלת האייקונים של מוד הטבלה - רכיב אחד לתא בעמדה ולבוחר בניהול.
// מובנה (`builtin:f16`) = צללית המטוס של המערכת, בצבע שנמסר כדי שתהיה קריאה
// בשלוש התמות. תמונה (`img:12`) = מה שהועלה בניהול, כמו שהוא.
import React from 'react';
import { parseIconRef } from '../../utils/tableCellDisplay';
import { renderAircraftSvgPaths } from '../../utils/aircraft';
import { displayIconById, type DisplayIconRow } from '../../utils/displayIcons';

export default function DisplayIcon({ iconRef, icons, size = 22, color, title }: {
  iconRef: string | null | undefined;
  icons: DisplayIconRow[];
  /** בפיקסלים. ברירת מחדל - בגובה שורת טבלה */
  size?: number | string;
  /** צבע הצללית (מובנה בלבד) */
  color: string;
  title?: string;
}) {
  const parsed = parseIconRef(iconRef);
  if (!parsed) return null;
  const box: React.CSSProperties = { width: size, height: size, display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' };
  if (parsed.kind === 'builtin') {
    const path = renderAircraftSvgPaths(parsed.id);
    // הנתיב מגיע עם fill לבן קשיח (נבנה למפה כהה) - דורסים לצבע התמה
    const tinted = React.isValidElement(path) ? React.cloneElement(path as React.ReactElement<any>, { fill: color, opacity: 1 }) : path;
    return (
      <svg viewBox="0 0 24 24" style={box} role="img" aria-label={title}>
        {title && <title>{title}</title>}
        {tinted}
      </svg>
    );
  }
  const row = displayIconById(icons, parsed.id);
  if (!row) return null;
  return <img src={row.image_data} alt={title || row.name} title={title || row.name} draggable={false} style={{ ...box, objectFit: 'contain' }} />;
}
