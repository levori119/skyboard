// סביבות תרגול — הקשר הסביבה של הבקשה הנוכחית (AsyncLocalStorage).
// סביבות 1-10 (טסות) חולקות את public; סביבות 11-50 (תרגול) — סכמה env_NN לכל אחת.
// ה-middleware קובע את ההקשר פעם אחת; server/db/pool.js קורא אותו בכל שאילתה.
import { AsyncLocalStorage } from 'node:async_hooks';

export const ENV_MIN = 1;
export const ENV_MAX = 50;
export const FLYING_MAX = 10;
export const DEFAULT_ENV = 1;

const als = new AsyncLocalStorage();

export function isValidEnv(env) {
  return typeof env === 'number' && Number.isInteger(env) && env >= ENV_MIN && env <= ENV_MAX;
}

// שם הסכמה נבנה אך ורק ממספר מאומת — לעולם לא ממחרוזת חיצונית (הגנת injection,
// כי שם סכמה משורבב ל-SQL כ-identifier ואי אפשר להעבירו כפרמטר $1).
export function schemaForEnv(env) {
  if (!isValidEnv(env)) throw new Error(`invalid environment: ${String(env)}`);
  return env <= FLYING_MAX ? 'public' : `env_${env}`;
}

export function currentEnv() {
  return als.getStore()?.env ?? DEFAULT_ENV;
}

export function currentSchema() {
  return als.getStore()?.schema ?? 'public';
}

export function runWithEnv(env, fn) {
  return als.run({ env, schema: schemaForEnv(env) }, fn);
}
