// Note values can be: plain text | data-URL (handwriting) | JSON { text, hw }

export const parseNoteValue = (val: string): { text: string; hw: string } => {
  if (!val) return { text: '', hw: '' };
  if (val.startsWith('data:')) return { text: '', hw: val };
  if (val.startsWith('{')) {
    try {
      const p = JSON.parse(val);
      return { text: p.text || '', hw: p.hw || '' };
    } catch {}
  }
  return { text: val, hw: '' };
};

export const serializeNoteValue = (text: string, hw: string): string => {
  const hasText = text.trim().length > 0;
  const hasHw = hw.startsWith('data:');
  if (hasText && hasHw) return JSON.stringify({ text, hw });
  if (hasHw) return hw;
  return text;
};
