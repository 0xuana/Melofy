import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { inspectInstalledProfile, loadInstalledSession } from "./index.js";

test("reports profile structure without returning credential values", () => {
  const profilePath = mkdtempSync(join(tmpdir(), "qqmusic-profile-"));
  writeFileSync(join(profilePath, "settings.json"), JSON.stringify({ login_data: "private-token", volume: 0.8 }));
  mkdirSync(join(profilePath, "IndexedDB", "https_xui.ptlogin2.qq.com_0.indexeddb.leveldb"), { recursive: true });

  const database = new DatabaseSync(join(profilePath, "Cookies"));
  database.exec("CREATE TABLE cookies(host_key TEXT, name TEXT, value TEXT)");
  database.prepare("INSERT INTO cookies VALUES (?, ?, ?)").run(".qq.com", "secret", "credential-value");
  database.close();

  const summary = inspectInstalledProfile(profilePath);
  assert.equal(summary.hasLoginData, true);
  assert.deepEqual(summary.settingKeys, ["login_data", "volume"]);
  assert.deepEqual(summary.cookieDomains, [{ domain: ".qq.com", count: 1 }]);
  assert.deepEqual(summary.indexedDbOrigins, ["https_xui.ptlogin2.qq.com_0"]);
  assert.doesNotMatch(JSON.stringify(summary), /private-token|credential-value|secret/);
});

test("loads the minimum installed session for server-side use", () => {
  const profilePath = mkdtempSync(join(tmpdir(), "qqmusic-profile-session-test-"));
  try {
    writeFileSync(
      join(profilePath, "settings.json"),
      JSON.stringify({
        login_data: {
          accountType: "qq",
          musicId: 12345,
          musicKey: "private-token",
          tokenExpired: 1_800_000_000,
        },
      }),
    );

    assert.deepEqual(loadInstalledSession(profilePath), {
      accountId: "12345",
      accountType: "qq",
      musicKey: "private-token",
      expiresAt: new Date(1_800_000_000_000),
    });
  } finally {
    rmSync(profilePath, { recursive: true, force: true });
  }
});
