import assert from "node:assert/strict";
import { test } from "node:test";
import { configurableMenuItems, filterNavigation, isMenuAllowed, parseMenuSelection } from "../src/features/identity/menu-permissions";

const defaults = [{ menuKey: "/stock", isVisible: false }, { menuKey: "/customers", isVisible: true }];

test("unconfigured users inherit global defaults and retain existing default-open behavior", () => {
  assert.equal(isMenuAllowed("SALESPERSON", "/stock", defaults, null), false);
  assert.equal(isMenuAllowed("SALESPERSON", "/customers", defaults, null), true);
  assert.equal(isMenuAllowed("SALESPERSON", "/tax-calculator", defaults, null), true);
});

test("personal allowlists can grant globally hidden menus and deny globally enabled menus", () => {
  assert.equal(isMenuAllowed("SALESPERSON", "/stock", defaults, ["/stock"]), true);
  assert.equal(isMenuAllowed("SALESPERSON", "/customers", defaults, ["/stock"]), false);
  assert.deepEqual(filterNavigation("SALESPERSON", defaults, ["/stock"]).flatMap((g) => g.items.map((i) => i.href)), ["/", "/stock"]);
});

test("empty personal allowlists deny every business menu; reset restores inheritance", () => {
  assert.deepEqual(filterNavigation("SALESPERSON", defaults, []).flatMap((g) => g.items.map((i) => i.href)), ["/"]);
  assert.equal(isMenuAllowed("SALESPERSON", "/customers", defaults, null), true);
  assert.equal(isMenuAllowed("SALESPERSON", "/settings/password", defaults, []), true);
});

test("global edits never change custom allowlists or implicitly grant unselected menus", () => {
  const changed = configurableMenuItems.map((item) => ({ menuKey: item.href, isVisible: false }));
  assert.deepEqual(filterNavigation("SALESPERSON", defaults, ["/stock"]), filterNavigation("SALESPERSON", changed, ["/stock"]));
  assert.equal(isMenuAllowed("SALESPERSON", "/tax-calculator", defaults, ["/stock"]), false);
});

test("admin-only and unknown routes stay forbidden even in a malformed personal allowlist", () => {
  for (const href of ["/users", "/menu-management", "/unknown"]) {
    assert.equal(isMenuAllowed("SALESPERSON", href, [], [href]), false);
  }
  for (const item of configurableMenuItems) assert.equal(isMenuAllowed("SUPER_ADMIN", item.href, defaults, []), true);
  assert.equal(isMenuAllowed("SUPER_ADMIN", "/users", defaults, []), true);
});

test("form validation accepts all-off and rejects unknown, privileged and file values", () => {
  assert.deepEqual(parseMenuSelection([]), []);
  assert.deepEqual(parseMenuSelection(["/stock", "/stock"]), ["/stock"]);
  for (const value of ["/users", "/", "/settings/password", "/unknown", new File(["x"], "menu")]) {
    assert.equal(parseMenuSelection(["/stock", value]), null);
  }
});
