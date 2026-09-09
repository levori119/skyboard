// הגנ"ש - מסך הניהול הטכני (שלב א): קטלוג מערכות האש והגילוי + סוגי האיום.
//
// כאן יושב ה**דגם** בלבד. הפריסה בשטח (נ"צ, PTL, סטטוס) היא מסך מבצעי נפרד
// שיגיע בשלב ב, ולכן אין כאן מפה ואין נ"צ. אפיון: AIR_DEFENSE_SPEC.md §2.
//
// הוולידציה כולה מגיעה מהליבה הטהורה `src/utils/airDefense.ts` - אותה הכרעה
// שתשמש את הפריסה ואת חישוב הכיסוי. הטופס רק **מציג** את מפתחות השגיאה.

import React, { useState, useEffect, useCallback } from 'react';
import { tr } from '../../i18n/tr';
import { API_URL } from '../../config';
import { customConfirm } from '../shared/ConfirmModal';
import {
  AD_KINDS, apertureDeg, isFullCircle, qualityBand, validateSystemInput,
  type AdSystemInput,
} from '../../utils/airDefense';

type Family = 'weapon' | 'sensor';
type Tab = Family | 'threats';

interface ThreatType { id: number; name: string; sort_order: number; enabled: boolean }
interface Effectiveness { system_id: number; threat_type_id: number; quality_pct: number; note: string | null }
interface AdSystem extends AdSystemInput {
  id: number;
  missile_type?: string | null;
  guidance?: string | null;
  color?: string | null;
  enabled?: boolean;
  effectiveness?: Effectiveness[];
}

const emptyForm = (): Record<string, any> => ({
  name: '', kind: 'ground', range_nm: '', missile_type: '', guidance: '',
  sector_from_deg: '', sector_to_deg: '',
  detect_from_deg: '', detect_to_deg: '', track_from_deg: '', track_to_deg: '',
  alt_min: '', alt_max: '', color: '', enabled: true,
});

// מסך הניהול כולו בתמה כהה קבועה (ראה ManagementPage) - ולכן הצבעים כאן קשיחים
// בדיוק כמו בשאר המנהלים, ואינם עוברים דרך תמות התצוגה של העמדה.
const S = {
  input: {
    padding: '8px 10px', borderRadius: '7px', border: '1px solid #334155',
    background: '#0f172a', color: 'white', fontSize: '14px', textAlign: 'start' as const,
  },
  card: {
    background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '8px',
    padding: '10px 12px', marginBottom: '6px',
  },
  label: { fontSize: '12px', color: '#94a3b8', marginBottom: '3px' },
  btn: (bg: string) => ({
    padding: '8px 16px', background: bg, color: 'white', border: 'none',
    borderRadius: '7px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '14px',
  }),
  ghost: {
    padding: '4px 10px', background: 'none', border: '1px solid #334155',
    borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
  },
};

/** תווית הדירוג לצד האחוז - הצבע נושא את אותה משמעות בשלושת הדירוגים. */
const bandColor = (pct: number | null | undefined): string => {
  const band = qualityBand(pct);
  return band === 'full' ? '#86efac' : band === 'partial' ? '#fbbf24' : '#f87171';
};

const numOrNull = (v: any): number | null =>
  (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export const AirDefenseSection = () => {
  const [tab, setTab] = useState<Tab>('weapon');
  const [threats, setThreats] = useState<ThreatType[]>([]);
  const [systems, setSystems] = useState<AdSystem[]>([]);
  const [form, setForm] = useState<Record<string, any>>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');

  const family: Family = tab === 'threats' ? 'weapon' : tab;
  const isSensor = family === 'sensor';

  const loadThreats = useCallback(async () => {
    const res = await fetch(`${API_URL}/air-defense/threat-types`);
    if (res.ok) setThreats(await res.json());
  }, []);

  const loadSystems = useCallback(async (fam: Family) => {
    const res = await fetch(`${API_URL}/air-defense/${fam}/systems`);
    if (res.ok) setSystems(await res.json());
  }, []);

  useEffect(() => { loadThreats(); }, [loadThreats]);
  useEffect(() => { if (tab !== 'threats') loadSystems(tab); }, [tab, loadSystems]);

  const reset = () => { setForm(emptyForm()); setEditingId(null); setErrors([]); setSaveError(''); };

  const startEdit = (sys: AdSystem) => {
    const f = emptyForm();
    for (const k of Object.keys(f)) {
      const v = (sys as any)[k];
      f[k] = v === null || v === undefined ? (k === 'enabled' ? true : '') : v;
    }
    setForm(f);
    setEditingId(sys.id);
    setErrors([]);
    setSaveError('');
  };

  /** גוף השמירה - רק שדות המשפחה, ומחרוזת ריקה הופכת ל-null ולא ל-0. */
  const buildBody = () => {
    const common = {
      name: String(form.name || '').trim(),
      kind: form.kind,
      range_nm: numOrNull(form.range_nm),
      alt_min: numOrNull(form.alt_min),
      alt_max: numOrNull(form.alt_max),
      color: form.color || null,
      enabled: !!form.enabled,
    };
    return isSensor
      ? {
        ...common,
        detect_from_deg: numOrNull(form.detect_from_deg), detect_to_deg: numOrNull(form.detect_to_deg),
        track_from_deg: numOrNull(form.track_from_deg), track_to_deg: numOrNull(form.track_to_deg),
      }
      : {
        ...common,
        missile_type: String(form.missile_type || '').trim() || null,
        guidance: form.guidance || null,
        sector_from_deg: numOrNull(form.sector_from_deg), sector_to_deg: numOrNull(form.sector_to_deg),
      };
  };

  const save = async () => {
    const body = buildBody();
    const errs = validateSystemInput(body as AdSystemInput);
    setErrors(errs);
    setSaveError('');
    if (errs.length) return;
    const url = editingId
      ? `${API_URL}/air-defense/${family}/systems/${editingId}`
      : `${API_URL}/air-defense/${family}/systems`;
    const res = await fetch(url, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { setSaveError(tr('airDefense.errSaveFailed')); return; }
    const saved = await res.json();
    await loadSystems(family);
    // נשארים בעריכה אחרי יצירה: טבלת היעילות נפתחת רק למערכת שמורה, וסגירת
    // הטופס כאן הייתה מחייבת את המשתמש לפתוח אותה מיד מחדש כדי להזין אותה.
    if (!editingId && saved?.id) setEditingId(saved.id); else if (editingId) reset();
  };

  const removeSystem = async (sys: AdSystem) => {
    if (!await customConfirm(`${tr('airDefense.deleteSystemConfirm')} "${sys.name}"?`)) return;
    await fetch(`${API_URL}/air-defense/${family}/systems/${sys.id}`, { method: 'DELETE' });
    if (editingId === sys.id) reset();
    loadSystems(family);
  };

  const setQuality = async (systemId: number, threatId: number, raw: string) => {
    if (raw === '') {
      await fetch(`${API_URL}/air-defense/${family}/systems/${systemId}/effectiveness/${threatId}`, { method: 'DELETE' });
      loadSystems(family);
      return;
    }
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setSaveError(tr('airDefense.errQualityRange')); return; }
    setSaveError('');
    await fetch(`${API_URL}/air-defense/${family}/systems/${systemId}/effectiveness`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threat_type_id: threatId, quality_pct: Math.round(pct) }),
    });
    loadSystems(family);
  };

  const editing = systems.find(s => s.id === editingId) || null;

  // ── תיאור טקסטואלי של מפתח זווית ברשימה ──────────────────────────────────
  const apertureText = (from: any, to: any): string => {
    const f = numOrNull(from), t = numOrNull(to);
    if (isFullCircle(f, t)) return tr('airDefense.aperture360');
    if (f === null || t === null) return '-';
    const w = apertureDeg(f, t);
    return `${f}° - ${t}°${w === null ? '' : ` (${w}°)`}`;
  };

  const altText = (sys: AdSystem): string => {
    const lo = numOrNull(sys.alt_min), hi = numOrNull(sys.alt_max);
    if (lo === null && hi === null) return tr('airDefense.altUnlimited');
    return `${lo === null ? '-' : lo} - ${hi === null ? '-' : hi}`;
  };

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => { setTab(key); reset(); }}
      style={{
        padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px',
        border: `1px solid ${tab === key ? '#0891b2' : '#334155'}`,
        background: tab === key ? '#0e7490' : 'transparent',
        color: tab === key ? 'white' : '#94a3b8', fontWeight: tab === key ? 'bold' : 'normal',
      }}
    >{label}</button>
  );

  const field = (key: string, label: string, extra?: React.CSSProperties) => (
    <div style={{ display: 'flex', flexDirection: 'column', ...extra }}>
      <span style={S.label}>{label}</span>
      <input
        value={form[key] ?? ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={S.input}
      />
    </div>
  );

  const degField = (key: string, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', width: '92px' }}>
      <span style={S.label}>{label}</span>
      <input
        type="number"
        value={form[key] ?? ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        style={S.input}
      />
    </div>
  );

  return (
    <div>
      <h2 style={{ color: '#7dd3fc', marginBottom: '6px' }}>{tr('airDefense.catalogTitle')}</h2>
      <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '14px' }}>{tr('airDefense.catalogHint')}</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {tabBtn('weapon', tr('airDefense.tabWeapons'))}
        {tabBtn('sensor', tr('airDefense.tabSensors'))}
        {tabBtn('threats', tr('airDefense.tabThreats'))}
      </div>

      {tab === 'threats'
        ? <ThreatTypesEditor threats={threats} reload={loadThreats} />
        : (
          <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* ── רשימת המערכות ── */}
            <div style={{ flex: '1 1 320px', minWidth: '300px' }}>
              {systems.map(sys => (
                <div key={sys.id} style={{ ...S.card, borderColor: editingId === sys.id ? '#0891b2' : '#1e3a5f' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ flex: 1, color: sys.enabled ? '#e2e8f0' : '#64748b', fontWeight: 'bold' }}>{sys.name}</span>
                    <span style={{ fontSize: '12px', color: '#7dd3fc' }}>
                      {tr(sys.kind === 'air' ? 'airDefense.kindAir' : 'airDefense.kindGround')}
                    </span>
                    <button onClick={() => startEdit(sys)} style={{ ...S.ghost, color: '#fbbf24' }}>{tr('shared.edit')}</button>
                    <button onClick={() => removeSystem(sys)} style={{ ...S.ghost, color: '#f87171', borderColor: '#7f1d1d' }}>{tr('shared.delete')}</button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <span>{tr('airDefense.rangeNm')}: {sys.range_nm ?? '-'}</span>
                    <span>{tr('airDefense.altRange')}: {altText(sys)}</span>
                    {isSensor
                      ? <>
                        <span>{tr('airDefense.detectAperture')}: {apertureText(sys.detect_from_deg, sys.detect_to_deg)}</span>
                        <span>{tr('airDefense.trackAperture')}: {apertureText(sys.track_from_deg, sys.track_to_deg)}</span>
                      </>
                      : <span>{tr('airDefense.sectorAperture')}: {apertureText(sys.sector_from_deg, sys.sector_to_deg)}</span>}
                  </div>
                  {!!sys.effectiveness?.length && (
                    <div style={{ fontSize: '12px', marginTop: '5px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {sys.effectiveness.map(e => (
                        <span key={e.threat_type_id} style={{ color: bandColor(e.quality_pct) }}>
                          {threats.find(t => t.id === e.threat_type_id)?.name || e.threat_type_id}: {e.quality_pct}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {systems.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '13px', padding: '20px', textAlign: 'center' }}>{tr('airDefense.noSystems')}</div>
              )}
            </div>

            {/* ── טופס המערכת ── */}
            <div style={{ flex: '1 1 380px', minWidth: '340px', background: '#0f172a', border: '1px solid #1e3a5f', borderRadius: '10px', padding: '14px' }}>
              <div style={{ color: '#7dd3fc', fontWeight: 'bold', marginBottom: '10px' }}>
                {editingId ? `${tr('shared.edit')} - ${form.name}` : tr('airDefense.newSystem')}
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {field('name', tr('airDefense.name'), { flex: '1 1 180px' })}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={S.label}>{tr('airDefense.kind')}</span>
                  <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={{ ...S.input, cursor: 'pointer' }}>
                    {AD_KINDS.map(k => (
                      <option key={k} value={k}>{tr(k === 'air' ? 'airDefense.kindAir' : 'airDefense.kindGround')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                {field('range_nm', tr('airDefense.rangeNm'), { width: '120px' })}
                {field('alt_min', tr('airDefense.altMin'), { width: '100px' })}
                {field('alt_max', tr('airDefense.altMax'), { width: '100px' })}
              </div>
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px' }}>{tr('airDefense.altHint')}</div>

              {isSensor ? (
                <>
                  <div style={S.label}>{tr('airDefense.detectAperture')}</div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    {degField('detect_from_deg', tr('airDefense.apertureFrom'))}
                    {degField('detect_to_deg', tr('airDefense.apertureTo'))}
                  </div>
                  <div style={S.label}>{tr('airDefense.trackAperture')}</div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                    {degField('track_from_deg', tr('airDefense.apertureFrom'))}
                    {degField('track_to_deg', tr('airDefense.apertureTo'))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {field('missile_type', tr('airDefense.missileType'), { flex: '1 1 150px' })}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={S.label}>{tr('airDefense.guidance')}</span>
                      <select value={form.guidance || ''} onChange={e => setForm({ ...form, guidance: e.target.value })} style={{ ...S.input, cursor: 'pointer' }}>
                        <option value="">{tr('airDefense.guidanceNone')}</option>
                        <option value="radar">{tr('airDefense.guidanceRadar')}</option>
                        <option value="ir">{tr('airDefense.guidanceIr')}</option>
                      </select>
                    </div>
                  </div>
                  <div style={S.label}>{tr('airDefense.sectorAperture')}</div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                    {degField('sector_from_deg', tr('airDefense.apertureFrom'))}
                    {degField('sector_to_deg', tr('airDefense.apertureTo'))}
                  </div>
                </>
              )}
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px' }}>{tr('airDefense.apertureHint')}</div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '13px', marginBottom: '12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
                {tr('airDefense.enabled')}
              </label>

              {errors.map(err => (
                <div key={err} style={{ color: '#f87171', fontSize: '12px', marginBottom: '5px' }}>
                  {tr(`airDefense.err${err.charAt(0).toUpperCase()}${err.slice(1)}`)}
                </div>
              ))}
              {saveError && <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '5px' }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={save} style={S.btn('#2563eb')}>
                  {editingId ? tr('airDefense.updateSystem') : tr('airDefense.addSystem')}
                </button>
                {editingId && <button onClick={reset} style={S.btn('#334155')}>{tr('shared.cancel')}</button>}
              </div>

              {/* ── טבלת היעילות ── */}
              <div style={{ marginTop: '18px', borderTop: '1px solid #1e3a5f', paddingTop: '12px' }}>
                <div style={{ color: '#7dd3fc', fontWeight: 'bold', marginBottom: '4px' }}>{tr('airDefense.effectivenessTitle')}</div>
                <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px' }}>{tr('airDefense.effectivenessHint')}</div>

                {!editing ? (
                  <div style={{ color: '#64748b', fontSize: '13px' }}>{tr('airDefense.effectivenessSaveFirst')}</div>
                ) : threats.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '13px' }}>{tr('airDefense.noThreats')}</div>
                ) : (
                  threats.map(threat => {
                    const row = editing.effectiveness?.find(e => e.threat_type_id === threat.id);
                    const pct = row?.quality_pct;
                    return (
                      <div key={threat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                        <span style={{ flex: 1, color: '#cbd5e1', fontSize: '13px' }}>{threat.name}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={pct ?? ''}
                          key={`${threat.id}-${pct ?? 'x'}`}
                          onBlur={e => setQuality(editing.id, threat.id, e.target.value.trim())}
                          style={{ ...S.input, width: '80px', padding: '5px 8px' }}
                        />
                        <span style={{ width: '86px', fontSize: '12px', color: bandColor(pct) }}>
                          {row ? tr(`airDefense.band${qualityBand(pct).charAt(0).toUpperCase()}${qualityBand(pct).slice(1)}`) : tr('airDefense.notSet')}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

/** עורך סוגי האיום - רשימה משותפת לשתי משפחות הקטלוג ולטופס אזור האירוע. */
const ThreatTypesEditor = ({ threats, reload }: { threats: ThreatType[]; reload: () => void }) => {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const reset = () => { setName(''); setEditingId(null); setError(''); };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const body = JSON.stringify({ name: trimmed });
    const res = editingId
      ? await fetch(`${API_URL}/air-defense/threat-types/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      : await fetch(`${API_URL}/air-defense/threat-types`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (res.ok) { reset(); reload(); return; }
    setError(res.status === 409 ? tr('airDefense.errThreatExists') : tr('airDefense.errSaveFailed'));
  };

  const remove = async (t: ThreatType) => {
    if (!await customConfirm(`${tr('airDefense.threatDeleteConfirm')} "${t.name}"?`)) return;
    const res = await fetch(`${API_URL}/air-defense/threat-types/${t.id}`, { method: 'DELETE' });
    // 409 = יש הערכות יעילות שתלויות בו. המחיקה נחסמת **ומנומקת**, כי מחיקה
    // שקטה כאן הייתה מוחקת איתה את כל ההערכות מול האיום הזה.
    if (!res.ok) { setError(res.status === 409 ? tr('airDefense.errThreatInUse') : tr('airDefense.errSaveFailed')); return; }
    if (editingId === t.id) reset();
    reload();
  };

  return (
    <div style={{ maxWidth: '520px' }}>
      <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>{tr('airDefense.threatsHint')}</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <input
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') save(); }}
          placeholder={tr('airDefense.threatName')}
          style={{ ...S.input, flex: 1 }}
        />
        <button onClick={save} style={S.btn('#2563eb')}>
          {editingId ? tr('airDefense.threatUpdate') : tr('airDefense.threatAdd')}
        </button>
        {editingId && <button onClick={reset} style={S.btn('#334155')}>{tr('shared.cancel')}</button>}
      </div>
      {error && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}

      {threats.map(t => (
        <div key={t.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ flex: 1, color: '#e2e8f0' }}>{t.name}</span>
          <button onClick={() => { setEditingId(t.id); setName(t.name); }} style={{ ...S.ghost, color: '#fbbf24' }}>{tr('shared.edit')}</button>
          <button onClick={() => remove(t)} style={{ ...S.ghost, color: '#f87171', borderColor: '#7f1d1d' }}>{tr('shared.delete')}</button>
        </div>
      ))}
      {threats.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '13px', padding: '20px', textAlign: 'center' }}>{tr('airDefense.noThreats')}</div>
      )}
    </div>
  );
};

export default AirDefenseSection;
