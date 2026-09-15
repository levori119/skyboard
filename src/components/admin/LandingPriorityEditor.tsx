// סדר עדיפויות לנחיתה לנקודת דת"ק - עורך הרשימה בטופס הנקודה (ניהול שדה תעופה).
//
// הרשימה היא מספרי מסלולים **בסדר רץ**: הראשון הוא המועדף, ואם הוא לא פתוח
// לנחיתות - הבא אחריו. מבנה שמגיע לנקודת הצטרפות מחולק לפיה (שרת:
// autoAssignLandingRunways, לוגיקה: shared/landingPriority.js).
//
// בחירה מתוך הקצוות שמוגדרים בשדה ולא הקלדה חופשית: "8" מול "08" או "26L" מול
// "26" היו מסלול שלעולם לא נמצא פתוח, והחלוקה הייתה נכשלת בשקט. הוספה והזזה
// בלחיצות (לא בגרירה) - נוח באצבע ובעט על ה-Cintiq.
import React from 'react';
import { tr } from '../../i18n/tr';

/** שני הקצוות של כל מסלול בשדה, בסדר המסלולים, בלי כפילויות. */
export function runwayEndsOf(runways: { heading_a?: string | null; heading_b?: string | null }[] | null | undefined): string[] {
  const out: string[] = [];
  for (const rw of runways || []) {
    for (const end of [rw?.heading_a, rw?.heading_b]) {
      const v = String(end ?? '').trim();
      if (v && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

const chipBtn: React.CSSProperties = {
  padding: '0 5px', background: 'transparent', border: 'none', color: '#94a3b8',
  cursor: 'pointer', fontSize: '11px', lineHeight: '18px', minWidth: '18px',
};

export function LandingPriorityEditor({ value, runwayEnds, onChange }: {
  value: string[];
  runwayEnds: string[];
  onChange: (next: string[]) => void;
}) {
  const list = value || [];
  const addable = runwayEnds.filter(e => !list.includes(e));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div data-testid="landing-priority-editor" style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: '5px', padding: '6px 8px' }}>
      <div style={{ color: '#93c5fd', fontSize: '11px', fontWeight: 'bold', marginBottom: '2px' }}>{tr('admin.landingPriority')}</div>
      <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '6px' }}>{tr('admin.landingPriorityHint')}</div>

      {list.length === 0
        ? <div style={{ color: '#475569', fontSize: '10px', marginBottom: '6px' }}>{tr('admin.landingPriorityEmpty')}</div>
        : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
            {list.map((rw, i) => {
              const missing = !runwayEnds.includes(rw);
              return (
                <span key={rw} data-rank={i + 1} data-runway={rw} data-missing={missing ? 'true' : undefined}
                  title={missing ? tr('admin.landingPriorityMissing') : undefined}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#0f172a', border: `1px solid ${missing ? '#b45309' : '#3b82f6'}`, borderRadius: '4px', paddingInlineStart: '5px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px' }}>{i + 1}.</span>
                  <span style={{ color: missing ? '#fbbf24' : '#e2e8f0', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{rw}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title={tr('admin.landingPriorityUp')}
                    style={{ ...chipBtn, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>▲</button>
                  <button type="button" onClick={() => onChange(list.filter(x => x !== rw))} title={tr('admin.landingPriorityRemove')}
                    style={{ ...chipBtn, color: '#f87171' }}>✕</button>
                </span>
              );
            })}
          </div>
        )}

      {runwayEnds.length === 0
        ? <div data-no-runways="true" style={{ color: '#f59e0b', fontSize: '10px' }}>{tr('admin.landingPriorityNoRunways')}</div>
        : addable.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: '10px' }}>{tr('admin.landingPriorityAdd')}</span>
            {addable.map(rw => (
              <button type="button" key={rw} data-add-runway={rw} onClick={() => onChange([...list, rw])}
                style={{ padding: '2px 8px', background: '#1e293b', color: '#cbd5e1', border: '1px dashed #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace' }}>
                + {rw}
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
