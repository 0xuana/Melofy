import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { QQMusicCredentials } from "@qqmusic-web/provider";

interface StoredSessionV1 {
  readonly version: 1;
  readonly accountId: string;
  readonly accountType: string;
  readonly musicKey: string;
  readonly expiresAt: string;
  readonly refreshKey?: string;
  readonly refreshToken?: string;
  readonly accessToken?: string;
  readonly openId?: string;
  readonly unionId?: string;
  readonly strMusicId?: string;
}

export interface PersistentQQMusicCredentials extends QQMusicCredentials {
  readonly refreshKey?: string;
  readonly refreshToken?: string;
  readonly accessToken?: string;
  readonly openId?: string;
  readonly unionId?: string;
  readonly strMusicId?: string;
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export class SessionStore {
  readonly path: string;

  constructor(path: string) {
    this.path = resolve(path);
  }

  load(): PersistentQQMusicCredentials | null {
    if (!existsSync(this.path)) return null;
    try {
      const value = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredSessionV1>;
      const expiresAt = new Date(value.expiresAt ?? "");
      if (
        value.version !== 1 ||
        !validString(value.accountId) ||
        !validString(value.accountType) ||
        !validString(value.musicKey) ||
        Number.isNaN(expiresAt.valueOf())
      ) return null;

      return {
        accountId: value.accountId,
        accountType: value.accountType,
        musicKey: value.musicKey,
        expiresAt,
        ...(validString(value.refreshKey) ? { refreshKey: value.refreshKey } : {}),
        ...(validString(value.refreshToken) ? { refreshToken: value.refreshToken } : {}),
        ...(validString(value.accessToken) ? { accessToken: value.accessToken } : {}),
        ...(validString(value.openId) ? { openId: value.openId } : {}),
        ...(validString(value.unionId) ? { unionId: value.unionId } : {}),
        ...(validString(value.strMusicId) ? { strMusicId: value.strMusicId } : {}),
      };
    } catch {
      return null;
    }
  }

  save(credentials: PersistentQQMusicCredentials): void {
    const parent = dirname(this.path);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    chmodSync(parent, 0o700);
    const temporary = `${this.path}.${process.pid}.tmp`;
    const value: StoredSessionV1 = {
      version: 1,
      accountId: credentials.accountId,
      accountType: credentials.accountType,
      musicKey: credentials.musicKey,
      expiresAt: credentials.expiresAt.toISOString(),
      ...(credentials.refreshKey ? { refreshKey: credentials.refreshKey } : {}),
      ...(credentials.refreshToken ? { refreshToken: credentials.refreshToken } : {}),
      ...(credentials.accessToken ? { accessToken: credentials.accessToken } : {}),
      ...(credentials.openId ? { openId: credentials.openId } : {}),
      ...(credentials.unionId ? { unionId: credentials.unionId } : {}),
      ...(credentials.strMusicId ? { strMusicId: credentials.strMusicId } : {}),
    };
    try {
      writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      renameSync(temporary, this.path);
      chmodSync(this.path, 0o600);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}
