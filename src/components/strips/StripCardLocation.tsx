import { tr } from '../../i18n/tr';
import { normalizeAlt } from '../../utils/strips';
import type { StripZoneAssignment } from '../../types/ground';

// ── "איפה הפ"מ" בכרטיס של רשימת הפ"מים במוד מפה ─────────────────────────────
// פ"מ ששויך לאזור - מוצג שם האזור (ואזורים נוספים אם שויך לכמה), בצבע האזור,
// כי זו השאלה שהבקר שואל כשהוא סורק את הרשימה. פ"מ בלי אזור - הגובה, ובגדול,
// כי אז זה המידע היחיד שמבדיל בינו לבין שאר הרשימה.

export type StripCardLocationInfo =
  | { kind: 'zone'; names: string[]; color: string | null }
  | { kind: 'alt'; alt: string }
  | null;

export function stripCardLocation(
  assignment: Pick<StripZoneAssignment, 'zone_id' | 'zone_name' | 'zone_color' | 'extra_zones'> | null | undefined,
  alt: string | null | undefined,
): StripCardLocationInfo {
  if (assignment && assignment.zone_id != null) {
    const names = [assignment.zone_name, ...(assignment.extra_zones || []).map(z => z.zone_name)]
      .filter((n): n is string => !!n && !!n.trim());
    if (names.length) return { kind: 'zone', names: [...new Set(names)], color: assignment.zone_color };
  }
  const a = normalizeAlt(alt || '');
  return a ? { kind: 'alt', alt: a } : null;
}

export function StripCardLocation({ info, text, muted, border, bgAlt }: {
  info: StripCardLocationInfo;
  text: string; muted: string; border: string; bgAlt: string;
}) {
  if (!info) return null;
  if (info.kind === 'zone') {
    const c = info.color || border;
    return (
      <span
        data-testid="strip-card-zone"
        title={tr('strips.cardZoneHint')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold', color: text, border: `1px solid ${c}`, padding: '1px 6px', borderRadius: '3px', background: bgAlt, maxWidth: '60%', overflow: 'hidden' }}
      >
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: c, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.names.join(' + ')}</span>
      </span>
    );
  }
  return (
    <span
      data-testid="strip-card-alt"
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', color: text, border: `1px solid ${border}`, padding: '1px 6px', borderRadius: '3px', background: bgAlt }}
    >
      <span style={{ fontSize: '10px', color: muted }}>{tr('shared.altitude')}</span>
      <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{info.alt}</span>
    </span>
  );
}
