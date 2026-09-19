import { useEffect, useState } from 'react';
import { etaCountdown } from '../utils/tableTransferCell';

/**
 * ספירה לאחור עד ההגעה לנקודת ההעברה (⏱ MM:SS), מתעדכנת כל שנייה.
 * מקור אחד לכרטיס ההעברה, לשורה המקוצרת ולתא "העברה/קבלה" של מוד הטבלה -
 * כך שלושתם מציגים את אותו זמן בדיוק.
 */
export function useEtaCountdown(etaMinutes: unknown, etaSetAt: unknown): { text: string; over: boolean } | null {
  const [value, setValue] = useState(() => etaCountdown(etaMinutes, etaSetAt));
  useEffect(() => {
    const update = () => setValue(etaCountdown(etaMinutes, etaSetAt));
    update();
    if (!etaMinutes || !etaSetAt) return;
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [etaMinutes, etaSetAt]);
  return value;
}
