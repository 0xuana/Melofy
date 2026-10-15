import assert from "node:assert/strict";
import test from "node:test";
import { applyThemePreferences, loadThemePreferences, saveThemePreferences } from "./themePreferences.js";

function createStorage(value = null) {
  let saved = value;
  return {
    getItem: () => saved,
    setItem: (_key, next) => { saved = next; },
  };
}

test("theme and browser-follow preferences persist locally", () => {
  const storage = createStorage();
  const preferences = { theme: "orange", followSystem: false };
  saveThemePreferences(preferences, storage);

  assert.deepEqual(loadThemePreferences(storage), preferences);
});

test("invalid or missing theme settings use defaults", () => {
  assert.deepEqual(loadThemePreferences(createStorage('{"theme":"blue","followSystem":"yes"}')), {
    theme: "pink",
    followSystem: true,
  });
});

test("preferences are applied to root data attributes", () => {
  const root = { dataset: {} };
  applyThemePreferences(root, { theme: "green", followSystem: true });
  assert.deepEqual(root.dataset, { theme: "green", followSystem: "true" });
});
