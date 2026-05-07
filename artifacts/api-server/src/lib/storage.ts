import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), "../../agentdata");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function filePath(name: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${name}.json`);
}

// ── Write lock: serialize all writes per-collection to prevent corruption ──
const writeLocks = new Map<string, Promise<void>>();

function withLock(name: string, fn: () => void): void {
  const prev = writeLocks.get(name) ?? Promise.resolve();
  const next = prev.then(() => {
    try { fn(); } catch (e) { /* swallow — caller handles */ throw e; }
  }).catch(() => {});
  writeLocks.set(name, next);
}

// Atomic write: write to .tmp then rename so readers never see partial data
function atomicWrite(fp: string, data: string): void {
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, data, "utf-8");
  fs.renameSync(tmp, fp);
}

export function readCollection<T>(name: string): T[] {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, "utf-8").trim();
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    // Try to recover from .tmp backup
    const tmp = fp + ".tmp";
    if (fs.existsSync(tmp)) {
      try { return JSON.parse(fs.readFileSync(tmp, "utf-8")) as T[]; } catch {}
    }
    return [];
  }
}

export function writeCollection<T>(name: string, data: T[]): void {
  const fp = filePath(name);
  atomicWrite(fp, JSON.stringify(data, null, 2));
}

export function findById<T extends { id: string }>(name: string, id: string): T | undefined {
  return readCollection<T>(name).find((x) => x.id === id);
}

export function insertRecord<T extends { id: string }>(name: string, record: T): T {
  const fp = filePath(name);
  const col = readCollection<T>(name);
  col.push(record);
  atomicWrite(fp, JSON.stringify(col, null, 2));
  return record;
}

export function updateRecord<T extends { id: string }>(name: string, id: string, patch: Partial<T>): T | null {
  const fp = filePath(name);
  const col = readCollection<T>(name);
  const idx = col.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  col[idx] = { ...col[idx], ...patch };
  atomicWrite(fp, JSON.stringify(col, null, 2));
  return col[idx];
}

// Upsert: insert if not found, update if found — used for incremental message saves
export function upsertRecord<T extends { id: string }>(name: string, record: T): T {
  const fp = filePath(name);
  const col = readCollection<T>(name);
  const idx = col.findIndex((x) => x.id === record.id);
  if (idx === -1) {
    col.push(record);
  } else {
    col[idx] = { ...col[idx], ...record };
  }
  atomicWrite(fp, JSON.stringify(col, null, 2));
  return record;
}

export function deleteRecord(name: string, id: string): boolean {
  const fp = filePath(name);
  const col = readCollection<{ id: string }>(name);
  const filtered = col.filter((x) => x.id !== id);
  if (filtered.length === col.length) return false;
  atomicWrite(fp, JSON.stringify(filtered, null, 2));
  return true;
}

export function findWhere<T>(name: string, predicate: (item: T) => boolean): T[] {
  return readCollection<T>(name).filter(predicate);
}

const UPLOADS_DIR = path.resolve(process.cwd(), "../../agentdata/uploads");

export function getUploadsDir(): string {
  ensureDir(UPLOADS_DIR);
  return UPLOADS_DIR;
}

export function getDataDir(): string {
  ensureDir(DATA_DIR);
  return DATA_DIR;
}
