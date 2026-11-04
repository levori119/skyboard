/**
 * **"זהה לעמדה"** - העתקת הגדרות המפה מעמדה אחרת שמשתמשת באותה מפה.
 *
 * עמדות שעובדות על אותה מפה צריכות בדרך כלל את אותן נקודות העברה, אותו מצב
 * אזורי טיסה ואותה תצוגת פ"מ. במקום לסמן הכל מחדש בכל עמדה (או בכל חלון מפה
 * בדסק משימה), בוחרים עמדה קיימת והגדרות המפה שלה מועתקות.
 *
 * המקורות האפשריים:
 * - **עמדה רגילה** שהמפה הראשית שלה (או המפה השנייה) היא המפה הזו
 * - **חלון מפה בדסק משימה** אחר (של עמדה כלשהי) שמוצגת בו המפה הזו
 */
import type { MDPresetMapSettings } from '../types/missionDesk';

export interface MapCopySource {
  /** מפתח יציב לבורר */
  key: string;
  label: string;
  /** העמדה שהמקור שייך לה - היא העמדה שחלון משקף כשהבחירה נשמרת */
  presetId: number;
  /** הגדרות המפה במבנה של חלון מפה בדסק */
  settings: Partial<MDPresetMapSettings>;
}

const nums = (v: unknown): number[] => {
  const a = Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return []; } })() : []);
  return (Array.isArray(a) ? a : []).map(Number).filter(Number.isFinite);
};

/** כל המקורות למפה `mapId`, בלי העמדה הנוכחית (ובלי החלון שנערך) */
export function mapCopySources(presets: any[], mapId: number | null | undefined, opts: { excludePresetId?: number | null; excludeWindowKey?: string } = {}): MapCopySource[] {
  if (mapId == null) return [];
  const out: MapCopySource[] = [];
  for (const p of presets || []) {
    const pid = Number(p?.id);
    const name = String(p?.name || pid);
    const self = opts.excludePresetId != null && pid === Number(opts.excludePresetId);
    if (!self && Number(p?.map_id) === Number(mapId)) {
      out.push({
        key: `p${pid}`, label: name, presetId: pid,
        settings: {
          transfer_points: nums(p.relevant_sectors),
          flight_zones_mode: p.flight_zones_mode === true,
          ...(p.fz_pin_display ? { fz_pin_display: p.fz_pin_display } : {}),
          sector_maps_enabled: p.sector_maps_enabled === true,
          sector_map_ids: nums(p.sector_map_ids),
          blind_map_default: p.blind_map_default === true,
        },
      });
    }
    if (!self && Number(p?.map2_id) === Number(mapId)) {
      out.push({
        key: `p${pid}m2`, label: `${name} (מפה 2)`, presetId: pid,
        settings: {
          transfer_points: nums(p.map2_transfer_points).length ? nums(p.map2_transfer_points) : nums(p.relevant_sectors),
          sector_maps_enabled: p.map2_sector_maps_enabled === true,
          sector_map_ids: nums(p.map2_sector_map_ids),
        },
      });
    }
    const cfg = p?.mission_desk_map_config && typeof p.mission_desk_map_config === 'object' ? p.mission_desk_map_config : {};
    for (const [wk, w] of Object.entries(cfg as Record<string, any>)) {
      if (!w || Number(w.map_id) !== Number(mapId)) continue;
      if (self && wk === opts.excludeWindowKey) continue;
      out.push({
        key: `p${pid}w${wk}`, label: `${name} · ${wk}`, presetId: pid,
        settings: {
          transfer_points: nums(w.transfer_points),
          flight_zones_mode: w.flight_zones_mode === true,
          ...(w.fz_pin_display ? { fz_pin_display: w.fz_pin_display } : {}),
          sector_maps_enabled: w.sector_maps_enabled === true,
          sector_map_ids: nums(w.sector_map_ids),
          ...(typeof w.strips_panel === 'boolean' ? { strips_panel: w.strips_panel } : {}),
          blind_map_default: w.blind_map_default === true,
        },
      });
    }
  }
  return out;
}

/** אותו מקור, בשדות של טופס עמדה רגילה (המפה הראשית) */
export function presetFieldsFromSource(src: MapCopySource): Record<string, unknown> {
  const s = src.settings;
  return {
    relevant_sectors: s.transfer_points ?? [],
    ...(s.flight_zones_mode !== undefined ? { flight_zones_mode: s.flight_zones_mode } : {}),
    ...(s.fz_pin_display ? { fz_pin_display: s.fz_pin_display } : {}),
    ...(s.sector_maps_enabled !== undefined ? { sector_maps_enabled: s.sector_maps_enabled } : {}),
    ...(s.sector_map_ids ? { sector_map_ids: s.sector_map_ids } : {}),
    ...(s.blind_map_default !== undefined ? { blind_map_default: s.blind_map_default } : {}),
  };
}

/**
 * **שיקוף עמדה** בחלון מפה של דסק משימה: כשנשמר מקור (`mirror_source_key`),
 * הגדרות המפה נלקחות **מהעמדה המשתקפת עכשיו** ולא מהעתקה ישנה - שינוי שם
 * מגיע לחלון בטעינה הבאה. מקור שנעלם (העמדה נמחקה / החליפה מפה) - נשארות
 * ההגדרות השמורות של החלון.
 */
export function resolveMirroredSettings<T extends Partial<MDPresetMapSettings> & { map_id?: number | null }>(
  presets: any[], settings: T, selfPresetId?: number | null,
): T {
  const key = settings.mirror_source_key;
  if (!key) return settings;
  const src = mapCopySources(presets, settings.map_id ?? null, { excludePresetId: selfPresetId ?? null }).find(s => s.key === key);
  return src ? { ...settings, ...src.settings } : settings;
}
