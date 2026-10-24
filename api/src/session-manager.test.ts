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

test("restores a WeChat QQMusic session as a WeChat login after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-wechat-session-"));
  const store = new SessionStore(join(root, "session.json"));
  const credentials = {
    accountId: "123456",
    accountType: "wx",
    musicKey: "W_X_persistent-secret",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    refreshKey: "refresh-key",
    refreshToken: "refresh-token",
  };
  try {
    const firstRun = new SessionManager(store, null, async () => {});
    await firstRun.setCredentials(credentials);
    assert.deepEqual(await firstRun.provider()?.getSession(), {
      accountId: "123456",
      provider: "wechat",
      expiresAt: "2030-01-01T00:00:00.000Z",
      avatarUrl: null,
    });

    const restarted = new SessionManager(store);
    assert.deepEqual(await restarted.provider()?.getSession(), await firstRun.provider()?.getSession());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("same-account reauthentication updates credentials without replacing the active provider", async () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-session-reauth-"));
  const store = new SessionStore(join(root, "session.json"));
  store.save({ accountId: "123456", accountType: "qq", musicKey: "old-key", expiresAt: new Date("2030-01-01T00:00:00.000Z") });
  try {
    const sessions = new SessionManager(store, null, async () => {});
    const providerBeforeLogin = sessions.provider();
    await sessions.setCredentials({ accountId: "123456", accountType: "qq", musicKey: "new-key", expiresAt: new Date("2030-02-01T00:00:00.000Z") });

    assert.equal(sessions.provider(), providerBeforeLogin);
    assert.equal((await sessions.provider()?.getSession())?.expiresAt, "2030-02-01T00:00:00.000Z");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("does not persist QR credentials when QQMusic profile validation fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-session-validation-"));
  const store = new SessionStore(join(root, "session.json"));
  const credentials = {
    accountId: "123456",
    accountType: "qq",
    musicKey: "candidate-key",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  };
  try {
    const sessions = new SessionManager(store, null, async () => { throw new Error("QQMusic profile rejected the session"); });
    await assert.rejects(sessions.setCredentials(credentials), /profile rejected/);
    assert.equal(store.load(), null);
    assert.equal(sessions.provider(), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
