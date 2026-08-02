// כ"א ותחקירים — מסך לבעלי תפקיד "כח אדם" במיראז' (is_manpower), נפתח ממסך
// ה-LOGIN. שני מסכים: **תחקירים** (טבלה עם סינון וקיבוץ) ו**כשירויות** (שעות
// עמדה לכל איש צוות, בטבלה או בגרף).
//
// מידור: המסך מציג רק עמדות שהמשתמש מורשה להן לפי מיראז' (`approved_workstations`;
// רשימה ריקה = כל העמדות). זהו מנגנון ההרשאה הקיים במערכת — מודל המידור הייעודי
// טרם אופיין, וכשיאופיין יש להחליף כאן את הסינון בלבד.
import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import type { CrewMember } from '../../types';
import { DEBRIEF_SEVERITIES, INVOLVED_TYPES } from '../shared/DebriefForm';

// ── פלטה ────────────────────────────────────────────────────────────────────
// המסך נפתח מ-LOGIN, שהוא תמיד כהה — משטח יחיד, בלי מיתוג תמה.
const C = {
  bg: '#0f172a',
  panel: '#1e293b',
  border: '#334155',
  ink: '#e2e8f0',
  inkMuted: '#94a3b8',
  inkFaint: '#64748b',
  accent: '#2563eb',
  input: '#0b1220',
  rowAlt: '#16233a',
  // סדרה יחידה בגרף → גוון אחד, בלי מקרא (הכותרת מזהה אותה)
  bar: '#60a5fa',
  barHover: '#93c5fd',
  grid: '#1e293b',
};

const fmtDateTime = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtHours = (h: number) => (Math.round(h * 10) / 10).toFixed(1);

const severityLabel = (code: string) =>
  DEBRIEF_SEVERITIES.find(s => s.code === code)?.labelKey
    ? tr(DEBRIEF_SEVERITIES.find(s => s.code === code)!.labelKey)
    : code || '';
const severityColor = (code: string) =>
  DEBRIEF_SEVERITIES.find(s => s.code === code)?.color || C.inkFaint;
const involvedLabel = (type: string) => {
  const t = INVOLVED_TYPES.find(x => x.code === type);
  return t ? tr(t.labelKey) : type;
};

// ── פריטי UI משותפים ────────────────────────────────────────────────────────
const panelStyle: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 14px',
};
const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: '7px', border: `1px solid ${C.border}`,
  background: C.input, color: C.ink, fontSize: '13px', textAlign: 'start',
};
const thStyle: React.CSSProperties = {
  textAlign: 'start', padding: '8px 10px', fontSize: '12px', fontWeight: 'bold',
  color: C.inkMuted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: '13px', color: C.ink, borderBottom: `1px solid ${C.grid}`,
  verticalAlign: 'top',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: C.inkMuted }}>
      {label}
      {children}
    </label>
  );
}

// ── גרף עמודות ──────────────────────────────────────────────────────────────
// סדרה יחידה (שעות לפי תקופה) → גוון אחד ובלי מקרא. הטבלה היא התצוגה הראשית
// והגרף תצוגה חלופית, ולכן קיימת תמיד חלופה טקסטואלית לקריאה.
function HoursBarChart({ data, unit }: { data: { label: string; hours: number }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div style={{ color: C.inkFaint, fontSize: '13px', padding: '20px', textAlign: 'center' }}>{tr('crew.noRows')}</div>;

  const max = Math.max(...data.map(d => d.hours), 1);
  const H = 200;          // גובה אזור הציור
  const barW = 26;
  const gap = 10;         // ≥ 2px מרווח משטח בין עמודות סמוכות
  const leftPad = 44;
  const W = leftPad + data.length * (barW + gap) + gap;
  // קווי סרגל עדינים — רקע, לא נתון
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, v: max * f }));

  return (
    <div style={{ overflowX: 'auto', paddingBottom: '6px' }}>
      <svg width={Math.max(W, 320)} height={H + 46} role="img" style={{ display: 'block' }}>
        {ticks.map(t => (
          <g key={t.f}>
            <line x1={leftPad} x2={W} y1={H - t.f * H} y2={H - t.f * H} stroke={C.grid} strokeWidth={1} />
            <text x={leftPad - 6} y={H - t.f * H + 4} textAnchor="end" fontSize="10" fill={C.inkFaint}>
              {fmtHours(t.v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const h = (d.hours / max) * H;
          const x = leftPad + gap + i * (barW + gap);
          const y = H - h;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* יעד עכבר גדול מהעמודה עצמה */}
              <rect x={x - gap / 2} y={0} width={barW + gap} height={H} fill="transparent" />
              <rect
                x={x} y={y} width={barW} height={Math.max(h, 2)}
                rx={4} ry={4}
                fill={hover === i ? C.barHover : C.bar}
              />
              <text
                x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="10"
                fill={hover === i ? C.ink : C.inkFaint}
              >{d.label}</text>
              {hover === i && (
                <text x={x + barW / 2} y={Math.max(y - 6, 10)} textAnchor="middle" fontSize="11" fill={C.ink} fontWeight="bold">
                  {fmtHours(d.hours)}
                </text>
              )}
            </g>
          );
        })}
        <text x={leftPad} y={H + 36} fontSize="11" fill={C.inkMuted}>{unit}</text>
      </svg>
    </div>
  );
}

// ── מסך התחקירים ────────────────────────────────────────────────────────────
// סינון וקיבוץ לפי כל פרמטרי התחקיר **למעט** טקסט חופשי (פירוט תחקיר, פירוט
// אחריות) — קיבוץ לפי שדה חופשי מייצר קבוצה לכל שורה ואינו נושא מידע.
type DebriefGroupKey = '' | 'preset_name' | 'severity' | 'created_by' | 'month';

const DEBRIEF_GROUPS: { key: DebriefGroupKey; labelKey: string }[] = [
  { key: '', labelKey: 'crew.groupNone' },
  { key: 'preset_name', labelKey: 'crew.colStation' },
  { key: 'severity', labelKey: 'crew.colSeverity' },
  { key: 'created_by', labelKey: 'crew.colCreatedBy' },
  { key: 'month', labelKey: 'crew.byMonth' },
];

const monthOf = (v?: string | null) => (v ? String(v).slice(0, 7) : '');

function DebriefsView({ allowedPresetIds }: { allowedPresetIds: number[] | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStation, setFStation] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fCreatedBy, setFCreatedBy] = useState('');
  const [fInvolved, setFInvolved] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [groupBy, setGroupBy] = useState<DebriefGroupKey>('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API_URL}/debriefs`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // מידור: עמדה שאינה ברשימת המורשות אינה מוצגת כלל
  const visible = useMemo(
    () => (allowedPresetIds ? rows.filter(r => allowedPresetIds.includes(Number(r.preset_id))) : rows),
    [rows, allowedPresetIds]
  );

  const options = useMemo(() => ({
    stations: [...new Set(visible.map(r => r.preset_name).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'he')),
    createdBy: [...new Set(visible.map(r => r.created_by).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'he')),
  }), [visible]);

  const filtered = useMemo(() => visible.filter(r => {
    if (fStation && r.preset_name !== fStation) return false;
    if (fSeverity && r.severity !== fSeverity) return false;
    if (fCreatedBy && r.created_by !== fCreatedBy) return false;
    if (fInvolved && !(Array.isArray(r.involved) && r.involved.some((i: any) => i.type === fInvolved))) return false;
    const t = r.event_time || r.created_at;
    if (fFrom && t && String(t) < fFrom) return false;
    if (fTo && t && String(t).slice(0, 10) > fTo) return false;
    return true;
  }), [visible, fStation, fSeverity, fCreatedBy, fInvolved, fFrom, fTo]);

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, any[]>();
    for (const r of filtered) {
      const raw = groupBy === 'month' ? monthOf(r.event_time || r.created_at) : r[groupBy];
      const key = String(raw || '—');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he'));
  }, [filtered, groupBy]);

  const clear = () => {
    setFStation(''); setFSeverity(''); setFCreatedBy(''); setFInvolved(''); setFFrom(''); setFTo('');
  };

  const row = (r: any) => (
    <tr key={r.id}>
      <td style={tdStyle}>{r.preset_name || '—'}</td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDateTime(r.event_time || r.created_at)}</td>
      <td style={tdStyle}>
        {r.severity ? (
          <span style={{ background: severityColor(r.severity), color: '#fff', borderRadius: '10px', padding: '1px 8px', fontSize: '11px', fontWeight: 'bold' }}>
            {severityLabel(r.severity)}
          </span>
        ) : '—'}
      </td>
      <td style={tdStyle}>{r.essence || '—'}</td>
      <td style={tdStyle}>
        {Array.isArray(r.involved) && r.involved.length
          ? r.involved.map((i: any, k: number) => (
              <span key={k} style={{ display: 'inline-block', background: C.input, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '1px 7px', fontSize: '11px', marginInlineEnd: '4px', marginBottom: '2px' }}>
                {involvedLabel(i.type)}: {i.value}
              </span>
            ))
          : '—'}
      </td>
      <td style={tdStyle}>{r.created_by || '—'}</td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDateTime(r.created_at)}</td>
    </tr>
  );

  const head = (
    <tr>
      <th style={thStyle}>{tr('crew.colStation')}</th>
      <th style={thStyle}>{tr('crew.colEventTime')}</th>
      <th style={thStyle}>{tr('crew.colSeverity')}</th>
      <th style={thStyle}>{tr('crew.colEssence')}</th>
      <th style={thStyle}>{tr('crew.colInvolved')}</th>
      <th style={thStyle}>{tr('crew.colCreatedBy')}</th>
      <th style={thStyle}>{tr('crew.colCreatedAt')}</th>
    </tr>
  );

  return (
    <div>
      {/* פילטרים בשורה אחת מעל הטבלה */}
      <div style={{ ...panelStyle, marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
        <Field label={tr('crew.colStation')}>
          <select value={fStation} onChange={e => setFStation(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{tr('crew.selectPlaceholder')}</option>
            {options.stations.map(s => <option key={String(s)} value={String(s)}>{String(s)}</option>)}
          </select>
        </Field>
        <Field label={tr('crew.colSeverity')}>
          <select value={fSeverity} onChange={e => setFSeverity(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{tr('crew.selectPlaceholder')}</option>
            {DEBRIEF_SEVERITIES.map(s => <option key={s.code} value={s.code}>{tr(s.labelKey)}</option>)}
          </select>
        </Field>
        <Field label={tr('crew.colCreatedBy')}>
          <select value={fCreatedBy} onChange={e => setFCreatedBy(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{tr('crew.selectPlaceholder')}</option>
            {options.createdBy.map(s => <option key={String(s)} value={String(s)}>{String(s)}</option>)}
          </select>
        </Field>
        <Field label={tr('crew.colInvolved')}>
          <select value={fInvolved} onChange={e => setFInvolved(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">{tr('crew.selectPlaceholder')}</option>
            {INVOLVED_TYPES.map(t => <option key={t.code} value={t.code}>{tr(t.labelKey)}</option>)}
          </select>
        </Field>
        <Field label={tr('crew.dateFrom')}>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} style={{ ...inputStyle, direction: 'ltr' }} />
        </Field>
        <Field label={tr('crew.dateTo')}>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} style={{ ...inputStyle, direction: 'ltr' }} />
        </Field>
        <Field label={tr('crew.groupBy')}>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as DebriefGroupKey)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {DEBRIEF_GROUPS.map(g => <option key={g.key} value={g.key}>{tr(g.labelKey)}</option>)}
          </select>
        </Field>
        <button onClick={clear} style={{ padding: '7px 12px', background: C.border, color: C.ink, border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>
          {tr('crew.clearFilters')}
        </button>
        <div style={{ marginInlineStart: 'auto', fontSize: '12px', color: C.inkMuted }}>
          {tr('crew.total')}: {filtered.length}
        </div>
      </div>

      {loading ? (
        <div style={{ color: C.inkMuted, padding: '30px', textAlign: 'center' }}>{tr('crew.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.inkFaint, padding: '30px', textAlign: 'center' }}>{tr('crew.noRows')}</div>
      ) : groups ? (
        groups.map(([key, list]) => {
          const open = openGroups[key] !== false;
          return (
            <div key={key} style={{ ...panelStyle, marginBottom: '10px', padding: '0', overflow: 'hidden' }}>
              <button
                onClick={() => setOpenGroups(p => ({ ...p, [key]: !open }))}
                style={{ width: '100%', textAlign: 'start', padding: '9px 14px', background: C.input, border: 'none', color: C.ink, fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '8px' }}
              >
                <span>{open ? '▾' : '▸'}</span>
                <span style={{ flex: 1 }}>{groupBy === 'severity' ? severityLabel(key) : key}</span>
                <span style={{ color: C.inkMuted, fontWeight: 'normal' }}>{tr('crew.colCount')}: {list.length}</span>
              </button>
              {open && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>{head}</thead>
                  <tbody>{list.map(row)}</tbody>
                </table>
              )}
            </div>
          );
        })
      ) : (
        <div style={{ ...panelStyle, padding: '0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>{head}</thead>
            <tbody>{filtered.map(row)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── מסך הכשירויות ───────────────────────────────────────────────────────────
// שורה לכל איש צוות, ומתחתיה משמרות העמדה שלו: שם עמדה, זמן כניסה, זמן יציאה
// (עם תאריכים) וסה"כ שעות. ניתן להחליף לגרף לפי ימים / שבועות / חודשים / שנים.
type Bucket = 'day' | 'week' | 'month' | 'year';

const BUCKETS: { key: Bucket; labelKey: string }[] = [
  { key: 'day', labelKey: 'crew.byDay' },
  { key: 'week', labelKey: 'crew.byWeek' },
  { key: 'month', labelKey: 'crew.byMonth' },
  { key: 'year', labelKey: 'crew.byYear' },
];

/** מפתח התקופה של תאריך. שבוע = יום ראשון שפותח אותו (שבוע העבודה בישראל). */
export function bucketKey(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  if (bucket === 'year') return String(d.getFullYear());
  if (bucket === 'month') return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  if (bucket === 'week') {
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());
    return `${p(sunday.getDate())}/${p(sunday.getMonth() + 1)}`;
  }
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function CompetencyView({ allowedPresetIds }: { allowedPresetIds: number[] | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chartFor, setChartFor] = useState<string | null>(null);
  const [bucket, setBucket] = useState<Bucket>('day');

  useEffect(() => {
    fetch(`${API_URL}/station-sessions`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => (allowedPresetIds ? rows.filter(r => allowedPresetIds.includes(Number(r.preset_id))) : rows),
    [rows, allowedPresetIds]
  );

  // קיבוץ לפי איש צוות. משמרת בלי שם נרשמת תחת "—" ולא נעלמת.
  const byPerson = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of visible) {
      const key = String(r.crew_name || '—');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .map(([name, list]) => ({
        name,
        list,
        hours: list.reduce((s, r) => s + Number(r.hours || 0), 0),
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [visible]);

  const chartData = (list: any[]) => {
    const map = new Map<string, number>();
    for (const r of list) {
      const k = bucketKey(r.entered_at, bucket);
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + Number(r.hours || 0));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, hours]) => ({ label, hours }));
  };

  if (loading) return <div style={{ color: C.inkMuted, padding: '30px', textAlign: 'center' }}>{tr('crew.loading')}</div>;
  if (!byPerson.length) return <div style={{ color: C.inkFaint, padding: '30px', textAlign: 'center' }}>{tr('crew.noRows')}</div>;

  return (
    <div>
      {byPerson.map(person => {
        const open = expanded[person.name] !== false;
        const showChart = chartFor === person.name;
        return (
          <div key={person.name} style={{ ...panelStyle, marginBottom: '10px', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: C.input }}>
              <button
                onClick={() => setExpanded(p => ({ ...p, [person.name]: !open }))}
                style={{ background: 'none', border: 'none', color: C.ink, fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center', flex: 1, textAlign: 'start' }}
              >
                <span>{open ? '▾' : '▸'}</span>
                <span>{person.name}</span>
              </button>
              <span style={{ fontSize: '12px', color: C.inkMuted }}>
                {tr('crew.colCount')}: {person.list.length}
              </span>
              <span style={{ fontSize: '13px', color: C.ink, fontWeight: 'bold' }}>
                {fmtHours(person.hours)} {tr('crew.hoursUnit')}
              </span>
              <button
                onClick={() => setChartFor(showChart ? null : person.name)}
                style={{ padding: '5px 11px', background: showChart ? C.accent : C.border, color: showChart ? '#fff' : C.ink, border: 'none', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}
              >
                {showChart ? tr('crew.tableToggle') : tr('crew.chartToggle')}
              </button>
            </div>

            {open && showChart && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {BUCKETS.map(b => (
                    <button
                      key={b.key}
                      onClick={() => setBucket(b.key)}
                      style={{ padding: '5px 12px', borderRadius: '7px', border: `1px solid ${bucket === b.key ? C.accent : C.border}`, background: bucket === b.key ? C.accent : 'transparent', color: bucket === b.key ? '#fff' : C.inkMuted, fontSize: '12px', cursor: 'pointer' }}
                    >{tr(b.labelKey)}</button>
                  ))}
                </div>
                <HoursBarChart data={chartData(person.list)} unit={tr('crew.hoursUnit')} />
              </div>
            )}

            {open && !showChart && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{tr('crew.colStation')}</th>
                    <th style={thStyle}>{tr('crew.colEnteredAt')}</th>
                    <th style={thStyle}>{tr('crew.colExitedAt')}</th>
                    <th style={thStyle}>{tr('crew.colHours')}</th>
                  </tr>
                </thead>
                <tbody>
                  {person.list.map((r: any, i: number) => (
                    <tr key={r.id} style={{ background: i % 2 ? C.rowAlt : 'transparent' }}>
                      <td style={tdStyle}>{r.preset_name || '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDateTime(r.entered_at)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: r.open ? '#fbbf24' : C.ink }}>
                        {r.open ? tr('crew.stillOpen') : fmtDateTime(r.exited_at)}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtHours(Number(r.hours || 0))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 'bold', color: C.inkMuted }} colSpan={3}>{tr('crew.total')}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>{fmtHours(person.hours)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── המסך הראשי ──────────────────────────────────────────────────────────────
export default function ManpowerPage({ crewMember, onBack }: { crewMember?: CrewMember | null; onBack: () => void }) {
  const [view, setView] = useState<'menu' | 'debriefs' | 'competency'>('menu');

  // רשימה ריקה ממיראז' = אין הגבלה (כל העמדות); רשימה עם ערכים = רק הן
  const allowed = crewMember?.approved_workstations;
  const allowedPresetIds = allowed && allowed.length ? allowed.map(Number) : null;

  const bigButton = (labelKey: string, hintKey: string, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 220px', padding: '28px 22px', borderRadius: '14px',
        border: `2px solid ${C.border}`, background: C.panel, color: C.ink,
        cursor: 'pointer', textAlign: 'start', display: 'flex', flexDirection: 'column', gap: '6px',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
    >
      <span style={{ fontSize: '19px', fontWeight: 'bold' }}>{tr(labelKey)}</span>
      <span style={{ fontSize: '12px', color: C.inkMuted }}>{tr(hintKey)}</span>
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: C.panel, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `3px solid #f472b6`, flexShrink: 0 }}>
        <span style={{ fontSize: '20px' }}>👥</span>
        <span style={{ color: '#f9a8d4', fontWeight: 700, fontSize: '17px', flex: 1 }}>
          {tr('crew.manpowerTitle')}
          {view !== 'menu' && ` · ${tr(view === 'debriefs' ? 'crew.manpowerDebriefs' : 'crew.manpowerCompetency')}`}
        </span>
        {view !== 'menu' && (
          <button onClick={() => setView('menu')} style={{ background: C.border, border: 'none', borderRadius: '8px', color: C.ink, padding: '6px 14px', cursor: 'pointer', fontSize: '13px' }}>
            ↩ {tr('crew.back')}
          </button>
        )}
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: `1px solid ${C.border}`, borderRadius: '8px', color: C.ink, padding: '6px 14px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}>
          ✕ {tr('crew.close')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {allowedPresetIds && (
          <div style={{ fontSize: '12px', color: '#fbbf24', marginBottom: '12px' }}>🔒 {tr('crew.restrictedHidden')}</div>
        )}
        {view === 'menu' && (
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', maxWidth: '760px' }}>
            {bigButton('crew.manpowerDebriefs', 'crew.manpowerDebriefsHint', () => setView('debriefs'))}
            {bigButton('crew.manpowerCompetency', 'crew.manpowerCompetencyHint', () => setView('competency'))}
          </div>
        )}
        {view === 'debriefs' && <DebriefsView allowedPresetIds={allowedPresetIds} />}
        {view === 'competency' && <CompetencyView allowedPresetIds={allowedPresetIds} />}
      </div>
    </div>
  );
}
