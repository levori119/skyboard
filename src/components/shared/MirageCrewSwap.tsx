// החלפת איש צוות בכניסת מיראז' — רכיב משותף (SectorDashboard + MissionDeskView).
// מציג רק אנשים שמורשים לעמדה הספציפית במיראז', ומחייב הזדהות מחדש:
// הקלדת מספר אישי ואישור מיראז' (כולל אכיפת העמדה בצד השרת) לפני ההחלפה.
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CrewMember } from '../../types';
import { API_URL } from '../../config';

interface EligibleUser {
  personalNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roles: string[];
}

interface Props {
  presetId: number;
  currentPersonalId?: string;
  onSwapped: (cm: CrewMember) => void;
  dark?: boolean; // true בתפריט הדסק (רקע כהה), false במודל הבקר (רקע בהיר)
}

export default function MirageCrewSwap({ presetId, currentPersonalId, onSwapped, dark }: Props) {
  const { t, i18n } = useTranslation();
  const dir = i18n.dir();
  const [eligible, setEligible] = useState<EligibleUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState<EligibleUser | null>(null);
  const [pn, setPn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const c = dark
    ? { text: '#e2e8f0', subtext: '#94a3b8', itemBg: 'transparent', itemBorder: '#334155', inputBg: '#0f172a', inputText: '#e2e8f0', inputBorder: '#475569' }
    : { text: '#1e293b', subtext: '#64748b', itemBg: '#f1f5f9', itemBorder: '#e2e8f0', inputBg: 'white', inputText: '#1e293b', inputBorder: '#cbd5e1' };

  useEffect(() => {
    fetch(`${API_URL}/auth/mirage-eligible?presetId=${presetId}`)
      .then(async r => {
        if (r.ok) { setEligible((await r.json()).eligible); return; }
        setLoadError(r.status === 502 ? t('login.mirageUnavailable') : t('login.errorLogin'));
      })
      .catch(() => setLoadError(t('login.errorConnection')));
  }, [presetId]);

  const identify = async () => {
    const typed = pn.trim();
    if (!typed) { setError(t('login.mirageEnterNumber')); return; }
    if (picked && typed !== picked.personalNumber) { setError(t('login.mirageSwapMismatch')); return; }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/mirage-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalNumber: typed, presetId }),
      });
      if (res.ok) {
        const data = await res.json();
        onSwapped({ ...data.crewMember, auth_source: 'mirage' });
      } else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setError(body.error === 'workstation_not_permitted' ? t('login.mirageWorkstationDenied') : t('login.mirageDenied'));
      } else if (res.status === 502) {
        setError(t('login.mirageUnavailable'));
      } else {
        setError(t('login.errorLogin'));
      }
    } catch {
      setError(t('login.errorConnection'));
    }
    setBusy(false);
  };

  if (loadError) return <div style={{ padding: '10px 14px', fontSize: '13px', color: '#f87171' }}>{loadError}</div>;
  if (!eligible) return <div style={{ padding: '10px 14px', fontSize: '13px', color: c.subtext }}>{t('login.mirageEligibleLoading')}</div>;
  if (eligible.length === 0) return <div style={{ padding: '10px 14px', fontSize: '13px', color: c.subtext }}>{t('login.mirageEligibleEmpty')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', direction: dir }}>
      <div style={{ fontSize: '12px', color: c.subtext }}>🛡️ {t('login.mirageSwapHint')}</div>
      {eligible.map(u => {
        const isCurrent = !!currentPersonalId && u.personalNumber === currentPersonalId;
        const isPicked = picked?.personalNumber === u.personalNumber;
        return (
          <button
            key={u.personalNumber}
            disabled={isCurrent}
            onClick={() => { setPicked(isPicked ? null : u); setError(''); }}
            style={{
              padding: '10px 14px',
              background: isCurrent ? 'transparent' : c.itemBg,
              color: isCurrent ? c.subtext : c.text,
              border: isPicked ? '2px solid #3b82f6' : `1px solid ${c.itemBorder}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: isCurrent ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              textAlign: 'start',
            }}
          >
            <span>{u.fullName}</span>
            {isCurrent && <span style={{ fontSize: '11px', color: '#3b82f6' }}>{t('login.mirageSwapCurrent')}</span>}
            {!isCurrent && u.roles.includes('admin') && <span style={{ fontSize: '10px', background: '#eab308', color: '#1e293b', padding: '2px 6px', borderRadius: '10px' }}>{t('login.roleAdmin')}</span>}
            {!isCurrent && !u.roles.includes('admin') && u.roles.includes('team_lead') && <span style={{ fontSize: '10px', background: '#06b6d4', color: '#0c4a6e', padding: '2px 6px', borderRadius: '10px' }}>{t('login.roleTeamLead')}</span>}
          </button>
        );
      })}
      {picked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', border: `1px solid ${c.itemBorder}`, borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: c.subtext }}>{t('login.mirageSwapIdentify', { name: picked.fullName })}</div>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder={t('login.miragePersonalNumber')}
            value={pn}
            onChange={e => setPn(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) identify(); }}
            style={{ padding: '9px 12px', borderRadius: '6px', border: `1px solid ${c.inputBorder}`, background: c.inputBg, color: c.inputText, fontSize: '14px', direction: 'ltr', textAlign: 'center' }}
          />
          <button
            onClick={identify}
            disabled={busy}
            style={{ padding: '9px', background: busy ? '#94a3b8' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? t('login.mirageIdentifying') : `🛡️ ${t('login.mirageIdentify')}`}
          </button>
        </div>
      )}
      {error && <div style={{ fontSize: '12px', color: '#ef4444', textAlign: 'center' }}>{error}</div>}
    </div>
  );
}
