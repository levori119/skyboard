// קיבוץ תוכן admin לפי **בסיס אב** - רכיב אחד לכל הטאבים במסך הניהול.
//
// אותו קיבוץ נדרש בארבעה מקומות (עמדות, מפות, עזרים, בלוקים), ולכן הוא חי כאן
// ולא משוכפל בכל טאב. הלוגיקה עצמה (groupItemsByBase + סינון לפי הרשאה) יושבת
// ב-src/utils/presetGroups.ts, אותו מודול שמשרת את בורר העמדה במסך הכניסה.
//
// התנהגות:
//   • קבוצה יחידה → אין כותרת כלל, הפריטים מוצגים ישירות (אין מה לקבץ).
//   • כמה קבוצות → כותרת מתקפלת לכל בסיס, **פתוחה כברירת מחדל**: זהו משטח
//     עבודה של אדמין ולא מסך תפעולי, והסתרה מאחורי קליק רק מאטה עריכה.
//   • "ללא בסיס אב" תמיד אחרון - סל התוכן המשותף.
import React, { useState } from 'react';
import { tr } from '../../i18n/tr';
import type { BaseItemGroup } from '../../utils/presetGroups';

/** בורר בסיס אב אחיד לטפסים במסך הניהול (מפה / עזרים / מרחב / טבלת בלוקים) */
export const ParentBaseSelect = ({ value, bases, onChange, compact = false }: {
  value: string | number | null | undefined;
  bases: { id: number; name: string; code?: string | null }[];
  onChange: (v: string) => void;
  compact?: boolean;
}) => (
  <select
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    data-testid="parent-base-select"
    style={{
      padding: compact ? '5px 8px' : '8px 10px', background: '#1e293b',
      border: '1px solid #475569', borderRadius: '6px', color: 'white',
      fontSize: compact ? '12px' : '13px', maxWidth: '100%',
    }}
  >
    <option value="">{tr('admin.llaBsys')}</option>
    {bases.map(b => (
      <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ''}</option>
    ))}
  </select>
);

function BaseGroupBox({ group, count, children }: {
  group: BaseItemGroup<unknown>;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: '18px' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        data-testid="base-group"
        data-base-name={group.baseName || ''}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '7px 10px', background: '#0a0f1a', borderRadius: '6px',
          borderInlineStart: `3px solid ${group.baseId == null ? '#475569' : '#38bdf8'}`,
          border: 'none', cursor: 'pointer', marginBottom: open ? '8px' : 0,
          textAlign: 'start', color: 'inherit',
        }}
      >
        <span style={{ color: '#64748b', fontSize: '12px' }}>{open ? '▼' : '▶'}</span>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 'bold', color: group.baseId == null ? '#94a3b8' : '#7dd3fc' }}>
          {group.baseName || tr('shared.stationNoParentBase')}
        </span>
        <span style={{ color: '#475569', fontSize: '11px' }}>({count})</span>
      </button>
      {open && <div style={{ paddingInlineStart: '10px' }}>{children}</div>}
    </div>
  );
}

/**
 * `renderItems` מקבל את פריטי הקבוצה ומחזיר את גוף הקבוצה - כך אותו רכיב משרת
 * גם רשימה שטוחה (מפות, בלוקים) וגם קיבוץ-משנה בתוך הבסיס (עמדות לפי תפקיד).
 */
export function BaseGroupList<T>({ groups, renderItems }: {
  groups: BaseItemGroup<T>[];
  renderItems: (items: T[], group: BaseItemGroup<T>) => React.ReactNode;
}) {
  if (groups.length === 0) return null;
  // בסיס אב יחיד - הכותרת לא מוסיפה מידע, רק גובה
  if (groups.length === 1) return <>{renderItems(groups[0].items, groups[0])}</>;
  return (
    <>
      {groups.map(g => (
        <BaseGroupBox key={g.key} group={g as BaseItemGroup<unknown>} count={g.items.length}>
          {renderItems(g.items, g)}
        </BaseGroupBox>
      ))}
    </>
  );
}

export default BaseGroupList;
