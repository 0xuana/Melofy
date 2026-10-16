import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const stylesheet = postcss.parse(css);

function findRule(selector) {
  let result;
  stylesheet.walkRules((rule) => {
    if (rule.selector === selector && rule.nodes.some((node) => node.type === "decl")) result = rule;
  });
  return result;
}

function declaration(rule, property) {
  return rule?.nodes?.find((node) => node.type === "decl" && node.prop === property)?.value;
}

function findRuleWithDeclaration(selector, property) {
  let result;
  stylesheet.walkRules((rule) => {
    if (rule.selector === selector && declaration(rule, property) !== undefined) result = rule;
  });
  return result;
}

test("dark hover colors come from theme-aware interaction tokens", () => {
  const expectations = [
    [".topbar-actions .icon-button.active, .topbar-actions .icon-button:hover", "--interaction-hover"],
    [".account-action:hover:not(:disabled)", "--interaction-hover"],
    [".nav:hover", "--hover-color"],
    [".queue-row:hover", "--hover-color"],
  ];

  for (const [selector, token] of expectations) {
    const rule = findRule(selector);
    assert.ok(rule, `expected hover rule ${selector}`);
    assert.equal(declaration(rule, "background"), `var(${token})`, `${selector} should use ${token}`);
  }
});

test("each color theme declares a distinct dark palette", () => {
  const expected = new Map([
    [":root[data-scheme=\"dark\"]", "#18151b"],
    [":root[data-theme=\"orange\"][data-scheme=\"dark\"]", "#1b1813"],
    [":root[data-theme=\"green\"][data-scheme=\"dark\"]", "#141a17"],
    [":root[data-theme=\"blue\"][data-scheme=\"dark\"]", "#14181d"],
  ]);
  for (const [selector, background] of expected) {
    assert.equal(declaration(findRule(selector), "--background-color"), background, `${selector} background`);
  }
});

test("dark track hover does not force a light surface", () => {
  const rule = findRule(':root[data-scheme="dark"] .track:hover');
  assert.ok(rule, "dark track hover override is required");
  assert.equal(declaration(rule, "background"), "var(--hover-color)");
});

test("the unplayed progress track is sourced from each light theme palette", () => {
  const palettes = [
    [":root", "#f0dfe7"],
    [":root[data-theme=\"orange\"]", "#f0dfcd"],
    [":root[data-theme=\"green\"]", "#d9eadf"],
    [":root[data-theme=\"blue\"]", "#d8e6f2"],
  ];
  for (const [selector, color] of palettes) {
    assert.equal(declaration(findRuleWithDeclaration(selector, "--progress-track"), "--progress-track"), color, `${selector} progress track`);
  }
  assert.equal(declaration(findRule(".progress::before"), "background"), "var(--progress-track)");
});

test("the now-playing cover has a visible accent hover state in dark mode", () => {
  const rule = findRule(':root[data-scheme="dark"] .mini-cover:hover:not(:disabled)');
  assert.ok(rule, "dark now-playing cover hover override is required");
  assert.equal(declaration(rule, "border-color"), "var(--color-primary)");
  assert.match(declaration(rule, "box-shadow"), /color-mix\(in srgb, var\(--primary-color\)/);
});

test("dark shortcut and account buttons retain their hover treatment", () => {
  const shortcutRule = findRule(':root[data-scheme="dark"] .list-shortcuts .icon-button:hover');
  const accountRule = findRule(':root[data-scheme="dark"] .topbar-actions .account-trigger:hover');
  assert.equal(declaration(shortcutRule, "background"), "var(--interaction-hover)");
  assert.equal(declaration(shortcutRule, "border-color"), "var(--interaction-hover-border)");
  assert.equal(declaration(accountRule, "background"), "var(--interaction-hover)");
  assert.equal(declaration(accountRule, "border-color"), "var(--interaction-hover-border)");
});
