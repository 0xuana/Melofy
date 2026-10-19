import assert from "node:assert/strict";
import test from "node:test";
import { addablePlaylists, calculateAddMenuPosition, isPlaylistDestinationUnavailable, shouldCloseAddMenu } from "./addMenu.js";

test("outside clicks close the add menu while clicks inside any track add control keep it open", () => {
  assert.equal(shouldCloseAddMenu({ closest: () => null }), true);
  assert.equal(shouldCloseAddMenu({ closest: (selector) => selector === ".track-add-control" }), false);
});

test("existing tracks and read-only playlists cannot be add destinations", () => {
  const writable = { id: "p1", kind: "created" };
  const collected = { id: "p2", kind: "collected" };
  assert.equal(isPlaylistDestinationUnavailable(writable, new Set(), false, false), false);
  assert.equal(isPlaylistDestinationUnavailable(writable, new Set(["p1"]), false, false), true);
  assert.equal(isPlaylistDestinationUnavailable(collected, new Set(), false, false), true);
  assert.equal(isPlaylistDestinationUnavailable(writable, new Set(), true, false), true);
});

test("add menus omit read-only collected playlists entirely", () => {
  const playlists = [{ id: "liked", kind: "liked" }, { id: "mine", kind: "created" }, { id: "shared", kind: "collected" }];
  assert.deepEqual(addablePlaylists(playlists).map((playlist) => playlist.id), ["liked", "mine"]);
});

test("add menu stays left of its trigger and fully inside the safe viewport", () => {
  const position = calculateAddMenuPosition(
    { left: 720, top: 300, height: 36 },
    { width: 258, height: 500 },
    { width: 900, height: 900 },
    72,
    650,
  );
  assert.deepEqual(position, { left: 454, top: 98, width: 258, maxHeight: 440 });
  assert.ok(position.left + position.width < 720);
  assert.ok(position.top >= 72 && position.top + position.maxHeight <= 650);
});

test("add menu narrows to available left space and caps height on small windows", () => {
  const position = calculateAddMenuPosition(
    { left: 150, top: 500, height: 32 },
    { width: 258, height: 420 },
    { width: 390, height: 400 },
    60,
    340,
  );
  assert.equal(position.left, 8);
  assert.equal(position.width, 134);
  assert.equal(position.top, 60);
  assert.equal(position.maxHeight, 280);
});
