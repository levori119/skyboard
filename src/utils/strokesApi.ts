// Client API for offline handwriting stroke templates (learned_strokes).
// Templates persist per crew member; GET returns seed + the user's own samples.
import { API_URL } from '../config';
import { StrokeSample } from './handwritingTemplates';

type RawStroke = { x: number; y: number }[];

export async function loadStrokeTemplates(crewMemberId?: number | null): Promise<StrokeSample[]> {
  const q = crewMemberId ? `?crew_member_id=${crewMemberId}` : '';
  const res = await fetch(`${API_URL}/strokes${q}`);
  if (!res.ok) return [];
  const rows = await res.json();
  return (rows as any[]).map(r => ({
    label: r.label, strokes: r.strokes, source: r.source === 'seed' ? 'seed' : 'user',
  }));
}

export async function saveStrokeSample(
  label: string, strokes: RawStroke[], crewMemberId?: number | null, source: 'seed' | 'user' = 'user',
): Promise<boolean> {
  const res = await fetch(`${API_URL}/strokes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, strokes, source, crew_member_id: crewMemberId ?? null }),
  });
  return res.ok;
}

export async function clearStrokeSamples(crewMemberId?: number | null): Promise<boolean> {
  const q = crewMemberId ? `?crew_member_id=${crewMemberId}` : '';
  const res = await fetch(`${API_URL}/strokes${q}`, { method: 'DELETE' });
  return res.ok;
}
