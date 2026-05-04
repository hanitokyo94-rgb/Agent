import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../data");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function filePath(name: string) {
  ensureDir(DATA_DIR);
  return path.join(DATA_DIR, `${name}.json`);
}

export function readCollection<T>(name: string): T[] {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as T[];
  } catch {
    return [];
  }
}

export function writeCollection<T>(name: string, data: T[]): void {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

export function findById<T extends { id: string }>(name: string, id: string): T | undefined {
  return readCollection<T>(name).find((x) => x.id === id);
}

export function insertRecord<T extends { id: string }>(name: string, record: T): T {
  const col = readCollection<T>(name);
  col.push(record);
  writeCollection(name, col);
  return record;
}

export function updateRecord<T extends { id: string }>(name: string, id: string, patch: Partial<T>): T | null {
  const col = readCollection<T>(name);
  const idx = col.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  col[idx] = { ...col[idx], ...patch };
  writeCollection(name, col);
  return col[idx];
}

export function deleteRecord(name: string, id: string): boolean {
  const col = readCollection<{ id: string }>(name);
  const filtered = col.filter((x) => x.id !== id);
  if (filtered.length === col.length) return false;
  writeCollection(name, filtered);
  return true;
}

export function findWhere<T>(name: string, predicate: (item: T) => boolean): T[] {
  return readCollection<T>(name).filter(predicate);
}

const UPLOADS_DIR = path.resolve(__dirname, "../../../../data/uploads");

export function getUploadsDir(): string {
  ensureDir(UPLOADS_DIR);
  return UPLOADS_DIR;
}
