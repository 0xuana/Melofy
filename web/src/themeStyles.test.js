import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const stylesheet = postcss.parse(css);

function findRule(selector) {
  let result;
  stylesheet.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ").trim() === selector.replace(/\s+/g, " ").trim() && rule.nodes.some((node) => node.type === "decl")) result = rule;
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

test("dark current-track hover overrides the generic dark track hover", () => {
  const rule = findRule(':root[data-scheme="dark"] .track.is-current:hover, :root[data-scheme="dark"] .track.is-current:focus-within, :root[data-scheme="dark"] .queue-row.current:hover, :root[data-scheme="dark"] .queue-row.current:focus-within');
  assert.ok(rule, "dark current-track and queue hover override is required");
  assert.equal(declaration(rule, "background"), "var(--current-hover-surface)");
  assert.equal(declaration(rule, "border-color"), "var(--interaction-hover-border)");
  assert.match(declaration(rule, "box-shadow"), /color-mix\(in srgb, var\(--primary-color\)/);
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

test("the dark hero's circular glow uses the selected theme accent instead of white", () => {
  const rule = findRule(':root[data-scheme="dark"] .hero::after');
  assert.ok(rule, "dark decorative hero glow override is required");
  assert.match(declaration(rule, "background"), /var\(--primary-color\)/);
  assert.doesNotMatch(declaration(rule, "background"), /rgba\(255,255,255/);
});

test("playlist cover shadow follows the theme and remains visible in dark mode", () => {
  assert.match(declaration(findRuleWithDeclaration(".cover", "box-shadow"), "box-shadow"), /var\(--primary-color\)/);
  const darkRule = findRule(':root[data-scheme="dark"] .cover');
  assert.ok(darkRule, "dark playlist cover shadow override is required");
  assert.match(declaration(darkRule, "box-shadow"), /var\(--primary-color\)/);
  assert.match(declaration(darkRule, "box-shadow"), /rgba\(0,\s*0,\s*0/);
});

test("playlist add-menu errors stay pinned and menu content cannot scroll horizontally", () => {
  const menu = findRule(".add-menu");
  assert.equal(declaration(menu, "overflow-x"), "hidden");
  const error = findRule(".add-menu-error");
  assert.ok(error, "add error needs a dedicated visible treatment");
  assert.equal(declaration(error, "position"), "sticky");
  assert.equal(declaration(error, "top"), "0");
});

test("unplayable track indicators derive from the selected theme in light and dark modes", () => {
  for (const token of ["--unplayable-text", "--unplayable-surface", "--unplayable-border"]) {
    const light = declaration(findRuleWithDeclaration(":root", token), token);
    const dark = declaration(findRuleWithDeclaration(':root[data-scheme="dark"]', token), token);
    assert.match(light, /var\(--color-primary\)|var\(--primary-color\)/, `${token} follows the selected light palette`);
    assert.match(dark, /var\(--color-primary\)|var\(--primary-color\)/, `${token} follows the selected dark palette`);
  }
  assert.equal(declaration(findRule(".unplayable-badge"), "color"), "var(--unplayable-text)");
  assert.equal(declaration(findRule(".track.is-unplayable:not(.is-current)"), "background"), "var(--unplayable-surface)");
});

test("dark shortcut and account buttons retain their hover treatment", () => {
  const shortcutRule = findRule(':root[data-scheme="dark"] .list-shortcuts .icon-button:hover');
  const accountRule = findRule(':root[data-scheme="dark"] .topbar-actions .account-trigger:hover');
  assert.equal(declaration(shortcutRule, "background"), "var(--interaction-hover)");
  assert.equal(declaration(shortcutRule, "border-color"), "var(--interaction-hover-border)");
  assert.equal(declaration(accountRule, "background"), "var(--interaction-hover)");
  assert.equal(declaration(accountRule, "border-color"), "var(--interaction-hover-border)");
});
