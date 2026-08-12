// טופס "הערה / הצעה" — נפתח מחלון "אודות" (סמל המערכת) בכל עמדה.
//
// המפעיל בשטח הוא מי שיודע מה חסר לו בסדק. הטופס הוא הצינור הישיר שלו למנהל
// המערכת הטכני: שם מלא, טלפון, יחידה, נושא ופירוט. התאריך והשעה **לא** נשאלים
// ולא נשלחים מהלקוח - הם נרשמים בשרת (created_at DEFAULT NOW()).
//
// הפלטה נגזרת מהתמה דרך crewPalette (אותו רכיב פלטה של טופס חברי העמדה),
// ולכן הטופס נכון בשלוש התמות בלי צבעים קשיחים. ראה /ui-adapt.
import React, { useState } from 'react';
import { API_URL } from '../../config';
import { tr } from '../../i18n/tr';
import { VKTrigger } from '../../VirtualKeyboard';
import { crewPalette, type ThemeMode, type Palette } from './StationCrewForm';

export interface SuggestionFormProps {
  presetId?: number | null;
  presetName?: string;
  /** שם המפעיל המחובר - ממלא מראש את "שם מלא" */
  defaultFullName?: string;
  themeMode?: ThemeMode;
  onClose: () => void;
  /** נקרא אחרי שליחה מוצלחת (למשל כדי לרענן רשימה) */
  onSent?: () => void;
}

type Field = { key: 'full_name' | 'phone' | 'unit' | 'subject'; labelKey: string; phKey: string; required: boolean };

const FIELDS: Field[] = [
  { key: 'full_name', labelKey: 'suggest.fullName', phKey: 'suggest.fullNamePlaceholder', required: true },
  { key: 'phone', labelKey: 'suggest.phone', phKey: 'suggest.phonePlaceholder', required: false },
  { key: 'unit', labelKey: 'suggest.unit', phKey: 'suggest.unitPlaceholder', required: false },
  { key: 'subject', labelKey: 'suggest.subject', phKey: 'suggest.subjectPlaceholder', required: true },
];

const inputStyle = (c: Palette): React.CSSProperties => ({
  flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: '7px',
  border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.inputText,
  fontSize: '14px', textAlign: 'start', outline: 'none',
});

export default function SuggestionForm({
  presetId, presetName, defaultFullName = '', themeMode = 'dark', onClose, onSent,
}: SuggestionFormProps) {
  const c = crewPalette(themeMode);
  const [form, setForm] = useState({ full_name: defaultFullName, phone: '', unit: '', subject: '' });
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: Field['key'], v: string) => { setForm(p => ({ ...p, [k]: v })); setError(null); };

  const submit = async () => {
    if (!form.full_name.trim() || !form.subject.trim() || !details.trim()) {
      setError(tr('suggest.required'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, details, preset_id: presetId ?? null, preset_name: presetName || '' }),
      });
      if (!res.ok) throw new Error('failed');
      setSent(true);
      onSent?.();
      setTimeout(onClose, 1400);
    } catch {
      setError(tr('suggest.failed'));
    }
    setSending(false);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10010, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.card, border: `2px solid ${c.border}`, borderRadius: '14px',
          padding: '22px 26px', width: '92%', minWidth: '320px', maxWidth: '520px',
          maxHeight: 'calc(92vh / var(--s, 1))', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ fontSize: '17px', fontWeight: 'bold', color: c.title, marginBottom: '4px' }}>
          💡 {tr('suggest.formTitle')}
        </div>
        <div style={{ fontSize: '12px', color: c.muted, marginBottom: '16px' }}>{tr('suggest.sectionHint')}</div>

        {FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: c.label, marginBottom: '4px' }}>
              {tr(f.labelKey)}{f.required ? ' *' : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                value={form[f.key]}
                onChange={e => set(f.key, e.target.value)}
                placeholder={tr(f.phKey)}
                style={inputStyle(c)}
              />
              <VKTrigger value={form[f.key]} onChange={v => set(f.key, v)} mode="full" label={tr(f.labelKey)} size={15} />
            </div>
          </div>
        ))}

        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', color: c.label, marginBottom: '4px' }}>{tr('suggest.details')} *</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <textarea
              value={details}
              onChange={e => { setDetails(e.target.value); setError(null); }}
              placeholder={tr('suggest.detailsPlaceholder')}
              style={{ ...inputStyle(c), minHeight: '110px', resize: 'vertical', lineHeight: 1.5 }}
            />
            <VKTrigger value={details} onChange={v => { setDetails(v); setError(null); }} mode="full" label={tr('suggest.details')} size={15} />
          </div>
        </div>

        {/* צבעי סטטוס (אדום שגיאה / ירוק הצלחה) קבועים בכל תמה - הם נושאים משמעות */}
        {error && <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '8px' }}>{error}</div>}
        {sent && <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: 'bold', marginBottom: '8px' }}>✅ {tr('suggest.sent')}</div>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
          <button
            onClick={submit}
            disabled={sending || sent}
            style={{
              flex: 1, padding: '11px', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold',
              background: sending || sent ? c.chipOff : c.accent, color: sending || sent ? c.chipOffText : 'white',
              cursor: sending || sent ? 'wait' : 'pointer',
            }}
          >
            {sending ? tr('suggest.sending') : `📨 ${tr('suggest.send')}`}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '11px 18px', background: c.chipOff, color: c.chipOffText, border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}
          >
            {tr('shared.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
