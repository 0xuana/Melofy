import assert from "node:assert/strict";
import test from "node:test";
import { defaultPlaylist, isPlaylistActive, normalizePath, playlistSelectionPath, resolvePath, shouldShowPlaylistNavigation } from "./navigation.js";

test("login, account profile, and discovery use standalone browser routes", () => {
  assert.equal(resolvePath("/", false), "/login");
  assert.equal(resolvePath("/profile", false), "/login");
  assert.equal(resolvePath("/login", true), "/");
  assert.equal(resolvePath("/profile", true), "/profile");
  assert.equal(resolvePath("/discover", true), "/discover");
  assert.equal(resolvePath("/discover", false), "/login");
  assert.equal(normalizePath("/discover"), "/discover");
  assert.equal(normalizePath("/unknown"), "/");
});

test("the root URL is Favorites by default and Discover is the only content route", () => {
  const liked = { id: "liked", kind: "liked" };
  const created = { id: "created", kind: "created" };
  assert.equal(resolvePath("/", true), "/");
  assert.deepEqual(defaultPlaylist([created, liked]), liked);
  assert.deepEqual(defaultPlaylist([created]), created);
  assert.equal(defaultPlaylist([]), null);
  assert.equal(shouldShowPlaylistNavigation("/"), true);
  assert.equal(shouldShowPlaylistNavigation("/discover"), false);
});

test("playlist navigation is inactive on Discover and selected playlist can return to root", () => {
  const playlist = { id: "playlist-1", kind: "created" };
  assert.equal(isPlaylistActive("/discover", playlist, playlist), false);
  assert.equal(isPlaylistActive("/", playlist, playlist), true);
  assert.equal(playlistSelectionPath("/discover"), "/");
  assert.equal(playlistSelectionPath("/"), "/");
});
