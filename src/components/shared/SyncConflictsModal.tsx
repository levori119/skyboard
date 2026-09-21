// מסך יישוב הסתירות - ההכרעה האנושית שהמערכת מסרבת לקבל במקום הבקר.
//
// מתי הוא נפתח: העמדה עבדה בנתק, ובזמן הזה עמדה אחרת נגעה באותו פ"מ. אין
// כאן תשובה נכונה שאפשר לחשב - יש שתי גרסאות, ומי שיודע מה קרה בשמיים הוא
// האדם שיושב מול המסך. לכן המסך מציג את **שתיהן זו מול זו**, מסמן מה בדיוק
// שונה, ונותן שתי אפשרויות בלבד.
//
// למה אין "מיזוג": פ"מ אינו מסמך טקסט. מיזוג של גובה מגרסה אחת ועמדה מגרסה
// שנייה מייצר מצב שאיש משני הצדדים לא בחר בו - וזו בדיוק הדרך לאבד מטוס בין
// שתי עמדות.
//
// /ui-adapt: שלוש התמות + סקייל. צבעי ההשוואה (ענבר=שלי, תורכיז=השרת) קבועים
// בכל תמה - הם נושאי משמעות ולא עיצוב.

import React from 'react';
import { tr } from '../../i18n/tr';
import { useBodyTheme } from '../../hooks/useBodyTheme';
import { windowFrame } from '../../utils/windowFrame';
import {
  getSyncState, subscribeSync, resolveConflict, type SyncConflict,
} from '../../offline/syncClient';

const SIDE = {
  mine: '#f59e0b',   // ענבר - מה שנעשה בעמדה הזו בזמן הנתק
  theirs: '#38bdf8', // תורכיז - מה שהמרכז מחזיק עכשיו
};

const SURFACE: Record<'light' | 'dark' | 'ocean', { bg: string; panel: string; text: string; sub: string; line: string }> = {
  dark: { bg: '#0f172a', panel: '#1e293b', text: '#e2e8f0', sub: '#94a3b8', line: '#334155' },
  ocean: { bg: '#0b2a3a', panel: '#0e3446', text: '#e0f2fe', sub: '#7dd3fc', line: '#155e75' },
  light: { bg: '#f8fafc', panel: '#ffffff', text: '#1e293b', sub: '#475569', line: '#cbd5e1' },
};

/**
 * עמודות שאינן מעניינות את הבקר בהשוואה.
 * `rev` ו-`updated_at` הם הבוכנה של המנגנון, לא מידע שדה - והצגתם הייתה
 * מסמנת "שונה" בכל שורה ומטביעה את ההבדל האמיתי.
 */
const HIDDEN_FIELDS = new Set(['rev', 'updated_at', 'created_at']);

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

/** כותרת אנושית לשורה: מה שאפשר לזהות לפיו פ"מ במבט אחד. */
export function titleOf(c: SyncConflict): string {
  const row = c.mine || c.serverRow || {};
  const cs = row.callsign || row.call_sign;
  const pk = Object.values(c.pk).join('/');
  return cs ? `${cs} (${pk})` : pk;
}

/** רק השדות שבאמת שונים - זה מה שהבקר צריך להכריע עליו. */
export function differingFields(c: SyncConflict): string[] {
  const a = c.mine || {};
  const b = c.serverRow || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .filter(k => !HIDDEN_FIELDS.has(k))
    .filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null))
    .sort();
}

export default function SyncConflictsModal({ onClose }: { onClose: () => void }) {
  const themeMode = useBodyTheme();
  const C = SURFACE[themeMode] || SURFACE.dark;
  const sync = React.useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // כשהוכרעה הסתירה האחרונה אין עוד מה להציג, והחלון נסגר מעצמו. חלון ריק
  // שנשאר פתוח הוא דבר שהמפעיל צריך לסגור בלי סיבה.
  React.useEffect(() => {
    if (!sync.conflicts.length) onClose();
  }, [sync.conflicts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decide = async (c: SyncConflict, choice: 'mine' | 'theirs') => {
    setBusyKey(c.key);
    setError(null);
    try {
      await resolveConflict(c.key, choice);
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setBusyKey(null);
    }
  };

  const sideBtn = (color: string): React.CSSProperties => ({
    background: color, color: '#0f172a', border: 'none', borderRadius: 6,
    padding: '6px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
    touchAction: 'manipulation',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('sync.conflictsTitle')}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,.55)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: C.bg, color: C.text,
          width: 'min(760px, 96vw)', maxHeight: '86vh',
          display: 'flex', flexDirection: 'column',
          textAlign: 'start',
          boxShadow: '0 10px 40px rgba(0,0,0,.5)',
          ...windowFrame('edit', themeMode, 10),
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBlockEnd: `1px solid ${C.line}`,
        }}>
          <strong style={{ fontSize: 14 }}>⚠ {tr('sync.conflictsTitle')}</strong>
          <span style={{ color: C.sub, fontSize: 11.5, fontWeight: 600 }}>
            {tr('sync.conflictsCount', { n: sync.conflicts.length })}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginInlineStart: 'auto', background: 'transparent', border: 'none',
              color: C.sub, fontSize: 18, cursor: 'pointer', lineHeight: 1,
            }}
            aria-label={tr('shared.close')}
          >×</button>
        </div>

        <div style={{ padding: '8px 14px', color: C.sub, fontSize: 11.5, lineHeight: 1.6 }}>
          {tr('sync.conflictsHelp')}
        </div>

        <div style={{ overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sync.conflicts.map(c => {
            const fields = differingFields(c);
            const busy = busyKey === c.key;
            return (
              <div key={c.key} style={{
                background: C.panel, borderRadius: 8, padding: 10,
                border: `1px solid ${C.line}`, opacity: busy ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBlockEnd: 8 }}>
                  <strong style={{ fontSize: 13 }}>{titleOf(c)}</strong>
                  <span style={{ color: C.sub, fontSize: 10.5, fontWeight: 600 }}>{c.table}</span>
                  <span style={{
                    marginInlineStart: 'auto', color: C.sub, fontSize: 10.5, fontWeight: 600,
                  }}>{tr(`sync.reason.${c.reason}`)}</span>
                </div>

                {fields.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ color: C.sub }}>
                        <th style={{ textAlign: 'start', padding: '2px 4px', fontWeight: 600 }}>{tr('sync.field')}</th>
                        <th style={{ textAlign: 'start', padding: '2px 4px', color: SIDE.mine }}>{tr('sync.mine')}</th>
                        <th style={{ textAlign: 'start', padding: '2px 4px', color: SIDE.theirs }}>{tr('sync.theirs')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map(f => (
                        <tr key={f} style={{ borderBlockStart: `1px solid ${C.line}` }}>
                          <td style={{ padding: '3px 4px', color: C.sub }}>{f}</td>
                          <td style={{ padding: '3px 4px', fontWeight: 700 }}>{show((c.mine || {})[f])}</td>
                          <td style={{ padding: '3px 4px', fontWeight: 700 }}>{show((c.serverRow || {})[f])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ color: C.sub, fontSize: 11.5 }}>
                    {c.serverRow ? tr('sync.noFieldDiff') : tr('sync.serverDeleted')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBlockStart: 10 }}>
                  <button
                    type="button" disabled={busy} style={sideBtn(SIDE.mine)}
                    onClick={() => { void decide(c, 'mine'); }}
                  >{tr('sync.keepMine')}</button>
                  <button
                    type="button" disabled={busy} style={sideBtn(SIDE.theirs)}
                    onClick={() => { void decide(c, 'theirs'); }}
                  >{tr('sync.keepTheirs')}</button>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div style={{ padding: '8px 14px', color: '#ef4444', fontSize: 11.5, fontWeight: 700 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
