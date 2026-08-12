// טופס תחקיר — נפתח מתפריט העמדה ("צור תחקיר"), מתחת ל"עדכון חברי העמדה".
//
// התחקיר מצלם את המצב בעמדה ברגע האירוע: חברי הצוות (אותם שדות בדיוק כמו
// בטופס "עדכון חברי העמדה" — CrewFields, בלי שכפול), פרטי האירוע, המעורבים
// ותמונת המסך של העמדה. חברי הצוות ניתנים לעדכון כאן ונשמרים גם חזרה לעמדה,
// כי בדרך כלל מה שמתקן אותם בתחקיר הוא גם התיקון הנכון לעמדה.
//
// התמונה **מצולמת לפני** שהטופס נפתח (SectorDashboard), ולכן הטופס אינו מופיע
// בה. ה-`data-nosnapshot` כאן הוא רשת ביטחון לצילום חוזר.
import React, { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import {
  CrewFields, SearchPicker, crewPalette, useMirageCrew, useSessionRoles,
  type SessionRoles, type ThemeMode,
} from './StationCrewForm';

/** סיווגי תחקיר — הקוד נשמר ב-DB, התווית מתורגמת. שינוי תרגום לא ישבור נתונים. */
export const DEBRIEF_SEVERITIES = [
  { code: 'critical', labelKey: 'crew.sevCritical', color: '#dc2626' },
  { code: 'severe', labelKey: 'crew.sevSevere', color: '#ea580c' },
  { code: 'accident', labelKey: 'crew.sevAccident', color: '#b91c1c' },
  { code: 'near_miss', labelKey: 'crew.sevNearMiss', color: '#d97706' },
  { code: 'medium', labelKey: 'crew.sevMedium', color: '#ca8a04' },
  { code: 'light', labelKey: 'crew.sevLight', color: '#65a30d' },
] as const;

export const INVOLVED_TYPES = [
  { code: 'squadron', labelKey: 'crew.involvedSquadron' },
  { code: 'callsign', labelKey: 'crew.involvedCallsign' },
  { code: 'formation_no', labelKey: 'crew.involvedFormationNo' },
  { code: 'yaba', labelKey: 'crew.involvedYaba' },
  { code: 'tower', labelKey: 'crew.involvedTower' },
  { code: 'other', labelKey: 'crew.involvedOther' },
] as const;

export type InvolvedType = typeof INVOLVED_TYPES[number]['code'];
export interface InvolvedRow { type: InvolvedType; value: string }

/** ערך datetime-local (זמן מקומי, בלי אזור) מתוך Date */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  presetId: number;
  presetName: string;
  presetRole?: string | null;
  themeMode?: ThemeMode;
  createdBy?: string;
  /** dataURL של צילום העמדה (ריק = הצילום נכשל / טרם צולם) */
  screenshot: string;
  /** הצרכן מסתיר את הטופס, מצלם מחדש ומחזיר תמונה חדשה דרך prop */
  onRecapture?: () => void;
  capturing?: boolean;
  /** טייסת/או"ק — מהפ"מים החיים בעמדה. יב"א/מגדלים מגיעים מרשימת היחידות (ראה useUnits) */
  squadrons: string[];
  callsigns: string[];
  /** now() מוזרק — כדי שאפשר יהיה לבדוק את הטופס דטרמיניסטית */
  now?: Date;
  onClose: () => void;
  onSaved?: () => void;
}

// שמות היחידות המבצעיות — מרשימת היחידות שבמסך הניהול (לשונית "יחידות"),
// **ולא** מרשימת העמדות: עמדה היא תצורת תצוגה במערכת ויחידה היא גוף בשטח.
// רק יחידות פעילות מוצגות למי שכותב תחקיר.
function useUnits() {
  const [units, setUnits] = useState<{ name: string; kind: string }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/units?active=1`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive) setUnits(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return units;
}

export default function DebriefForm({
  presetId, presetName, presetRole, themeMode = 'dark', createdBy,
  screenshot, onRecapture, capturing, squadrons, callsigns,
  now, onClose, onSaved,
}: Props) {
  const c = crewPalette(themeMode);
  const { roles, setRoles, loading } = useSessionRoles(presetId, createdBy);
  const { byPosition } = useMirageCrew(presetId);
  const units = useUnits();

  const [essence, setEssence] = useState('');
  const [severity, setSeverity] = useState('');
  const [details, setDetails] = useState('');
  const [responsibility, setResponsibility] = useState('');
  const [involved, setInvolved] = useState<InvolvedRow[]>([]);
  const [eventTime, setEventTime] = useState(() => toLocalInputValue(now ?? new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const optionsFor = useMemo(() => {
    const named = (kind: string) => units.filter(u => u.kind === kind).map(u => u.name);
    return {
      squadron: squadrons,
      callsign: callsigns,
      formation_no: ['1', '2', '3', '4', '5', '6', '7', '8'],
      yaba: named('yaba'),
      tower: named('tower'),
      other: named('other'),
    };
  }, [squadrons, callsigns, units]);

  const setRow = (i: number, patch: Partial<InvolvedRow>) =>
    setInvolved(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(false);
    try {
      // חברי העמדה שעודכנו כאן נשמרים גם חזרה לעמדה — התחקיר שומר snapshot משלו
      await fetch(`${API_URL}/workstation-session-roles/${presetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roles),
      }).catch(() => {});

      const res = await fetch(`${API_URL}/debriefs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_id: presetId,
          preset_name: presetName,
          crew: roles as SessionRoles,
          essence,
          severity,
          details,
          involved: involved.filter(r => r.value.trim()),
          responsibility,
          screenshot,
          // datetime-local הוא זמן מקומי בלי אזור — ההמרה ל-ISO קובעת את ה-tz
          event_time: eventTime ? new Date(eventTime).toISOString() : null,
          created_by: createdBy || '',
        }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      setSaving(false);
      setError(true);
      return;
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const field = (label: string, node: React.ReactNode) => (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: c.label, marginBottom: '4px' }}>{label}</label>
      {node}
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 11px', borderRadius: '7px',
    border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.inputText,
    fontSize: '14px', boxSizing: 'border-box', textAlign: 'start',
  };

  const sectionStyle: React.CSSProperties = {
    border: `1px solid ${c.inputBorder}`, borderRadius: '10px',
    padding: '12px 14px', marginBottom: '14px',
  };

  const sectionTitle = (text: string) => (
    <div style={{ fontSize: '12px', fontWeight: 'bold', color: c.muted, marginBottom: '10px' }}>{text}</div>
  );

  return (
    <div
      data-nosnapshot
      style={{
        position: 'fixed', inset: 0, zIndex: 3200, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* data-crew-scroll — אזור הגלילה שביחס אליו תפריטי ההצעות של שדות
          חברי הצוות מחליטים אם להיפתח למטה או למעלה (SearchPicker) */}
      <div data-crew-scroll style={{
        background: c.card, border: `2px solid ${c.border}`, borderRadius: '14px',
        padding: '20px 24px', minWidth: '360px', maxWidth: '620px', width: '92%',
        maxHeight: 'calc(92vh / var(--s, 1))', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{ flex: 1, fontSize: '18px', fontWeight: 'bold', color: c.title }}>
            📋 {tr('crew.debriefTitle')}: {presetName}
          </div>
          <button
            onClick={onClose}
            style={{ background: c.chipOff, color: c.chipOffText, border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer' }}
          >✕ {tr('crew.close')}</button>
        </div>

        {/* חברי הצוות — אותם שדות בדיוק כמו ב"עדכון חברי העמדה" */}
        <div style={sectionStyle}>
          {sectionTitle(tr('crew.debriefCrewSection'))}
          {loading ? (
            <div style={{ fontSize: '13px', color: c.muted }}>{tr('crew.crewListLoading')}</div>
          ) : (
            <CrewFields roles={roles} setRoles={setRoles} presetRole={presetRole} byPosition={byPosition} c={c} />
          )}
        </div>

        {/* פרטי האירוע */}
        <div style={sectionStyle}>
          {sectionTitle(tr('crew.debriefEventSection'))}

          {field(tr('crew.debriefEventTime'), (
            <input
              type="datetime-local"
              value={eventTime}
              onChange={e => setEventTime(e.target.value)}
              style={{ ...inputStyle, direction: 'ltr' }}
            />
          ))}

          {field(tr('crew.debriefEssence'), (
            <input
              type="text"
              value={essence}
              onChange={e => setEssence(e.target.value)}
              placeholder={tr('crew.debriefEssencePlaceholder')}
              style={inputStyle}
            />
          ))}

          {field(tr('crew.debriefSeverity'), (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {DEBRIEF_SEVERITIES.map(s => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => setSeverity(severity === s.code ? '' : s.code)}
                  style={{
                    flex: '1 0 auto', padding: '8px 10px', borderRadius: '7px', cursor: 'pointer',
                    fontSize: '13px', fontWeight: severity === s.code ? 'bold' : 'normal',
                    // צבע הסיווג הוא צבע סטטוס — קבוע בכל התמות
                    border: `2px solid ${severity === s.code ? s.color : c.inputBorder}`,
                    background: severity === s.code ? s.color : c.inputBg,
                    color: severity === s.code ? '#ffffff' : c.inputText,
                  }}
                >{tr(s.labelKey)}</button>
              ))}
            </div>
          ))}

          {field(tr('crew.debriefDetails'), (
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder={tr('crew.debriefDetailsPlaceholder')}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          ))}

          {field(tr('crew.debriefResponsibility'), (
            <textarea
              value={responsibility}
              onChange={e => setResponsibility(e.target.value)}
              placeholder={tr('crew.debriefResponsibilityPlaceholder')}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          ))}
        </div>

        {/* מעורבים — סוג + ערך. הרשימות נגזרות מהנתונים החיים בעמדה,
            והשדה נשאר טקסט חופשי כדי לא לחסום מקרה שלא ברשימה. */}
        <div style={sectionStyle}>
          {sectionTitle(tr('crew.debriefInvolved'))}
          {involved.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
              <select
                value={row.type}
                onChange={e => setRow(i, { type: e.target.value as InvolvedType, value: '' })}
                style={{ ...inputStyle, width: 'auto', flex: '0 0 128px', cursor: 'pointer' }}
              >
                {INVOLVED_TYPES.map(t => (
                  <option key={t.code} value={t.code}>{tr(t.labelKey)}</option>
                ))}
              </select>
              <SearchPicker
                value={row.value}
                onChange={v => setRow(i, { value: v })}
                options={optionsFor[row.type]}
                placeholder={tr('crew.involvedValue')}
                c={c}
              />
              <button
                type="button"
                onClick={() => setInvolved(prev => prev.filter((_, j) => j !== i))}
                title={tr('crew.involvedRemove')}
                style={{ flex: '0 0 auto', background: c.chipOff, color: c.chipOffText, border: 'none', borderRadius: '7px', padding: '9px 11px', fontSize: '13px', cursor: 'pointer' }}
              >✕</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setInvolved(prev => [...prev, { type: 'squadron', value: '' }])}
            style={{ background: 'transparent', border: `1px dashed ${c.inputBorder}`, color: c.label, borderRadius: '7px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer' }}
          >＋ {tr('crew.involvedAdd')}</button>
        </div>

        {/* תמונת העמדה — צולמה לפני פתיחת הטופס, ולכן הטופס אינו בתוכה */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1, fontSize: '12px', fontWeight: 'bold', color: c.muted }}>{tr('crew.debriefScreenshot')}</div>
            {onRecapture && (
              <button
                type="button"
                onClick={onRecapture}
                disabled={capturing}
                style={{ background: c.chipOff, color: c.chipOffText, border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', cursor: capturing ? 'wait' : 'pointer' }}
              >📷 {capturing ? tr('crew.screenshotCapturing') : tr('crew.screenshotRetake')}</button>
            )}
          </div>
          {screenshot ? (
            <img
              src={screenshot}
              alt={tr('crew.debriefScreenshot')}
              style={{ width: '100%', maxHeight: '190px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${c.inputBorder}`, background: c.inputBg }}
            />
          ) : (
            <div style={{ fontSize: '12px', color: capturing ? c.muted : '#f59e0b' }}>
              {capturing ? tr('crew.screenshotCapturing') : tr('crew.screenshotFailed')}
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center', marginBottom: '8px' }}>{tr('crew.debriefSaveFailed')}</div>
        )}

        <button
          onClick={save}
          disabled={saving}
          style={{
            width: '100%', padding: '12px', background: saving ? c.chipOff : c.accent,
            color: saving ? c.chipOffText : 'white', border: 'none', borderRadius: '8px',
            fontSize: '15px', fontWeight: 'bold', cursor: saving ? 'wait' : 'pointer',
          }}
        >{saving ? '...' : `✅ ${tr('crew.debriefSave')}`}</button>
      </div>
    </div>
  );
}
