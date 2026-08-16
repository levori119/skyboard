import React from 'react';
import { tr } from '../../i18n/tr';
import { altToDisplay, buildBlocks, findStepOverlaps, type AltStep } from '../../utils/joiningPoints';

// ─── נקודות הצטרפות (STAR) - מקטע ביישות שדה התעופה ──────────────────────────
//
// הנקודה מוגדרת **על השדה** ולא על העמדה, כמו מסלולים והקפות: עמדת שדה רואה
// אותה דרך השדה שלה. לעמדה נשארת דריסת **תצוגה** בלבד (מיקום/מצב פרוס), כדי
// שלא ייווצרו שני מקורות אמת לטווח הגבהים או לנקודת המעבר המקושרת.
//
// טווח הגבהים נשמר **ברגל** ומוצג **במאות** (4000 -> 040), כי זו הכתיבה שעל
// הסדק. תצוגת הבלוקים כאן היא אותה `buildBlocks` שמייצרת את הטבלה בעמדה -
// כך שהמנהל רואה בהגדרה בדיוק את מה שהפקח יראה.

export interface JoiningPointRow {
  id: number;
  airfield_id: number;
  name: string;
  alt_min_ft: number;
  alt_max_ft: number;
  default_step_ft: number;
  sector_id?: number | null;
  sub_label?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
  color?: string | null;
  sort_order?: number;
  steps?: AltStep[];
}

interface Props {
  apiUrl: string;
  airfieldId: number;
  points: JoiningPointRow[];
  sectors: { id: number; name: string }[];
  expanded: boolean;
  onToggle: () => void;
  /** הנקודה שממתינה לדקירה על המפה (מנוהל בעמוד הניהול, כמו אלמנט הקפה). */
  placingId: number | null;
  onPlace: (id: number | null) => void;
  onReload: () => void | Promise<void>;
  confirmDelete: (msg: string) => boolean | Promise<boolean>;
}

const btn = (bg: string, fg: string): React.CSSProperties => ({
  padding: '3px 8px', background: bg, color: fg, border: 'none',
  borderRadius: '4px', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap',
});

const inp: React.CSSProperties = {
  background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '4px',
  color: 'white', fontSize: '11px', padding: '3px 6px', width: '100%', boxSizing: 'border-box',
};

const EMPTY = { name: '', alt_min_ft: '4000', alt_max_ft: '10000', default_step_ft: '1000', sector_id: '', color: '#38bdf8' };

/**
 * הסיבה **האמיתית** לכשל השמירה.
 * קודם הוצגה כאן הודעת ברירת מחדל אחת ("טווח גבהים לא תקין") לכל כשל - כולל
 * 404 של route שלא נטען ו-403 של הרשאה. הודעה שמצביעה על השדה הלא נכון גרועה
 * מ"שגיאה": היא שולחת את המנהל לתקן טווח תקין במקום לראות מה באמת קרה.
 */
async function failureReason(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const j = JSON.parse(text);
    if (j?.error || j?.message) return String(j.message || j.error);
  } catch { /* גוף שאינו JSON - למשל דף שגיאה של Express כשה-route אינו קיים */ }
  return `HTTP ${res.status}`;
}

export default function JoiningPointsSection({
  apiUrl, airfieldId, points, sectors, expanded, onToggle, placingId, onPlace, onReload, confirmDelete,
}: Props) {
  const [editId, setEditId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState({ ...EMPTY });
  const [steps, setSteps] = React.useState<AltStep[]>([]);
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');

  // עריכת שדה מנקה את השגיאה: הודעה שנשארת אחרי שהערך כבר תוקן נקראת כאילו
  // הערך החדש שגוי - וזה בדיוק מה שקרה עם "טווח גבהים לא תקין".
  const patch = (p: Partial<typeof EMPTY>) => { setError(''); setForm(f => ({ ...f, ...p })); };
  const patchSteps = (fn: (s: AltStep[]) => AltStep[]) => { setError(''); setSteps(fn); };

  const openNew = () => { setForm({ ...EMPTY }); setSteps([]); setEditId(null); setAdding(true); setError(''); };
  const openEdit = (p: JoiningPointRow) => {
    setForm({
      name: p.name || '',
      alt_min_ft: String(p.alt_min_ft ?? 0),
      alt_max_ft: String(p.alt_max_ft ?? 0),
      default_step_ft: String(p.default_step_ft ?? 1000),
      sector_id: p.sector_id != null ? String(p.sector_id) : '',
      color: p.color || '#38bdf8',
    });
    setSteps((p.steps || []).map(s => ({ from_ft: s.from_ft, to_ft: s.to_ft, step_ft: s.step_ft })));
    setEditId(p.id); setAdding(true); setError('');
  };
  const close = () => { setAdding(false); setEditId(null); setError(''); };

  const preview = React.useMemo(() => buildBlocks({
    id: 0, name: '', steps,
    alt_min_ft: Number(form.alt_min_ft) || 0,
    alt_max_ft: Number(form.alt_max_ft) || 0,
    default_step_ft: Number(form.default_step_ft) || 0,
  }), [form.alt_min_ft, form.alt_max_ft, form.default_step_ft, steps]);

  const save = async () => {
    if (!form.name.trim()) { setError(tr('joining.nameRequired')); return; }
    const lo = Number(form.alt_min_ft), hi = Number(form.alt_max_ft);
    // שתי הודעות נפרדות: "לא מספר" ו"עד נמוך ממ" הן שתי טעויות שונות, והודעה
    // אחת לשתיהן שולחת את המשתמש לחפש במקום הלא נכון.
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { setError(tr('joining.rangeNotNumber')); return; }
    if (hi <= lo) { setError(tr('joining.rangeOrder')); return; }
    if (findStepOverlaps(steps).length) { setError(tr('joining.overlapError')); return; }
    const body = {
      airfield_id: airfieldId, name: form.name.trim(),
      alt_min_ft: lo, alt_max_ft: hi, default_step_ft: Number(form.default_step_ft) || 1000,
      sector_id: form.sector_id ? Number(form.sector_id) : null,
      color: form.color, sort_order: editId ? undefined : points.length, steps,
      ...(editId ? { x_pct: points.find(p => p.id === editId)?.x_pct ?? null, y_pct: points.find(p => p.id === editId)?.y_pct ?? null } : {}),
    };
    const res = await fetch(editId ? `${apiUrl}/joining-points/${editId}` : `${apiUrl}/joining-points`, {
      method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { setError(tr('joining.saveFailed', { reason: await failureReason(res) })); return; }
    close();
    await onReload();
  };

  const remove = async (p: JoiningPointRow) => {
    if (!(await confirmDelete(tr('joining.confirmDelete')))) return;
    await fetch(`${apiUrl}/joining-points/${p.id}`, { method: 'DELETE' });
    await onReload();
  };

  const clearPlacement = async (p: JoiningPointRow) => {
    await fetch(`${apiUrl}/joining-points/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...p, steps: p.steps || [], x_pct: null, y_pct: null }),
    });
    await onReload();
  };

  return (
    <div style={{ borderTop: '1px solid #334155', paddingTop: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '6px' : 0, cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold', flex: 1 }}>⤵ {tr('joining.title')} ({points.length})</div>
        {expanded && !adding && (
          <button type="button" onClick={e => { e.stopPropagation(); openNew(); }} style={btn('#0284c7', 'white')}>{tr('joining.addPoint')}</button>
        )}
        <span style={{ color: expanded ? '#7dd3fc' : '#475569', fontSize: '11px', marginInlineStart: '4px' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: expanded ? '2000px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        {adding && (
          <div style={{ background: '#0f172a', border: '1px solid #0369a1', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '6px' }}>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.name')}
                <input value={form.name} onChange={e => patch({ name: e.target.value })} placeholder={tr('joining.namePlaceholder')} style={inp} />
              </label>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.altFrom')}
                <input type="number" value={form.alt_min_ft} onChange={e => patch({ alt_min_ft: e.target.value })} style={inp} />
              </label>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.altTo')}
                <input type="number" value={form.alt_max_ft} onChange={e => patch({ alt_max_ft: e.target.value })} style={inp} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 60px', gap: '6px', alignItems: 'end' }}>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.defaultStep')}
                <input type="number" value={form.default_step_ft} onChange={e => patch({ default_step_ft: e.target.value })} style={inp} />
              </label>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.linkedPoint')}
                <select value={form.sector_id} onChange={e => patch({ sector_id: e.target.value })} style={inp}>
                  <option value="">{tr('joining.noLinkedPoint')}</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>{tr('joining.color')}
                <input type="color" value={form.color} onChange={e => patch({ color: e.target.value })} style={{ ...inp, padding: 0, height: '24px' }} />
              </label>
            </div>

            {/* הפרשי גבהים לפי טווח - זה מה שמאפשר 1000 רגל למטה ו-500 למעלה */}
            <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#7dd3fc', fontWeight: 'bold' }}>{tr('joining.steps')}</span>
                <button type="button" onClick={() => patchSteps(s => [...s, { from_ft: Number(form.alt_min_ft) || 0, to_ft: Number(form.alt_max_ft) || 0, step_ft: 500 }])} style={btn('#0369a1', 'white')}>{tr('joining.addStep')}</button>
              </div>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 24px', gap: '4px', marginBottom: '3px' }}>
                  <input type="number" value={s.from_ft} onChange={e => patchSteps(a => a.map((x, j) => j === i ? { ...x, from_ft: Number(e.target.value) } : x))} style={inp} />
                  <input type="number" value={s.to_ft} onChange={e => patchSteps(a => a.map((x, j) => j === i ? { ...x, to_ft: Number(e.target.value) } : x))} style={inp} />
                  <input type="number" value={s.step_ft} onChange={e => patchSteps(a => a.map((x, j) => j === i ? { ...x, step_ft: Number(e.target.value) } : x))} style={inp} />
                  <button type="button" onClick={() => patchSteps(a => a.filter((_, j) => j !== i))} style={btn('#7f1d1d', '#fca5a5')}>✕</button>
                </div>
              ))}
            </div>

            {/* תצוגה מקדימה של הבלוקים - בדיוק אותה לוגיקה שרצה בעמדה */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {preview.map(ft => (
                <span key={ft} style={{ fontFamily: 'monospace', fontSize: '10px', background: '#1e293b', color: '#7dd3fc', borderRadius: '3px', padding: '1px 4px' }}>{altToDisplay(ft)}</span>
              ))}
            </div>

            {error && <div style={{ color: '#fca5a5', fontSize: '10px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '5px' }}>
              <button type="button" onClick={save} style={btn('#16a34a', 'white')}>{tr('joining.save')}</button>
              <button type="button" onClick={close} style={btn('#475569', 'white')}>{tr('joining.cancel')}</button>
            </div>
          </div>
        )}

        {points.map(p => (
          <div key={p.id} data-testid="admin-joining-point" data-point-id={p.id}
            style={{ background: '#0f172a', borderRadius: '4px', border: `1px solid ${placingId === p.id ? '#fbbf24' : '#1e3a5f'}`, padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color || '#38bdf8', flexShrink: 0 }} />
            <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '11px' }}>{p.name}</span>
            <span style={{ fontFamily: 'monospace', color: '#7dd3fc', fontSize: '10px' }}>
              {altToDisplay(Math.min(p.alt_min_ft, p.alt_max_ft))}-{altToDisplay(Math.max(p.alt_min_ft, p.alt_max_ft))}
            </span>
            {p.sector_id ? (
              <span style={{ color: '#86efac', fontSize: '10px' }}>🔀 {sectors.find(s => s.id === Number(p.sector_id))?.name || p.sector_id}</span>
            ) : null}
            {p.x_pct == null || p.y_pct == null
              ? <span style={{ color: '#fbbf24', fontSize: '10px' }}>⚠ {tr('joining.notPlaced')}</span>
              : <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'monospace' }}>{Number(p.x_pct).toFixed(1)},{Number(p.y_pct).toFixed(1)}</span>}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => onPlace(placingId === p.id ? null : p.id)} style={btn(placingId === p.id ? '#f59e0b' : '#1d4ed8', 'white')}>
              📍 {placingId === p.id ? tr('joining.placeHint') : tr('joining.place')}
            </button>
            {p.x_pct != null && <button type="button" onClick={() => clearPlacement(p)} style={btn('#334155', '#cbd5e1')}>{tr('joining.clearPlacement')}</button>}
            <button type="button" onClick={() => openEdit(p)} style={btn('#334155', '#cbd5e1')}>{tr('joining.edit')}</button>
            <button type="button" onClick={() => remove(p)} style={btn('#7f1d1d', '#fca5a5')}>{tr('joining.delete')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
