import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface CookieDomainSummary {
  readonly domain: string;
  readonly count: number;
}

export interface InstalledProfileSummary {
  readonly profilePath: string;
  readonly exists: boolean;
  readonly hasLoginData: boolean;
  readonly settingKeys: readonly string[];
  readonly cookieDomains: readonly CookieDomainSummary[];
  readonly indexedDbOrigins: readonly string[];
}

export interface InstalledQQMusicSession {
  readonly accountId: string;
  readonly accountType: string;
  readonly musicKey: string;
  readonly expiresAt: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadInstalledSession(inputPath: string): InstalledQQMusicSession | null {
  const settingsPath = join(resolve(inputPath), "settings.json");
  if (!existsSync(settingsPath)) return null;

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
    if (!isRecord(settings) || !isRecord(settings.login_data)) return null;

    const login = settings.login_data;
    if (
      typeof login.musicId !== "number" ||
      !Number.isSafeInteger(login.musicId) ||
      typeof login.musicKey !== "string" ||
      login.musicKey.length === 0 ||
      typeof login.accountType !== "string" ||
      typeof login.tokenExpired !== "number"
    ) {
      return null;
    }

    return {
      accountId: String(login.musicId),
      accountType: login.accountType,
      musicKey: login.musicKey,
      expiresAt: new Date(login.tokenExpired * 1_000),
    };
  } catch {
    return null;
  }
}

function inspectSettings(profilePath: string): { hasLoginData: boolean; settingKeys: string[] } {
  const settingsPath = join(profilePath, "settings.json");
  if (!existsSync(settingsPath)) return { hasLoginData: false, settingKeys: [] };

  try {
    const value = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { hasLoginData: false, settingKeys: [] };
    }

    const settingKeys = Object.keys(value).sort();
    return { hasLoginData: settingKeys.includes("login_data"), settingKeys };
  } catch {
    return { hasLoginData: false, settingKeys: [] };
  }
}

function inspectCookieDomains(profilePath: string): CookieDomainSummary[] {
  const cookiePath = join(profilePath, "Cookies");
  if (!existsSync(cookiePath)) return [];

  try {
    const database = new DatabaseSync(cookiePath, { readOnly: true });
    try {
      return database
        .prepare("SELECT host_key AS domain, COUNT(*) AS count FROM cookies GROUP BY host_key ORDER BY host_key")
        .all()
        .flatMap((row) =>
          typeof row.domain === "string" && typeof row.count === "number"
            ? [{ domain: row.domain, count: row.count }]
            : [],
        );
    } finally {
      database.close();
    }
  } catch {
    return [];
  }
}

function inspectIndexedDbOrigins(profilePath: string): string[] {
  const indexedDbPath = join(profilePath, "IndexedDB");
  if (!existsSync(indexedDbPath)) return [];

  try {
    return readdirSync(indexedDbPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".indexeddb.leveldb"))
      .map((entry) => entry.name.replace(/\.indexeddb\.leveldb$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export function inspectInstalledProfile(inputPath: string): InstalledProfileSummary {
  const profilePath = resolve(inputPath);
  if (!existsSync(profilePath)) {
    return {
      profilePath,
      exists: false,
      hasLoginData: false,
      settingKeys: [],
      cookieDomains: [],
      indexedDbOrigins: [],
    };
  }

  const settings = inspectSettings(profilePath);
  return {
    profilePath,
    exists: true,
    hasLoginData: settings.hasLoginData,
    settingKeys: settings.settingKeys,
    cookieDomains: inspectCookieDomains(profilePath),
    indexedDbOrigins: inspectIndexedDbOrigins(profilePath),
  };
}
