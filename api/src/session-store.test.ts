import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SessionStore } from "./session-store.js";

test("persists credentials atomically with private permissions", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-session-store-"));
  const path = join(root, "private", "session.json");
  const store = new SessionStore(path);
  try {
    store.save({
      accountId: "12345",
      accountType: "qq",
      musicKey: "secret",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      refreshKey: "refresh-key",
      refreshToken: "refresh-token",
    });
    assert.deepEqual(store.load(), {
      accountId: "12345",
      accountType: "qq",
      musicKey: "secret",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      refreshKey: "refresh-key",
      refreshToken: "refresh-token",
    });
    assert.equal(statSync(join(root, "private")).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(path, "utf8"), /undefined/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects malformed sessions and clears saved credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-session-invalid-"));
  const path = join(root, "session.json");
  const store = new SessionStore(path);
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, accountId: "123" }));
    assert.equal(store.load(), null);
    store.clear();
    assert.equal(store.load(), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
