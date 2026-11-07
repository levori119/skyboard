/**
 * **עדיפות חימושים** - טופס בהגדרות המבצעיות של העמדה.
 *
 * לכל חימוש: טבלת **עדיפויות גבהים ליציאה לתקיפה** - הגובה הראשון הוא הנדרש,
 * והבאים אחריו לפי הסדר. המלצת הגובה בכניסת פ"מ לעמדה (src/utils/altRecommend.ts)
 * לוקחת את הגובה הראשון שפנוי בבלוקים שלי; ואם אף גובה מהטבלה אינו בבלוקים
 * שלי - את הבלוק עם הגובה הקרוב לגובה הנדרש.
 *
 * סדר החימושים הוא גם עדיפות: פ"מ עם כמה חימושים מקבל את הראשון שתואם.
 *
 * נשמר באותו שדה של חוקי הגובה בניהול (`workstation_presets.alt_armament_rules`),
 * ולכן חוק מסוג אחר שנקבע שם (נמוך/בינוני/גבוה, טווח) מוצג כאן לקריאה, עם
 * אפשרות להזיז או למחוק אותו. עריכה בטיוטה ושמירה מפורשת - בכותרת ולמטה.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { useDragPosition } from '../../hooks/useDragPosition';
import { normalizeAltRules, type AltArmamentRule } from '../../utils/altRecommend';

interface Props {
  rules: AltArmamentRule[];
  /** חימושים שכבר מופיעים על פ"מים בעמדה - נוספים לרשימת הבחירה */
  armamentOptions: string[];
  /** המלצת הגובה פעילה בעמדה (`suggest_alt_range`) - בלעדיה העדיפויות לא משפיעות */
  altRecOn: boolean;
  themeMode: FrameTheme;
  onSave: (rules: AltArmamentRule[]) => void;
  onClose: () => void;
}

/** חוק בטיוטה: הגבהים כטקסט, כדי שאפשר יהיה להקליד בחופשיות */
type Draft = AltArmamentRule & { altsText?: string[] };

const toDraft = (r: AltArmamentRule): Draft =>
  r.kind === 'priority' ? { ...r, altsText: (r.alts_ft || []).map(String) } : { ...r };

const fromDraft = (d: Draft): AltArmamentRule =>
  d.kind === 'priority'
    ? { armament: d.armament, kind: 'priority', alts_ft: (d.altsText || []).map(Number) as number[] }
    : (({ altsText: _a, ...rest }) => rest)(d);

export default function ArmamentPriorityForm({ rules, armamentOptions, altRecOn, themeMode, onSave, onClose }: Props) {
  const winRef = useRef<HTMLDivElement | null>(null);
  const drag = useDragPosition(winRef);
  const light = themeMode === 'light';
  const c = light
    ? { bg: '#ffffff', head: '#f1f5f9', text: '#0f172a', muted: '#64748b', row: '#f8fafc', line: '#e2e8f0', input: '#ffffff' }
    : { bg: '#0f172a', head: '#1e293b', text: '#e2e8f0', muted: '#94a3b8', row: '#111827', line: '#334155', input: '#0b1324' };

  const [draft, setDraft] = useState<Draft[]>(() => rules.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [catalog, setCatalog] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API_URL}/default-armament-names`).then(r => (r.ok ? r.json() : [])).then((rows: any[]) => {
      setCatalog((Array.isArray(rows) ? rows : []).map(r => String(r?.name || '')).filter(Boolean));
    }).catch(() => {});
  }, []);
  const names = useMemo(() => [...new Set([...catalog, ...armamentOptions].map(s => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), [catalog, armamentOptions]);

  const change = (next: Draft[]) => { setDraft(next); setDirty(true); };
  const setRule = (i: number, patch: Partial<Draft>) => change(draft.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const swap = <T,>(arr: T[], i: number, j: number): T[] => {
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const setAlts = (i: number, alts: string[]) => setRule(i, { altsText: alts });

  const save = () => { onSave(normalizeAltRules(draft.map(fromDraft))); setDirty(false); };

  const btn: React.CSSProperties = { background: 'transparent', border: `1px solid ${c.line}`, color: c.text, borderRadius: 5, cursor: 'pointer', padding: '3px 10px', fontSize: '12px' };
  const mini: React.CSSProperties = { ...btn, padding: '0 6px', fontSize: '11px' };
  const box: React.CSSProperties = { background: c.input, border: `1px solid ${c.line}`, borderRadius: 5, color: c.text, fontSize: '13px', padding: '4px 6px' };
  const saveBtn = (testId: string) => (
    <button data-testid={testId} onPointerDown={e => e.stopPropagation()} onClick={save} disabled={!dirty}
      style={{ ...btn, background: dirty ? '#059669' : 'transparent', borderColor: dirty ? '#059669' : c.line, color: dirty ? '#ffffff' : c.muted, fontWeight: 'bold', cursor: dirty ? 'pointer' : 'default' }}>
      {tr('shared.save')}
    </button>
  );
  const adminText = (r: AltArmamentRule) => r.kind === 'band'
    ? tr(r.band === 'high' ? 'admin.altRulesHigh' : r.band === 'mid' ? 'admin.altRulesMid' : 'admin.altRulesLow')
    : r.kind === 'alt' ? `${r.alt_ft ?? ''} ${tr('admin.altRulesFeet')}` : `${r.min_ft ?? ''}-${r.max_ft ?? ''} ${tr('admin.altRulesFeet')}`;

  return createPortal(
    <div ref={winRef} data-testid="armament-priority-form" onClick={e => e.stopPropagation()}
      style={{ zoom: 'var(--s)' as any, position: 'fixed', ...(drag.dragged ? { left: drag.pos!.x, top: drag.pos!.y } : { top: 90, insetInlineEnd: 340 }), zIndex: 9000, width: 380, maxHeight: '75vh', display: 'flex', flexDirection: 'column', background: c.bg, color: c.text, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', ...windowFrame('edit', themeMode, 8), overflow: 'hidden' }}>
      <div {...drag.handleProps} style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: c.head, borderBottom: `1px solid ${c.line}` }}>
        <span style={{ fontSize: '14px' }}>🎯</span>
        <span style={{ flex: 1, fontWeight: 'bold', fontSize: '13px' }}>{tr('ctrl.armPriorityTitle')}</span>
        {saveBtn('armament-priority-save-top')}
        <button onPointerDown={e => e.stopPropagation()} onClick={onClose} title={tr('shared.close')} style={{ ...btn, border: 'none', fontSize: '14px', padding: '0 4px' }}>✕</button>
      </div>
      {!altRecOn && (
        <div data-testid="armament-priority-off" style={{ margin: '8px 10px 0', padding: '6px 8px', borderRadius: 6, border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '11px', lineHeight: 1.5 }}>
          {tr('ctrl.armPriorityAltRecOff')}
        </div>
      )}
      <div style={{ padding: '8px 10px', fontSize: '11px', color: c.muted, lineHeight: 1.5 }}>{tr('ctrl.armPriorityHint')}</div>
      <div style={{ overflowY: 'auto', padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft.length === 0 && <div style={{ fontSize: '12px', color: c.muted, padding: '6px 0' }}>{tr('ctrl.armPriorityNone')}</div>}
        {draft.map((r, i) => (
          <div key={i} data-testid="armament-priority-row" style={{ background: c.row, border: `1px solid ${c.line}`, borderRadius: 6, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: c.muted, minWidth: 16 }}>{i + 1}</span>
              {r.kind === 'priority' ? (
                <select value={r.armament} aria-label={tr('ctrl.armPriorityArmament')} onChange={e => setRule(i, { armament: e.target.value })} style={{ ...box, flex: 1, minWidth: 0 }}>
                  <option value="">{tr('ctrl.armPriorityPick')}</option>
                  {[...new Set([...(r.armament ? [r.armament] : []), ...names])].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <span style={{ flex: 1, fontSize: '12px' }}>
                  <b>{r.armament}</b> <span style={{ color: c.muted }}>{tr('ctrl.armPriorityFromAdmin', { text: adminText(r) })}</span>
                </span>
              )}
              <button onClick={() => change(swap(draft, i, i - 1))} disabled={i === 0} title={tr('admin.altRulesUp')} style={{ ...mini, opacity: i === 0 ? 0.35 : 1 }}>▲</button>
              <button onClick={() => change(swap(draft, i, i + 1))} disabled={i === draft.length - 1} title={tr('admin.altRulesDown')} style={{ ...mini, opacity: i === draft.length - 1 ? 0.35 : 1 }}>▼</button>
              <button onClick={() => change(draft.filter((_, j) => j !== i))} title={tr('shared.delete3')} style={{ ...mini, background: '#7f1d1d', color: '#fecaca', border: 'none' }}>✕</button>
            </div>
            {r.kind === 'priority' && (
              <div style={{ paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '11px', color: c.muted }}>{tr('ctrl.armPriorityAlts')}</div>
                {(r.altsText || []).map((a, k, arr) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '11px', color: c.muted, minWidth: 58 }}>{tr('ctrl.armPriorityAltN', { n: k + 1 })}</span>
                    <input type="number" inputMode="numeric" step={500} min={0} value={a} placeholder="24000" aria-label={tr('ctrl.armPriorityAltN', { n: k + 1 })}
                      onChange={e => setAlts(i, arr.map((x, j) => (j === k ? e.target.value : x)))} style={{ ...box, width: 100 }} />
                    <button onClick={() => setAlts(i, swap(arr, k, k - 1))} disabled={k === 0} style={{ ...mini, opacity: k === 0 ? 0.35 : 1 }}>▲</button>
                    <button onClick={() => setAlts(i, swap(arr, k, k + 1))} disabled={k === arr.length - 1} style={{ ...mini, opacity: k === arr.length - 1 ? 0.35 : 1 }}>▼</button>
                    <button onClick={() => setAlts(i, arr.filter((_, j) => j !== k))} title={tr('shared.delete3')} style={{ ...mini, color: '#f87171' }}>✕</button>
                  </div>
                ))}
                <button data-testid="armament-priority-add-alt" onClick={() => setAlts(i, [...(r.altsText || []), ''])} style={{ ...mini, alignSelf: 'flex-start', padding: '2px 8px' }}>+ {tr('ctrl.armPriorityAddAlt')}</button>
              </div>
            )}
          </div>
        ))}
        <button data-testid="armament-priority-add" onClick={() => change([...draft, { armament: '', kind: 'priority', altsText: [''] }])}
          style={{ ...btn, alignSelf: 'flex-start', color: '#f97316', borderColor: '#f97316' }}>+ {tr('ctrl.armPriorityAdd')}</button>
        <div style={{ fontSize: '10px', color: c.muted }}>{tr('ctrl.armPriorityFeetHint')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '8px 10px', borderTop: `1px solid ${c.line}`, background: c.head }}>
        <button onClick={onClose} style={btn}>{tr('shared.cancel')}</button>
        {saveBtn('armament-priority-save')}
      </div>
    </div>,
    document.body,
  );
}
