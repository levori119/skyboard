// הסתרה גורפת של כפתורים ופעולות - הצד של העמדה.
//
// הקטלוג וההסבר: shared/hiddenActions.js. המנהל מכבה כפתור ב"הגדרות כלליות",
// וכל עמדה מסתירה אותו תוך סבב סקר אחד (או מיד ב"רענן הגדרות").
//
//   const show = useHiddenActions();
//   {show('voice') && <button ...>}
//
// ⚠️ עד שהתשובה הראשונה מגיעה - **הכל מוצג**. כשל רשת לא מעלים כפתורים: עמדה
// שלא יודעת מה הוסתר מתנהגת כמו לפני הפיצ'ר, ולא נשארת בלי כלים.

import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import { parseHiddenActions } from '../../shared/hiddenActions';
import { subscribeShared, refreshShared } from './sharedPolling';

const KEY = 'hidden-actions';
const POLL_MS = 30_000;

async function fetchHidden(): Promise<string[] | undefined> {
  try {
    const r = await fetch(`${API_URL}/system/hidden-actions`);
    if (!r.ok) return undefined;
    const d = await r.json();
    return parseHiddenActions(d?.hidden);
  } catch {
    return undefined;
  }
}

/** רענון יזום - "רענן הגדרות" בעמדה, ושמירה במסך הניהול */
export function refreshHiddenActions(): Promise<void> {
  return refreshShared(KEY);
}

/** מחזיר `show(id)` - false רק כשהפעולה הוסתרה בניהול */
export function useHiddenActions(): (id: string) => boolean {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => subscribeShared(KEY, fetchHidden, POLL_MS, setHidden), []);
  return useCallback((id: string) => !hidden.includes(id), [hidden]);
}
