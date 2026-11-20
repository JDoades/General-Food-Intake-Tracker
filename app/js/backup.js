// Export and import of Ish data. Pure functions apart from the optional browser
// helpers at the bottom, which never touch the network.

import { normaliseData, SCHEMA_VERSION } from './store.js';

export class BackupError extends Error {}

const CODE_GZIP = 'ISH1:';
const CODE_PLAIN = 'ISH0:';

export function toJSON(data, now = Date.now()) {
  return JSON.stringify({ app: 'ish', exportedAt: new Date(now).toISOString(), ...data, version: SCHEMA_VERSION }, null, 1);
}

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function canCompress() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** A copy-and-paste text code. Gzipped when the browser supports it, plain otherwise. */
export async function toCode(data, { compress = canCompress(), now = Date.now() } = {}) {
  const json = JSON.stringify({ app: 'ish', exportedAt: new Date(now).toISOString(), ...data, version: SCHEMA_VERSION });
  const bytes = new TextEncoder().encode(json);
  if (compress) {
    const gz = await streamBytes(bytes, new CompressionStream('gzip'));
    return CODE_GZIP + bytesToBase64(gz);
  }
  return CODE_PLAIN + bytesToBase64(bytes);
}

/**
 * Read a backup from a file's text or a pasted code. Returns clean, valid data.
 * Throws BackupError with a friendly message if it can't be read.
 */
export async function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) throw new BackupError("That's empty. Paste a backup code or pick a backup file.");
  const trimmed = text.trim();
  let json;
  if (trimmed.startsWith(CODE_GZIP) || trimmed.startsWith(CODE_PLAIN)) {
    const isGzip = trimmed.startsWith(CODE_GZIP);
    const b64 = trimmed.slice(5).replace(/\s+/g, '');
    let bytes;
    try {
      bytes = base64ToBytes(b64);
    } catch {
      throw new BackupError("That code looks incomplete. Make sure you copied all of it.");
    }
    if (isGzip) {
      if (!canCompress()) throw new BackupError("This browser can't open compressed codes. Try a backup file instead.");
      try {
        bytes = await streamBytes(bytes, new DecompressionStream('gzip'));
      } catch {
        throw new BackupError("That code looks incomplete. Make sure you copied all of it.");
      }
    }
    json = new TextDecoder().decode(bytes);
  } else if (trimmed.startsWith('{')) {
    json = trimmed;
  } else {
    throw new BackupError("That doesn't look like an Ish backup.");
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError("That backup is damaged and can't be read.");
  }
  if (!raw || typeof raw !== 'object' || (raw.app && raw.app !== 'ish')) {
    throw new BackupError("That doesn't look like an Ish backup.");
  }
  if (!Array.isArray(raw.entries) && !Array.isArray(raw.customFoods)) {
    throw new BackupError("That doesn't look like an Ish backup.");
  }
  if (Number(raw.version) > SCHEMA_VERSION) {
    throw new BackupError('That backup is from a newer version of Ish. Update the app first.');
  }
  return normaliseData(raw);
}

export function summarise(data) {
  const days = data.entries.map((e) => e.day).sort();
  return {
    entries: data.entries.length,
    customFoods: data.customFoods.length,
    days: new Set(days).size,
    firstDay: days[0] || null,
    lastDay: days[days.length - 1] || null,
  };
}

/** Combine two data sets. Things already on this phone win if the same id appears in both. */
export function mergeData(current, incoming) {
  const entryIds = new Set(current.entries.map((e) => e.id));
  const foodIds = new Set(current.customFoods.map((f) => f.id));
  return normaliseData({
    ...current,
    entries: [...current.entries, ...incoming.entries.filter((e) => !entryIds.has(e.id))],
    customFoods: [...current.customFoods, ...incoming.customFoods.filter((f) => !foodIds.has(f.id))],
    favourites: [...new Set([...current.favourites, ...incoming.favourites])],
    meta: { ...current.meta },
  });
}

/** Use the backup as-is, but keep this phone's "already dismissed" hints. */
export function replaceData(current, incoming) {
  return normaliseData({
    ...incoming,
    meta: {
      ...incoming.meta,
      installHintDismissed: current.meta.installHintDismissed,
      lastExport: current.meta.lastExport,
    },
  });
}

export function backupFilename(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `ish-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// ---- Browser helpers (not used in Node tests) ----

/**
 * Save a backup file. Uses the share sheet where it can (so iPhone can Save to Files,
 * AirDrop, or email it to yourself), otherwise a normal download.
 * Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function saveBackupFile(data) {
  const name = backupFilename();
  const text = toJSON(data);
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Ish backup' });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // Fall through to a download if sharing failed for another reason
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}
