import assert from "node:assert/strict";
import test from "node:test";
import { normalizePath, resolvePath } from "./navigation.js";

test("login and account profile use standalone browser routes", () => {
  assert.equal(resolvePath("/", false), "/login");
  assert.equal(resolvePath("/profile", false), "/login");
  assert.equal(resolvePath("/login", true), "/");
  assert.equal(resolvePath("/profile", true), "/profile");
  assert.equal(normalizePath("/unknown"), "/");
});
