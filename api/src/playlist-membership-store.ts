import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface MembershipEntry {
  readonly accountId: string;
  readonly trackId: string;
  readonly playlistIds: readonly string[];
  readonly savedAt: number;
}

interface MembershipFileV1 {
  readonly version: 1;
  readonly entries: readonly MembershipEntry[];
}

const cacheLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const maxEntries = 50_000;

function validEntry(value: unknown): value is MembershipEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<MembershipEntry>;
  return typeof entry.accountId === "string" && typeof entry.trackId === "string"
    && Array.isArray(entry.playlistIds) && entry.playlistIds.every((id) => typeof id === "string")
    && typeof entry.savedAt === "number" && Number.isFinite(entry.savedAt);
}

export class PlaylistMembershipStore {
  readonly path: string;
  readonly #entries = new Map<string, MembershipEntry>();

  constructor(path: string, now = Date.now()) {
    this.path = resolve(path);
    if (!existsSync(this.path)) return;
    try {
      const value = JSON.parse(readFileSync(this.path, "utf8")) as Partial<MembershipFileV1>;
      if (value.version !== 1 || !Array.isArray(value.entries)) return;
      for (const entry of value.entries) {
        if (!validEntry(entry) || now - entry.savedAt > cacheLifetimeMs || entry.savedAt > now + 60_000) continue;
        this.#entries.set(this.#key(entry.accountId, entry.trackId), entry);
      }
    } catch {
      // A corrupt or interrupted cache is a miss; the live provider can rebuild it.
    }
  }

  get(accountId: string, trackId: string, now = Date.now()): readonly string[] | null {
    const key = this.#key(accountId, trackId);
    const entry = this.#entries.get(key);
    if (!entry) return null;
    if (now - entry.savedAt > cacheLifetimeMs || entry.savedAt > now + 60_000) {
      this.#entries.delete(key);
      this.#save();
      return null;
    }
    return [...entry.playlistIds];
  }

  set(accountId: string, trackId: string, playlistIds: readonly string[], now = Date.now()): void {
    this.#entries.set(this.#key(accountId, trackId), { accountId, trackId, playlistIds: [...new Set(playlistIds)], savedAt: now });
    this.#prune(now);
    this.#save();
  }

  invalidate(accountId: string, trackId: string): void {
    if (this.#entries.delete(this.#key(accountId, trackId))) this.#save();
  }

  clearAccount(accountId: string): void {
    let changed = false;
    for (const [key, entry] of this.#entries) {
      if (entry.accountId !== accountId) continue;
      this.#entries.delete(key);
      changed = true;
    }
    if (changed) this.#save();
  }

  #key(accountId: string, trackId: string): string {
    return JSON.stringify([accountId, trackId]);
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) if (now - entry.savedAt > cacheLifetimeMs) this.#entries.delete(key);
    if (this.#entries.size <= maxEntries) return;
    const oldest = [...this.#entries.entries()].sort((left, right) => left[1].savedAt - right[1].savedAt);
    for (const [key] of oldest.slice(0, this.#entries.size - maxEntries)) this.#entries.delete(key);
  }

  #save(): void {
    const parent = dirname(this.path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
    const temporary = `${this.path}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify({ version: 1, entries: [...this.#entries.values()] } satisfies MembershipFileV1)}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporary, this.path);
      chmodSync(this.path, 0o600);
    } finally { rmSync(temporary, { force: true }); }
  }
}
