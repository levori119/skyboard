// עורך תצוגת העמודה במוד טבלה - נפתח מתחת לשורת העמודה בניהול (כפתור 🎨).
//
// שלושה חלקים, כולם נשמרים בתוך הגדרת העמודה (table_modes.columns):
//   • שורה שנייה  - שדה נוסף שמוצג מתחת לשדה העמודה באותו תא
//   • עיצוב תצוגה - כללים לפי ערך: משבצת / עיגול / קו תחתון... בצבע שנבחר
//   • תצוגה        - טקסט / אייקון / אייקון וטקסט, ומיפוי ערך → אייקון
//
// אותו עורך משמש גם לשורה השנייה עצמה (בלי חלק "שורה שנייה"), כדי שגם לה
// יהיו עיצוב ואייקון משלה. ראה TABLE_MODE_DISPLAY_SPEC.md
import React, { useState } from 'react';
import { tr } from '../../i18n/tr';
import {
  CELL_SHAPES, CELL_SCALES, CELL_DISPLAY_MODES, DECOR_COLORS, BUILTIN_DISPLAY_ICONS,
  cellDecorStyle, columnDisplayMode, newDecorRule,
  type CellDecorRule, type CellShape, type CellDisplayMode,
} from '../../utils/tableCellDisplay';
import { useDisplayIcons } from '../../utils/displayIcons';
import DisplayIcon from '../shared/DisplayIcon';
import { STRIP_FIELD_DEFS, EDITABLE_LABELS, fieldDefLabel } from '../../types/stripFields';

const box: React.CSSProperties = { background: '#0b1324', border: '1px solid #334155', borderRadius: '6px', padding: '8px 10px' };
const sectionTitle: React.CSSProperties = { fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', marginBlockEnd: '6px' };
const inputStyle: React.CSSProperties = { background: '#0f172a', color: 'white', border: '1px solid #475569', borderRadius: '4px', padding: '4px 8px', fontSize: '13px' };
const smallBtn: React.CSSProperties = { padding: '3px 9px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };

const ICON_COLOR = '#e2e8f0';

export default function TableColumnDisplayEditor({ col, onChange, catalogFields, allowSecond = true }: {
  col: any;
  onChange: (changes: any) => void;
  /** שדות מהקטלוג (מותאמים) - לבחירת השורה השנייה */
  catalogFields: { key: string; label?: string }[];
  /** false - עורך של השורה השנייה עצמה (אין שורה שלישית) */
  allowSecond?: boolean;
}) {
  const icons = useDisplayIcons(true);
  const [secondOpen, setSecondOpen] = useState(false);
  const rules: CellDecorRule[] = Array.isArray(col.decor) ? col.decor : [];
  const mode = columnDisplayMode(col);
  const iconMap: Record<string, string> = col.iconMap || {};
  const second = col.second || null;

  const setRules = (next: CellDecorRule[]) => onChange({ decor: next });
  const updateRule = (id: string, changes: Partial<CellDecorRule>) => setRules(rules.map(r => (r.id === id ? { ...r, ...changes } : r)));
  const moveRule = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRules(next);
  };

  // המיפוי נערך כרשימת זוגות כדי שאפשר יהיה להקליד ערך חדש לפני שיש לו אייקון
  const mapEntries = Object.entries(iconMap);
  const setMapEntries = (entries: [string, string][]) => {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k] = v;
    onChange({ iconMap: next });
  };

  const secondDef = second ? STRIP_FIELD_DEFS.find(f => f.key === second.key) : null;
  const secondIsCatalog = !!second && catalogFields.some(f => f.key === second.key);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBlockStart: '8px' }}
      // העורך יושב בתוך שורה שנגררת לסידור - בלי זה כל לחיצה בו מתחילה גרירה
      draggable onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}>

      {/* ── שורה שנייה ─────────────────────────────────────────────── */}
      {allowSecond && (
        <div style={box} data-sk="second">
          <div style={sectionTitle}>{tr('tableDisplay.secondLine')}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={second?.key || ''}
              onChange={e => {
                const key = e.target.value;
                if (!key) { onChange({ second: null }); return; }
                const def = STRIP_FIELD_DEFS.find(f => f.key === key);
                const cat = catalogFields.find(f => f.key === key);
                onChange({ second: {
                  key, field: key,
                  label: def ? fieldDefLabel(def) : (cat?.label || key),
                  editable: 'none',
                  isCustom: !!cat,
                } });
              }}
              style={inputStyle}
            >
              <option value="">{tr('tableDisplay.noSecondLine')}</option>
              <optgroup label={tr('tableDisplay.systemFields')}>
                {STRIP_FIELD_DEFS.filter(f => f.key !== (col.key || col.field)).map(f => (
                  <option key={f.key} value={f.key}>{fieldDefLabel(f)}</option>
                ))}
              </optgroup>
              {catalogFields.length > 0 && (
                <optgroup label={tr('tableDisplay.customFields')}>
                  {catalogFields.filter(f => f.key !== (col.key || col.field)).map(f => (
                    <option key={f.key} value={f.key}>{f.label || f.key}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {second && (
              <>
                <input
                  value={second.label ?? ''}
                  onChange={e => onChange({ second: { ...second, label: e.target.value } })}
                  placeholder={tr('tableDisplay.secondLineTitle')}
                  style={{ ...inputStyle, flex: 1, minWidth: '120px' }}
                />
                {/* שדה מהקטלוג נערך לפי סוגו (כמו בעמודה רגילה) - בלי בורר */}
                {!secondIsCatalog && (
                  <select
                    value={second.editable || 'none'}
                    onChange={e => onChange({ second: { ...second, editable: e.target.value } })}
                    style={inputStyle}
                  >
                    {(secondDef?.editableOptions || ['none']).filter((o: string) => o !== 'handwriting' || !(secondDef?.editableOptions || []).includes('both')).map((opt: string) => (
                      <option key={opt} value={opt}>{EDITABLE_LABELS[opt]}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => setSecondOpen(o => !o)} style={{ ...smallBtn, background: secondOpen ? '#334155' : smallBtn.background }}>
                  🎨 {tr('tableDisplay.secondLineDisplay')}
                </button>
              </>
            )}
          </div>
          {second && secondOpen && (
            <div style={{ borderInlineStart: '2px solid #334155', paddingInlineStart: '8px', marginBlockStart: '6px' }}>
              <TableColumnDisplayEditor
                col={second}
                onChange={changes => onChange({ second: { ...second, ...changes } })}
                catalogFields={catalogFields}
                allowSecond={false}
              />
            </div>
          )}
        </div>
      )}

      {/* ── עיצוב תצוגה ────────────────────────────────────────────── */}
      <div style={box} data-sk="decor">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={sectionTitle}>{tr('tableDisplay.decorTitle')}</div>
          <button onClick={() => setRules([...rules, newDecorRule()])} style={smallBtn}>+ {tr('tableDisplay.addRule')}</button>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBlockEnd: '6px' }}>{tr('tableDisplay.decorHint')}</div>
        {rules.length === 0 && <div style={{ fontSize: '12px', color: '#475569' }}>{tr('tableDisplay.noRules')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rules.map((rule, idx) => (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', background: '#111c33', borderRadius: '5px', padding: '6px' }}>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => moveRule(idx, -1)} disabled={idx === 0} title={tr('tableDisplay.moveUp')} style={{ ...smallBtn, padding: '0 5px', fontSize: '10px', opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                <button onClick={() => moveRule(idx, 1)} disabled={idx === rules.length - 1} title={tr('tableDisplay.moveDown')} style={{ ...smallBtn, padding: '0 5px', fontSize: '10px', opacity: idx === rules.length - 1 ? 0.3 : 1 }}>▼</button>
              </span>
              <input
                value={rule.match}
                onChange={e => updateRule(rule.id, { match: e.target.value })}
                placeholder={tr('tableDisplay.matchPlaceholder')}
                title={tr('tableDisplay.matchHint')}
                style={{ ...inputStyle, width: '110px' }}
              />
              {/* הצורות כדוגמה חיה - רואים את התוצאה לפני שבוחרים */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {CELL_SHAPES.map((shape: CellShape) => (
                  <button
                    key={shape}
                    onClick={() => updateRule(rule.id, { shape })}
                    title={tr(`tableDisplay.shape_${shape}`)}
                    style={{ padding: '3px 5px', background: rule.shape === shape ? '#334155' : 'transparent', border: `1px solid ${rule.shape === shape ? '#94a3b8' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', color: '#e2e8f0', fontSize: '11px', minWidth: '30px' }}
                  >
                    <span style={cellDecorStyle({ ...rule, shape, bold: false, scale: 1 })}>{shape === 'none' ? '∅' : 'A'}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                {DECOR_COLORS.map(c => (
                  <button key={c} onClick={() => updateRule(rule.id, { color: c })} title={c}
                    style={{ width: '16px', height: '16px', background: c, border: rule.color === c ? '2px solid #f8fafc' : '1px solid #475569', borderRadius: '3px', cursor: 'pointer', padding: 0 }} />
                ))}
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(rule.color) ? rule.color : '#ef4444'} onChange={e => updateRule(rule.id, { color: e.target.value })}
                  title={tr('tableDisplay.customColor')} style={{ width: '22px', height: '20px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
              </div>
              <button onClick={() => updateRule(rule.id, { bold: !rule.bold })} title={tr('tableDisplay.bold')}
                style={{ ...smallBtn, fontWeight: 'bold', background: rule.bold ? '#334155' : smallBtn.background }}>B</button>
              <select value={String(rule.scale || 1)} onChange={e => updateRule(rule.id, { scale: Number(e.target.value) })} title={tr('tableDisplay.fontSize')} style={inputStyle}>
                {CELL_SCALES.map(n => <option key={n} value={n}>{`×${n}`}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#94a3b8' }}>
                {tr('tableDisplay.textColor')}
                <input type="checkbox" checked={!!rule.textColor} onChange={e => updateRule(rule.id, { textColor: e.target.checked ? rule.color : undefined })} />
                {rule.textColor && (
                  <input type="color" value={rule.textColor} onChange={e => updateRule(rule.id, { textColor: e.target.value })}
                    style={{ width: '22px', height: '20px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                )}
              </label>
              <span style={{ marginInlineStart: 'auto', padding: '2px 8px', background: '#1e293b', borderRadius: '4px', color: '#e2e8f0', fontSize: '13px' }}>
                <span style={cellDecorStyle(rule)}>{rule.match && rule.match !== '*' ? rule.match : tr('tableDisplay.sample')}</span>
              </span>
              <button onClick={() => setRules(rules.filter(r => r.id !== rule.id))} style={{ ...smallBtn, background: '#7f1d1d', border: 'none', color: '#fecaca' }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── תצוגה: טקסט / אייקון ──────────────────────────────────── */}
      <div style={box} data-sk="display">
        <div style={sectionTitle}>{tr('tableDisplay.displayTitle')}</div>
        <div style={{ display: 'flex', gap: '4px', marginBlockEnd: '6px' }}>
          {CELL_DISPLAY_MODES.map((m: CellDisplayMode) => (
            <button key={m} onClick={() => onChange({ display: m })}
              style={{ ...smallBtn, background: mode === m ? '#2563eb' : smallBtn.background, borderColor: mode === m ? '#3b82f6' : '#475569' }}>
              {tr(`tableDisplay.mode_${m}`)}
            </button>
          ))}
        </div>
        {mode !== 'text' && (
          <>
            <div style={{ fontSize: '11px', color: '#64748b', marginBlockEnd: '6px' }}>{tr('tableDisplay.iconMapHint')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {mapEntries.map(([value, ref], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    value={value}
                    onChange={e => setMapEntries(mapEntries.map((p, j) => (j === i ? [e.target.value, p[1]] : p)) as [string, string][])}
                    placeholder={tr('tableDisplay.valuePlaceholder')}
                    style={{ ...inputStyle, width: '130px' }}
                  />
                  <span style={{ color: '#64748b' }}>←</span>
                  <IconPicker value={ref} icons={icons} onChange={r => setMapEntries(mapEntries.map((p, j) => (j === i ? [p[0], r] : p)) as [string, string][])} />
                  <button onClick={() => setMapEntries(mapEntries.filter((_, j) => j !== i) as [string, string][])} style={{ ...smallBtn, background: '#7f1d1d', border: 'none', color: '#fecaca' }}>✕</button>
                </div>
              ))}
            </div>
            {/* המיפוי הוא אובייקט ערך → אייקון, ולכן שורה ריקה אחת בכל פעם:
                שתי שורות ריקות היו מתמזגות למפתח אחד ואחת מהן נעלמת */}
            <button
              onClick={() => setMapEntries([...mapEntries, ['', '']])}
              disabled={mapEntries.some(([k]) => k === '')}
              style={{ ...smallBtn, marginBlockStart: '6px', opacity: mapEntries.some(([k]) => k === '') ? 0.4 : 1 }}
            >+ {tr('tableDisplay.addMapping')}</button>
          </>
        )}
      </div>
    </div>
  );
}

/** בוחר אייקון: המובנים (צלליות המטוסים) + מה שהועלה לטבלת האייקונים */
function IconPicker({ value, icons, onChange }: { value: string; icons: { id: number; name: string; image_data: string }[]; onChange: (ref: string) => void }) {
  const [open, setOpen] = useState(false);
  const cell = (ref: string, title: string) => (
    <button key={ref} onClick={() => { onChange(ref); setOpen(false); }} title={title}
      style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: value === ref ? '#334155' : 'transparent', border: `1px solid ${value === ref ? '#94a3b8' : '#334155'}`, borderRadius: '4px', cursor: 'pointer', padding: 0 }}>
      <DisplayIcon iconRef={ref} icons={icons} color={ICON_COLOR} size={28} title={title} />
    </button>
  );
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...smallBtn, display: 'flex', alignItems: 'center', gap: '4px', minWidth: '70px', minHeight: '30px' }}>
        {value ? <DisplayIcon iconRef={value} icons={icons} color={ICON_COLOR} size={22} /> : <span style={{ color: '#64748b' }}>{tr('tableDisplay.pickIcon')}</span>}
        <span style={{ fontSize: '10px' }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, marginBlockStart: '4px', zIndex: 41, background: '#0f172a', border: '1px solid #475569', borderRadius: '6px', padding: '8px', width: '260px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBlockEnd: '4px' }}>{tr('tableDisplay.builtinIcons')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBlockEnd: '8px' }}>
              {BUILTIN_DISPLAY_ICONS.map(b => cell(`builtin:${b.id}`, b.label))}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBlockEnd: '4px' }}>{tr('tableDisplay.uploadedIcons')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {icons.map(i => cell(`img:${i.id}`, i.name))}
              {icons.length === 0 && <div style={{ fontSize: '11px', color: '#475569' }}>{tr('tableDisplay.noUploadedIcons')}</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
