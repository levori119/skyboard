/**
 * לקיחת פ"מ שכבר בנקודת העברה - הצד של העמדה (ראה server/routes/transferTakeovers.js).
 *
 * `tryRequest` נקרא **לפני** שליחת העברה. אם לפ"מ יש העברה פתוחה מעמדה אחרת,
 * השרת פותח בקשה ומחזיר אותה - והשליחה הרגילה **לא** מתבצעת. אחרת מחזיר false
 * והשליחה ממשיכה כרגיל.
 */

import { useCallback, useRef, useState } from 'react';
import { usePolling } from '../../hooks/usePollingRegistry';
import { pickTakeoverToShow, type TransferTakeoverRequest } from '../../utils/transferTakeover';

interface Options {
  apiUrl: string;
  presetId: number | null;
  /** מצב ההעברות השתנה (אושרה לקיחה) - לרענן את נתוני העמדה. */
  onChanged: () => void;
}

export function useTransferTakeovers({ apiUrl, presetId, onChanged }: Options) {
  const [list, setList] = useState<TransferTakeoverRequest[]>([]);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // תוצאה שנודעה מתשובת ההכרעה עצמה (הצד השני הקדים / פג / נסגר). השרת כבר
  // סימן אותה כנראתה אצלי, ולכן הסבב הבא לא יחזיר אותה - מחזיקים אותה כאן עד "אישור".
  const [local, setLocal] = useState<Record<number, TransferTakeoverRequest>>({});
  const approvedSeen = useRef<Set<number>>(new Set());
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const refresh = useCallback(async () => {
    if (presetId == null) return;
    try {
      const r = await fetch(`${apiUrl}/transfer-takeovers?presetId=${presetId}`);
      if (!r.ok) return;
      const rows: TransferTakeoverRequest[] = await r.json();
      setList(rows);
      // תוצאת "אושר" שהגיעה מהצד השני - ההעברות זזו, לרענן מיד ולא לחכות לסבב
      if (rows.some(x => x.status === 'approved' && !approvedSeen.current.has(x.id))) {
        rows.filter(x => x.status === 'approved').forEach(x => approvedSeen.current.add(x.id));
        onChangedRef.current();
      }
    } catch { /* סבב הבא */ }
  }, [apiUrl, presetId]);

  usePolling(`transfer-takeovers-${presetId ?? 'none'}`, refresh, presetId != null ? 3000 : 0);

  const tryRequest = useCallback(async (stripId: string, kind: 'sector' | 'preset', payload: Record<string, unknown>): Promise<boolean> => {
    if (presetId == null) return false;
    try {
      const r = await fetch(`${apiUrl}/transfer-takeovers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strip_id: String(stripId).replace(/^s/, ''), requester_preset_id: presetId, kind, payload }),
      });
      if (!r.ok) return false;
      const { request } = await r.json();
      if (!request) return false;
      setList(prev => [...prev.filter(x => x.id !== request.id), request]);
      return true;
    } catch {
      // השרת לא ענה - לא חוסמים העברה בגלל בדיקה שנכשלה
      return false;
    }
  }, [apiUrl, presetId]);

  const decide = useCallback(async (id: number, decision: 'approve' | 'deny') => {
    if (presetId == null || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiUrl}/transfer-takeovers/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, preset_id: presetId }),
      });
      const data = await r.json().catch(() => ({}));
      const req: TransferTakeoverRequest | undefined = data?.request;
      if (r.ok) {
        // הכרעתי - אין לי מה לראות יותר
        setHidden(prev => new Set(prev).add(id));
        if (data.status === 'approved') { approvedSeen.current.add(id); onChangedRef.current(); }
      } else if (req) {
        // הצד השני הקדים / ההעברה נסגרה / פג - מציגים את התוצאה במקום
        setLocal(prev => ({ ...prev, [id]: req }));
      }
    } finally {
      setBusy(false);
      refresh();
    }
  }, [apiUrl, presetId, busy, refresh]);

  const ackOutcome = useCallback((id: number) => {
    setHidden(prev => new Set(prev).add(id));
    setLocal(prev => { const n = { ...prev }; delete n[id]; return n; });
    fetch(`${apiUrl}/transfer-takeovers/${id}/seen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId }),
    }).catch(() => {});
  }, [apiUrl, presetId]);

  const merged = [...list.filter(x => !local[x.id]), ...Object.values(local)];
  const { current, queued } = pickTakeoverToShow(merged, presetId, hidden);
  return { current, queued, busy, tryRequest, decide, ackOutcome };
}
