// רשימת העמדות שהוגדרו לצפייה מהעמדה (preset_view_stations).
// מקור יחיד לתפריט "תצוגה" (האם הפריט לחיץ) ולסרגל עצמו (אילו ריבועים) -
// כך שניהם רואים אותה רשימה ואין שתי קריאות פולינג לאותו endpoint.
import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../config';
import { IS_PEEK_FRAME, type ViewStation } from '../utils/stationPeek';

// רענון הרשימה (לא התוכן - הוא מתעדכן בתוך המסגרת): שינוי הגדרה במסך הניהול
// מגיע לעמדה בלי צורך ברענון דף.
const LIST_POLL_MS = 30000;

export function useViewStations(presetId: number | null | undefined): ViewStation[] {
  const [stations, setStations] = useState<ViewStation[]>([]);

  const load = useCallback(async () => {
    if (!presetId) return;
    try {
      const r = await fetch(`${API_URL}/preset-view-stations/${presetId}`);
      if (r.ok) {
        const data = await r.json();
        setStations(Array.isArray(data) ? data : []);
      }
    } catch { /* מנותק - נשארים עם הרשימה הקיימת */ }
  }, [presetId]);

  useEffect(() => {
    if (IS_PEEK_FRAME || !presetId) return;   // גארד נגד קינון: מסגרת לא מציגה סרגל משלה
    load();
    const iv = setInterval(load, LIST_POLL_MS);
    return () => clearInterval(iv);
  }, [presetId, load]);

  return stations;
}
