import { tr } from '../../i18n/tr';
import React, { useState, useRef, useEffect } from 'react';
import { API_URL } from '../../config';
import Strip from '../strips/Strip';
import { getFormationDisplayName } from '../../utils/strips';
import { evaluateQuery, clampMenuPos } from '../../utils/queryBuilder';
import type { SGNode, SGCell, SGSplit, SGCondition } from '../../types/stripGrid';
import { CLASSIC_STRIP_FIELDS } from '../../types/stripGrid';
import { ensureSGBlinkStyle } from '../../utils/stripGrid';

export const ClassicStripCard = ({ strip, rows, lightMode, onUpdateField, onDragStart, isDragging, singleClickEdit, aviationBases, allSectors, layoutJson, conditionsJson, stripHeight }: {
  strip: any; rows: any[]; lightMode: boolean;
  onUpdateField?: (field: string, value: string) => void;
  onDragStart?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  singleClickEdit?: boolean;
  aviationBases?: any[];
  allSectors?: any[];
  layoutJson?: SGNode | null;
  conditionsJson?: SGCondition[];
  stripHeight?: number;
}) => {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [cardHovered, setCardHovered] = useState(false);
  const fieldLabel = (key: string) => {
    const found = CLASSIC_STRIP_FIELDS.find(f => f.key === key);
    return found ? found.label : key;
  };
  const getVal = (fieldKey: string) => {
    if (!fieldKey) return '';
    if (fieldKey === 'callSign') return getFormationDisplayName(strip);
    if (fieldKey === 'sq') return strip.sq || strip.squadron || '';
    if (fieldKey === 'numberOfFormation') return strip.numberOfFormation || strip.number_of_formation || '';
    if (fieldKey === 'takeoff_time') {
      const raw = strip.takeoff_time || strip.takeoffTime || '';
      if (!raw) return '';
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return raw;
    }
    if (fieldKey === 'airborne') return strip.airborne ? 'מאוויר' : 'קרקע';
    if (fieldKey === 'weapons') return (Array.isArray(strip.weapons) ? strip.weapons : []).map((w: any) => w.type || w.name || '').filter(Boolean).join(', ');
    if (fieldKey === 'targets') return (Array.isArray(strip.targets) ? strip.targets : []).map((t: any) => t.name || '').filter(Boolean).join(', ');
    if (fieldKey === 'systems') return (Array.isArray(strip.systems) ? strip.systems : []).map((s: any) => typeof s === 'string' ? s : (s.name || s.type || '')).filter(Boolean).join(', ');
    if (fieldKey === 'takeoff_airfield') {
      const id = strip.takeoff_airfield_id || strip.departure_base_id;
      if (!id) return '';
      const base = (aviationBases || []).find((b: any) => b.id === id || b.id === Number(id));
      return base ? (base.code || base.name || String(id)) : String(id);
    }
    if (fieldKey === 'landing_airfield') {
      const id = strip.landing_airfield_id || strip.landing_base_id;
      if (!id) return '';
      const base = (aviationBases || []).find((b: any) => b.id === id || b.id === Number(id));
      return base ? (base.code || base.name || String(id)) : String(id);
    }
    if (fieldKey === 'flight_direction') {
      const taId = strip.takeoff_airfield_id; const laId = strip.landing_airfield_id;
      if (!taId || !laId) return '';
      const ta = (aviationBases || []).find((b: any) => b.id === taId || b.id === Number(taId));
      const la = (aviationBases || []).find((b: any) => b.id === laId || b.id === Number(laId));
      if (!ta || !la || ta.coord_n == null || la.coord_n == null) return '';
      const tLat = parseFloat(ta.coord_n), lLat = parseFloat(la.coord_n);
      if (isNaN(tLat) || isNaN(lLat)) return '';
      return lLat < tLat ? 'דרומה ↓' : lLat > tLat ? 'צפונה ↑' : '';
    }
    if (fieldKey === 'workstation_preset_name') return strip.workstation_preset_name || '';
    if (fieldKey === 'sector') {
      if (strip.sector_id) {
        const sec = (allSectors || []).find((s: any) => s.id === strip.sector_id || s.id === Number(strip.sector_id));
        return sec ? (sec.name || String(strip.sector_id)) : String(strip.sector_id);
      }
      return strip.sector || '';
    }
    if (fieldKey === 'status') {
      const STATUS_HE: Record<string,string> = { queued: 'ממתין', active: 'פעיל', pending_transfer: 'בהעברה', completed: 'הושלם' };
      return STATUS_HE[strip.status] || strip.status || '';
    }
    return strip[fieldKey] || '';
  };
  const getRowFields = (row: any): any[] => (row.fields && Array.isArray(row.fields) && row.fields.length > 0)
    ? row.fields : (row.field_name ? [{ field_name: row.field_name }] : []);
  const getRowVal = (row: any) => {
    const rf = getRowFields(row);
    return rf.reduce((acc: string, f: any, i: number) => {
      const v = getVal(f.field_name);
      if (!v) return acc;
      if (!acc) return v;
      const sep = rf[i - 1]?.separator ?? ' / ';
      return acc + sep + v;
    }, '');
  };
  const getSingleEditableField = (row: any): string | null => {
    const fields = getRowFields(row);
    const markedField = fields.find((f: any) => f.editable);
    if (markedField) return markedField.field_name;
    if (!row.editable) return null;
    return fields.length === 1 ? fields[0].field_name : null;
  };
  const defaultColor = lightMode ? '#1e293b' : '#e2e8f0';
  const accent = lightMode ? '#3b82f6' : '#1d4ed8';

  // Evaluate conditions for grid layout
  const evalConditions = (conds: SGCondition[], targetCellId?: string) => {
    let bg: string | undefined; let text: string | undefined; let blink = false; let blinkColor = '#ef4444'; let blinkRate = 0.8;
    for (const c of (conds || [])) {
      if (c.target === 'cell' && targetCellId && c.targetCellId !== targetCellId) continue;
      if (c.target === 'strip' && targetCellId !== undefined) continue;
      if (c.target === 'all' && targetCellId === undefined) continue; // 'all' applies to cells only, not strip wrapper
      let match = false;
      try { match = c.query ? evaluateQuery(strip, c.query) : false; } catch { match = false; }
      if (match) {
        if (c.styleBg) bg = c.styleBg; if (c.styleText) text = c.styleText;
        if (c.blink) { blink = true; if (c.blinkColor) blinkColor = c.blinkColor; if (c.blinkRate) blinkRate = c.blinkRate; }
      }
    }
    return { bg, text, blink, blinkColor, blinkRate };
  };

  const renderSGNode = (node: SGNode, stripBg?: string, stripTxt?: string): React.ReactNode => {
    if (node.type === 'cell') {
      const cell = node as SGCell;
      const val = getVal(cell.fieldKey);
      const condStyle = evalConditions(conditionsJson || [], cell.id);
      const bg = condStyle.bg || cell.bgColor || stripBg || (lightMode ? '#ffffff' : '#1e293b');
      const clr = condStyle.text || cell.textColor || stripTxt || defaultColor;
      const shouldBlink = condStyle.blink || !!cell.blink;
      const blinkClr = condStyle.blink ? condStyle.blinkColor : (cell.blinkColor || '#ef4444');
      const blinkSpd = condStyle.blink ? condStyle.blinkRate : (cell.blinkRate || 0.8);
      if (shouldBlink) ensureSGBlinkStyle();
      const titleStr = cell.showTitle ? ((cell.titleText && cell.titleText.trim()) ? cell.titleText : (CLASSIC_STRIP_FIELDS.find(f => f.key === cell.fieldKey)?.label || '')) : '';
      return (
        <div key={cell.id} title={cell.hint || undefined} style={{
          flex: 1, display: 'flex', flexDirection: cell.showTitle ? 'column' : 'row',
          alignItems: cell.showTitle ? 'stretch' : 'center', justifyContent: cell.showTitle ? 'flex-start' : (cell.textAlign || 'center'),
          background: bg, color: clr, fontSize: `${cell.fontSize || 12}px`,
          fontWeight: cell.bold ? 'bold' : 'normal', fontStyle: cell.italic ? 'italic' : 'normal',
          overflow: 'hidden', padding: '1px 4px', minHeight: '20px', minWidth: 0,
          ...(shouldBlink ? { '--sg-bb': bg, '--sg-bt': blinkClr, animation: `sg-cell-blink ${blinkSpd}s step-end infinite` } : {}),
        } as React.CSSProperties}>
          {cell.showTitle && (
            <div style={{ fontSize: `${cell.titleFontSize || 10}px`, fontWeight: cell.titleBold ? 'bold' : 'normal', color: cell.titleColor || '#93c5fd', background: cell.titleBg || 'transparent', textAlign: cell.titleAlign || 'center', borderRadius: '2px', padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, lineHeight: 1.3 }}>{titleStr}</div>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: cell.textAlign || 'center', ...(cell.textBgColor ? { background: cell.textBgColor, borderRadius: '2px', padding: '0 3px' } : {}) }}>{val}</span>
        </div>
      );
    }
    const split = node as SGSplit;
    const condStyle = evalConditions(conditionsJson || []);
    const activeBg = condStyle.bg || stripBg; const activeTxt = condStyle.text || stripTxt;
    return (
      <div key={split.id} style={{ display: 'flex', flexDirection: split.direction === 'h' ? 'row' : 'column', flex: 1, overflow: 'hidden' }}>
        {split.children.map((child, i) => (
          <div key={child.id} style={{ [split.direction === 'h' ? 'width' : 'height']: `${split.sizes[i] ?? (100 / split.children.length)}%`, display: 'flex', overflow: 'hidden', flexDirection: split.direction === 'h' ? 'column' : 'row', borderInlineEnd: split.direction === 'h' && i < split.children.length - 1 ? `1px solid ${lightMode ? '#e2e8f0' : '#334155'}` : undefined, borderBottom: split.direction === 'v' && i < split.children.length - 1 ? `1px solid ${lightMode ? '#e2e8f0' : '#334155'}` : undefined }}>
            {renderSGNode(child, activeBg, activeTxt)}
          </div>
        ))}
      </div>
    );
  };

  if (layoutJson) {
    const stripCondStyle = evalConditions(conditionsJson || []);
    return (
      <div
        draggable={!!onDragStart} onDragStart={onDragStart}
        onMouseEnter={() => setCardHovered(true)}
        onMouseLeave={() => setCardHovered(false)}
        style={{ border: `1.5px solid ${lightMode ? '#94a3b8' : '#475569'}`, borderRadius: '4px', marginBottom: '5px', overflow: 'hidden', opacity: isDragging ? 0.4 : 1, cursor: onDragStart ? 'grab' : 'default', userSelect: 'none', boxShadow: `0 2px 0 ${accent}`, display: 'flex', flexDirection: 'column', background: stripCondStyle.bg || (lightMode ? '#ffffff' : '#1e293b'), color: stripCondStyle.text || defaultColor, height: stripHeight ? `${stripHeight}px` : undefined }}
      >
        {renderSGNode(layoutJson)}
      </div>
    );
  }

  // Compact card with a colored accent stripe at the bottom for clear visual separation between strips.
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => { setCardHovered(false); setHoveredRow(null); }}
      style={{ border: `1.5px solid ${lightMode ? '#94a3b8' : '#475569'}`, borderRadius: '4px', marginBottom: '5px', overflow: 'hidden', opacity: isDragging ? 0.4 : 1, cursor: onDragStart ? 'grab' : 'default', userSelect: 'none', boxShadow: `0 2px 0 ${accent}` }}
    >
      {[0, 1, 2].map(i => {
        const row = rows[i] || {};
        const fields = getRowFields(row);
        const val = getRowVal(row);
        const editableField = getSingleEditableField(row);
        const isEditing = editingRow === i;
        const rowDefaultBg = lightMode ? (i % 2 === 0 ? '#ffffff' : '#f8fafc') : (i % 2 === 0 ? '#1e293b' : '#0f172a');
        const justifyContent = row.text_align === 'right' ? 'flex-end' : row.text_align === 'left' ? 'flex-start' : 'center';
        const hasPerFieldStyle = fields.some((f: any) => f.text_color || f.bg_color || f.bold != null || f.italic != null || f.underline != null || f.font_size);
        return (
          <div key={i}
            style={{
              padding: '1px 6px', minHeight: '18px', display: 'flex', alignItems: 'center',
              justifyContent,
              background: isEditing
                ? (lightMode ? '#eff6ff' : '#1e3a5f')
                : (hoveredRow === i && editableField && onUpdateField)
                  ? (lightMode ? '#f1f5f9' : '#1e2d40')
                  : (row.bg_color || rowDefaultBg),
              color: row.text_color || defaultColor,
              fontSize: `${row.font_size || 12}px`,
              fontWeight: row.bold ? 'bold' : 'normal',
              fontStyle: row.italic ? 'italic' : 'normal',
              textDecoration: row.underline ? 'underline' : 'none',
              borderBottom: i < 2 ? `1px solid ${lightMode ? '#e2e8f0' : '#1e293b'}` : 'none',
              cursor: (editableField && onUpdateField) ? 'text' : 'grab',
              borderRight: row.border_width ? `${row.border_width}px solid ${row.border_color || '#94a3b8'}` : undefined,
              transition: 'background 0.1s',
            }}
            onMouseEnter={() => setHoveredRow(i)}
            onMouseLeave={() => setHoveredRow(null)}
            onMouseDown={e => { if (editableField && onUpdateField) e.stopPropagation(); }}
            onClick={() => { if (editableField && onUpdateField) { setEditingRow(i); setEditVal(getVal(editableField)); } }}
          >
            {isEditing ? (
              <span style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: lightMode ? '#3b82f6' : '#93c5fd', fontStyle: 'normal', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 'bold' }}>{fieldLabel(editableField!)}: </span>
                <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  onBlur={() => { if (onUpdateField && editableField) onUpdateField(editableField, editVal); setEditingRow(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { if (onUpdateField && editableField) onUpdateField(editableField, editVal); setEditingRow(null); } if (e.key === 'Escape') setEditingRow(null); }}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 'inherit', textAlign: (row.text_align || 'center') as any, minWidth: 0 }}
                />
              </span>
            ) : hasPerFieldStyle && fields.length > 1 ? (
              /* Per-field styled rendering */
              <span style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'baseline', overflow: 'hidden', width: '100%', justifyContent }}>
                {fields.map((f: any, fi: number) => {
                  const fVal = getVal(f.field_name);
                  return (
                    <span key={fi} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                      {fi > 0 && <span style={{ color: row.text_color || defaultColor, opacity: 0.6, whiteSpace: 'pre' }}>{fields[fi - 1]?.separator ?? ' / '}</span>}
                      <span style={{
                        color: f.text_color || undefined,
                        background: f.bg_color || undefined,
                        fontSize: f.font_size ? `${f.font_size}px` : undefined,
                        fontWeight: f.bold ? 'bold' : undefined,
                        fontStyle: f.italic ? 'italic' : undefined,
                        textDecoration: f.underline ? 'underline' : undefined,
                        borderRadius: f.bg_color ? '2px' : undefined,
                        padding: f.bg_color ? '0 2px' : undefined,
                        opacity: fVal ? 1 : 0.3,
                        whiteSpace: 'nowrap',
                      }}>{fVal || ''}</span>
                    </span>
                  );
                })}
              </span>
            ) : (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: (row.text_align || 'center') as any }}>
                {val || (editableField && onUpdateField && cardHovered
                  ? <span style={{ color: lightMode ? '#94a3b8' : '#475569', fontStyle: 'italic' }}>{fieldLabel(editableField)}</span>
                  : '')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ClassicTransferHelpModal = ({ lightMode, onClose }: { lightMode: boolean; onClose: () => void }) => {
  const bg = lightMode ? '#ffffff' : '#0f172a';
  const border = lightMode ? '#cbd5e1' : '#334155';
  const text = lightMode ? '#1e293b' : '#e2e8f0';
  const subtext = lightMode ? '#475569' : '#94a3b8';
  const greenBg = lightMode ? '#dcfce7' : '#14532d';
  const greenText = lightMode ? '#166534' : '#86efac';
  const amberBg = lightMode ? '#fef3c7' : '#451a03';
  const amberText = lightMode ? '#92400e' : '#fcd34d';
  const stationBox = (label: string, color: string, fill: string) => (
    <g>
      <rect width="120" height="44" rx="6" fill={fill} stroke={color} strokeWidth="1.5" />
      <text x="60" y="27" textAnchor="middle" fontSize="13" fontWeight="bold" fill={color}>{label}</text>
    </g>
  );
  const arrow = (color: string) => (
    <g>
      <line x1="0" y1="22" x2="50" y2="22" stroke={color} strokeWidth="2" />
      <polygon points="50,22 42,17 42,27" fill={color} />
      <line x1="50" y1="22" x2="0" y2="22" stroke={color} strokeWidth="2" />
      <polygon points="0,22 8,17 8,27" fill={color} />
    </g>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '20px', maxWidth: '640px', width: '90%', maxHeight: '90vh', overflowY: 'auto', color: text, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: `1px solid ${border}` }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>{tr("❓ איך עובדות העברות בעמדת סטריפים?")}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: subtext, cursor: 'pointer', fontSize: '20px', padding: '4px 10px' }}>✕</button>
        </div>

        <div style={{ marginBottom: '18px', padding: '12px', background: greenBg, borderRadius: '8px', border: `1px solid ${greenText}` }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: greenText, fontWeight: 'bold' }}>{tr("📋 העברה ישירה בין עמדות סטריפים")}</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', lineHeight: 1.6, color: text }}>
            כאשר שתי עמדות סטריפים מעבירות פמ"מ ביניהן — ההעברה היא ישירה, <b>{tr("מעמדה לעמדה")}</b>, בלי סקטור באמצע.
            <br />
            <b>{tr("בהגדרות העמדה:")}</b> בוחרים את העמדות תחת "📋 עמדות סטריפים שותפות (העברה ישירה)". הרשימה מציגה רק עמדות מסוג סטריפים.
            <br />
            <b>{tr("בעמדה עצמה:")}</b> העמדות השותפות מופיעות תחת הכותרת "📋 עמדות סטריפים" — בפאנל הימני להעברה, ובפאנל השמאלי לקבלה.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px', background: bg, borderRadius: '6px' }}>
            <svg width="320" height="50" viewBox="0 0 320 50">
              <g transform="translate(10,3)">{stationBox('📋 עמדה A', greenText, greenBg)}</g>
              <g transform="translate(135,3)">{arrow(greenText)}</g>
              <g transform="translate(190,3)">{stationBox('📋 עמדה B', greenText, greenBg)}</g>
            </svg>
          </div>
        </div>

        <div style={{ padding: '12px', background: amberBg, borderRadius: '8px', border: `1px solid ${amberText}` }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: amberText, fontWeight: 'bold' }}>{tr("📍 העברה דרך נקודת העברה (לעמדות שאינן סטריפים)")}</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', lineHeight: 1.6, color: text }}>
            כדי להעביר פמ"מ בין עמדת סטריפים לעמדה רגילה (מפה/טבלה) — משתמשים בנקודות העברה משותפות (סקטורים).
            <br />
            <b>{tr("בהגדרות העמדה:")}</b> בוחרים את הסקטורים תחת "📍 נקודות העברה לעמדות שאינן סטריפים" — בנפרד לקבלה (ממי מקבל) ולהעברה (למי מעביר). העמדה הרגילה מצידה צריכה להגדיר אותם סקטורים בנקודות הקבלה/העברה שלה.
            <br />
            <b>{tr("בעמדה עצמה:")}</b> הנקודות מופיעות תחת הכותרת "📍 נקודות העברה" / "📍 נקודות קבלה" — בנפרד מעמדות הסטריפים השותפות.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px', background: bg, borderRadius: '6px' }}>
            <svg width="460" height="50" viewBox="0 0 460 50">
              <g transform="translate(10,3)">{stationBox('📋 עמדת סטריפים', amberText, greenBg)}</g>
              <g transform="translate(135,3)">{arrow(amberText)}</g>
              <g transform="translate(190,3)">
                <rect width="80" height="44" rx="22" fill={amberBg} stroke={amberText} strokeWidth="1.5" strokeDasharray="3 2" />
                <text x="40" y="27" textAnchor="middle" fontSize="11" fontWeight="bold" fill={amberText}>{tr("📍 נקודה")}</text>
              </g>
              <g transform="translate(275,3)">{arrow(amberText)}</g>
              <g transform="translate(330,3)">{stationBox('🗺 עמדה רגילה', amberText, bg)}</g>
            </svg>
          </div>
        </div>

        <div style={{ marginTop: '14px', padding: '10px', background: lightMode ? '#f1f5f9' : '#1e293b', borderRadius: '6px', fontSize: '12px', color: subtext, lineHeight: 1.5 }}>
          💡 <b>{tr("טיפ:")}</b> ניתן להגדיר את שני הסוגים יחד באותה עמדה. בעמדה הם יוצגו זה לצד זה עם כותרות מפרידות.
        </div>
      </div>
    </div>
  );
};

// Reorderable list item helper using HTML5 drag-and-drop
const useReorderable = <T,>(items: T[], onChange: (items: T[]) => void) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx === null || dragIdx === idx) return;
    const arr = [...items];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(idx, 0, moved);
    setDragIdx(idx);
    onChange(arr);
  };
  const onDragEnd = () => setDragIdx(null);
  return { dragIdx, onDragStart, onDragOver, onDragEnd };
};

// Editor for classic preset's directional partner stations + transfer/receive points
// + a live SVG flow diagram showing data direction.
export const ClassicPartnersAndPointsEditor = ({ presetForm, setPresetForm, presets, sectors, editingPresetId, onShowHelp }: {
  presetForm: any;
  setPresetForm: (updater: (p: any) => any) => void;
  presets: any[];
  sectors: any[];
  editingPresetId?: number;
  onShowHelp: () => void;
}) => {
  const myName = presetForm.name || 'עמדה זו';
  const incomingIds: number[] = presetForm.classic_incoming_partner_preset_ids || [];
  const outgoingIds: number[] = presetForm.classic_outgoing_partner_preset_ids || [];
  const recvPts: any[] = presetForm.classic_receive_points || [];
  const xferPts: any[] = presetForm.classic_transfer_points || [];

  const otherClassic = presets.filter((wp: any) => wp.id !== editingPresetId && wp.preset_type !== 'ground' && wp.preset_type !== 'ground_mgmt');
  const presetById = (id: number) => presets.find((p: any) => Number(p.id) === Number(id));
  const sectorById = (id: number) => sectors.find((s: any) => Number(s.id) === Number(id));

  const setIncoming = (next: number[]) => setPresetForm(p => ({ ...p, classic_incoming_partner_preset_ids: next }));
  const setOutgoing = (next: number[]) => setPresetForm(p => ({ ...p, classic_outgoing_partner_preset_ids: next }));
  const setRecv = (next: any[]) => setPresetForm(p => ({ ...p, classic_receive_points: next }));
  const setXfer = (next: any[]) => setPresetForm(p => ({ ...p, classic_transfer_points: next }));

  const incomingReorder = useReorderable<number>(incomingIds, setIncoming);
  const outgoingReorder = useReorderable<number>(outgoingIds, setOutgoing);
  const recvReorder = useReorderable<any>(recvPts, setRecv);
  const xferReorder = useReorderable<any>(xferPts, setXfer);

  const PartnerList = ({ ids, reorderApi, onRemove, onAdd, accent, label, emoji }: any) => {
    const candidates = otherClassic.filter((wp: any) => !ids.includes(Number(wp.id)));
    return (
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <label style={{ color: accent, fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{emoji} {label}:</label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minHeight: '6px', marginBottom: '5px' }}>
          {ids.length === 0 && <div style={{ color: '#475569', fontSize: '11px', padding: '4px 8px' }}>{tr("(אין)")}</div>}
          {ids.map((pid: number, idx: number) => {
            const pp = presetById(pid);
            const isDragging = reorderApi.dragIdx === idx;
            return (
              <div key={pid} draggable onDragStart={reorderApi.onDragStart(idx)} onDragOver={reorderApi.onDragOver(idx)} onDragEnd={reorderApi.onDragEnd}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: isDragging ? '#1e3a5f' : '#1e293b', border: `1px solid ${accent}55`, borderRadius: '4px', cursor: 'grab', opacity: isDragging ? 0.5 : 1 }}>
                <span style={{ color: '#64748b', fontSize: '12px', cursor: 'grab' }} title={tr("גרור לסידור")}>≡</span>
                <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold', flex: 1 }}>📋 {pp?.name || `[${pid}]`}</span>
                <button type="button" onClick={() => onRemove(pid)} title={tr("הסר")}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>✕</button>
              </div>
            );
          })}
        </div>
        {candidates.length > 0 && (
          <select value="" onChange={e => { if (e.target.value) onAdd(Number(e.target.value)); e.currentTarget.value = ''; }}
            style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#cbd5e1', fontSize: '12px', direction: 'rtl', width: '100%' }}>
            <option value="">{tr("+ הוסף עמדה...")}</option>
            {candidates.map((wp: any) => <option key={wp.id} value={wp.id}>📋 {wp.name}</option>)}
          </select>
        )}
        {candidates.length === 0 && otherClassic.length === 0 && (
          <div style={{ color: '#475569', fontSize: '11px', fontStyle: 'italic' }}>{tr("אין עמדות סטריפים אחרות")}</div>
        )}
      </div>
    );
  };

  const PointList = ({ pts, reorderApi, accent, emoji, label, partnerDirIds, partnerDirLabel, onUpdate, showAltConditions, conditionsLabel }: any) => {
    const usedSecIds = new Set(pts.map((p: any) => Number(p.sector_id)));
    const available = sectors.filter((s: any) => !usedSecIds.has(Number(s.id)));
    return (
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', color: accent, fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>{emoji} {label}:</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '5px' }}>
          {pts.length === 0 && <div style={{ color: '#475569', fontSize: '11px', padding: '4px 8px' }}>{tr("(אין)")}</div>}
          {pts.map((pt: any, idx: number) => {
            const sec = sectorById(pt.sector_id);
            const linkedPartnerIds: number[] = Array.isArray(pt.partner_preset_ids) ? pt.partner_preset_ids : [];
            const isDragging = reorderApi.dragIdx === idx;
            const partnerCandidates = (partnerDirIds || []).filter((pid: number) => !linkedPartnerIds.includes(Number(pid)));
            const updateThis = (patch: any) => {
              const next = pts.map((x: any, i: number) => i === idx ? { ...x, ...patch } : x);
              onUpdate(next);
            };
            return (
              <div key={pt.sector_id} draggable onDragStart={reorderApi.onDragStart(idx)} onDragOver={reorderApi.onDragOver(idx)} onDragEnd={reorderApi.onDragEnd}
                style={{ padding: '5px 8px', background: isDragging ? '#1e3a5f' : '#1e293b', border: `1px solid ${accent}55`, borderRadius: '4px', cursor: 'grab', opacity: isDragging ? 0.5 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#64748b', fontSize: '12px', cursor: 'grab' }} title={tr("גרור לסידור")}>≡</span>
                  <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold', flex: 1 }}>📍 {pt.label || sec?.label_he || sec?.name || `סקטור ${pt.sector_id}`}</span>
                  <button type="button" onClick={() => onUpdate(pts.filter((_: any, i: number) => i !== idx))} title={tr("הסר")}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', padding: '0 4px' }}>✕</button>
                </div>
                {/* Linked partner stations chips */}
                <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', paddingInlineStart: '20px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px' }}>{partnerDirLabel}:</span>
                  {linkedPartnerIds.length === 0 && <span style={{ color: '#475569', fontSize: '10px', fontStyle: 'italic' }}>{tr("(ללא)")}</span>}
                  {linkedPartnerIds.map((pid: number) => {
                    const pp = presetById(pid);
                    return (
                      <span key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', background: '#0f172a', border: '1px solid #334155', borderRadius: '10px', fontSize: '10px', color: '#cbd5e1' }}>
                        📋 {pp?.name || `[${pid}]`}
                        <button type="button" onClick={() => updateThis({ partner_preset_ids: linkedPartnerIds.filter(x => x !== pid) })}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    );
                  })}
                  {partnerCandidates.length > 0 && (
                    <select value="" onChange={e => { if (e.target.value) updateThis({ partner_preset_ids: [...linkedPartnerIds, Number(e.target.value)] }); e.currentTarget.value = ''; }}
                      style={{ padding: '1px 4px', background: '#0f172a', border: '1px solid #334155', borderRadius: '3px', color: '#cbd5e1', fontSize: '10px' }}>
                      <option value="">{tr("+ עמדה")}</option>
                      {partnerCandidates.map((pid: number) => {
                        const pp = presetById(pid);
                        return <option key={pid} value={pid}>{pp?.name || `[${pid}]`}</option>;
                      })}
                    </select>
                  )}
                </div>
                {/* Alt conditions — receive points only */}
                {showAltConditions && (
                  <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', paddingInlineStart: '20px' }}>
                    <span style={{ color: '#f59e0b', fontSize: '10px', fontWeight: 'bold' }}>{conditionsLabel || '📐 תנאי קבלה:'}</span>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>{tr("גובה מינ':")}</span>
                      <input type="number" placeholder="—" value={pt.alt_min ?? ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateThis({ alt_min: e.target.value !== '' ? Number(e.target.value) : null })}
                        style={{ width: '55px', padding: '2px 4px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '3px', color: '#fbbf24', fontSize: '10px', textAlign: 'center' }} />
                      <span style={{ color: '#64748b', fontSize: '10px' }}>{tr("מקס':")}</span>
                      <input type="number" placeholder="—" value={pt.alt_max ?? ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateThis({ alt_max: e.target.value !== '' ? Number(e.target.value) : null })}
                        style={{ width: '55px', padding: '2px 4px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '3px', color: '#fbbf24', fontSize: '10px', textAlign: 'center' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>{tr("זוגיות:")}</span>
                      <select value={pt.parity || 'any'}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateThis({ parity: e.target.value })}
                        style={{ padding: '2px 4px', background: '#0f172a', border: '1px solid #92400e', borderRadius: '3px', color: '#fbbf24', fontSize: '10px' }}>
                        <option value="any">{tr("כולם")}</option>
                        <option value="even">{tr("זוגי")}</option>
                        <option value="odd">{tr("אי-זוגי")}</option>
                      </select>
                    </div>
                    {(pt.alt_min != null || pt.alt_max != null || (pt.parity && pt.parity !== 'any')) && (
                      <button type="button" onClick={() => updateThis({ alt_min: null, alt_max: null, parity: 'any' })}
                        title={tr("נקה תנאים")} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', padding: '0 2px' }}>{tr("✕ נקה")}</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {available.length > 0 && (
          <select value="" onChange={e => {
            if (!e.target.value) return;
            const sec = sectorById(Number(e.target.value));
            if (sec) onUpdate([...pts, { sector_id: sec.id, label: sec.label_he || sec.name, partner_preset_ids: [] }]);
            e.currentTarget.value = '';
          }}
            style={{ padding: '4px 8px', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', color: '#cbd5e1', fontSize: '12px', direction: 'rtl', width: '100%' }}>
            <option value="">{tr("+ הוסף נקודה...")}</option>
            {available.map((s: any) => <option key={s.id} value={s.id}>📍 {s.label_he || s.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  // ── Live flow diagram (SVG) ──────────────────────────────────────────────────
  const FlowDiagram = () => {
    // Right side (RTL) = sources I receive from = incoming partners + receive points
    // Left side = destinations I transfer to = outgoing partners + transfer points
    const rightItems: { kind: 'partner' | 'point'; name: string; sub?: string }[] = [
      ...incomingIds.map(pid => ({ kind: 'partner' as const, name: presetById(pid)?.name || `[${pid}]` })),
      ...recvPts.map((pt: any) => {
        const sec = sectorById(pt.sector_id);
        const partnersOnPt = (pt.partner_preset_ids || []).map((pid: number) => presetById(pid)?.name || `[${pid}]`).join(', ');
        return { kind: 'point' as const, name: pt.label || sec?.label_he || sec?.name || `סקטור ${pt.sector_id}`, sub: partnersOnPt };
      }),
    ];
    const leftItems: { kind: 'partner' | 'point'; name: string; sub?: string }[] = [
      ...outgoingIds.map(pid => ({ kind: 'partner' as const, name: presetById(pid)?.name || `[${pid}]` })),
      ...xferPts.map((pt: any) => {
        const sec = sectorById(pt.sector_id);
        const partnersOnPt = (pt.partner_preset_ids || []).map((pid: number) => presetById(pid)?.name || `[${pid}]`).join(', ');
        return { kind: 'point' as const, name: pt.label || sec?.label_he || sec?.name || `סקטור ${pt.sector_id}`, sub: partnersOnPt };
      }),
    ];

    const rowH = 32;
    const itemW = 170;
    const centerW = 130;
    const padding = 30;
    const gapX = 80;
    const maxRows = Math.max(rightItems.length, leftItems.length, 1);
    const height = padding * 2 + maxRows * rowH + 10;
    const width = padding * 2 + itemW * 2 + centerW + gapX * 2;
    const centerX = width / 2;
    const centerY = height / 2;
    // RTL: right column at high X, left column at low X
    const rightColX = width - padding - itemW;
    const leftColX = padding;
    const startY = padding;

    if (rightItems.length === 0 && leftItems.length === 0) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
          הגדר שותפים או נקודות מעל כדי לראות תרשים זרימה
        </div>
      );
    }

    const renderItem = (item: typeof rightItems[number], x: number, y: number, key: string) => {
      const isPartner = item.kind === 'partner';
      const fill = isPartner ? '#14532d' : '#451a03';
      const stroke = isPartner ? '#22c55e' : '#f59e0b';
      const tx = isPartner ? '#86efac' : '#fcd34d';
      const sub = item.sub ? ` (${item.sub})` : '';
      return (
        <g key={key}>
          <rect x={x} y={y} width={itemW} height={rowH - 6} rx={6} fill={fill} stroke={stroke} strokeWidth={1.5} />
          <text x={x + itemW / 2} y={y + (rowH - 6) / 2 + 4} textAnchor="middle" fill={tx} fontSize="11" fontWeight="bold" direction="rtl">
            {(isPartner ? '📋 ' : '📍 ') + item.name}{sub}
          </text>
        </g>
      );
    };

    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ background: '#020617', borderRadius: '6px', maxHeight: '320px' }}>
        {/* arrowhead defs */}
        <defs>
          <marker id="ah-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
          </marker>
          <marker id="ah-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>
        {/* center: my station */}
        <rect x={centerX - centerW / 2} y={centerY - 22} width={centerW} height={44} rx={8} fill="#1e3a5f" stroke="#3b82f6" strokeWidth={2} />
        <text x={centerX} y={centerY - 4} textAnchor="middle" fill="#bfdbfe" fontSize="12" fontWeight="bold" direction="rtl">📋 {myName}</text>
        <text x={centerX} y={centerY + 12} textAnchor="middle" fill="#94a3b8" fontSize="10" direction="rtl">{tr("(העמדה הזו)")}</text>
        {/* right items (incoming) */}
        {rightItems.map((it, i) => {
          const y = startY + i * rowH;
          const arrowStartX = rightColX;
          const arrowEndX = centerX + centerW / 2 + 4;
          return (
            <g key={`r-${i}`}>
              {renderItem(it, rightColX, y, `r-${i}`)}
              <line x1={arrowStartX} y1={y + (rowH - 6) / 2} x2={arrowEndX} y2={centerY} stroke="#22c55e" strokeWidth={1.5} markerEnd="url(#ah-in)" />
            </g>
          );
        })}
        {/* left items (outgoing) */}
        {leftItems.map((it, i) => {
          const y = startY + i * rowH;
          const arrowStartX = centerX - centerW / 2 - 4;
          const arrowEndX = leftColX + itemW;
          return (
            <g key={`l-${i}`}>
              {renderItem(it, leftColX, y, `l-${i}`)}
              <line x1={arrowStartX} y1={centerY} x2={arrowEndX} y2={y + (rowH - 6) / 2} stroke="#f59e0b" strokeWidth={1.5} markerEnd="url(#ah-out)" />
            </g>
          );
        })}
        {/* labels for sides */}
        <text x={width - padding} y={15} textAnchor="end" fill="#86efac" fontSize="10" fontWeight="bold" direction="rtl">{tr("📥 ממי מקבל")}</text>
        <text x={padding} y={15} textAnchor="start" fill="#fcd34d" fontSize="10" fontWeight="bold" direction="rtl">{tr("📤 למי מעביר")}</text>
      </svg>
    );
  };

  return (
    <>
      {/* Section: directional partner stations */}
      <div style={{ padding: '10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ color: '#86efac', fontSize: '13px', fontWeight: 'bold' }}>{tr("📋 עמדות שותפות (העברה ישירה):")}</label>
          <button type="button" onClick={onShowHelp} title={tr("עזרה: איך עובדות העברות בעמדת סטריפים?")}
            style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid #334155', background: '#1e3a5f', color: '#93c5fd', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
        </div>
        <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', direction: 'rtl' }}>{tr("סמן בנפרד מי שותפת קבלה (אני מקבל ממנה) ומי שותפת העברה (אני מעביר אליה). השינוי משתקף אוטומטית גם בהגדרות העמדה השנייה. גרור ≡ לשינוי סדר. רלוונטי לתצוגת סטריפים קלאסית.")}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <PartnerList ids={incomingIds} reorderApi={incomingReorder}
            onRemove={(pid: number) => setIncoming(incomingIds.filter(x => x !== pid))}
            onAdd={(pid: number) => setIncoming([...incomingIds, pid])}
            accent="#86efac" emoji="📥" label="ממי מקבל (קלט)" />
          <PartnerList ids={outgoingIds} reorderApi={outgoingReorder}
            onRemove={(pid: number) => setOutgoing(outgoingIds.filter(x => x !== pid))}
            onAdd={(pid: number) => setOutgoing([...outgoingIds, pid])}
            accent="#fcd34d" emoji="📤" label="למי מעביר (פלט)" />
        </div>
      </div>

      {/* Section: receive/transfer sector points with alt conditions */}
      <div style={{ padding: '10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#93c5fd', fontSize: '13px', fontWeight: 'bold' }}>{tr("📍 נקודות קבלה/העברה (עמדות שאינן סטריפים):")}</label>
        <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#64748b', direction: 'rtl' }}>{tr("בנקודות קבלה/העברה ניתן להגדיר")} <span style={{ color: '#f59e0b' }}>{tr("📐 תנאי גובה וזוגיות")}</span> {tr("— הגובה המינ'/מקס' וזוגיות (זוגי/אי-זוגי/הכל) שרלוונטיים לנקודה זו. ניתן גם לשייך")} <span style={{ color: '#fcd34d' }}>{tr("עמדות יעד")}</span> {tr("לכל נקודת העברה.")}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <PointList pts={recvPts} reorderApi={recvReorder}
            accent="#86efac" emoji="📥" label="נקודות קבלה"
            partnerDirIds={incomingIds} partnerDirLabel="עמדות מקור"
            showAltConditions={true}
            onUpdate={setRecv} />
          <PointList pts={xferPts} reorderApi={xferReorder}
            accent="#fcd34d" emoji="📤" label="נקודות העברה"
            partnerDirIds={outgoingIds} partnerDirLabel="עמדות יעד"
            showAltConditions={true}
            conditionsLabel="📐 תנאי העברה:"
            onUpdate={setXfer} />
        </div>
      </div>

      {/* Section: live flow diagram */}
      <div style={{ padding: '10px', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e3a5f' }}>
        <label style={{ display: 'block', marginBottom: '6px', color: '#93c5fd', fontSize: '13px', fontWeight: 'bold' }}>{tr("🔀 תרשים זרימה (בזמ\"א):")}</label>
        <FlowDiagram />
      </div>
    </>
  );
};

const FreehandCanvas = ({ lightMode }: { lightMode: boolean }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [eraseMode, setEraseMode] = React.useState(false);
  const isDown = React.useRef(false);
  const lastP = React.useRef<{ x: number; y: number } | null>(null);
  const strokeColor = lightMode ? '#1d4ed8' : '#93c5fd';
  const ERASER_R = 14;

  // Toggle canvas pointer-events based on what the cursor is over:
  // pass-through when over strips/buttons/headers, active when over empty space
  React.useEffect(() => {
    const onGlobalMove = (e: PointerEvent) => {
      const c = canvasRef.current;
      if (!c || isDown.current) return;
      c.style.pointerEvents = 'none';
      const below = document.elementFromPoint(e.clientX, e.clientY);
      c.style.pointerEvents = 'auto';
      if (!below) return;
      let el: Element | null = below;
      let passThrough = false;
      while (el) {
        const tag = (el as HTMLElement).tagName?.toLowerCase();
        if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'a') { passThrough = true; break; }
        if ((el as HTMLElement).dataset?.classicStrip || (el as HTMLElement).dataset?.panelHeader) { passThrough = true; break; }
        el = el.parentElement;
      }
      c.style.pointerEvents = passThrough ? 'none' : 'auto';
    };
    window.addEventListener('pointermove', onGlobalMove, { passive: true });
    return () => window.removeEventListener('pointermove', onGlobalMove);
  }, []);

  React.useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const obs = new ResizeObserver(() => {
      const temp = document.createElement('canvas');
      temp.width = c.width; temp.height = c.height;
      temp.getContext('2d')?.drawImage(c, 0, 0);
      c.width = c.offsetWidth; c.height = c.offsetHeight;
      c.getContext('2d')?.drawImage(temp, 0, 0);
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, []);

  const getPos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // מונע מרכיב-ההורה לקלוט את המגע/עט (כמו בדסק החופשי שעובד)
    // לא משתמשים ב-setPointerCapture — בחלק ממכשירי המגע הוא חוסם את אירועי ה-move של עט/מגע
    // (הדסק החופשי שעובד גם לא משתמש בו). ה-canvas ממלא את חלון הסטריפים, אז הקו נשאר בתוכו.
    isDown.current = true;
    const p = getPos(e);
    lastP.current = p;
    if (eraseMode) {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.clearRect(p.x - ERASER_R, p.y - ERASER_R, ERASER_R * 2, ERASER_R * 2);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!isDown.current) return;
    e.preventDefault();
    e.stopPropagation();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = getPos(e);
    if (eraseMode) {
      ctx.clearRect(p.x - ERASER_R, p.y - ERASER_R, ERASER_R * 2, ERASER_R * 2);
    } else {
      if (!lastP.current) { lastP.current = p; return; }
      ctx.beginPath(); ctx.moveTo(lastP.current.x, lastP.current.y); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    lastP.current = p;
  };
  const onUp = () => { isDown.current = false; lastP.current = null; };
  const clearAll = () => { const c = canvasRef.current; if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height); };

  const btn: React.CSSProperties = { padding: '2px 7px', borderRadius: 4, cursor: 'pointer', fontSize: 11, border: 'none', fontFamily: 'inherit', direction: 'rtl' };
  return (
    <>
      <div style={{ position: 'absolute', top: 5, insetInlineStart: 5, display: 'flex', gap: 3, zIndex: 20, pointerEvents: 'auto' }}>
        <button onClick={() => setEraseMode(m => !m)} title={eraseMode ? 'מצב מחק פעיל — לחץ לציור' : 'מחק נקודתי'}
          style={{ ...btn, background: eraseMode ? (lightMode ? '#fef9c3' : '#422006') : (lightMode ? '#e0e7ff' : '#1e1b4b'), color: eraseMode ? (lightMode ? '#92400e' : '#fde68a') : (lightMode ? '#4338ca' : '#a5b4fc'), outline: eraseMode ? `2px solid ${lightMode ? '#ca8a04' : '#f59e0b'}` : 'none' }}>
          {eraseMode ? '✏️' : '🧹'}
        </button>
        <button onClick={clearAll} title={tr("נקה הכל")} style={{ ...btn, background: lightMode ? '#fee2e2' : '#1c0606', color: lightMode ? '#dc2626' : '#f87171' }}>
          ✕ הכל
        </button>
      </div>
      <canvas ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', pointerEvents: 'auto', touchAction: 'none', zIndex: 10, cursor: eraseMode ? 'cell' : 'crosshair' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      />
    </>
  );
};

// ─── Civilian Strip Mode ───────────────────────────────────────────────────────
export type CivCol = { key: string; label: string; sub_cols?: string[]; color?: string };
export type CivAssignment = { id: number; strip_id: number; preset_id: number; col_key: string; sub_col: string; sort_order: number };

export const CIV_STATUSES = [
  { key: 'CLR', color: '#ffffff', bg: '#1565c0', label: 'CLEARANCE' },
  { key: 'TXI', color: '#ffffff', bg: '#0d47a1', label: 'TAXI' },
  { key: 'CTL', color: '#ffffff', bg: '#455a64', label: 'CONTROL' },
  { key: 'LUW', color: '#ffffff', bg: '#607d8b', label: 'LUAW' },
  { key: 'GPB', color: '#000000', bg: '#c8a800', label: 'PUSHBACK' },
  { key: 'HOO', color: '#ffffff', bg: '#00695c', label: 'HANDOVER' },
  { key: 'ENT', color: '#ffffff', bg: '#2e7d32', label: 'ENTRY' },
  { key: 'SEQ', color: '#ffffff', bg: '#4527a0', label: 'SEQUENCE' },
  { key: '',   color: '#334155', bg: '#e2e8f0', label: '' },
];

export const CivilianStripCard = ({ strip, onUpdateField, onDragStart, onDelete, colColor }: {
  strip: any;
  onUpdateField: (id: string, field: string, val: string) => void;
  onDragStart: (e: React.DragEvent, stripId: string) => void;
  onDelete?: (id: string) => void;
  colColor?: string;
}) => {
  const [editingField, setEditingField] = React.useState<string | null>(null);
  const statusInfo = CIV_STATUSES.find(s => s.key === (strip.civ_status || '')) || CIV_STATUSES[CIV_STATUSES.length - 1];
  const leftBg = colColor || '#1565c0';

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = CIV_STATUSES.findIndex(s => s.key === (strip.civ_status || ''));
    const next = CIV_STATUSES[(idx + 1) % CIV_STATUSES.length];
    onUpdateField(String(strip.id), 'civ_status', next.key);
  };

  const InlineEdit = ({ field, value, placeholder, darkBg, style, wide }: { field: string; value: string; placeholder?: string; darkBg?: boolean; style?: React.CSSProperties; wide?: boolean }) => {
    const textCol = darkBg ? 'rgba(255,255,255,0.9)' : '#0a1828';
    return editingField === field
      ? <input
          autoFocus
          defaultValue={value}
          placeholder={placeholder}
          onBlur={e => { onUpdateField(String(strip.id), field, e.target.value); setEditingField(null); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
          onClick={e => e.stopPropagation()}
          style={{ background: darkBg ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)', border: 'none', borderBottom: `1px solid ${darkBg ? 'rgba(255,255,255,0.5)' : '#1565c0'}`, color: textCol, fontFamily: 'monospace', outline: 'none', padding: '0 2px', width: wide ? '100%' : '50px', ...style }}
        />
      : <span onClick={e => { e.stopPropagation(); setEditingField(field); }} title={tr("לחץ לעריכה")} style={{ cursor: 'text', color: textCol, ...style }}>{value || <span style={{ opacity: 0.25 }}>{placeholder || '·'}</span>}</span>;
  };

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, String(strip.id))}
      style={{
        background: '#c8d8e4',
        border: '1px solid #8faabb',
        borderRadius: '1px',
        marginBottom: '2px',
        cursor: 'grab',
        userSelect: 'none',
        fontFamily: 'monospace',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', minHeight: '68px' }}>

        {/* LEFT — callsign + airline — column-colored block */}
        <div style={{ width: '90px', minWidth: '90px', background: leftBg, padding: '5px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
          <div style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '0.5px', lineHeight: 1.15, overflow: 'hidden' }}>
            <InlineEdit field="callSign" value={strip.callSign || ''} placeholder="CALLSIGN" darkBg style={{ fontSize: '14px', fontWeight: 900, width: '80px' }} />
          </div>
          <div style={{ fontSize: '9px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            <InlineEdit field="unit" value={strip.unit || ''} placeholder="Airline" darkBg style={{ fontSize: '9px', width: '80px', opacity: 0.85 }} />
          </div>
        </div>

        {/* MIDDLE — flight info on light background */}
        <div style={{ flex: 1, padding: '4px 5px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', minWidth: 0, background: '#c8d8e4' }}>

          {/* Row 1: FL Stand Gate Time + SSR */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '4px', fontSize: '10px', flexWrap: 'nowrap', overflow: 'hidden' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '1px', color: '#0a1828' }}>
                FL<InlineEdit field="civ_fl" value={strip.civ_fl || ''} placeholder="320" style={{ fontSize: '10px', width: '28px' }} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '1px', color: '#0a1828' }}>
                S<InlineEdit field="civ_stand" value={strip.civ_stand || ''} placeholder="432" style={{ fontSize: '10px', width: '24px' }} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '1px', color: '#0a1828' }}>
                A<InlineEdit field="civ_dest" value={strip.civ_dest || ''} placeholder="23" style={{ fontSize: '10px', width: '18px' }} />
              </span>
              <InlineEdit field="civ_time" value={strip.civ_time || ''} placeholder="12:35" style={{ fontSize: '10px', width: '38px', color: '#0a1828' }} />
            </div>
            <InlineEdit field="civ_ssr" value={strip.civ_ssr || ''} placeholder="SSR" style={{ fontSize: '9px', width: '44px', textAlign: 'right', color: '#4a6070' }} />
          </div>

          {/* Row 2: Route */}
          <div style={{ fontSize: '9px', color: '#2a4060', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1, display: 'flex', alignItems: 'center' }}>
            <InlineEdit field="civ_route" value={strip.civ_route || ''} placeholder="ROUTE..." style={{ fontSize: '9px', width: '100%', color: '#2a4060' }} wide />
          </div>

          {/* Row 3: runway + status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <InlineEdit field="civ_runway" value={strip.civ_runway || ''} placeholder="26L" style={{ fontSize: '18px', fontWeight: 900, color: '#0a1828', width: '40px', letterSpacing: '-0.5px' }} />
            <button
              onClick={cycleStatus}
              style={{ background: statusInfo.bg, color: statusInfo.color, border: 'none', borderRadius: '2px', padding: '2px 7px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', letterSpacing: '0.5px', fontFamily: 'monospace', flexShrink: 0, minWidth: '36px' }}
            >{statusInfo.key || '—'}</button>
          </div>
        </div>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); if (confirm(`מחק סטריפ ${strip.callSign}?`)) onDelete(String(strip.id)); }}
          style={{ position: 'absolute', top: '1px', right: '2px', background: 'transparent', border: 'none', color: '#7f1d1d', cursor: 'pointer', fontSize: '10px', padding: '0 2px', lineHeight: 1, opacity: 0.5 }}
          title={tr("מחק")}
        >✕</button>
      )}
    </div>
  );
};

export const CivilianView = ({ strips, presetId, civColumns, assignments, onAssign, onUpdateField, boardBg }: {
  strips: any[];
  presetId: string | number;
  civColumns: CivCol[];
  assignments: CivAssignment[];
  onAssign: (stripId: string, colKey: string, slotIdx?: number, subCol?: string) => void;
  onUpdateField: (id: string, field: string, val: string) => void;
  boardBg?: string;
}) => {
  const MAX_SLOTS = 3;
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = React.useState<string | null>(null);

  const getStripAtSlot = (colKey: string, slotIdx: number) => {
    const a = assignments.find(a => a.col_key === colKey && a.sort_order === slotIdx);
    if (!a) return null;
    return strips.find(s => Number(s.id) === Number(a.strip_id)) || null;
  };

  const getUnassigned = () => {
    return strips.filter(s => {
      const a = assignments.find(a => Number(a.strip_id) === Number(s.id));
      return !a || a.col_key === '' || a.col_key === '__queue__';
    });
  };

  const handleSlotDrop = (e: React.DragEvent, colKey: string, slotIdx: number) => {
    e.preventDefault();
    if (draggingId) onAssign(draggingId, colKey, slotIdx);
    setDraggingId(null);
    setDragOverKey(null);
  };

  const handleQueueDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggingId) onAssign(draggingId, '__queue__', 0);
    setDraggingId(null);
    setDragOverKey(null);
  };

  const allCols: CivCol[] = [...civColumns, { key: '__queue__', label: 'תור', color: '#475569' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', overflow: 'auto', background: boardBg || '#07090c', gap: '2px', padding: '4px', boxSizing: 'border-box' }}>
      {allCols.map(col => {
        const isQueue = col.key === '__queue__';
        const colCount = isQueue
          ? getUnassigned().length
          : assignments.filter(a => a.col_key === col.key).length;
        return (
          <div key={col.key} style={{ display: 'flex', flexDirection: 'column', flex: isQueue ? '0 0 210px' : '1', minWidth: isQueue ? '180px' : '200px', maxWidth: isQueue ? '240px' : '400px', borderRadius: '4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
            {/* Column header */}
            <div style={{ background: isQueue ? '#1e293b' : (col.color || '#1e3a5f'), padding: '5px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid rgba(0,0,0,0.5)', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
              {!isQueue && (
                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', marginRight: '4px' }}>
                  {Array.from({ length: MAX_SLOTS }, (_, i) => (
                    <span key={i} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '9px', fontFamily: 'monospace', minWidth: '10px', textAlign: 'center' }}>{i + 1}</span>
                  ))}
                </span>
              )}
              <span style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: '10px', fontFamily: 'monospace', borderRadius: '2px', padding: '0 5px', flexShrink: 0 }}>{colCount}</span>
            </div>

            {/* Column body */}
            {isQueue ? (
              /* Queue: scrollable list of unassigned strips */
              <div
                onDragOver={e => { e.preventDefault(); setDragOverKey('__queue__'); }}
                onDragLeave={() => setDragOverKey(null)}
                onDrop={handleQueueDrop}
                style={{ flex: 1, overflowY: 'auto', padding: '4px', background: dragOverKey === '__queue__' ? 'rgba(71,85,105,0.3)' : 'rgba(0,0,0,0.25)', transition: 'background 0.1s', minHeight: '60px' }}
              >
                {getUnassigned().map((s: any) => (
                  <CivilianStripCard key={s.id} strip={s} onUpdateField={onUpdateField} colColor={col.color}
                    onDragStart={(e, id) => { e.dataTransfer.setData('text/plain', id); setDraggingId(id); }} />
                ))}
                {getUnassigned().length === 0 && (
                  <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '10px', textAlign: 'center', marginTop: '20px', letterSpacing: '1px', fontFamily: 'monospace' }}>EMPTY</div>
                )}
              </div>
            ) : (
              /* Numbered slots — exactly MAX_SLOTS */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px', background: 'rgba(0,0,0,0.15)' }}>
                {Array.from({ length: MAX_SLOTS }, (_, slotIdx) => {
                  const strip = getStripAtSlot(col.key, slotIdx);
                  const dropKey = `${col.key}:${slotIdx}`;
                  const isOver = dragOverKey === dropKey;
                  return (
                    <div
                      key={slotIdx}
                      onDragOver={e => { e.preventDefault(); setDragOverKey(dropKey); }}
                      onDragLeave={() => setDragOverKey(null)}
                      onDrop={e => handleSlotDrop(e, col.key, slotIdx)}
                      style={{
                        flex: '1 1 0',
                        minHeight: '80px',
                        borderRadius: '3px',
                        border: isOver ? `2px solid ${col.color || '#60a5fa'}` : '1px solid rgba(255,255,255,0.07)',
                        background: isOver ? `${col.color || '#1e3a5f'}22` : (strip ? 'transparent' : 'rgba(0,0,0,0.3)'),
                        transition: 'all 0.1s',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Slot number */}
                      <div style={{ position: 'absolute', top: '2px', left: '4px', color: 'rgba(255,255,255,0.15)', fontSize: '9px', fontFamily: 'monospace', pointerEvents: 'none', zIndex: 1 }}>{slotIdx + 1}</div>
                      {strip
                        ? <CivilianStripCard strip={strip} onUpdateField={onUpdateField} colColor={col.color}
                            onDragStart={(e, id) => { e.dataTransfer.setData('text/plain', id); setDraggingId(id); }} />
                        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: isOver ? (col.color || '#60a5fa') : 'rgba(255,255,255,0.07)', fontSize: isOver ? '20px' : '14px', fontFamily: 'monospace', transition: 'all 0.1s' }}>{isOver ? '⬇' : '—'}</div>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

export const ClassicView = ({ strips, incomingTransfers, outgoingTransfers, classicStripTable, receivePoints, transferPoints, partnerPresets, allSectors, lightMode, presetId, crewMemberId, initialPanelOrder, onTransfer, onTransferToPreset, onAcceptTransfer, onUpdateStripField, onCancelTransfer, onMoveTransfer, onSplitPartial, onMergePartial, getSiblings, aviationBases, tableMode }: {
  strips: any[]; incomingTransfers: any[]; outgoingTransfers: any[];
  classicStripTable: any; receivePoints: any[]; transferPoints: any[];
  /* layoutJson/conditionsJson are extracted from classicStripTable inside ClassicView */
  partnerPresets?: any[];
  allSectors: any[]; lightMode: boolean;
  aviationBases?: any[];
  presetId?: number | string;
  crewMemberId?: number | null;
  initialPanelOrder?: { rightPartners: number[]; rightPoints: number[]; leftPartners: number[]; leftPoints: number[] } | null;
  onTransfer: (stripId: string, toSectorId: number) => void;
  onTransferToPreset?: (stripId: string, toPresetId: number) => void;
  onAcceptTransfer: (transferId: string) => void;
  onUpdateStripField: (stripId: string, field: string, value: string) => void;
  onCancelTransfer?: (transferId: string) => void;
  onMoveTransfer?: (transferId: string, target: { to_sector_id?: number; to_preset_id?: number }) => void;
  onSplitPartial?: (sourceStripId: string, indices: number[]) => void;
  onMergePartial?: (targetStripId: string, sourceStripId: string) => void;
  getSiblings?: (strip: any) => any[];
  tableMode?: boolean;
}) => {
  const isPresetMode = !!partnerPresets;
  const rows = (classicStripTable?.rows || [{}, {}, {}]).sort((a: any, b: any) => a.row_number - b.row_number);
  const sgLayoutJson: SGNode | null = classicStripTable?.layout_json || null;
  const sgConditionsJson: SGCondition[] = classicStripTable?.conditions_json || [];
  const [draggingStripId, setDraggingStripId] = useState<string | null>(null);
  const [draggingTransferId, setDraggingTransferId] = useState<string | null>(null);
  // For dragging an already-transferred outgoing strip between transfer points / partner stations.
  const [draggingTransferMoveId, setDraggingTransferMoveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<'mine' | number | string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; transferId: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Section reorder (drag the section header ≡): persisted per-crew-member to the server,
  // with localStorage as fallback. Stored as { rightPartners, rightPoints, leftPartners, leftPoints }.
  const orderKey = `sky_classic_panel_order_${presetId ?? 'global'}`;
  const loadOrder = (key: string, serverOrder?: { rightPartners: number[]; rightPoints: number[]; leftPartners: number[]; leftPoints: number[] } | null) => {
    if (serverOrder) return serverOrder;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { rightPartners: [], rightPoints: [], leftPartners: [], leftPoints: [], ...JSON.parse(raw) };
    } catch {}
    return { rightPartners: [], rightPoints: [], leftPartners: [], leftPoints: [] };
  };
  const [savedOrder, setSavedOrder] = useState<{ rightPartners: number[]; rightPoints: number[]; leftPartners: number[]; leftPoints: number[] }>(() => loadOrder(orderKey, initialPanelOrder));
  const isFirstOrderMount = React.useRef(true);
  const isFirstCrewSwap = React.useRef(true);

  // When presetId changes, reload order (server pref for this preset, then localStorage).
  React.useEffect(() => { setSavedOrder(loadOrder(orderKey, initialPanelOrder)); }, [orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // When crewMemberId changes (hot-swap), reload order from the new crew member's saved preference.
  React.useEffect(() => {
    if (isFirstCrewSwap.current) { isFirstCrewSwap.current = false; return; }
    setSavedOrder(loadOrder(orderKey, initialPanelOrder));
  }, [crewMemberId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist order to server and localStorage whenever it changes (skip initial mount).
  React.useEffect(() => {
    if (isFirstOrderMount.current) { isFirstOrderMount.current = false; return; }
    try { localStorage.setItem(orderKey, JSON.stringify(savedOrder)); } catch {}
    if (crewMemberId) {
      const presetKey = String(presetId ?? 'global');
      fetch(`${API_URL}/crew-members/${crewMemberId}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classic_panel_orders: { [presetKey]: savedOrder } }),
      }).catch(() => {});
    }
  }, [savedOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistOrder = (next: typeof savedOrder) => { setSavedOrder(next); };
  const applyOrder = <I,>(items: I[], getKey: (item: I) => number, keys: number[]): I[] => {
    if (!keys.length) return items;
    const map = new Map<number, I>();
    items.forEach(it => map.set(getKey(it), it));
    const ordered: I[] = [];
    keys.forEach(k => { if (map.has(k)) { ordered.push(map.get(k)!); map.delete(k); } });
    map.forEach(v => ordered.push(v));
    return ordered;
  };
  // section drag-token: { panel: 'right'|'left', kind: 'partner'|'point', id: number }
  const [draggingSection, setDraggingSection] = useState<{ panel: 'right' | 'left'; kind: 'partner' | 'point'; id: number } | null>(null);
  const [classicRightW, setClassicRightW] = useState(280);
  const [classicLeftW, setClassicLeftW] = useState(280);
  const classicResizeRef = React.useRef<{ which: 'right' | 'left'; startX: number; startW: number } | null>(null);
  const [classicSectorContactsOpenId, setClassicSectorContactsOpenId] = useState<number | null>(null);
  const [classicAllContactsCache, setClassicAllContactsCache] = useState<any[] | null>(null);
  const getClassicContactsForSector = (sectorId: number) => {
    if (!classicAllContactsCache) return [];
    const myPresetName = classicAllContactsCache.find((c: any) => Number(c.preset_id) === Number(presetId))?.preset_name || '';
    const byPreset = new Map<number, { presetName: string; contacts: any[] }>();
    for (const c of classicAllContactsCache) {
      if (Number(c.preset_id) === Number(presetId)) continue;
      if (myPresetName && (c.preset_name || '') === myPresetName) continue;
      let sectors: number[] = [];
      try { sectors = Array.isArray(c.relevant_sectors) ? c.relevant_sectors : (typeof c.relevant_sectors === 'string' ? JSON.parse(c.relevant_sectors) : []); } catch {}
      if (!sectors.map(Number).includes(sectorId)) continue;
      if (!byPreset.has(c.preset_id)) byPreset.set(c.preset_id, { presetName: c.preset_name || `עמדה ${c.preset_id}`, contacts: [] });
      byPreset.get(c.preset_id)!.contacts.push(c);
    }
    return Array.from(byPreset.entries()).map(([pid, v]) => ({ presetId: pid, ...v }));
  };
  const openClassicSectorContacts = async (sectorId: number) => {
    if (classicSectorContactsOpenId === sectorId) { setClassicSectorContactsOpenId(null); return; }
    if (!classicAllContactsCache) {
      const data = await fetch(`${API_URL}/workstation-contacts/all`).then(r => r.ok ? r.json() : []).catch(() => []);
      setClassicAllContactsCache(data);
    }
    setClassicSectorContactsOpenId(sectorId);
  };
  const renderClassicSectorContactsPanel = (sectorId: number, headerBg?: string) => {
    if (classicSectorContactsOpenId !== sectorId || !classicAllContactsCache) return null;
    const groups = getClassicContactsForSector(sectorId);
    const bg = headerBg ?? (lightMode ? '#dbeafe' : '#1e3a5f');
    return (
      <div style={{ background: bg, padding: '4px 8px 6px', fontSize: '11px', direction: 'rtl' }}>
        {groups.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>{tr("אין קשרים מוגדרים לסקטור זה")}</div>
        ) : groups.map(g => (
          <div key={g.presetId} style={{ marginBottom: '4px' }}>
            <div style={{ fontWeight: 'bold', color: 'rgba(255,255,255,0.6)', fontSize: '9px', marginBottom: '2px', paddingBottom: '1px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>📍 {g.presetName}</div>
            {g.contacts.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', gap: '5px', padding: '2px 4px', borderRadius: '3px', background: 'rgba(0,0,0,0.25)', marginBottom: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                {c.device_type && <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '9px', minWidth: '24px', flexShrink: 0 }}>{c.device_type}</span>}
                {c.mahut && <span style={{ color: 'rgba(255,255,255,0.75)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{c.mahut}</span>}
                {c.oketz && <span style={{ color: '#93c5fd', fontWeight: 'bold', fontSize: '10px', flexShrink: 0 }}>{c.oketz}</span>}
                {c.frequency && <span style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: '10px', flexShrink: 0 }}>{c.frequency}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };
  const startClassicResize = (which: 'right' | 'left') => (e: React.MouseEvent) => {
    e.preventDefault();
    const startW = which === 'right' ? classicRightW : classicLeftW;
    classicResizeRef.current = { which, startX: e.clientX, startW };
    const onMove = (me: MouseEvent) => {
      if (!classicResizeRef.current) return;
      const dx = me.clientX - classicResizeRef.current.startX;
      const newW = Math.max(80, Math.min(600, classicResizeRef.current.startW + (which === 'right' ? -dx : dx)));
      if (which === 'right') setClassicRightW(newW);
      else setClassicLeftW(newW);
    };
    const onUp = () => { classicResizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  // Per-session toggle: force center panel to day mode regardless of global lightMode
  const [centerDayMode, setCenterDayMode] = useState(false);
  const reorderSection = (panel: 'right' | 'left', kind: 'partner' | 'point', srcId: number, dstId: number, currentList: number[]) => {
    if (srcId === dstId) return;
    const arr = [...currentList];
    const si = arr.indexOf(srcId);
    if (si === -1) arr.unshift(srcId);
    else arr.splice(si, 1);
    const di = arr.indexOf(dstId);
    arr.splice(di === -1 ? arr.length : di, 0, srcId);
    const fieldKey = `${panel}${kind === 'partner' ? 'Partners' : 'Points'}` as keyof typeof savedOrder;
    persistOrder({ ...savedOrder, [fieldKey]: arr });
  };

  // centerLight = true when global lightMode is on OR center-panel day-mode is toggled on
  const centerLight = lightMode || centerDayMode;

  const border = lightMode ? '#cbd5e1' : '#1e3a5f';
  const headerBg = lightMode ? '#e2e8f0' : '#1e293b';
  const headerColor = lightMode ? '#374151' : '#94a3b8';
  const sectorHeaderBg = lightMode ? '#dbeafe' : '#1e3a5f';
  const sectorHeaderColor = lightMode ? '#1e40af' : '#93c5fd';
  const panelBg = lightMode ? '#f8fafc' : '#0b1220';
  // Colors for center panel when centerDayMode is independently on
  const cBorder = centerLight ? '#cbd5e1' : '#1e3a5f';
  const cHeaderBg = centerLight ? '#e2e8f0' : '#1e293b';
  const cHeaderColor = centerLight ? '#374151' : '#94a3b8';
  const cPanelBg = centerLight ? '#f8fafc' : '#0b1220';

  const PANEL_STYLE: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderInlineStart: `1px solid ${border}`, background: panelBg, position: 'relative' };
  const PANEL_HDR: React.CSSProperties = { background: headerBg, color: headerColor, padding: '6px 10px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', flexShrink: 0, borderBottom: `1px solid ${border}` };
  const SEC_HDR: React.CSSProperties = { background: sectorHeaderBg, color: sectorHeaderColor, padding: '4px 8px', fontSize: '12px', fontWeight: 'bold', borderBottom: `1px solid ${border}` };

  const transferToSynth = (t: any) => ({
    callSign: t.callsign, sq: t.sq, alt: t.alt, task: t.task, squadron: t.squadron,
    takeoff_time: t.takeoff_time, notes: t.notes, erka: t.erka, mivtza: t.mivtza,
    koteret: t.koteret, tzevet_shilta: t.tzevet_shilta, ta_shilta: t.ta_shilta, numberOfFormation: t.number_of_formation,
    aircraft_indices: t.aircraft_indices,
  });

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%', direction: 'rtl', position: 'relative' }}
      onClick={() => setCtxMenu(null)}
    >
      {/* Context menu for cancel transfer */}
      {ctxMenu && (
        <div
          style={{ position: 'fixed', ...clampMenuPos(ctxMenu.x, ctxMenu.y, 140, 60), background: lightMode ? '#fff' : '#1e293b', border: `1px solid ${lightMode ? '#cbd5e1' : '#334155'}`, borderRadius: '6px', padding: '4px', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: '120px' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px 10px', textAlign: 'right', fontSize: '13px', borderRadius: '4px' }}
            onMouseEnter={e => (e.currentTarget.style.background = lightMode ? '#fee2e2' : '#450a0a')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            onClick={() => { if (onCancelTransfer) onCancelTransfer(ctxMenu.transferId); setCtxMenu(null); }}
          >{tr("🚫 בטל העברה")}</button>
        </div>
      )}

      {/* Floating help button (top-right) */}
      <button
        onClick={() => setShowHelp(true)}
        title={tr("עזרה: איך עובדות העברות בעמדת סטריפים?")}
        style={{ position: 'absolute', top: '6px', insetInlineEnd: '6px', zIndex: 100, width: '28px', height: '28px', borderRadius: '50%', border: `1px solid ${border}`, background: lightMode ? '#dbeafe' : '#1e3a5f', color: lightMode ? '#1e40af' : '#93c5fd', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
      >?</button>
      {showHelp && <ClassicTransferHelpModal lightMode={lightMode} onClose={() => setShowHelp(false)} />}

      {/* RIGHT panel — Transfer (למי מעביר) */}
      <div style={{ ...PANEL_STYLE, borderInlineStart: 'none', flex: 'none', width: `${classicRightW}px` }}>
        <div data-panel-header="true" style={PANEL_HDR}>📤 למי מעביר ({outgoingTransfers.length})</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
          {(() => {
            const partners = isPresetMode ? (partnerPresets || []) : [];
            const sectorPts = transferPoints || [];
            const showPartners = partners.length > 0;
            const showSectorPts = sectorPts.length > 0;
            const nothing = !showPartners && !showSectorPts;
            if (nothing) {
              return <div style={{ color: headerColor, fontSize: '12px', textAlign: 'center', padding: '20px', opacity: 0.5 }}>{tr("לא הוגדרו יעדי העברה")}</div>;
            }
            return (
              <>
                {showPartners && (
                  <>
                    {showSectorPts && <div style={{ ...SEC_HDR, background: lightMode ? '#dcfce7' : '#14532d', color: lightMode ? '#166534' : '#86efac', fontSize: '10px', marginBottom: '4px' }}>{tr("📋 עמדות סטריפים")}</div>}
                    {applyOrder(partners, (p: any) => Number(p.id), savedOrder.rightPartners).map((pp: any) => {
                      const ptOut = outgoingTransfers.filter(t => Number(t.to_preset_id) === Number(pp.id));
                      const isDrop = dropTarget === `preset-${pp.id}`;
                      const isSectionDrag = draggingSection?.panel === 'right' && draggingSection?.kind === 'partner';
                      return (
                        <div key={`p-${pp.id}`} style={{ marginBottom: '10px', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}
                          onDragOver={e => {
                            if (isSectionDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return; }
                            e.preventDefault(); setDropTarget(`preset-${pp.id}`);
                          }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
                          onDrop={e => {
                            if (isSectionDrag && draggingSection) {
                              e.preventDefault();
                              const cur = applyOrder(partners, (p: any) => Number(p.id), savedOrder.rightPartners).map((p: any) => Number(p.id));
                              reorderSection('right', 'partner', draggingSection.id, Number(pp.id), cur);
                              setDraggingSection(null); return;
                            }
                            e.preventDefault(); setDropTarget(null);
                            if (draggingTransferMoveId) {
                              if (onMoveTransfer) onMoveTransfer(draggingTransferMoveId, { to_preset_id: Number(pp.id) });
                              setDraggingTransferMoveId(null);
                              return;
                            }
                            if (draggingStripId) {
                              const alreadyTransferred = outgoingTransfers.some(t => String(t.strip_id) === String(draggingStripId).replace('s',''));
                              if (!alreadyTransferred && onTransferToPreset) {
                                onTransferToPreset(draggingStripId, Number(pp.id));
                              }
                              setDraggingStripId(null);
                            }
                          }}
                        >
                          <div style={{ ...SEC_HDR, background: isDrop ? (lightMode ? '#dcfce7' : '#166534') : sectorHeaderBg, color: isDrop ? (lightMode ? '#166534' : '#86efac') : sectorHeaderColor }}>
                            <span draggable onDragStart={e => { e.stopPropagation(); setDraggingSection({ panel: 'right', kind: 'partner', id: Number(pp.id) }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/sky-section', 'right-partner'); }} onDragEnd={() => setDraggingSection(null)}
                              style={{ cursor: 'grab', marginInlineEnd: '4px', opacity: 0.55, userSelect: 'none' }} title={tr("גרור לסידור")}>≡</span>
                            📋 {pp.name} ({ptOut.length})
                            {isDrop && <span style={{ fontSize: '10px', marginInlineStart: '6px' }}>{tr("↓ שחרר להעביר")}</span>}
                          </div>
                          <div style={{ padding: '3px', minHeight: '36px', background: isDrop ? (lightMode ? '#f0fdf4' : '#0a2010') : 'transparent', transition: 'background 0.15s' }}>
                            {ptOut.length === 0
                              ? <div style={{ color: headerColor, fontSize: '11px', textAlign: 'center', padding: '4px', opacity: 0.4 }}>{isDrop ? '↓ שחרר להעביר' : 'גרור פמ"מ לכאן'}</div>
                              : ptOut.map((t: any) => (
                                <div key={t.id} data-classic-strip="true" style={{ position: 'relative', marginBottom: '3px' }}
                                  draggable
                                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingTransferMoveId(String(t.id)); }}
                                  onDragEnd={() => { setDraggingTransferMoveId(null); setDropTarget(null); }}
                                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, transferId: String(t.id) }); }}>
                                  <ClassicStripCard strip={transferToSynth(t)} rows={rows} lightMode={lightMode} singleClickEdit aviationBases={aviationBases} allSectors={allSectors} layoutJson={sgLayoutJson} conditionsJson={sgConditionsJson}
                                    onUpdateField={(field, val) => onUpdateStripField(String(t.strip_id), field, val)} />
                                  <button onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}
                                    onClick={e => { e.stopPropagation(); if (onCancelTransfer) onCancelTransfer(String(t.id)); }}
                                    style={{ position: 'absolute', top: '2px', insetInlineEnd: '2px', padding: '1px 5px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer', lineHeight: 1.4, zIndex: 11, whiteSpace: 'nowrap' }}>{tr("בטל העברה")}</button>
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {showSectorPts && (
                  <>
                    {showPartners && <div style={{ ...SEC_HDR, background: lightMode ? '#fef3c7' : '#451a03', color: lightMode ? '#92400e' : '#fcd34d', fontSize: '10px', marginTop: '8px', marginBottom: '4px' }}>{tr("📍 נקודות העברה")}</div>}
                    {applyOrder(sectorPts, (s: any) => Number(s.sector_id), savedOrder.rightPoints).map((pt: any) => {
                      const ptOut = outgoingTransfers.filter(t => Number(t.to_sector_id) === Number(pt.sector_id) && !t.to_preset_id);
                      const isDrop = dropTarget === pt.sector_id;
                      const isSectionDrag = draggingSection?.panel === 'right' && draggingSection?.kind === 'point';
                      return (
                        <div key={`s-${pt.sector_id}`} style={{ marginBottom: '10px', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}
                          onDragOver={e => {
                            if (isSectionDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return; }
                            e.preventDefault(); setDropTarget(pt.sector_id);
                          }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node) && dropTarget === pt.sector_id) setDropTarget(null); }}
                          onDrop={e => {
                            if (isSectionDrag && draggingSection) {
                              e.preventDefault();
                              const cur = applyOrder(sectorPts, (s: any) => Number(s.sector_id), savedOrder.rightPoints).map((s: any) => Number(s.sector_id));
                              reorderSection('right', 'point', draggingSection.id, Number(pt.sector_id), cur);
                              setDraggingSection(null); return;
                            }
                            e.preventDefault(); setDropTarget(null);
                            if (draggingTransferMoveId) {
                              if (onMoveTransfer) onMoveTransfer(draggingTransferMoveId, { to_sector_id: Number(pt.sector_id) });
                              setDraggingTransferMoveId(null);
                              return;
                            }
                            if (draggingStripId) {
                              const alreadyTransferred = outgoingTransfers.some(t => String(t.strip_id) === String(draggingStripId).replace('s','') || String('s' + t.strip_id) === String(draggingStripId));
                              if (!alreadyTransferred) {
                                onTransfer(draggingStripId, pt.sector_id);
                              }
                              setDraggingStripId(null);
                            }
                          }}
                        >
                          {(() => {
                            const clsHdrBg = isDrop ? (lightMode ? '#dcfce7' : '#166534') : sectorHeaderBg;
                            return (<>
                              <div style={{ ...SEC_HDR, background: clsHdrBg, color: isDrop ? (lightMode ? '#166534' : '#86efac') : sectorHeaderColor, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span draggable={!tableMode} onDragStart={e => { if (tableMode) return; e.stopPropagation(); setDraggingSection({ panel: 'right', kind: 'point', id: Number(pt.sector_id) }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/sky-section', 'right-point'); }} onDragEnd={() => setDraggingSection(null)}
                                  style={{ cursor: tableMode ? 'default' : 'grab', marginInlineEnd: '4px', opacity: tableMode ? 0.2 : 0.55, userSelect: 'none' }} title={tableMode ? '' : 'גרור לסידור'}>≡</span>
                                <span style={{ flex: 1 }}>📍 {pt.label || allSectors.find((s: any) => s.id === pt.sector_id)?.label_he || `סקטור ${pt.sector_id}`} ({ptOut.length}){isDrop && <span style={{ fontSize: '10px', marginInlineStart: '6px' }}>{tr("↓ שחרר להעביר")}</span>}</span>
                                {!isDrop && (
                                  <button
                                    onClick={e => { e.stopPropagation(); openClassicSectorContacts(Number(pt.sector_id)); }}
                                    title={tr("הצג קשרי עמדות לנקודה זו")}
                                    style={{ padding: '1px 5px', fontSize: '10px', background: classicSectorContactsOpenId === Number(pt.sector_id) ? '#0369a1' : 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                                    📡 קשר
                                  </button>
                                )}
                              </div>
                              {renderClassicSectorContactsPanel(Number(pt.sector_id), clsHdrBg)}
                            </>);
                          })()}
                          <div style={{ padding: '3px', minHeight: '36px', background: isDrop ? (lightMode ? '#f0fdf4' : '#0a2010') : 'transparent', transition: 'background 0.15s' }}>
                            {ptOut.length === 0
                              ? <div style={{ color: headerColor, fontSize: '11px', textAlign: 'center', padding: '4px', opacity: 0.4 }}>{isDrop ? '↓ שחרר להעביר' : 'גרור פמ"מ לכאן'}</div>
                              : ptOut.map((t: any) => (
                                <div key={t.id} data-classic-strip="true" style={{ position: 'relative', marginBottom: '3px' }}
                                  draggable
                                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingTransferMoveId(String(t.id)); }}
                                  onDragEnd={() => { setDraggingTransferMoveId(null); setDropTarget(null); }}
                                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, transferId: String(t.id) }); }}>
                                  <ClassicStripCard strip={transferToSynth(t)} rows={rows} lightMode={lightMode} singleClickEdit aviationBases={aviationBases} allSectors={allSectors} layoutJson={sgLayoutJson} conditionsJson={sgConditionsJson}
                                    onUpdateField={(field, val) => onUpdateStripField(String(t.strip_id), field, val)} />
                                  <button onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} draggable={false}
                                    onClick={e => { e.stopPropagation(); if (onCancelTransfer) onCancelTransfer(String(t.id)); }}
                                    style={{ position: 'absolute', top: '2px', insetInlineEnd: '2px', padding: '1px 5px', background: '#7f1d1d', color: '#fecaca', border: 'none', borderRadius: '3px', fontSize: '9px', cursor: 'pointer', lineHeight: 1.4, zIndex: 11, whiteSpace: 'nowrap' }}>{tr("בטל העברה")}</button>
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            );
          })()}
        </div>
        <FreehandCanvas lightMode={lightMode} />
      </div>

      {/* Arrow: שלי → למי מעביר — doubles as resize handle */}
      <div onMouseDown={startClassicResize('right')} title={tr("גרור לשינוי רוחב")} style={{ width: 34, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, userSelect: 'none', direction: 'ltr', background: panelBg, borderInlineStart: `1px solid ${border}`, borderInlineEnd: `1px solid ${border}`, cursor: 'col-resize' }}>
        <span style={{ fontSize: '8px', color: '#22c55e', fontWeight: 700, textAlign: 'center', direction: 'rtl', lineHeight: 1.3 }}>{tr("ממני")}</span>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M2 11H18M12 5l6 6-6 6" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: '8px', color: '#22c55e', fontWeight: 700, textAlign: 'center', direction: 'rtl', lineHeight: 1.3 }}>למי{'\u000A'}מעביר</span>
      </div>

      {/* CENTER panel — My Strips (שלי) — same as before */}
      <div id="classic-mine-panel" style={{ ...PANEL_STYLE, borderInlineStart: `1px solid ${cBorder}`, background: dropTarget === 'mine' ? (centerLight ? '#eff6ff' : '#0f1f3a') : cPanelBg, transition: 'background 0.15s' }}
        onDragOver={e => { e.preventDefault(); setDropTarget('mine'); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
        onDrop={e => {
          e.preventDefault(); setDropTarget(null);
          if (draggingTransferId) { onAcceptTransfer(draggingTransferId); setDraggingTransferId(null); return; }
          // Accept strips dragged in from the sidebar
          const extId = e.dataTransfer.getData('text/strip-id');
          if (extId && presetId) {
            onUpdateStripField(String(extId), 'workstation_preset_id', String(presetId));
          }
        }}
      >
        <div data-panel-header="true" style={{ ...PANEL_HDR, background: dropTarget === 'mine' ? (centerLight ? '#bfdbfe' : '#1e3a5f') : cHeaderBg, color: cHeaderColor, borderBottom: `1px solid ${cBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span>🎯 שלי ({strips.length}) {dropTarget === 'mine' ? (draggingTransferId ? '← שחרר לקבל' : '← שחרר להוסיף') : ''}</span>
          {/* Toggle day/night mode for center column only — hidden when global lightMode is on */}
          {!lightMode && (
            <button
              onClick={e => { e.stopPropagation(); setCenterDayMode(v => !v); }}
              title={centerDayMode ? 'עבור למצב לילה בעמודה' : 'האר את העמודה (מצב יום)'}
              style={{ background: 'transparent', border: `1px solid ${cBorder}`, borderRadius: '4px', cursor: 'pointer', fontSize: '13px', padding: '1px 5px', color: centerDayMode ? '#f59e0b' : '#94a3b8', flexShrink: 0, lineHeight: 1 }}
            >
              {centerDayMode ? '☀️' : '🌙'}
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px', background: cPanelBg }}>
          {!classicStripTable && (
            <div style={{ background: '#78350f', color: '#fde68a', padding: '8px 12px', borderRadius: '6px', margin: '6px 4px', fontSize: '12px', textAlign: 'center' }}>
              ⚠️ לא הוגדרה תבנית סטריפ לעמדה זו — ערוך את הגדרות העמדה
            </div>
          )}
          {strips.length === 0
            ? <div style={{ color: cHeaderColor, fontSize: '12px', textAlign: 'center', padding: '20px', opacity: 0.5 }}>{tr("אין פמ\"מים")}</div>
            : strips.map((s: any) => {
              const cCount = parseInt(s.numberOfFormation ?? s.number_of_formation ?? '1') || 1;
              const cSiblings = getSiblings ? getSiblings(s) : [];
              const showSplit = onSplitPartial && cCount > 1;
              const showMerge = onMergePartial && cSiblings.length > 0;
              return (
                <div key={s.id} style={{ position: 'relative' }}>
                  {(showSplit || showMerge) && (
                    <div style={{ position: 'absolute', top: '2px', insetInlineStart: '2px', display: 'flex', gap: '2px', zIndex: 5 }}>
                      {showSplit && (
                        <button onClick={e => { e.stopPropagation(); onSplitPartial!(String(s.id), []); }}
                          style={{ background: '#4c1d95', border: '1px solid #7c3aed', color: '#c4b5fd', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', lineHeight: 1 }}>✂</button>
                      )}
                      {showMerge && (
                        <button onClick={e => { e.stopPropagation(); onMergePartial!(String(cSiblings[0].id), String(s.id)); }}
                          style={{ background: '#1e3a5f', border: '1px solid #1d4ed8', color: '#93c5fd', borderRadius: '4px', padding: '1px 5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', lineHeight: 1 }}>⊕</button>
                      )}
                    </div>
                  )}
                  <div data-classic-strip="true" draggable onDragStart={() => setDraggingStripId(String(s.id))} onDragEnd={() => { setDraggingStripId(null); setDropTarget(null); }}>
                    <ClassicStripCard strip={s} rows={rows} lightMode={centerLight} isDragging={draggingStripId === String(s.id)} aviationBases={aviationBases} allSectors={allSectors} layoutJson={sgLayoutJson} conditionsJson={sgConditionsJson}
                      onUpdateField={(field, val) => onUpdateStripField(String(s.id), field, val)} />
                  </div>
                </div>
              );
            })
          }
        </div>
        <FreehandCanvas lightMode={centerLight} />
      </div>

      {/* Arrow: ממי מקבל → אלי — doubles as resize handle */}
      <div onMouseDown={startClassicResize('left')} title={tr("גרור לשינוי רוחב")} style={{ width: 34, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, userSelect: 'none', direction: 'ltr', background: panelBg, borderInlineStart: `1px solid ${border}`, borderInlineEnd: `1px solid ${border}`, cursor: 'col-resize' }}>
        <span style={{ fontSize: '8px', color: '#22c55e', fontWeight: 700, textAlign: 'center', direction: 'rtl', lineHeight: 1.3 }}>ממי{'\u000A'}מקבל</span>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M2 11H18M12 5l6 6-6 6" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: '8px', color: '#22c55e', fontWeight: 700, textAlign: 'center', direction: 'rtl', lineHeight: 1.3 }}>{tr("אלי")}</span>
      </div>

      {/* LEFT panel — Receive (ממי מקבל) */}
      <div style={{ ...PANEL_STYLE, flex: 'none', width: `${classicLeftW}px` }}>
        <div data-panel-header="true" style={PANEL_HDR}>📥 ממי מקבל ({incomingTransfers.length})</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
          {(() => {
            const partners = isPresetMode ? (partnerPresets || []) : [];
            const sectorPts = receivePoints || [];
            const showPartners = partners.length > 0;
            const showSectorPts = sectorPts.length > 0;
            const nothing = !showPartners && !showSectorPts;
            if (nothing) {
              return <div style={{ color: headerColor, fontSize: '12px', textAlign: 'center', padding: '20px', opacity: 0.5 }}>{tr("לא הוגדרו מקורות קבלה")}</div>;
            }
            return (
              <>
                {showPartners && (
                  <>
                    {showSectorPts && <div style={{ ...SEC_HDR, background: lightMode ? '#dcfce7' : '#14532d', color: lightMode ? '#166534' : '#86efac', fontSize: '10px', marginBottom: '4px' }}>{tr("📋 עמדות סטריפים")}</div>}
                    {applyOrder(partners, (p: any) => Number(p.id), savedOrder.leftPartners).map((pp: any) => {
                      const ptIn = incomingTransfers.filter(t => Number(t.from_preset_id) === Number(pp.id));
                      const isSectionDrag = draggingSection?.panel === 'left' && draggingSection?.kind === 'partner';
                      return (
                        <div key={`p-${pp.id}`} style={{ marginBottom: '10px', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}
                          onDragOver={e => { if (isSectionDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                          onDrop={e => {
                            if (isSectionDrag && draggingSection) {
                              e.preventDefault();
                              const cur = applyOrder(partners, (p: any) => Number(p.id), savedOrder.leftPartners).map((p: any) => Number(p.id));
                              reorderSection('left', 'partner', draggingSection.id, Number(pp.id), cur);
                              setDraggingSection(null);
                            }
                          }}>
                          <div style={SEC_HDR}>
                            <span draggable onDragStart={e => { e.stopPropagation(); setDraggingSection({ panel: 'left', kind: 'partner', id: Number(pp.id) }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/sky-section', 'left-partner'); }} onDragEnd={() => setDraggingSection(null)}
                              style={{ cursor: 'grab', marginInlineEnd: '4px', opacity: 0.55, userSelect: 'none' }} title={tr("גרור לסידור")}>≡</span>
                            📋 {pp.name} ({ptIn.length})
                          </div>
                          <div style={{ padding: '3px' }}>
                            {ptIn.length === 0
                              ? <div style={{ color: headerColor, fontSize: '11px', textAlign: 'center', padding: '4px', opacity: 0.4 }}>{tr("אין פמ\"מים ממתינים")}</div>
                              : ptIn.map((t: any) => (
                                <div key={t.id} style={{ position: 'relative' }}>
                                  <ClassicStripCard strip={transferToSynth(t)} rows={rows} lightMode={lightMode} aviationBases={aviationBases} allSectors={allSectors} layoutJson={sgLayoutJson} conditionsJson={sgConditionsJson} />
                                  <button title={tr("קבל העברה")} onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                                    onClick={e => { e.stopPropagation(); onAcceptTransfer(String(t.id)); }}
                                    style={{ position: 'absolute', top: '2px', insetInlineEnd: '2px', padding: '2px 7px', borderRadius: '4px', background: '#166534', color: '#86efac', border: 'none', fontSize: '11px', lineHeight: 1.4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', fontWeight: 'bold' }}>{tr("קבל")}</button>
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {showSectorPts && (
                  <>
                    {showPartners && <div style={{ ...SEC_HDR, background: lightMode ? '#fef3c7' : '#451a03', color: lightMode ? '#92400e' : '#fcd34d', fontSize: '10px', marginTop: '8px', marginBottom: '4px' }}>{tr("📍 נקודות קבלה")}</div>}
                    {applyOrder(sectorPts, (s: any) => Number(s.sector_id), savedOrder.leftPoints).map((pt: any) => {
                      const ptT = incomingTransfers.filter(t => Number(t.to_sector_id) === Number(pt.sector_id) && !t.from_preset_id);
                      const isSectionDrag = draggingSection?.panel === 'left' && draggingSection?.kind === 'point';
                      return (
                        <div key={`s-${pt.sector_id}`} style={{ marginBottom: '10px', border: `1px solid ${border}`, borderRadius: '6px', overflow: 'hidden' }}
                          onDragOver={e => { if (isSectionDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                          onDrop={e => {
                            if (isSectionDrag && draggingSection) {
                              e.preventDefault();
                              const cur = applyOrder(sectorPts, (s: any) => Number(s.sector_id), savedOrder.leftPoints).map((s: any) => Number(s.sector_id));
                              reorderSection('left', 'point', draggingSection.id, Number(pt.sector_id), cur);
                              setDraggingSection(null);
                            }
                          }}>
                          <div style={SEC_HDR}>
                            <span draggable={!tableMode} onDragStart={e => { if (tableMode) return; e.stopPropagation(); setDraggingSection({ panel: 'left', kind: 'point', id: Number(pt.sector_id) }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/sky-section', 'left-point'); }} onDragEnd={() => setDraggingSection(null)}
                              style={{ cursor: tableMode ? 'default' : 'grab', marginInlineEnd: '4px', opacity: tableMode ? 0.2 : 0.55, userSelect: 'none' }} title={tableMode ? '' : 'גרור לסידור'}>≡</span>
                            📍 {pt.label || allSectors.find((s: any) => s.id === pt.sector_id)?.label_he || `סקטור ${pt.sector_id}`} ({ptT.length})
                          </div>
                          <div style={{ padding: '3px' }}>
                            {ptT.length === 0
                              ? <div style={{ color: headerColor, fontSize: '11px', textAlign: 'center', padding: '4px', opacity: 0.4 }}>{tr("אין פמ\"מים")}</div>
                              : ptT.map((t: any) => (
                                <div key={t.id} style={{ position: 'relative' }}>
                                  <ClassicStripCard strip={transferToSynth(t)} rows={rows} lightMode={lightMode} aviationBases={aviationBases} allSectors={allSectors} layoutJson={sgLayoutJson} conditionsJson={sgConditionsJson} />
                                  <button title={tr("קבל העברה")} onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                                    onClick={e => { e.stopPropagation(); onAcceptTransfer(String(t.id)); }}
                                    style={{ position: 'absolute', top: '2px', insetInlineEnd: '2px', padding: '2px 7px', borderRadius: '4px', background: '#166534', color: '#86efac', border: 'none', fontSize: '11px', lineHeight: 1.4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', fontWeight: 'bold' }}>{tr("קבל")}</button>
                                </div>
                              ))
                            }
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            );
          })()}
        </div>
        <FreehandCanvas lightMode={lightMode} />
      </div>

    </div>
  );
};

// --- תצוגה ורטיקאלית ---
