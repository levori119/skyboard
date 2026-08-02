// בורר העמדה — רשימה מקובצת לפי **בסיס אב**, במקום רשימה שטוחה אחת.
//
// למה: במסך הכניסה יש עשרות עמדות מכמה בסיסים. רשימה שטוחה מאלצת את הבקר/פקח
// לסרוק את כולה; קיבוץ לפי בסיס מצמצם את החיפוש לבסיס שלו בקליק אחד.
//
// התנהגות:
//   • כל הקטגוריות **סגורות** בפתיחה — המסך נשאר קצר וקריא.
//   • לחיצה על כותרת פותחת את עמדות הבסיס (אקורדיון, כמה פתוחות בו-זמנית).
//   • בסיס אב יחיד → אין כותרת כלל, העמדות מוצגות ישירות.
//   • בכל קבוצה: העמדה שעודכנה/נוצרה אחרונה ראשונה, עם חותמת הזמן לצידה.
//
// הצבעים מגיעים מ-crewPalette (אותה פלטה של טופס חברי העמדה, שנפתח מיד אחרי
// הבחירה) — כדי ששני השלבים ייראו כרצף אחד בכל תמה.
import React, { useMemo, useState } from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { crewPalette, type ThemeMode } from './StationCrewForm';
import {
  groupPresetsByBase, shouldShowGroupHeaders, formatStationTime, isUpdatedStamp,
  type PresetLike, type BaseLike, type StationGroup,
} from '../../utils/presetGroups';

export default function StationPicker({
  presets, bases, themeMode = 'dark', onSelect,
}: {
  presets: PresetLike[];
  bases?: BaseLike[];
  themeMode?: ThemeMode;
  onSelect: (preset: PresetLike) => void;
}) {
  const c = crewPalette(themeMode);
  const groups = useMemo(() => groupPresetsByBase(presets, bases || []), [presets, bases]);
  const showHeaders = shouldShowGroupHeaders(groups);
  // מפתח הקבוצה: מזהה הבסיס, ו-'none' לעמדות בלי בסיס אב
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const now = new Date();
  const rtl = i18n.dir() === 'rtl';

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const stationRow = (p: PresetLike) => {
    const stamp = p.updated_at || p.created_at;
    const time = formatStationTime(stamp, now);
    const label = isUpdatedStamp(p) ? tr('shared.stationUpdatedAt') : tr('shared.stationCreatedAt');
    return (
      <button
        key={p.id}
        type="button"
        data-testid="station-option"
        data-station-name={p.name}
        onClick={() => onSelect(p)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%', padding: '12px 14px', textAlign: 'start',
          background: c.listBg, color: c.inputText,
          border: `1px solid ${c.inputBorder}`, borderRadius: 8, cursor: 'pointer',
          fontSize: 16, fontWeight: 600,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = c.listHover; e.currentTarget.style.borderColor = c.accent; }}
        onMouseLeave={e => { e.currentTarget.style.background = c.listBg; e.currentTarget.style.borderColor = c.inputBorder; }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        {time && (
          <span style={{ color: c.muted, fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {/* dir="ltr" על החותמת בלבד: "28/06 14:32" הוא רצף תווים חלשים,
                ובהקשר עברי האלגוריתם הדו-כיווני היה הופך אותו ל-"14:32 28/06" */}
            {label} <span dir="ltr" style={{ display: 'inline-block' }}>{time}</span>
          </span>
        )}
      </button>
    );
  };

  const groupKey = (g: StationGroup) => (g.baseId == null ? 'none' : `b${g.baseId}`);

  return (
    <div data-testid="station-picker" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map(g => {
        const key = groupKey(g);
        // בלי כותרות (בסיס אב יחיד) הרשימה תמיד פתוחה — אין על מה ללחוץ כדי לפתוח
        const isOpen = !showHeaders || open[key] === true;
        return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {showHeaders && (
              <button
                type="button"
                data-testid="station-group"
                data-base-name={g.baseName || ''}
                aria-expanded={isOpen}
                aria-controls={`station-group-body-${key}`}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 14px', textAlign: 'start',
                  background: isOpen ? c.listHover : c.chipOff,
                  color: isOpen ? c.title : c.chipOffText,
                  border: `1px solid ${isOpen ? c.accent : c.inputBorder}`,
                  borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 700,
                }}
              >
                {/* המשולש מצביע פנימה לכיוון הטקסט כשסגור (בעברית שמאלה), ומטה כשפתוח */}
                <span style={{
                  display: 'inline-block', fontSize: 11, color: c.muted,
                  transform: isOpen ? 'rotate(90deg)' : (rtl ? 'rotate(180deg)' : 'none'),
                  transition: 'transform 0.15s',
                }}>▶</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.baseName || tr('shared.stationNoParentBase')}
                </span>
                <span style={{
                  color: c.muted, fontSize: 12, fontWeight: 600, flexShrink: 0,
                  background: c.listBg, borderRadius: 10, padding: '2px 8px',
                }}>{g.presets.length}</span>
              </button>
            )}
            {isOpen && (
              <div
                id={`station-group-body-${key}`}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  paddingInlineStart: showHeaders ? 12 : 0,
                }}
              >
                {g.presets.map(stationRow)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
