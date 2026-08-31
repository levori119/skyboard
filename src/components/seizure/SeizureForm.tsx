/**
 * **טופס הגדרת המרחב המולאם** + הרשימה החכמה של עמדות ההפצה.
 *
 * ── למה הרשימה מחושבת כאן ולא בשרת ───────────────────────────────────────────
 * השאלה "האם המרחב חותך אזור שמוצג בעמדה X" תלויה במפה של X, בעוגנים שלה
 * ובאזורים שעליה. השרת מגיש את החומר הגולמי (`/candidates`) וההכרעה נעשית
 * ב-`tempZoneSeizure.ts` - **אותה** פונקציה שצובעת את האזורים בעמדה המקבלת.
 * מימוש שני בשרת היה נשבר בשקט ברגע שאחד מהם משתנה.
 *
 * ── שלוש קבוצות, אף עמדה לא נעלמת ───────────────────────────────────────────
 * מושפעות (מסומנות מראש) · עם מפה מעוגנת · בלי מפה מעוגנת. הסתרה של הקבוצה
 * השלישית הייתה מונעת מהיוצר להפיץ למי שהוא **יודע** שצריך לדעת, ובלי מפה
 * העמדה עדיין מקבלת התראה וכפתור "פתח מפה".
 *
 * חלון **עריכה** ולכן מסגרת כתומה (CLAUDE.md §מסגרת חלון).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { startPointerDrag, readRootScale } from '../../utils/pointerDrag';
import { buildGeoAnchor, geoToImagePct, imagePctToGeo, type MapGeoAnchor } from '../../utils/geo';
import { DRAW_PALETTE } from '../../utils/mapDrawing';
import { seizureCoverage, SEIZURE_DEFAULT_COLOR, normalizeSeizureRange } from '../../utils/tempZoneSeizure';
import { seizurePalette, seizureInputStyle } from './seizureTheme';
import StationState from './StationState';
import type { TempZoneSeizure } from '../../types';

interface CandidatePreset {
  id: number;
  name: string;
  map_id: number | null;
  map_anchored: boolean;
  /** יש מקטע משמרת פתוח - כלומר מישהו יושב על העמדה עכשיו. */
  active?: boolean;
  /** שם העמדה שמכסה אותה באיחוד עמדות פעיל, אם יש. */
  merged_into_name?: string | null;
}
interface CandidateZone { id: number; name: string; polygon: unknown; polygon_geo: unknown; bands: { lo: number | null; hi: number | null }[] }
interface CandidatesPayload {
  presets: CandidatePreset[];
  maps: Record<string, Record<string, unknown>>;
  zones: Record<string, CandidateZone[]>;
}

interface Props {
  apiUrl: string;
  presetId: number;
  presetName: string;
  mapId: number | null;
  /** עוגני המפה שעליה צויר הפוליגון - בלעדיהם אין נ"צ ואין הלאמה. */
  anchor: MapGeoAnchor;
  /** הפוליגון שצויר, באחוזי תמונת המפה של היוצר. */
  ptsPct: { x: number; y: number }[];
  themeMode: FrameTheme;
  onCancel: () => void;
  onCreated: (s: TempZoneSeizure) => void;
}

const asPts = (raw: unknown): { x: number; y: number }[] => {
  const v = typeof raw === 'string' ? safeParse(raw) : raw;
  return Array.isArray(v) ? v.filter(p => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)))
    .map(p => ({ x: Number(p.x), y: Number(p.y) })) : [];
};
const asGeo = (raw: unknown): { lat: number; lon: number }[] => {
  const v = typeof raw === 'string' ? safeParse(raw) : raw;
  return Array.isArray(v) ? v.filter(p => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lon)))
    .map(p => ({ lat: Number(p.lat), lon: Number(p.lon) })) : [];
};
function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return []; }
}

export default function SeizureForm({ apiUrl, presetId, presetName, mapId, anchor, ptsPct, themeMode, onCancel, onCreated }: Props) {
  const P = seizurePalette(themeMode);
  // ── גרירה בפיקסלים אמיתיים ───────────────────────────────────────────────
  // הטופס יושב ב-portal על ה-body, כלומר **מחוץ** ל-`#root` ולזום `--s` שעליו.
  // `startPointerDrag` מחזיר היסט ביחידות **מוגדלות** (כבר חילק ב---s), ולכן
  // כאן מכפילים בחזרה: בלי זה החלון היה זז פי 1/1.65 מהיד ב-24", ובפיתוח
  // ב-15.6" (--s=1) הבאג היה בלתי נראה.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const winRef = useRef<HTMLDivElement | null>(null);
  const onDragDown = (e: React.PointerEvent) => {
    const s = readRootScale();
    const r = winRef.current?.getBoundingClientRect();
    const origin = posRef.current ?? { x: r?.left ?? 0, y: r?.top ?? 0 };
    startPointerDrag(e, { onMove: (dx, dy) => setPos({ x: origin.x + dx * s, y: origin.y + dy * s }) });
  };

  const [name, setName] = useState('');
  const [altMin, setAltMin] = useState('');
  const [altMax, setAltMax] = useState('');
  const [color, setColor] = useState(SEIZURE_DEFAULT_COLOR);
  const [purpose, setPurpose] = useState('');
  const [phone, setPhone] = useState('');
  const [radio, setRadio] = useState('');
  const [etaEnd, setEtaEnd] = useState('');
  const [note, setNote] = useState('');
  const [toAll, setToAll] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [touchedSelection, setTouchedSelection] = useState(false);
  const [cands, setCands] = useState<CandidatesPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /** הפוליגון בנ"צ - מקור האמת שנשמר ושמוקרן בכל עמדה אחרת. */
  const polygonGeo = useMemo(
    () => ptsPct.map(p => imagePctToGeo(p.x, p.y, anchor)),
    [ptsPct, anchor],
  );

  // ב"מ לטלפון ולקש"פ מאנשי הקשר של העמדה: הפקח לא אמור להקליד את מספר
  // העמדה של עצמו בכל אירוע, ומספר שהוקלד בטעות הוא בירור שלא יקרה.
  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/workstation-contacts?preset_id=${presetId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: { oketz?: string; frequency?: string; priority?: string }[]) => {
        if (!alive || !Array.isArray(rows) || !rows.length) return;
        const main = rows.find(r => (r.priority || '') === 'ראשי') || rows[0];
        setPhone(prev => prev || String(main.oketz || ''));
        setRadio(prev => prev || String(main.frequency || ''));
      })
      .catch(() => { /* אין אנשי קשר - השדות נשארים ריקים ופתוחים להקלדה */ });
    return () => { alive = false; };
  }, [apiUrl, presetId]);

  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/temp-zone-seizures/candidates?preset_id=${presetId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setCands(d); })
      .catch(() => { /* בלי הרשימה עדיין אפשר "הפצה כללית" */ });
    return () => { alive = false; };
  }, [apiUrl, presetId]);

  const range = useMemo(
    () => normalizeSeizureRange({ alt_min: altMin === '' ? null : Number(altMin), alt_max: altMax === '' ? null : Number(altMax) }),
    [altMin, altMax],
  );

  /** לכל עמדה: האם מפתה מעוגנת, ואילו אזורים שלה המרחב חותך. */
  const groups = useMemo(() => {
    const affected: { p: CandidatePreset; zones: string[] }[] = [];
    const anchored: { p: CandidatePreset; zones: string[] }[] = [];
    const noMap: { p: CandidatePreset; zones: string[] }[] = [];
    if (!cands) return { affected, anchored, noMap };
    for (const p of cands.presets) {
      if (!p.map_anchored || !p.map_id) { noMap.push({ p, zones: [] }); continue; }
      const theirAnchor = buildGeoAnchor(cands.maps[String(p.map_id)] || null);
      if (!theirAnchor) { noMap.push({ p, zones: [] }); continue; }
      const seizurePts = polygonGeo.map(g => geoToImagePct(g.lat, g.lon, theirAnchor));
      const hits: string[] = [];
      for (const z of cands.zones[String(p.map_id)] || []) {
        const geo = asGeo(z.polygon_geo);
        const zonePts = geo.length >= 3 ? geo.map(g => geoToImagePct(g.lat, g.lon, theirAnchor)) : asPts(z.polygon);
        if (seizureCoverage(zonePts, seizurePts, z.bands, range) !== 'none') hits.push(z.name);
      }
      if (hits.length) affected.push({ p, zones: hits }); else anchored.push({ p, zones: [] });
    }
    return { affected, anchored, noMap };
  }, [cands, polygonGeo, range]);

  // העמדות המושפעות מסומנות מראש - אבל **רק** עד שהמפעיל נגע ברשימה, אחרת
  // כל שינוי בטווח הגבהים היה דורס בחירה ידנית שהוא כבר עשה.
  useEffect(() => {
    if (touchedSelection) return;
    setSelected(new Set(groups.affected.map(a => a.p.id)));
  }, [groups.affected, touchedSelection]);

  const toggle = (id: number) => {
    setTouchedSelection(true);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canCreate = name.trim().length > 0 && (toAll || selected.size > 0) && !saving;
  const blockReason = !name.trim() ? tr('seizure.needName') : (!toAll && selected.size === 0 ? tr('seizure.needTargets') : '');

  const submit = async () => {
    if (!canCreate) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/temp-zone-seizures`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), purpose, color, alt_min: range.alt_min, alt_max: range.alt_max,
          polygon_geo: polygonGeo.map(g => ({ lat: g.lat, lon: g.lon })), polygon: ptsPct,
          creator_preset_id: presetId, creator_preset_name: presetName, creator_map_id: mapId,
          phone, radio, note,
          eta_end: etaEnd ? new Date(etaEnd).toISOString() : null,
          to_all: toAll, target_preset_ids: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(String(data?.error || '')); setSaving(false); return; }
      onCreated(data as TempZoneSeizure);
    } catch {
      setError(tr('seizure.saveFailed'));
      setSaving(false);
    }
  };

  const label = (t: string) => (
    <label style={{ display: 'block', color: P.muted, fontSize: 11, marginBottom: 3 }}>{t}</label>
  );
  const inp = seizureInputStyle(P);
  const tdBase: React.CSSProperties = { padding: '4px 6px', textAlign: 'start', verticalAlign: 'top' };

  /**
   * ── רשימת ההפצה כ**טבלה** ולא כשורות טקסט ────────────────────────────────
   * שלושה פריטי מידע נוסעים יחד על כל עמדה - שם, מצב, ואילו אזורים המרחב חותך
   * אצלה - וכשהם שכנים באותה שורת flex הם נשברים במקומות שונים בכל שורה: מצב
   * העמדה של אחת יושב מתחת לשם של השנייה, ורשימת האזורים דוחפת אותו הצידה.
   * היוצר סורק כאן עשרות עמדות בלחץ זמן, וסריקה **אנכית** בעמודה קבועה היא
   * מה שהופכת את הרשימה לקריאה במבט אחד.
   *
   * `table-layout: fixed` הוא שמקבע את העמודות: בלעדיו רוחב העמודה נגזר
   * מהתוכן, ועמדה אחת עם שם ארוך מזיזה את כל הטבלה.
   *
   * **מצב העמדה אינו מסתיר אותה**: עמדה חשוכה עדיין יכולה להיות היעד הנכון
   * (מישהו ייכנס אליה תוך דקה), אבל היוצר חייב לדעת שהוא מפיץ אל מסך כבוי -
   * אחרת הוא ימתין לאישור שלא יגיע.
   */
  const stationRow = (p: CandidatePreset, zones: string[], dim: boolean) => (
    <tr key={p.id} onClick={() => toggle(p.id)}
      style={{
        cursor: 'pointer',
        background: selected.has(p.id) ? (themeMode === 'light' ? '#ffedd5' : '#431407') : 'transparent',
        opacity: toAll ? 0.5 : 1,
      }}>
      <td style={{ ...tdBase, width: 26, textAlign: 'center' }}>
        <input type="checkbox" readOnly checked={toAll || selected.has(p.id)} style={{ pointerEvents: 'none', margin: 0 }} />
      </td>
      {/* שם ארוך נשבר בתוך התא. `textOverflow` היה חסר תועלת כאן: בלי
          `nowrap` הוא אינו נכנס לפעולה, ועם `nowrap` שם עמדה היה נחתך */}
      <td style={{ ...tdBase, color: dim ? P.muted : P.text, fontSize: 12, wordBreak: 'break-word' }}>{p.name}</td>
      <td style={{ ...tdBase, width: 108 }}><StationState state={p} /></td>
      {/* שמות האזורים גולשים לשורות נוספות בתוך התא ולא דוחפים את העמודות */}
      <td style={{ ...tdBase, color: '#fdba74', fontSize: 10, wordBreak: 'break-word' }}>
        {zones.length > 0 ? zones.join(' · ') : ''}
      </td>
    </tr>
  );

  const group = (title: string, items: { p: CandidatePreset; zones: string[] }[], dim: boolean) => items.length === 0 ? null : (
    <React.Fragment key={title}>
      <tr>
        <td colSpan={4} style={{ color: P.muted, fontSize: 10, padding: '4px 6px 2px', borderBottom: `1px solid ${P.line}` }}>
          {title} ({items.length})
        </td>
      </tr>
      {items.map(i => stationRow(i.p, i.zones, dim))}
    </React.Fragment>
  );

  // ── portal ל-body: הטופס יושב מעל **הכל** ─────────────────────────────────
  // z-index לבדו אינו מספיק: סרגלי המפה והתפריטים יושבים בהקשרי ערימה משלהם,
  // ואלמנט שקבור בתוך אחד מהם נצבע מתחתיהם ולא מעליהם - בלי קשר למספר. יציאה
  // מהעץ היא הדרך היחידה שמבטיחה "מעל הכל", וזו גם התבנית של כל דיאלוג במסך.
  //
  // מחוץ ל-`#root` אין זום `--s`, ולכן `vh` הוא כבר אמיתי ואין לחלק בו.
  return createPortal(
    <div ref={winRef} style={{
      position: 'fixed', zIndex: 10700,
      ...(pos ? { left: pos.x, top: pos.y } : { insetInlineStart: '50%', top: 60, transform: 'translateX(-50%)' }),
      width: 460, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
      background: P.panel, ...windowFrame('edit', themeMode, 10), boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      direction: i18n.dir(),
    }}>
      <div onPointerDown={onDragDown} style={{
        cursor: 'move', touchAction: 'none', userSelect: 'none',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderBottom: `1px solid ${P.line}`, background: P.panelAlt,
      }}>
        <span style={{ color: P.accent, fontWeight: 'bold', fontSize: 14, flex: 1 }}>⛶ {tr('seizure.formTitle')}</span>
        <button type="button" onClick={onCancel}
          style={{ background: 'none', border: 'none', color: P.danger, cursor: 'pointer', fontSize: 15 }}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          {label(tr('shared.name'))}
          <input value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fAltFrom'))}
            <input value={altMin} onChange={e => setAltMin(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fAltTo'))}
            <input value={altMax} onChange={e => setAltMax(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" style={inp} />
          </div>
          <div style={{ flex: 1.2, color: (!altMin && !altMax) ? P.accent : P.muted, fontSize: 11, paddingBottom: 7 }}>
            {(!altMin && !altMax) ? `⚠ ${tr('seizure.allAlts')}` : ''}
          </div>
        </div>

        <div>
          {label(tr('shared.color'))}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {DRAW_PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={c}
                style={{
                  width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer',
                  border: `2px solid ${color === c ? P.text : 'transparent'}`,
                }} />
            ))}
          </div>
        </div>

        <div>
          {label(tr('seizure.fPurpose'))}
          <input value={purpose} onChange={e => setPurpose(e.target.value)} style={inp} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fCreator'))}
            <input value={presetName} readOnly style={{ ...inp, opacity: 0.7 }} />
          </div>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fEta'))}
            <input type="datetime-local" value={etaEnd} onChange={e => setEtaEnd(e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fPhone'))}
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            {label(tr('seizure.fRadio'))}
            <input value={radio} onChange={e => setRadio(e.target.value)} style={inp} />
          </div>
        </div>

        <div>
          {label(tr('shared.note'))}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div style={{ borderTop: `1px solid ${P.line}`, paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: P.text, fontSize: 12, fontWeight: 'bold', flex: 1 }}>{tr('seizure.fDistribute')}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: toAll ? P.accent : P.muted, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={toAll} onChange={e => setToAll(e.target.checked)} />
              {tr('seizure.fToAll')}
            </label>
          </div>
          <div style={{ maxHeight: 190, overflowY: 'auto', border: `1px solid ${P.line}`, borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              {/* הכותרת נדבקת למעלה: הרשימה נגללת, והעמודה שמסתכלים עליה
                  חייבת להישאר מסומנת בשמה גם בעמדה החמישים */}
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: P.panelAlt }}>
                  <th style={{ ...tdBase, width: 26 }} />
                  <th style={{ ...tdBase, color: P.muted, fontSize: 10, fontWeight: 'normal' }}>{tr('seizure.colStation')}</th>
                  <th style={{ ...tdBase, width: 108, color: P.muted, fontSize: 10, fontWeight: 'normal' }}>{tr('seizure.colState')}</th>
                  <th style={{ ...tdBase, color: P.muted, fontSize: 10, fontWeight: 'normal' }}>{tr('seizure.colCrosses')}</th>
                </tr>
              </thead>
              <tbody>
                {group(tr('seizure.grpAffected'), groups.affected, false)}
                {group(tr('seizure.grpAnchored'), groups.anchored, true)}
                {group(tr('seizure.grpNoMap'), groups.noMap, true)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 12px', borderTop: `1px solid ${P.line}`, background: P.panelAlt, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, color: error ? P.danger : P.muted, fontSize: 11 }}>{error || blockReason}</span>
        <button type="button" onClick={onCancel}
          style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${P.line}`, background: P.panel, color: P.muted, cursor: 'pointer', fontSize: 12 }}>
          {tr('shared.cancel')}
        </button>
        <button type="button" onClick={submit} disabled={!canCreate}
          style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 'bold',
            border: `1px solid ${canCreate ? '#f97316' : P.line}`,
            background: canCreate ? '#f97316' : P.panel,
            color: canCreate ? '#0f172a' : P.muted,
            cursor: canCreate ? 'pointer' : 'not-allowed',
          }}>
          {tr('seizure.create')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
