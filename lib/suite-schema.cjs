const fail = (m) => Object.assign(new Error(m), { status: 400 });
const assertions = new Set([
  "expectText",
  "expectVisible",
  "expectTextExact",
  "expectValue",
  "expectCount",
  "expectURL",
]);
const roles = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "heading",
  "dialog",
  "alert",
  "status",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
  "tab",
  "tabpanel",
  "menu",
  "menuitem",
  "img",
  "spinbutton",
  "switch",
  "searchbox",
  "slider",
  "progressbar",
]);
function keys(obj, allowed) {
  if (
    !obj ||
    typeof obj !== "object" ||
    Array.isArray(obj) ||
    Object.keys(obj).some((k) => !allowed.includes(k))
  )
    throw fail("Unsupported or unknown fields.");
}
function text(v, max = 1000, empty = false) {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    throw fail("Invalid bounded text.");
  return v;
}
function validateLocator(raw) {
  keys(raw, ["kind", "value", "role", "exact", "formIndex"]);
  if (
    !["role", "label", "text", "testId", "placeholder"].includes(raw.kind) ||
    raw.exact !== true
  )
    throw fail("Use an exact structured locator.");
  text(raw.value, 160);
  if (
    raw.formIndex !== undefined &&
    (!Number.isInteger(raw.formIndex) ||
      raw.formIndex < 0 ||
      raw.formIndex > 100)
  )
    throw fail("Invalid form scope.");
  if (raw.kind === "role" && !roles.has(raw.role))
    throw fail("Unsupported role.");
  if (raw.kind !== "role" && raw.role !== undefined)
    throw fail("Role only applies to role locators.");
  return { ...raw };
}
function url(v, target) {
  let u;
  try {
    u = new URL(v);
  } catch {
    throw fail("Invalid URL.");
  }
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.origin !== new URL(target).origin ||
    u.username ||
    u.password
  )
    throw fail("Navigation must stay on target origin.");
  return v;
}
function normalizeSteps(raw, target) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 12)
    throw fail("Provide 1–12 automation actions.");
  const seen = new Set();
  const result = raw.map((s, i) => {
    keys(s, ["stepId", "op", "value", "label", "text", "locator"]);
    const stepId = s.stepId === undefined ? `s${i + 1}` : text(s.stepId, 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(stepId) || seen.has(stepId))
      throw fail("Duplicate or invalid step ID.");
    seen.add(stepId);
    const r = { stepId, op: s.op };
    if (["navigate", "clickText", "expectText"].includes(s.op)) {
      if (
        s.locator !== undefined ||
        s.label !== undefined ||
        s.text !== undefined
      )
        throw fail("Unknown operation fields.");
      r.value = text(s.value);
      if (s.op === "navigate") url(r.value, target);
    } else if (s.op === "fillLabel") {
      if (s.value !== undefined || s.locator !== undefined)
        throw fail("Unknown operation fields.");
      r.label = text(s.label, 160);
      r.text = text(s.text, 1000, true);
    } else if (
      [
        "click",
        "fill",
        "expectVisible",
        "expectTextExact",
        "expectValue",
        "expectCount",
      ].includes(s.op)
    ) {
      if (s.label !== undefined || s.text !== undefined)
        throw fail("Unknown operation fields.");
      r.locator = validateLocator(s.locator);
      if (s.op === "expectCount") {
        if (!Number.isInteger(s.value) || s.value < 0 || s.value > 1000)
          throw fail("Invalid count.");
        r.value = s.value;
      } else if (["fill", "expectValue", "expectTextExact"].includes(s.op))
        r.value = text(s.value, 1000, true);
      else if (s.value !== undefined) throw fail("Unexpected value.");
    } else if (s.op === "expectURL") {
      if (
        s.locator !== undefined ||
        s.label !== undefined ||
        s.text !== undefined
      )
        throw fail("Unknown operation fields.");
      r.value = url(text(s.value), target);
    } else throw fail("Unsupported automation action.");
    return r;
  });
  if (!result.some((s) => assertions.has(s.op)))
    throw fail("No observable assertion supplied.");
  if (!result.some((s) => s.op === "navigate")) {
    let stepId = "navigate";
    while (seen.has(stepId)) stepId += "0";
    result.unshift({ stepId, op: "navigate", value: url(target, target) });
  }
  if (result.length > 12) throw fail("Too many actions after navigation.");
  return result;
}
module.exports = { normalizeSteps, validateLocator, keys, text, assertions };
