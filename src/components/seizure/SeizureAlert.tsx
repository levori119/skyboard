/**
 * **ההתראה המתפרצת** של הלאמת אזור זמני - שלושה מצבים, חלון אחד.
 *
 * | מצב | למי | נסגר ב- |
 * |-----|-----|---------|
 * | `incoming` | עמדה שההלאמה הופצה אליה | **אישור בלבד** |
 * | `ended`    | אותה עמדה, כשההלאמה יצאה מתוקף | אישור |
 * | `overdue`  | לעמדה **היוצרת**, כשחלף זמן הסיום | סיים / הארך |
 *
 * ── למה אין ✕ ואין Esc במצב `incoming` ──────────────────────────────────────
 * זו התראה בטיחותית: מרחב נתפס מעל הסקטור של הפקח, ויש פ"מים שצריך לטפל בהם.
 * התראה שנסגרת בטעות - בלחיצת Esc שנועדה לחלון אחר, או בקליק מפוזר - היא
 * התראה שלא הייתה. היחיד שסוגר אותה הוא **אישור מפורש**, שגם נרשם אצל היוצר.
 *
 * ── עמדה בלי מפה מעוגנת ──────────────────────────────────────────────────────
 * אין לה אזורים להצליב ואין לה איפה לצייר את הפוליגון, ולכן היא מקבלת את אותו
 * מידע בדיוק ועוד כפתור **"פתח מפה"** - מפת העמדה היוצרת בחלון צף.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { tr } from '../../i18n/tr';
import { windowFrame, type FrameTheme } from '../../utils/windowFrame';
import { SEIZURE_COVERAGE_COLOR, seizureRangeLabel, type SeizureCoverage } from '../../utils/tempZoneSeizure';
import { seizurePalette, seizureInputStyle } from './seizureTheme';
import type { TempZoneSeizure } from '../../types';

export type SeizureAlertVariant = 'incoming' | 'ended' | 'overdue';

interface Props {
  variant: SeizureAlertVariant;
  seizure: TempZoneSeizure;
  /** האזורים של **העמדה הזו** שההלאמה מגבילה. ריק = אין (או אין מפה מעוגנת). */
  zones: { name: string; coverage: SeizureCoverage }[];
  /** הפ"מים שצריך לטפל בהם - אזור מוגבל וגובה בתוך ההלאמה. */
  pins: { key: string; callsign: string; zoneName?: string; altFl: number | null }[];
  hasAnchoredMap: boolean;
  themeMode: FrameTheme;
  /** כמה התראות נוספות ממתינות אחרי זו. */
  queued?: number;
  onAck?: (note: string) => void;
  onDismiss?: () => void;
  onOpenMap?: () => void;
  onEnd?: () => void;
  onExtend?: (minutes: number) => void;
}

/** אפשרויות ההארכה - דקות. שלוש לחיצות, בלי הקלדת שעה באמצע אירוע. */
const EXTEND_CHOICES = [15, 30, 60];

const fmtTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

export function SeizureAlertCard({
  variant, seizure, zones, pins, hasAnchoredMap, themeMode, queued = 0,
  onAck, onDismiss, onOpenMap, onEnd, onExtend,
}: Props) {
  const P = seizurePalette(themeMode);
  const [note, setNote] = useState('');
  const ended = variant === 'ended';
  const overdue = variant === 'overdue';
  const headColor = ended ? '#16a34a' : overdue ? '#ca8a04' : '#b91c1c';
  const range = seizureRangeLabel(seizure);

  const row = (k: string, v: React.ReactNode) => !v ? null : (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'baseline' }}>
      <span style={{ color: P.muted, minWidth: 92 }}>{k}</span>
      <span style={{ color: P.text, fontWeight: 'bold' }}>{v}</span>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10600,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 560, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: P.panel, ...windowFrame(overdue ? 'edit' : 'view', themeMode, 12),
        boxShadow: '0 18px 60px rgba(0,0,0,0.65)',
      }}>
        {/* כותרת - הצבע הוא הודעת המצב, ולכן צבע סטטוס ולא צבע תמה */}
        <div style={{
          background: headColor, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          borderStartStartRadius: 10, borderStartEndRadius: 10,
        }}>
          <span style={{ fontSize: 20 }}>{ended ? '✅' : overdue ? '⏱' : '⛔'}</span>
          <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16, flex: 1 }}>
            {ended ? tr('seizure.endedTitle') : overdue ? tr('seizure.overdueTitle') : tr('seizure.title')}
          </span>
          {queued > 0 && (
            <span style={{ background: 'rgba(0,0,0,0.35)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
              +{queued}
            </span>
          )}
        </div>

        <div style={{ padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: seizure.color, flexShrink: 0 }} />
            <span style={{ color: P.text, fontSize: 18, fontWeight: 'bold' }}>{seizure.name}</span>
          </div>

          {row(tr('seizure.alertCreator'), seizure.creator_preset_name)}
          {row(tr('seizure.alertAlts'), range || tr('seizure.allAlts'))}
          {row(tr('seizure.fPurpose'), seizure.purpose)}
          {row(tr('seizure.fPhone'), seizure.phone)}
          {row(tr('seizure.fRadio'), seizure.radio)}
          {row(tr('seizure.fEta'), fmtTime(seizure.eta_end))}
          {row(tr('shared.note'), seizure.note)}

          {ended && (
            <div style={{ color: P.ok, fontSize: 13, marginTop: 6 }}>{tr('seizure.endedBody')}</div>
          )}
          {overdue && (
            <div style={{ color: P.accent, fontSize: 13, marginTop: 6 }}>{tr('seizure.overdueBody')}</div>
          )}

          {!ended && !overdue && hasAnchoredMap && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: P.muted, fontSize: 11, marginBottom: 3 }}>{tr('seizure.alertZones')}</div>
              {zones.length === 0 ? (
                <div style={{ color: P.muted, fontSize: 12 }}>{tr('seizure.alertNoZones')}</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {zones.map(z => (
                    <span key={z.name} style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 10,
                      border: `1px solid ${SEIZURE_COVERAGE_COLOR[z.coverage === 'full' ? 'full' : 'partial']}`,
                      color: SEIZURE_COVERAGE_COLOR[z.coverage === 'full' ? 'full' : 'partial'],
                    }}>
                      {z.name} - {z.coverage === 'full' ? tr('seizure.covFull') : tr('seizure.covPartial')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!ended && !overdue && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: P.muted, fontSize: 11, marginBottom: 3 }}>{tr('seizure.alertPins')}</div>
              {pins.length === 0 ? (
                <div style={{ color: P.muted, fontSize: 12 }}>{tr('seizure.alertNoPins')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflowY: 'auto' }}>
                  {pins.map(p => (
                    <div key={p.key} style={{ display: 'flex', gap: 10, fontSize: 12, color: P.text, background: P.panelAlt, borderRadius: 4, padding: '3px 8px' }}>
                      <span style={{ fontWeight: 'bold', minWidth: 70 }}>✈ {p.callsign}</span>
                      <span style={{ color: P.muted, flex: 1 }}>{p.zoneName || ''}</span>
                      <span style={{ color: P.accent }}>{p.altFl != null ? p.altFl : '?'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!ended && !overdue && !hasAnchoredMap && (
            <button type="button" onClick={onOpenMap}
              style={{
                marginTop: 10, alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 6,
                border: '1px solid #38bdf8', background: themeMode === 'light' ? '#e0f2fe' : '#0c4a6e',
                color: themeMode === 'light' ? '#075985' : '#7dd3fc', cursor: 'pointer', fontSize: 13,
              }}>
              🗺 {tr('seizure.openMap')}
            </button>
          )}

          {!ended && !overdue && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', color: P.muted, fontSize: 11, marginBottom: 3 }}>{tr('seizure.ackNote')}</label>
              <input value={note} onChange={e => setNote(e.target.value)} style={seizureInputStyle(P)} />
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: `1px solid ${P.line}`, background: P.panelAlt, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {overdue && (
            <>
              {EXTEND_CHOICES.map(m => (
                <button key={m} type="button" onClick={() => onExtend?.(m)}
                  style={{ padding: '7px 12px', borderRadius: 6, border: `1px solid ${P.line}`, background: P.panel, color: P.text, cursor: 'pointer', fontSize: 12 }}>
                  {tr('seizure.extendBy')}{m} {tr('shared.minutes')}
                </button>
              ))}
              <button type="button" onClick={onEnd}
                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #dc2626', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                {tr('seizure.endBtn')}
              </button>
            </>
          )}
          {ended && (
            <button type="button" onClick={onDismiss}
              style={{ padding: '8px 26px', borderRadius: 6, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
              {tr('shared.acknowledge')}
            </button>
          )}
          {!ended && !overdue && (
            <button type="button" onClick={() => onAck?.(note)}
              style={{ padding: '8px 26px', borderRadius: 6, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}>
              ✔ {tr('seizure.ackBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ── למה portal ל-body ───────────────────────────────────────────────────────
 * התראה בטיחותית חייבת לשבת מעל **הכל**: תפריטי הכותרת, סרגלי המפה וכל חלון
 * צף. `z-index` לבדו אינו מספיק כשאחד ההורים יוצר הקשר ערימה משלו - ולכן
 * ההתראה יוצאת מהעץ, בדיוק כמו יתר הדיאלוגים במסך (`zoneAlertPopups`).
 *
 * הכרטיס עצמו (`SeizureAlertCard`) נשאר רכיב רגיל: `createPortal` אינו נתמך
 * ברינדור לשרת, ובלי ההפרדה אי אפשר היה לבדוק את ההתראה כלל.
 */
export default function SeizureAlert(props: Props) {
  return createPortal(<SeizureAlertCard {...props} />, document.body);
}
