// מרכיב את משאבי התרגום מקבצי ה-registry המקובצים (src/i18n/registry/*.json).
//
// כל קובץ = קבוצה לוגית אחת:
//   { "_group": "העברות עמדה", "keys": { "cancel": { "he": "בטל", "en": "Cancel" } } }
//
// המפתח הטכני המלא הוא "<group>.<key>"  (למשל transfers.cancel) — זה מה שמופיע בקוד.
// הטקסטים he/en חיים **רק כאן** — לכן אפשר לשנות אותם בלי לגעת בקוד.

import admin from './registry/admin.json';
import airPicture from './registry/airPicture.json';
import blocks from './registry/blocks.json';
import classic from './registry/classic.json';
import shared from './registry/shared.json';
import crew from './registry/crew.json';
import ctrl from './registry/ctrl.json';
import dashboard from './registry/dashboard.json';
import dataWindows from './registry/dataWindows.json';
import env from './registry/env.json';
import ground from './registry/ground.json';
import help from './registry/help.json';
import joining from './registry/joining.json';
import links from './registry/links.json';
import map from './registry/map.json';
import misc from './registry/misc.json';
import missiondesk from './registry/missiondesk.json';
import offline from './registry/offline.json';
import pattern from './registry/pattern.json';
import pattern3d from './registry/pattern3d.json';
import query from './registry/query.json';
import strips from './registry/strips.json';
import suggest from './registry/suggest.json';
import transfers from './registry/transfers.json';
import vertical from './registry/vertical.json';

export type RegistryEntry = { he: string; en: string };
export type RegistryGroup = { _group: string; _note?: string; keys: Record<string, RegistryEntry> };

export const REGISTRY: Record<string, RegistryGroup> = {
  admin, airPicture, blocks, classic, crew, ctrl, dashboard, dataWindows, env,
  ground, help, joining, links, map, misc, missiondesk, offline, pattern, pattern3d, query, shared, strips, suggest, transfers, vertical,
} as unknown as Record<string, RegistryGroup>;

/** בונה resources ל-i18next: { he: {group: {key: text}}, en: {...} } */
export function buildResources(lang: 'he' | 'en'): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [group, data] of Object.entries(REGISTRY)) {
    out[group] = {};
    for (const [key, entry] of Object.entries(data.keys)) {
      // באנגלית — אם אין תרגום, נופלים חזרה לעברית (לעולם לא מפתח גולמי)
      out[group][key] = lang === 'en' ? (entry.en || entry.he) : entry.he;
    }
  }
  return out;
}

/** שורות שטוחות לטבלת הניהול: מפתח טכני | עברית | אנגלית | קבוצה */
export function registryRows() {
  const rows: { key: string; group: string; groupLabel: string; he: string; en: string }[] = [];
  for (const [group, data] of Object.entries(REGISTRY)) {
    for (const [key, entry] of Object.entries(data.keys)) {
      rows.push({ key: `${group}.${key}`, group, groupLabel: data._group, he: entry.he, en: entry.en });
    }
  }
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}
