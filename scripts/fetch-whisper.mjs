#!/usr/bin/env node
// מוריד ומכין את מנוע התמלול המקומי של העמדה אל vendor/whisper/.
//
// למה: ה-Web Speech API לא עובד ב-Electron (נשען על שירות ענן של גוגל שהמפתחות
// אליו קומפלו רק לתוך Chrome), ולכן העמדה מתמללת בעצמה. הסקריפט מביא את שני
// הרכיבים הדרושים:
//   1. whisper.cpp - בינארי Windows מוכן (בלי קומפילציה, בלי rebuild ל-ABI)
//   2. מודל עברית של ivrit-ai בפורמט ggml, ומקוונטז אותו ל-q5_0 (1.6GB → ~550MB)
//
// הרצה:  npm run whisper:fetch
// התוצר נכנס למתקין דרך extraResources ב-electron-builder.railway.json.
//
// ⚠️ vendor/ ב-.gitignore: הבינארי והמודל לא נכנסים ל-git.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor', 'whisper');
const TMP = path.join(ROOT, 'vendor', '.tmp');

// whisper.cpp - שחרור עם בינארי Windows x64 (גרסת BLAS: מהירה יותר על CPU)
const WHISPER_VERSION = 'v1.9.1';
const WHISPER_ZIP_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-blas-bin-x64.zip`;
// מודל עברית, Apache-2.0
const MODEL_URL = 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin';
const QUANT_TYPE = 'q5_0';

const mb = (n) => `${(n / 1024 / 1024).toFixed(0)}MB`;

async function download(url, dest, label) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`⏭  ${label} כבר קיים (${mb(fs.statSync(dest).size)}) - מדלג`);
    return;
  }
  console.log(`⬇  מוריד ${label}...`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length') || 0);

  const partial = `${dest}.part`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(partial);
  let seen = 0;
  let lastLog = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    seen += chunk.length;
    if (seen - lastLog > 25 * 1024 * 1024) {   // דיווח כל 25MB
      lastLog = seen;
      console.log(`   ${mb(seen)}${total ? ` / ${mb(total)}` : ''}`);
    }
  }
  await new Promise((resolve, reject) => out.end(err => (err ? reject(err) : resolve())));
  fs.renameSync(partial, dest);
  console.log(`✅ ${label} - ${mb(fs.statSync(dest).size)}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} יצא בקוד ${code}`))));
  });
}

async function unzip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    await run('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`]);
  } else {
    await run('unzip', ['-o', zipPath, '-d', destDir]);
  }
}

/** הבינארים בזיפ יושבים לעיתים בתת-תיקייה - שוטחים אותם ל-vendor/whisper. */
function flattenBinaries(fromDir, toDir) {
  const wanted = /\.(exe|dll|so|dylib)$/i;
  const seen = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!wanted.test(entry.name)) continue;
      fs.copyFileSync(full, path.join(toDir, entry.name));
      seen.push(entry.name);
    }
  };
  walk(fromDir);
  return seen;
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });
  fs.mkdirSync(TMP, { recursive: true });

  // ── 1. מנוע ──
  const zip = path.join(TMP, 'whisper-bin.zip');
  await download(WHISPER_ZIP_URL, zip, `whisper.cpp ${WHISPER_VERSION}`);
  const extractDir = path.join(TMP, 'whisper-bin');
  fs.rmSync(extractDir, { recursive: true, force: true });
  await unzip(zip, extractDir);
  const bins = flattenBinaries(extractDir, VENDOR);
  console.log(`✅ בינארים: ${bins.join(', ') || '(לא נמצאו!)'}`);

  const exe = process.platform === 'win32' ? '.exe' : '';
  const cli = ['whisper-cli', 'main'].map(n => path.join(VENDOR, n + exe)).find(p => fs.existsSync(p));
  if (!cli) throw new Error('לא נמצא בינארי whisper-cli/main בזיפ - בדוק את הגרסה ב-WHISPER_VERSION');

  // ── 2. מודל ──
  const rawModel = path.join(TMP, 'ggml-model-f16.bin');
  await download(MODEL_URL, rawModel, 'מודל עברית של ivrit-ai (fp16, ~1.6GB)');

  // ── 3. קוונטיזציה ──
  // מקטין את המתקין פי 3 בפגיעה זניחה בדיוק. אם כלי הקוונטיזציה לא הגיע בזיפ,
  // עדיף מודל מלא מאשר להיכשל - העמדה תעבוד, רק תתפוס יותר מקום.
  const target = path.join(VENDOR, 'ggml-model.bin');
  const quantizer = ['quantize', 'whisper-quantize'].map(n => path.join(VENDOR, n + exe)).find(p => fs.existsSync(p));
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`⏭  ${path.basename(target)} כבר קיים (${mb(fs.statSync(target).size)}) - מדלג`);
  } else if (quantizer) {
    console.log(`⚙  מקוונטז ל-${QUANT_TYPE}...`);
    await run(quantizer, [rawModel, target, QUANT_TYPE]);
    console.log(`✅ מודל מקוונטז - ${mb(fs.statSync(target).size)} (מקור: ${mb(fs.statSync(rawModel).size)})`);
  } else {
    console.warn('⚠  כלי הקוונטיזציה לא נמצא בזיפ - מעתיק את המודל המלא (מתקין גדול יותר)');
    fs.copyFileSync(rawModel, target);
  }

  console.log(`\n✅ מנוע התמלול מוכן ב-${VENDOR}`);
  console.log('   הרצה בפיתוח: npm run electron:railway');
  console.log('   בניית מתקין: npm run electron:build:railway');
  console.log(`   (אפשר למחוק את ${TMP} כדי לפנות מקום)`);
}

main().catch(err => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
