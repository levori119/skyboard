export type UiLang = 'he' | 'en';
export function normalizeUiLanguage(raw: unknown): UiLang | null;
export function buildUiConfig(env: Record<string, string | undefined>, opts?: { localDb?: boolean }): { uiLanguage: UiLang | null; authoritative: boolean };
export function resolveLock(cfg: unknown): { action: 'keep' } | { action: 'set'; lock: UiLang | null };
