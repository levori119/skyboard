// פלטת תמות לדסק משימה כללי — עוקבת אחרי שלוש התמות של המערכת
// (לילה/יום/תכלת, אותם צבעי בסיס כמו SectorDashboard). צבעי סטטוס של
// כפתורים/כללים נשארים קשיחים בכוונה (צבע תפעולי שהמשתמש בחר).
export type MDThemeMode = 'light' | 'dark' | 'ocean';

export interface MDTheme {
  bg: string; panel: string; panelAlt: string; border: string;
  text: string; subtext: string; accent: string; inputBg: string;
  headerBg: string; ruled: string; ink: string;
}

export function mdTheme(mode: MDThemeMode): MDTheme {
  if (mode === 'light') return {
    bg: '#e2e8f0', panel: '#ffffff', panelAlt: '#f1f5f9', border: '#cbd5e1',
    text: '#0f172a', subtext: '#475569', accent: '#0284c7', inputBg: '#f8fafc',
    headerBg: '#e2e8f0', ruled: '#cbd5e1', ink: '#1e293b',
  };
  if (mode === 'ocean') return {
    bg: '#0c2a40', panel: '#123a5c', panelAlt: '#0e3050', border: '#2b6a94',
    text: '#e0f2fe', subtext: '#7dd3fc', accent: '#38bdf8', inputBg: '#0c2a40',
    headerBg: '#0e3050', ruled: '#1e4a6e', ink: '#e0f2fe',
  };
  return {
    bg: '#0f172a', panel: '#1e293b', panelAlt: '#16213a', border: '#334155',
    text: '#f1f5f9', subtext: '#94a3b8', accent: '#0ea5e9', inputBg: '#0f172a',
    headerBg: '#16213a', ruled: '#334155', ink: '#f1f5f9',
  };
}
