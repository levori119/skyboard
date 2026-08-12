import type { WorkstationSession } from '../types/index';

export const getSession = (): WorkstationSession | null => {
  try {
    const data = sessionStorage.getItem('workstation_session');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const saveSession = (session: WorkstationSession): void => {
  sessionStorage.setItem('workstation_session', JSON.stringify(session));
};

export const clearSession = (): void => {
  sessionStorage.removeItem('workstation_session');
};

// הסקטורים הרלוונטיים לעמדה — משמש בשני מקומות: בכניסה לעמדה (WorkstationLogin)
// ובמסגרת הצפייה בעמדה אחרת (מצב ?peek=), ולכן יושב כאן ולא משוכפל.
//
// עמדה שאינה קלאסית מקבלת גם את סקטורי נקודות המסירה/הקבלה, כדי שפאנל השכנים
// במפה יציג אותם. עמדה קלאסית **חייבת** להישאר בלי ההרחבה: היא נשענת על
// relevantSectors ריק כדי לבחור את ענף טעינת הנתונים הנכון.
export const buildRelevantSectors = (preset: any, sectors: any[]): any[] => {
  if (!Array.isArray(sectors)) return [];
  const relevantIds: number[] = Array.isArray(preset?.relevant_sectors) ? preset.relevant_sectors : [];
  const isClassic = preset?.preset_type === 'classic' || preset?.display_mode === 'classic';
  let allIds: number[] = relevantIds;
  if (!isClassic) {
    const ptIds = (arr: any) => (Array.isArray(arr) ? arr : []).map((p: any) => Number(p?.sector_id)).filter(Boolean);
    allIds = [...new Set([...relevantIds, ...ptIds(preset?.classic_transfer_points), ...ptIds(preset?.classic_receive_points)])];
  }
  return sectors.filter(s => allIds.includes(s.id));
};
