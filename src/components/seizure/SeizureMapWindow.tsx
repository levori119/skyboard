/**
 * **"פתח מפה"** - מפת העמדה **היוצרת** בחלון צף, לעמדה שאין לה מפה מעוגנת.
 *
 * למה זו מפת היוצר ולא שלי: לעמדה כזו אין עוגנים, ולכן אין דרך להקרין את
 * הפוליגון על משהו שלה. מה שכן אפשר להראות לה הוא בדיוק מה שהיוצר רואה -
 * הפוליגון על **התמונה שעליה הוא צויר**, באחוזים שלה (`polygon`). זו הסיבה
 * ששני הייצוגים נשמרים: נ"צ להקרנה, ואחוזי תמונה לחלון הזה.
 *
 * הגודל הוא **רבע** משטח המפה של העמדה, כנדרש באפיון - גדול מספיק כדי לראות
 * איפה זה, קטן מספיק כדי לא לחסום את מה שמתחתיו.
 *
 * חלון **צפייה ותפעול** - מסגרת תורכיז, בר-עגינה בקונטיינר החלונות.
 */

import React, { useEffect, useState } from 'react';
import i18n from '../../i18n';
import { tr } from '../../i18n/tr';
import { useDockableWindow } from '../../hooks/useDockableWindow';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { startPointerDrag } from '../../utils/pointerDrag';
import { seizureRangeLabel } from '../../utils/tempZoneSeizure';
import { seizurePalette } from './seizureTheme';
import type { TempZoneSeizure } from '../../types';

interface Props {
  apiUrl: string;
  seizure: TempZoneSeizure;
  /** רבע משטח המפה של העמדה. ברירת מחדל לעמדה שאין לה מפה כלל. */
  width?: number;
  height?: number;
  themeMode: FrameTheme;
  onClose: () => void;
}

const DEFAULT_W = 340;
const DEFAULT_H = 240;

export default function SeizureMapWindow({ apiUrl, seizure, width, height, themeMode, onClose }: Props) {
  const P = seizurePalette(themeMode);
  const [pos, setPos] = useState({ x: 120, y: 140 });
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const dock = useDockableWindow(`seizureMap-${seizure.id}`, tr('seizure.mapWinTitle'), {
    setFloatingPos: (x, y) => setPos({ x, y }),
    floatingPos: () => pos,
  });

  useEffect(() => {
    let alive = true;
    if (seizure.creator_map_id == null) { setFailed(true); return; }
    fetch(`${apiUrl}/maps/${seizure.creator_map_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(m => { if (!alive) return; if (m?.image_data) setImg(String(m.image_data)); else setFailed(true); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [apiUrl, seizure.creator_map_id]);

  const onDragDown = (e: React.PointerEvent) => {
    const origin = { ...pos };
    startPointerDrag(e, { onMove: (dx, dy) => setPos({ x: origin.x + dx, y: origin.y + dy }) });
  };

  const w = Math.max(220, Math.round(width || DEFAULT_W));
  const h = Math.max(160, Math.round(height || DEFAULT_H));
  const pts = Array.isArray(seizure.polygon) ? seizure.polygon : [];
  const range = seizureRangeLabel(seizure);

  return dock.render(
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 9600, width: w,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: P.panel, ...windowFrame('view', themeMode, 8), boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      direction: i18n.dir(), ...dock.rootStyle,
    }}>
      <div
        onPointerDown={e => { dock.onHeaderPointerDown(e); onDragDown(e); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          background: P.panelAlt, borderBottom: `1px solid ${P.line}`,
          cursor: 'move', touchAction: 'none', userSelect: 'none',
        }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: seizure.color, flexShrink: 0 }} />
        <span style={{ color: P.text, fontWeight: 'bold', fontSize: 12, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {seizure.name} · {range || tr('seizure.allAlts')}
        </span>
        <button type="button" onClick={onClose}
          style={{ background: 'none', border: 'none', color: P.muted, cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>

      <div style={{ position: 'relative', width: '100%', height: h, background: P.panelAlt }}>
        {img && (
          <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
        )}
        {!img && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.muted, fontSize: 12 }}>
            {failed ? tr('offline.noData') : tr('shared.loading')}
          </div>
        )}
        {pts.length >= 3 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill={`${seizure.color}33`} stroke={seizure.color} strokeWidth={0.8} strokeDasharray="2,1.2" />
          </svg>
        )}
      </div>

      <div style={{ padding: '4px 8px', color: P.muted, fontSize: 10, borderTop: `1px solid ${P.line}` }}>
        {seizure.creator_preset_name}{seizure.phone ? ` · ${seizure.phone}` : ''}{seizure.radio ? ` · ${seizure.radio}` : ''}
      </div>
    </div>,
  );
}
