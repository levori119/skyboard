// useHandwritingRecognizer — loads offline stroke templates for the crew member,
// builds the $P recognizer, and exposes recognize() + saveSample() (rolling
// learning). Keeps all handwriting logic OUT of the host component.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DollarPRecognizer } from '../utils/dollarRecognizer';
import { buildRecognizer, StrokeSample } from '../utils/handwritingTemplates';
import { resolveContext } from '../utils/handwritingContext';
import { loadStrokeTemplates, saveStrokeSample } from '../utils/strokesApi';
import type { HandwritingResult } from '../components/shared/HandwritingPad';

type RawStroke = { x: number; y: number }[];

export function useHandwritingRecognizer(crewMemberId?: number | null) {
  const recognizerRef = useRef<DollarPRecognizer>(new DollarPRecognizer());
  const [ready, setReady] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);

  const reload = useCallback(async () => {
    const samples: StrokeSample[] = await loadStrokeTemplates(crewMemberId);
    recognizerRef.current = buildRecognizer(samples);
    setTemplateCount(recognizerRef.current.size);
    setReady(true);
  }, [crewMemberId]);

  useEffect(() => { reload().catch(() => setReady(true)); }, [reload]);

  /** Recognize strokes and resolve against a context candidate set. */
  const recognize = useCallback((strokes: RawStroke[], candidates: string[], threshold = 0.5): HandwritingResult => {
    const rec = recognizerRef.current.recognize(strokes);
    const { best, matches, ambiguous } = resolveContext(rec.name ?? '', candidates, { threshold });
    return { raw: rec.name, rawScore: rec.score, best, matches, ambiguous, strokes };
  }, []);

  /** Persist a confirmed sample (rolling learning) and add it live. */
  const saveSample = useCallback(async (label: string, strokes: RawStroke[]) => {
    recognizerRef.current.add(label, strokes);
    setTemplateCount(recognizerRef.current.size);
    await saveStrokeSample(label, strokes, crewMemberId, 'user').catch(() => {});
  }, [crewMemberId]);

  return { ready, templateCount, recognize, saveSample, reload };
}
