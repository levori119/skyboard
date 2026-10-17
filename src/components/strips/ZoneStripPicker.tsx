import { useEffect } from 'react';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { getFormationDisplayName, normalizeAlt } from '../../utils/strips';
import { compareAirborneThenTakeoff } from '../../utils/stripOrder';
import type { StripZoneAssignment } from '../../types/ground';

// ── שיבוץ פ"מ באזור מתוך תפריט ────────────────────────────────────────────────
// לחיצה ימנית (או כפתור הצד של העט, שמתורגם ללחיצה ימנית) על **שטח** אזור
// במפת אזורים פותחת רשימה של הפ"מים בביצוע שבשאילתא של העמדה. בחירה משבצת את
// הפ"מ באזור בנקודה שנלחצה - בדיוק כמו גרירה אליה. ליד כל פ"מ כתוב איפה הוא
// עכשיו, כי זה מה שקובע מה יקרה בבחירה:
//   transfer - ממתין לעמדה בנקודת העברה: הבחירה **מקבלת** אותו ואז משבצת.
//   zone     - כבר באזור אחר: נפתח טופס המעבר (להשאיר את האזור הקודם או לשחרר).
//   free     - בלי אזור: שיבוץ מיידי.
// פ"מ שכבר נמצא באזור הזה לא מוצג - אין מה לעשות איתו מכאן.
// על **הקו** של האזור נשאר תפריט האזור (הגבלות ובלוקים); כפתור ⚙ כאן מוביל
// אליו גם מהשטח.

export type ZonePickWhere =
  | { kind: 'transfer'; transferId: string | null; from: string | null }
  | { kind: 'zone'; zones: string[] }
  | { kind: 'free' };

export interface ZonePickRow {
  id: number;
  label: string;
  sq: string;
  alt: string;
  airborne: boolean;
  where: ZonePickWhere;
}

type Asgn = Pick<StripZoneAssignment, 'strip_id' | 'zone_id' | 'zone_name' | 'extra_zones'>;
type Transfer = { id: string | number; strip_id: number | string; status?: string; from_sector_label?: string | null; from_sector_name?: string | null };

const numId = (id: unknown) => parseInt(String(id).replace(/^s/, ''), 10);
const DEAD = new Set(['cancelled', 'rejected']);

/**
 * השורות של התפריט, לפי סדר הרשימה בסרגל (באוויר קודם, אחר כך לפי שעת המראה).
 * @param strips      הפ"מים של השאילתא (myStrips)
 * @param transfers   ההעברות הנכנסות לעמדה - פ"מ ב-pending_transfer נחשב "בנקודת
 *                    העברה" רק אם יש לו העברה נכנסת; אחרת הוא בדרך **מאיתנו** ולא מוצג
 */
export function zonePickRows({ strips, assignments, transfers, zoneId }: {
  strips: any[]; assignments: Asgn[]; transfers: Transfer[]; zoneId: number;
}): ZonePickRow[] {
  const rows: (ZonePickRow & { _s: any })[] = [];
  for (const s of strips) {
    if (!s || DEAD.has(String(s.status))) continue;
    const id = numId(s.id);
    if (!Number.isFinite(id)) continue;
    const a = assignments.find(x => Number(x.strip_id) === id);
    const zoneIds = a && a.zone_id != null ? [a.zone_id, ...(a.extra_zones || []).map(e => e.zone_id)] : [];
    if (zoneIds.includes(zoneId)) continue;
    let where: ZonePickWhere;
    if (s.status === 'pending_transfer') {
      const t = transfers.find(x => numId(x.strip_id) === id && (!x.status || x.status === 'pending'));
      if (!t) continue;
      where = { kind: 'transfer', transferId: String(t.id), from: t.from_sector_label || t.from_sector_name || null };
    } else if (zoneIds.length) {
      const names = [a!.zone_name, ...(a!.extra_zones || []).map(e => e.zone_name)].filter((n): n is string => !!n && !!n.trim());
      where = { kind: 'zone', zones: [...new Set(names)] };
    } else {
      where = { kind: 'free' };
    }
    rows.push({
      id, _s: s, where,
      label: String(getFormationDisplayName(s) || s.callSign || s.call_sign || `#${id}`),
      sq: String(s.sq || s.squadron || ''),
      alt: s.alt ? normalizeAlt(String(s.alt)) : '',
      airborne: !!s.airborne,
    });
  }
  rows.sort((a, b) => compareAirborneThenTakeoff(a._s, b._s));
  return rows.map(({ _s, ...r }) => r);
}

const palette = (theme: FrameTheme) => theme === 'light'
  ? { bg: '#ffffff', row: '#f8fafc', rowHover: '#e2e8f0', text: '#1e293b', muted: '#64748b', border: '#cbd5e1', sq: '#7c3aed', transfer: '#b45309', zone: '#0e7490' }
  : theme === 'ocean'
    ? { bg: '#033240', row: '#05404e', rowHover: '#064e5e', text: '#cffafe', muted: '#67e8f9', border: '#0e7490', sq: '#c4b5fd', transfer: '#fbbf24', zone: '#5eead4' }
    : { bg: '#1e293b', row: '#0f172a', rowHover: '#334155', text: '#e2e8f0', muted: '#94a3b8', border: '#334155', sq: '#a78bfa', transfer: '#fbbf24', zone: '#22d3ee' };

const uiScale = () => {
  try { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1; } catch { return 1; }
};

export function ZoneStripPicker({ zoneName, zoneColor, rows, x, y, themeMode, dir, onPick, onZoneSettings, onClose }: {
  zoneName: string;
  zoneColor: string | null;
  rows: ZonePickRow[];
  /** נקודת הלחיצה בפיקסלים אמיתיים (clientX/Y) */
  x: number; y: number;
  themeMode: FrameTheme;
  dir: 'rtl' | 'ltr';
  onPick: (row: ZonePickRow) => void;
  onZoneSettings: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const P = palette(themeMode);
  // התפריט יושב בתוך #root שתחת zoom: var(--s), ולכן נקודת הלחיצה מחולקת ב-s
  const s = uiScale();
  const W = 300, vw = (typeof window !== 'undefined' ? window.innerWidth : 1920) / s, vh = (typeof window !== 'undefined' ? window.innerHeight : 1080) / s;
  const left = Math.max(8, Math.min(x / s, vw - W - 8));
  const below = y / s < vh * 0.55;

  return (
    <div data-zone-strip-picker="" style={{ position: 'fixed', inset: 0, zIndex: 9200 }} onPointerDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}
        style={{ position: 'absolute', left, width: W, ...(below ? { top: y / s } : { bottom: vh - y / s }), maxHeight: vh * 0.6, display: 'flex', flexDirection: 'column', background: P.bg, color: P.text, direction: dir, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', overflow: 'hidden', ...windowFrame('view', themeMode, 8) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${P.border}` }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: zoneColor || P.muted, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'bold', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{zoneName}</div>
            <div style={{ fontSize: 11, color: P.muted }}>{tr('ctrl.zonePickTitle')}</div>
          </div>
          <button type="button" onClick={onZoneSettings} title={tr('ctrl.zonePickSettings')}
            style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${P.border}`, background: 'transparent', color: P.muted, cursor: 'pointer', fontSize: 16, touchAction: 'manipulation' }}>⚙</button>
          <button type="button" onClick={onClose} title={tr('crew.close')}
            style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${P.border}`, background: 'transparent', color: P.muted, cursor: 'pointer', fontSize: 14, touchAction: 'manipulation' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.length === 0 && (
            <div style={{ padding: '14px 8px', textAlign: 'center', color: P.muted, fontSize: 12 }}>{tr('ctrl.zonePickEmpty')}</div>
          )}
          {rows.map(r => (
            <button key={r.id} type="button" data-zone-pick={r.id} onClick={() => onPick(r)}
              onPointerEnter={e => { (e.currentTarget as HTMLElement).style.background = P.rowHover; }}
              onPointerLeave={e => { (e.currentTarget as HTMLElement).style.background = P.row; }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, minHeight: 40, padding: '6px 9px', borderRadius: 6, border: `1px solid ${P.border}`, background: P.row, color: P.text, cursor: 'pointer', textAlign: 'start', touchAction: 'manipulation' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontWeight: 'bold', fontSize: 14, ...(r.airborne ? { color: '#60a5fa' } : {}) }}><bdi>{r.label}</bdi></span>
                {r.sq && <span style={{ fontWeight: 'bold', fontSize: 11, color: P.sq }}><bdi dir="ltr">{r.sq}</bdi></span>}
                <span style={{ flex: 1 }} />
                {r.alt && <span style={{ fontSize: 12, fontWeight: 'bold', color: P.muted }}><bdi dir="ltr">{r.alt}</bdi></span>}
              </div>
              {r.where.kind === 'transfer' && (
                <span data-where="transfer" style={{ fontSize: 11, fontWeight: 'bold', color: P.transfer }}>
                  ⇄ {tr('ctrl.zonePickAtTransfer')}{r.where.from ? ` · ${r.where.from}` : ''} - {tr('ctrl.zonePickAutoAccept')}
                </span>
              )}
              {r.where.kind === 'zone' && (
                <span data-where="zone" style={{ fontSize: 11, fontWeight: 'bold', color: P.zone }}>
                  ◉ {tr('ctrl.zonePickInZone')} {r.where.zones.join(' + ')}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
