import { tr } from '../../i18n/tr';

/**
 * התווית שנשארת בחלון הפ"מים כשהוא מכווץ לעמודה צרה - "קיימים N פ"מם".
 *
 * רכיב משותף לכל העמדות: הסרגל הרגיל (SectorDashboard) ועמדת השדה (GroundView).
 * בעמודה של ~32px אין מקום לכרטיס פ"מ, ולכן במצב מכווץ מציירים **רק** את התווית,
 * ולחיצה עליה פותחת את החלון.
 *
 * `incomingCount` - העברות שממתינות לקבלה. בעמדת שדה הן יושבות בתוך חלון הפ"מים,
 * ולכן בכיווץ נשארת תווית שלהן - אחרת העברה נכנסת נעלמת מהעין.
 */
export function CollapsedStripsBadge({ count, incomingCount = 0, onOpen }: {
  count: number;
  incomingCount?: number;
  onOpen: () => void;
}) {
  if (count <= 0 && incomingCount <= 0) return null;
  const vertical = {
    writingMode: 'vertical-rl',
    transform: 'rotate(180deg)',
    fontSize: '11px',
    fontWeight: 'bold',
    marginTop: '12px',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    lineHeight: 1.3,
    borderRadius: '6px',
    padding: '8px 4px',
  } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {count > 0 && (
        <div
          onClick={onOpen}
          title={tr('shared.collapsedStripsHint', { count })}
          style={{ ...vertical, color: '#7c3aed', background: '#f3e8ff', border: '1px solid #c4b5fd' }}
        >
          {tr('ctrl.existing')} {count} {tr('ctrl.formation5')}
        </div>
      )}
      {incomingCount > 0 && (
        <div
          onClick={onOpen}
          title={tr('shared.collapsedIncomingHint', { count: incomingCount })}
          style={{ ...vertical, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd' }}
        >
          {tr('ground.awaitingAcceptance')}{incomingCount})
        </div>
      )}
    </div>
  );
}
