// ─── תקלה במטוס - רכיב משותף ─────────────────────────────────────────────────
//
// התקלה היא תכונה של ה**מטוס** בתוך הפ"מ, ולכן אותם שלושה שדות בדיוק מוצגים
// בכל מקום שבו עורכים מטוס בודד: פאנל הפ"מ בעמדת המגדל וחלון פרטי הפ"מ.
// רכיב אחד = אותה התנהגות, אותו עיצוב ואותה סמנטיקה בכל המסכים (DRY).
//
// שרשור התקלות לרמת הפ"מ נעשה ב-`src/utils/faults.ts` ומוצג בשדה "תקלות".

import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { VKTrigger } from '../../VirtualKeyboard';
import { faultRedFor } from '../../utils/faults';

export interface AircraftFaultValue {
  has_fault?: boolean | null;
  fault_type?: string | null;
  fault_details?: string | null;
}

// גוון האדום עבר ל-`utils/faults.ts` (יחד עם שאר לוגיקת התקלה, שאין לה תלות
// ב-React), ומיוצא מחדש כאן כדי שהצרכנים הוותיקים לא ישברו.
export { faultRedFor };

/**
 * מהויות התקלה מהתפריט שמנוהל במסך ניהול מערכת.
 * נטען פעם אחת לכל רכיב שמשתמש בו - רשימה קצרה שמשתנה לעתים נדירות.
 */
export const useFaultTypes = (): string[] => {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/fault-types`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { name?: string }[]) => {
        if (alive) setNames((Array.isArray(rows) ? rows : []).map(r => String(r.name || '')).filter(Boolean));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return names;
};

export const AircraftFaultFields = ({ value, faultTypes, lightMode = false, compact = false, onChange }: {
  value: AircraftFaultValue;
  faultTypes: string[];
  lightMode?: boolean;
  /** גרסה צפופה לפאנל המגדל (גופנים קטנים יותר) */
  compact?: boolean;
  onChange: (next: Required<AircraftFaultValue>) => void;
}) => {
  const has = value.has_fault === true;
  const type = value.fault_type ?? '';
  const details = value.fault_details ?? '';
  const red = faultRedFor(lightMode);
  const fs = compact ? '10px' : '11px';
  const border = lightMode ? '#cbd5e1' : '#334155';
  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, padding: '2px 5px', fontSize: fs,
    background: lightMode ? '#ffffff' : '#0f172a',
    border: `1px solid ${border}`, borderRadius: '4px',
    color: lightMode ? '#1e293b' : '#e2e8f0', outline: 'none',
  };

  // כיבוי הדגל מנקה מהות ופירוט - "אין תקלה" חייב להיות אין תקלה (כמו בשרת)
  const emit = (next: AircraftFaultValue) => {
    const on = next.has_fault === true;
    onChange({
      has_fault: on,
      fault_type: on ? (next.fault_type ?? '') : '',
      fault_details: on ? (next.fault_details ?? '') : '',
    });
  };

  // מהות שנמחקה מהתפריט אחרי שנרשמה על המטוס עדיין חייבת להופיע בבורר,
  // אחרת בחירה קיימת הייתה נעלמת מהמסך בלי שאיש שינה אותה
  const options = faultTypes.includes(type) || !type ? faultTypes : [type, ...faultTypes];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', direction: 'rtl' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: fs, color: has ? red : (lightMode ? '#64748b' : '#94a3b8'), fontWeight: has ? 'bold' : 'normal' }}>
        <input
          type="checkbox"
          checked={has}
          onChange={e => emit({ ...value, has_fault: e.target.checked })}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: red, cursor: 'pointer', margin: 0 }}
        />
        <span>⚠ {tr('strips.fault')}</span>
      </label>
      {has && (
        <>
          <select
            value={type}
            onChange={e => emit({ ...value, has_fault: true, fault_type: e.target.value })}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            style={{ ...inputStyle, cursor: 'pointer', color: type ? red : (lightMode ? '#94a3b8' : '#64748b') }}
            title={tr('strips.faultNature')}
          >
            <option value="">{tr('strips.selectFaultNature')}</option>
            {options.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {/* העמדה היא מסך מגע - לכל שדה טקסט חופשי מקלדת וירטואלית לצדו */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <input
              type="text"
              value={details}
              onChange={e => emit({ ...value, has_fault: true, fault_details: e.target.value })}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
              placeholder={tr('strips.faultDetails')}
              title={tr('strips.faultDetails')}
              style={inputStyle}
            />
            <VKTrigger
              value={details}
              onChange={v => emit({ ...value, has_fault: true, fault_details: v })}
              mode="full" label={tr('strips.faultDetails')} size={13}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AircraftFaultFields;
