import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PlaylistMembershipStore } from "./playlist-membership-store.js";

test("persists membership by account and restores it after store recreation", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-membership-store-"));
  const path = join(root, "private", "memberships.json");
  try {
    const store = new PlaylistMembershipStore(path, 10_000);
    store.set("account-a", "song-1", ["playlist-b", "playlist-a", "playlist-a"], 10_000);
    const restored = new PlaylistMembershipStore(path, 11_000);

    assert.deepEqual(restored.get("account-a", "song-1", 11_000), ["playlist-b", "playlist-a"]);
    assert.equal(restored.get("account-b", "song-1", 11_000), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("expires stale entries and ignores corrupt cache files", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-membership-expiry-"));
  const path = join(root, "memberships.json");
  try {
    const store = new PlaylistMembershipStore(path, 1_000);
    store.set("account-a", "song-1", ["playlist-a"], 1_000);
    const restored = new PlaylistMembershipStore(path, 8 * 24 * 60 * 60 * 1000);
    assert.equal(restored.get("account-a", "song-1", 8 * 24 * 60 * 60 * 1000), null);

    const corruptPath = join(root, "corrupt.json");
    writeFileSync(corruptPath, "not json");
    assert.equal(new PlaylistMembershipStore(corruptPath).get("account-a", "song-1"), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalidates entries per song and clears only the selected account", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-membership-invalidate-"));
  const path = join(root, "memberships.json");
  try {
    const store = new PlaylistMembershipStore(path, 1_000);
    store.set("account-a", "song-1", ["playlist-a"], 1_000);
    store.set("account-a", "song-2", ["playlist-b"], 1_000);
    store.set("account-b", "song-1", ["playlist-c"], 1_000);
    store.invalidate("account-a", "song-1");
    store.clearAccount("account-a");

    assert.equal(store.get("account-a", "song-2", 1_000), null);
    assert.deepEqual(store.get("account-b", "song-1", 1_000), ["playlist-c"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("writes the cache with private directory and file permissions", () => {
  const root = mkdtempSync(join(tmpdir(), "qqmusic-membership-permissions-"));
  const path = join(root, "private", "memberships.json");
  try {
    const store = new PlaylistMembershipStore(path);
    store.set("account-a", "song-1", ["playlist-a"]);
    assert.equal(statSync(join(root, "private")).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
