// Learned-digit OCR training API helpers (extracted from App.tsx)
import { API_URL } from '../config';

export const getLearnedDigits = async (crewMemberId?: number): Promise<{ digit: string; imageData: string }[]> => {
  try {
    const url = crewMemberId ? `${API_URL}/digits?crew_member_id=${crewMemberId}` : `${API_URL}/digits`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
};

export const saveLearnedDigit = async (digit: string, imageData: string, crewMemberId?: number) => {
  try {
    await fetch(`${API_URL}/digits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digit, imageData, crew_member_id: crewMemberId })
    });
  } catch (err) {
    console.error('Failed to save digit:', err);
  }
};

export const clearLearnedDigits = async (crewMemberId?: number) => {
  try {
    const url = crewMemberId ? `${API_URL}/digits?crew_member_id=${crewMemberId}` : `${API_URL}/digits`;
    await fetch(url, { method: 'DELETE' });
  } catch (err) {
    console.error('Failed to clear digits:', err);
  }
};

export const getDigitsCount = async (crewMemberId?: number): Promise<number> => {
  try {
    const url = crewMemberId ? `${API_URL}/digits/count?crew_member_id=${crewMemberId}` : `${API_URL}/digits/count`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
};
