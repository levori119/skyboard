import React from 'react';
import { tr } from '../../i18n/tr';
import type { MapCopySource } from '../../utils/mapSettingsCopy';

/**
 * בורר **"זהה לעמדה"** - משותף להגדרת עמדה רגילה ולחלון מפה בדסק משימה.
 * בחירת מקור מעתיקה את הגדרות המפה שלו (נקודות העברה, מצב אזורי טיסה,
 * תצוגת פ"מ, מפות סקטור) לטופס. השמירה עצמה נשארת של הטופס - אפשר לבטל.
 */
export default function MapCopyFromStation({ sources, onPick }: { sources: MapCopySource[]; onPick: (src: MapCopySource) => void }) {
  if (!sources.length) return null;
  return (
    <div data-testid="map-copy-from-station" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>📋 {tr('admin.mapCopyFromStation')}</span>
      <select value="" onChange={e => { const src = sources.find(s => s.key === e.target.value); if (src) onPick(src); }}
        style={{ flex: 1, minWidth: 160, padding: '6px 8px', border: '1px solid #475569', borderRadius: 6, background: '#1e293b', color: 'white', fontSize: 12 }}>
        <option value="">{tr('admin.mapCopyFromStationPick', { count: sources.length })}</option>
        {sources.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </div>
  );
}
