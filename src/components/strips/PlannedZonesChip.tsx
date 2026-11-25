// אזורים מתוכננים על כרטיס הפ"מ ("→ 705, 711") - לאן הפ"מ אמור ללכת.
// מסגרת **מקווקוות** בכוונה: זו הכוונה ולא שיוך, ואסור שתיראה כמו אזור תפוס.
// ראה src/utils/plannedZones.ts.
import { tr } from '../../i18n/tr';
import { bidiAuto } from '../../utils/bidi';
import { parsePlannedZones, formatPlannedZones } from '../../utils/plannedZones';

export default function PlannedZonesChip({ raw, muted, border }: { raw: unknown; muted: string; border: string }) {
  const names = parsePlannedZones(raw);
  if (names.length === 0) return null;
  return (
    <span
      data-testid="planned-zones-chip"
      title={tr('ctrl.plannedZonesTip')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '3px', marginInlineStart: '4px',
        padding: '0 5px', borderRadius: '4px', border: `1px dashed ${border}`,
        fontSize: '10px', lineHeight: 1.5, color: muted, whiteSpace: 'nowrap', verticalAlign: 'middle',
      }}
    >
      ⇢ {bidiAuto(formatPlannedZones(names))}
    </span>
  );
}
