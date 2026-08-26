import React, { useState, useEffect, useMemo } from 'react';
import { tr } from '../../i18n/tr';
import { imagePctToGeo, geoToImagePct, fmtCoordPair, parseCoordPair } from '../../utils/geo';
import type { MapGeoAnchor } from '../../utils/geo';

/**
 * רשימת הנ"צ של אזור המפה - הצגה ועריכה.
 *
 * אזור מגיע לבקר מהפרסום כ**רשימת נ"צ**, לא כציור. כאן הוא רואה את הקודקודים
 * בדיוק בפורמט שבו קיבל אותם (`NDDMM.mmm EDDDMM.mmm`), מתקן קודקוד שהונח
 * בעכבר בקירוב, ומדביק רשימה שלמה במקום לצייר 12 לחיצות על המפה.
 *
 * הרשימה חיה רק כשהמפה **מכוילת גיאוגרפית** - בלי עוגנים אין מהיכן לגזור נ"צ,
 * ולכן במקום שדות שלא עושים כלום מוצגת הסיבה (ראה CLAUDE.md - "לא לתת לפקד
 * להידלק בלי שקורה משהו").
 *
 * הרכיב אדיש למקור הנקודות: הוא משרת גם אזור חדש בציור (draftPoints) וגם אזור
 * שמור בעריכה, כי בשניהם המידע זהה - מערך קודקודים באחוזי-תמונה.
 */
export const COORD_SAMPLE = 'N3212.450 E03456.820';

export const ZoneCoordList = ({ points, anchor, onChange, minPoints = 0 }: {
  points: { x: number; y: number }[];
  anchor: MapGeoAnchor | null;
  onChange: (pts: { x: number; y: number }[]) => void;
  /** מתחת לזה כפתור המחיקה נחסם - אזור שמור לא יורד מ-3 קודקודים */
  minPoints?: number;
}) => {
  const geoTexts = useMemo(
    () => (anchor ? points.map(p => fmtCoordPair(imagePctToGeo(p.x, p.y, anchor))) : []),
    [points, anchor]
  );
  const geoKey = geoTexts.join('|');
  const [texts, setTexts] = useState<string[]>(geoTexts);
  const [errs, setErrs] = useState<Record<number, string>>({});
  const [addText, setAddText] = useState('');
  const [addErr, setAddErr] = useState('');
  const [pasteText, setPasteText] = useState<string | null>(null);
  const [pasteErr, setPasteErr] = useState('');
  const [copied, setCopied] = useState(false);

  // גרירת האזור על המפה משנה את הנקודות מבחוץ - השדות מתעדכנים איתן
  useEffect(() => { setTexts(geoTexts); setErrs({}); }, [geoKey]);

  const inputStyle = (bad: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 0, padding: '3px 5px', borderRadius: '3px',
    border: '1px solid ' + (bad ? '#ef4444' : '#334155'), background: '#1e293b', color: 'white',
    fontSize: '11px', fontFamily: 'monospace', direction: 'ltr', letterSpacing: '0.02em',
  });

  const btn = (bg: string): React.CSSProperties => ({
    background: bg, color: 'white', border: 'none', borderRadius: '4px',
    padding: '3px 8px', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap', flexShrink: 0,
  });

  /** נ"צ מוקלד → נקודה באחוזי-תמונה, או הסיבה שלא. */
  const toPoint = (text: string): { pt?: { x: number; y: number }; err?: string } => {
    if (!anchor) return { err: tr('map.zoneCoordsNeedCalib') };
    const g = parseCoordPair(text);
    if (!g) return { err: tr('map.zoneCoordInvalid', { fmt: COORD_SAMPLE }) };
    const pt = geoToImagePct(g.lat, g.lon, anchor);
    if (pt.x < -0.05 || pt.x > 100.05 || pt.y < -0.05 || pt.y > 100.05) return { err: tr('map.zoneCoordOutside') };
    return { pt: { x: Math.min(100, Math.max(0, pt.x)), y: Math.min(100, Math.max(0, pt.y)) } };
  };

  const clearErr = (i: number) => setErrs(prev => { const n = { ...prev }; delete n[i]; return n; });

  const commit = (i: number) => {
    const text = (texts[i] ?? '').trim();
    if (text === (geoTexts[i] ?? '')) { clearErr(i); return; }
    const { pt, err } = toPoint(text);
    if (!pt) { setErrs(prev => ({ ...prev, [i]: err as string })); return; }
    clearErr(i);
    onChange(points.map((p, k) => (k === i ? pt : p)));
  };

  const addPoint = () => {
    const { pt, err } = toPoint(addText);
    if (!pt) { setAddErr(err as string); return; }
    setAddErr(''); setAddText('');
    onChange([...points, pt]);
  };

  const applyPaste = () => {
    const lines = (pasteText ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const { pt, err } = toPoint(lines[i]);
      if (!pt) { setPasteErr(tr('map.zoneCoordPasteBadLine', { line: i + 1 }) + ' - ' + err); return; }
      out.push(pt);
    }
    if (out.length < 3) { setPasteErr(tr('map.zoneCoordPasteMin')); return; }
    setPasteErr(''); setPasteText(null);
    onChange(out);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(geoTexts.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', marginTop: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '8px' }}>
        <div style={{ color: '#7dd3fc', fontSize: '11px', fontWeight: 'bold' }}>
          {tr('map.zoneCoords')} ({points.length})
        </div>
        {anchor && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={copyAll} disabled={!points.length}
              style={{ ...btn(copied ? '#059669' : '#334155'), opacity: points.length ? 1 : 0.4 }}>
              {copied ? tr('map.zoneCoordCopied') : tr('map.zoneCoordCopy')}
            </button>
            <button onClick={() => { setPasteText(pasteText === null ? geoTexts.join('\n') : null); setPasteErr(''); }}
              style={btn(pasteText === null ? '#334155' : '#7c3aed')}>
              {tr('map.zoneCoordPaste')}
            </button>
          </div>
        )}
      </div>

      {!anchor ? (
        <div style={{ color: '#f59e0b', fontSize: '10px', lineHeight: 1.4 }}>{tr('map.zoneCoordsNeedCalib')}</div>
      ) : pasteText !== null ? (
        <>
          <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '4px' }}>{tr('map.zoneCoordPasteHint')}</div>
          <textarea value={pasteText} onChange={e => { setPasteText(e.target.value); setPasteErr(''); }} rows={6}
            placeholder={COORD_SAMPLE}
            style={{ width: '100%', boxSizing: 'border-box', padding: '5px', borderRadius: '4px', border: '1px solid #475569', background: '#0f172a', color: 'white', fontSize: '11px', fontFamily: 'monospace', direction: 'ltr', resize: 'vertical' }} />
          {pasteErr && <div style={{ color: '#f87171', fontSize: '10px', marginTop: '4px' }}>{pasteErr}</div>}
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button onClick={applyPaste} style={{ ...btn('#0ea5e9'), flex: 1, padding: '5px' }}>{tr('map.zoneCoordPasteApply')}</button>
            <button onClick={() => { setPasteText(null); setPasteErr(''); }} style={btn('#475569')}>{tr('shared.cancel')}</button>
          </div>
        </>
      ) : (
        <>
          {points.length === 0 && (
            <div style={{ color: '#64748b', fontSize: '10px', marginBottom: '6px' }}>{tr('map.zoneCoordsEmpty')}</div>
          )}
          <div style={{ maxHeight: '168px', overflowY: 'auto' }}>
            {points.map((_, i) => (
              <div key={i} style={{ marginBottom: '4px' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', width: '16px', textAlign: 'end', flexShrink: 0 }}>{i + 1}</span>
                  <input value={texts[i] ?? ''} onChange={e => setTexts(prev => prev.map((t, k) => (k === i ? e.target.value : t)))}
                    onBlur={() => commit(i)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    placeholder={COORD_SAMPLE} style={inputStyle(!!errs[i])} />
                  <button onClick={() => onChange(points.filter((_, k) => k !== i))} disabled={points.length <= minPoints}
                    title={points.length <= minPoints ? tr('map.zoneCoordMin') : tr('map.zoneCoordRemove')}
                    style={{ background: 'transparent', border: 'none', color: points.length <= minPoints ? '#475569' : '#ef4444', cursor: points.length <= minPoints ? 'default' : 'pointer', fontSize: '12px', padding: '0 2px', flexShrink: 0 }}>✕</button>
                </div>
                {errs[i] && <div style={{ color: '#f87171', fontSize: '10px', marginInlineStart: '20px' }}>{errs[i]}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ width: '16px', flexShrink: 0 }} />
            <input value={addText} onChange={e => { setAddText(e.target.value); setAddErr(''); }}
              onKeyDown={e => { if (e.key === 'Enter') addPoint(); }} placeholder={COORD_SAMPLE}
              style={{ ...inputStyle(!!addErr), borderStyle: 'dashed', background: '#0f172a' }} />
            <button onClick={addPoint} title={tr('map.zoneCoordAdd')} style={btn('#0ea5e9')}>+</button>
          </div>
          {addErr && <div style={{ color: '#f87171', fontSize: '10px', marginInlineStart: '20px', marginTop: '3px' }}>{addErr}</div>}
        </>
      )}
    </div>
  );
};

export default ZoneCoordList;
