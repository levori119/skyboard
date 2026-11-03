import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import type { AltArmamentRule } from '../../utils/altRecommend';

/**
 * **חוקי גובה לפי חימוש** בהגדרות העמדה - הבסיס להמלצת הגובה כשפ"מ נכנס
 * לעמדה (`src/utils/altRecommend.ts`).
 *
 * כל חוק: חימוש ← אחד משלושה:
 * - **נמוך / בינוני / גבוה** - שליש מבלוקי העמדה (נגזר אוטומטית מהטבלה)
 * - **גובה פיזי** ברגל - הבלוק שמכיל אותו
 * - **טווח גבהים** ברגל - בלוק בתוך הטווח
 *
 * הסדר הוא העדיפות: פ"מ עם כמה חימושים מקבל את החוק הראשון שתואם.
 */
export default function AltRulesEditor({ rules, onChange }: { rules: AltArmamentRule[]; onChange: (rules: AltArmamentRule[]) => void }) {
  const [armNames, setArmNames] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/default-armament-names`).then(r => (r.ok ? r.json() : [])).then((rows: any[]) => {
      setArmNames((Array.isArray(rows) ? rows : []).map(r => String(r.name || '')).filter(Boolean));
    }).catch(() => {});
  }, []);

  const set = (i: number, patch: Partial<AltArmamentRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const box: React.CSSProperties = { background: '#0f172a', border: '1px solid #334155', borderRadius: '5px', color: 'white', fontSize: '12px', padding: '4px 6px' };
  const small: React.CSSProperties = { background: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '11px', padding: '2px 6px' };
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  return (
    <div data-testid="alt-rules-editor" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#86efac' }}>{tr('admin.altRulesTitle')}</div>
      <div style={{ fontSize: '11px', color: '#4ade80' }}>{tr('admin.altRulesHint')}</div>
      <datalist id="alt-rules-armaments">{armNames.map(n => <option key={n} value={n} />)}</datalist>
      {rules.map((r, i) => (
        <div key={i} data-testid="alt-rule-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', direction: 'rtl' }}>
          <input list="alt-rules-armaments" value={r.armament} placeholder={tr('admin.altRulesArmament')} aria-label={tr('admin.altRulesArmament')}
            onChange={e => set(i, { armament: e.target.value })} style={{ ...box, width: 130 }} />
          <select value={r.kind} aria-label={tr('admin.altRulesKind')} onChange={e => set(i, { kind: e.target.value as AltArmamentRule['kind'] })} style={box}>
            <option value="band">{tr('admin.altRulesKindBand')}</option>
            <option value="alt">{tr('admin.altRulesKindAlt')}</option>
            <option value="range">{tr('admin.altRulesKindRange')}</option>
          </select>
          {r.kind === 'band' && (
            <select value={r.band || 'low'} aria-label={tr('admin.altRulesKindBand')} onChange={e => set(i, { band: e.target.value as AltArmamentRule['band'] })} style={box}>
              <option value="low">{tr('admin.altRulesLow')}</option>
              <option value="mid">{tr('admin.altRulesMid')}</option>
              <option value="high">{tr('admin.altRulesHigh')}</option>
            </select>
          )}
          {r.kind === 'alt' && (
            <input type="number" step={500} value={r.alt_ft ?? ''} placeholder={tr('admin.altRulesFeet')} aria-label={tr('admin.altRulesKindAlt')}
              onChange={e => set(i, { alt_ft: num(e.target.value) })} style={{ ...box, width: 90 }} />
          )}
          {r.kind === 'range' && (<>
            <input type="number" step={500} value={r.min_ft ?? ''} placeholder={tr('admin.altRulesFrom')} aria-label={tr('admin.altRulesFrom')}
              onChange={e => set(i, { min_ft: num(e.target.value) })} style={{ ...box, width: 80 }} />
            <span style={{ color: '#64748b' }}>-</span>
            <input type="number" step={500} value={r.max_ft ?? ''} placeholder={tr('admin.altRulesTo')} aria-label={tr('admin.altRulesTo')}
              onChange={e => set(i, { max_ft: num(e.target.value) })} style={{ ...box, width: 80 }} />
          </>)}
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title={tr('admin.altRulesUp')} style={small}>▲</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === rules.length - 1} title={tr('admin.altRulesDown')} style={small}>▼</button>
          <button type="button" onClick={() => onChange(rules.filter((_, j) => j !== i))} title={tr('shared.delete3')}
            style={{ ...small, background: '#7f1d1d', color: '#fca5a5', border: 'none' }}>✕</button>
        </div>
      ))}
      <button type="button" data-testid="alt-rule-add" onClick={() => onChange([...rules, { armament: '', kind: 'band', band: 'low' }])}
        style={{ ...small, alignSelf: 'flex-start', color: '#86efac', borderColor: '#14532d', padding: '4px 10px' }}>+ {tr('admin.altRulesAdd')}</button>
    </div>
  );
}
