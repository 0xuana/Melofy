import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionManager } from "./session-manager.js";
import { SessionStore } from "./session-store.js";

test("imports the installed session once and restores it after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-session-manager-"));
  const store = new SessionStore(join(root, "session.json"));
  const imported = {
    accountId: "9988",
    accountType: "qq",
    musicKey: "persistent-secret",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  };
  try {
    const firstRun = new SessionManager(store, imported);
    assert.deepEqual(await firstRun.provider()?.getSession(), {
      accountId: "9988",
      provider: "qq",
      expiresAt: "2030-01-01T00:00:00.000Z",
      avatarUrl: null,
    });

    const restarted = new SessionManager(store);
    assert.deepEqual(await restarted.provider()?.getSession(), await firstRun.provider()?.getSession());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
