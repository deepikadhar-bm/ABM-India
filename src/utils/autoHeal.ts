// ============================================================================
//  AUTO-HEAL ENGINE v4 — Runtime DOM Recovery + Playwright Smart Healing
// ----------------------------------------------------------------------------
//  FLOW:
//    Primary → getByRole → getByLabel → getByPlaceholder → getByText
//    → CSS → XPath → DOM Similarity → Relative XPath → Position → Fail
//
//  RULE: if multiple elements match the same strategy → take .first()
// ============================================================================

import { Locator, Page } from "@playwright/test";
import { logger }        from "../helpers/logger";

type PlaywrightRole = Parameters<Page["getByRole"]>[0];

export type HealStrategy =
  | "primary"
  | "getByRole"
  | "getByLabel"
  | "getByPlaceholder"
  | "getByText"
  | "css"
  | "xpath"
  | "dom"
  | "relative-xpath"
  | "position";

export interface HealResult {
  locator:    Locator;
  healed:     boolean;
  strategy:   HealStrategy;
  selector?:  string;
  confidence: number;
}

export interface HealContext {
  testName:  string;
  testFile:  string;
  pomMethod: string;
  pageUrl:   string;
  pomFile?:  string;
  pomLine?:  number;
}

interface RuntimeHints {
  raw:              string;
  selector?:        string;
  tag?:             string;
  attributes:       Record<string, string>;
  role?:            PlaywrightRole;
  name?:            string;
  label?:           string;
  placeholder?:     string;
  texts:            string[];
  cssSelectors:     string[];
  xpathSelectors:   string[];
  lastKnownBounds?: { x: number; y: number; width: number; height: number };
}

interface HealingAttempt {
  strategy:   Exclude<HealStrategy, "primary">;
  locator:    Locator;
  selector:   string;
  confidence: number;
}

// ── Confidence per strategy ───────────────────────────────────────────────────
const STRATEGY_CONFIDENCE: Record<Exclude<HealStrategy, "primary">, number> = {
  getByRole:        0.90,
  getByLabel:       0.85,
  getByPlaceholder: 0.80,
  getByText:        0.75,
  css:              0.70,
  xpath:            0.65,
  dom:              0.60,
  "relative-xpath": 0.35,  // kept in type only — disabled in execution
  position:         0.25,
};

// ✅ Increased timeouts — ERP apps are slow, 800ms not enough
const STRATEGY_TIMEOUT: Record<Exclude<HealStrategy, "primary">, number> = {
  getByRole:        2000,
  getByLabel:       2000,
  getByPlaceholder: 2000,
  getByText:        2000,
  css:              2000,
  xpath:            2500,
  dom:              2500,
  "relative-xpath": 2500,  // kept for type — disabled in execution
  position:         2500,
};

const ROLE_BY_TAG: Record<string, PlaywrightRole> = {
  a:        "link",
  button:   "button",
  select:   "combobox",
  textarea: "textbox",
};

const INPUT_ROLE_BY_TYPE: Record<string, PlaywrightRole> = {
  button:   "button",
  checkbox: "checkbox",
  email:    "textbox",
  number:   "spinbutton",
  password: "textbox",
  radio:    "radio",
  search:   "searchbox",
  submit:   "button",
  tel:      "textbox",
  text:     "textbox",
  url:      "textbox",
};

const SCORED_ATTRS    = ["id", "name", "placeholder", "aria-label", "title", "class", "type"];
const MAX_HINT_LENGTH = 120;  // ✅ Increased from 80 — more context kept
const DOM_MIN_SCORE   = 0.45;

// ============================================================================
//  VISIBILITY
// ============================================================================
async function isVisible(locator: Locator, timeout = 2000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
//  STRING HELPERS
// ============================================================================
function cleanHint(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\\(["'])/g, "$1").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > MAX_HINT_LENGTH) return undefined;
  return cleaned;
}

function unique(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const c = cleanHint(v);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function firstMatch(source: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = source.match(p);
    const v = cleanHint(m?.[1] || m?.[2]);
    if (v) return v;
  }
  return undefined;
}

function allTextValues(source: string): string[] {
  const values: string[] = [];
  const patterns = [
    /text\(\)=["']([^"']+)["']/g,
    /normalize-space\(\)=["']([^"']+)["']/g,
    /contains\(text\(\),\s*["']([^"']+)["']\)/g,
    /contains\(normalize-space\(\),\s*["']([^"']+)["']\)/g,
    /getByText\(['"`]([^'"`]+)['"`]/g,
    /has-text\(["']([^"']+)["']\)/g,
  ];
  for (const p of patterns) {
    for (const m of source.matchAll(p)) {
      const v = cleanHint(m[1]);
      if (v) values.push(v);
    }
  }
  return unique(values);
}

function decodeLocatorString(value: string): string {
  return value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function allMatches(source: string, patterns: RegExp[]): string[] {
  const values: string[] = [];
  for (const p of patterns) {
    for (const m of source.matchAll(p)) {
      const v = cleanHint(m[1] || m[2]);
      if (v) values.push(v);
    }
  }
  return unique(values);
}

function allAttributeValues(source: string, attributeNames: string[]): string[] {
  const values: string[] = [];
  for (const attrName of attributeNames) {
    const cssP   = new RegExp(`\\[${attrName}=\\\\?["']([^"'\\\\]+)\\\\?["']\\]`, "g");
    const xpathP = new RegExp(`@${attrName}=\\\\?["']([^"'\\\\]+)\\\\?["']`, "g");
    values.push(...allMatches(source, [cssP, xpathP]));
  }
  return unique(values);
}

function extractSelector(raw: string): string | undefined {
  const m = raw.match(/locator\((['"`])((?:\\.|(?!\1).)+)\1\)/);
  return m?.[2] ? decodeLocatorString(m[2]) : undefined;
}

function extractAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const normalized = decodeLocatorString(source);
  const patterns = [
    /@([\w:-]+)=["']([^"']+)["']/g,
    /\[([\w:-]+)=["']([^"']+)["']\]/g,
  ];
  for (const p of patterns) {
    for (const m of normalized.matchAll(p)) {
      const name  = m[1]?.toLowerCase();
      const value = cleanHint(m[2]);
      if (name && value && !attrs[name]) attrs[name] = value;
    }
  }
  return attrs;
}

function extractTag(selector: string | undefined): string | undefined {
  if (!selector) return undefined;
  const normalized = selector.replace(/^xpath=/, "").replace(/^css=/, "").trim();
  const xpathTag   = normalized.match(/^[\(\s]*\/\/\s*([a-zA-Z][\w-]*|\*)/)?.[1];
  const cssTag     = normalized.match(/^([a-zA-Z][\w-]*)/)?.[1];
  const tag        = xpathTag || cssTag;
  return tag && tag !== "*" ? tag.toLowerCase() : undefined;
}

function inferRole(selector: string | undefined, raw: string): PlaywrightRole | undefined {
  const explicit = firstMatch(raw, [
    /getByRole\(['"`]([^'"`]+)['"`]/,
    /\[role=["']?([a-zA-Z-]+)["']?\]/,
    /@role=["']([^"']+)["']/,
  ]);
  if (explicit) return explicit as PlaywrightRole;
  if (!selector) return undefined;
  const tag       = extractTag(selector);
  if (tag && ROLE_BY_TAG[tag]) return ROLE_BY_TAG[tag];
  const inputType = firstMatch(selector, [
    /input[^"'[\]]*\[type=["']?([^"'\]]+)["']?\]/,
    /@type=["']([^"']+)["']/,
  ]);
  if (tag === "input") {
    return inputType ? INPUT_ROLE_BY_TYPE[inputType.toLowerCase()] : "textbox";
  }
  return undefined;
}

function cssEscape(value: string):   string { return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1"); }
function cssString(value: string):   string { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function xpathString(value: string): string { return value.replace(/"/g, '\\"'); }

function inferCssSelectors(selector: string | undefined, raw: string): string[] {
  const exactSelector = selector?.startsWith("css=")
    ? selector.replace(/^css=/, "")
    : selector && !selector.startsWith("xpath=") && !selector.startsWith("//") && !selector.startsWith("(")
      ? selector : undefined;

  const ids = allMatches(raw, [
    /#([A-Za-z][\w-]*)/g,
    /\[@id=\\?["']([^"'\\]+)\\?["']\]/g,
    /@id=\\?["']([^"'\\]+)\\?["']/g,
  ]).map(id => `#${cssEscape(id)}`);

  const dataAttributes = allAttributeValues(raw, ["data-testid", "data-cy", "data-qa"])
    .map(v => `[data-testid="${cssString(v)}"], [data-cy="${cssString(v)}"], [data-qa="${cssString(v)}"]`);

  const names = allMatches(raw, [
    /\[name=\\?["']([^"'\\]+)\\?["']\]/g,
    /@name=\\?["']([^"'\\]+)\\?["']/g,
  ]).map(v => `[name="${cssString(v)}"]`);

  const ariaLabels = allMatches(raw, [
    /\[aria-label=\\?["']([^"'\\]+)\\?["']\]/g,
    /@aria-label=\\?["']([^"'\\]+)\\?["']/g,
  ]).map(v => `[aria-label="${cssString(v)}"]`);

  const placeholders = allMatches(raw, [
    /\[placeholder=\\?["']([^"'\\]+)\\?["']\]/g,
    /@placeholder=\\?["']([^"'\\]+)\\?["']/g,
  ]).map(v => `[placeholder="${cssString(v)}"]`);

  return unique([exactSelector, ...ids, ...dataAttributes, ...names, ...ariaLabels, ...placeholders]);
}

function inferXPathSelectors(
  selector:   string | undefined,
  hints:      Partial<RuntimeHints> & { texts?: string[] },
  attributes: Record<string, string> = {}
): string[] {
  const exactXPath = selector?.startsWith("xpath=")
    ? selector
    : selector?.startsWith("//") || selector?.startsWith("(")
      ? `xpath=${selector}` : undefined;

  const selectors: Array<string | undefined> = [exactXPath];

  for (const t of hints.texts ?? []) {
    selectors.push(`xpath=//*[normalize-space()="${xpathString(t)}"]`);
    selectors.push(`xpath=//*[contains(normalize-space(),"${xpathString(t)}")]`);
  }

  if (hints.placeholder) selectors.push(`xpath=//*[@placeholder="${xpathString(hints.placeholder)}"]`);
  if (hints.label)       selectors.push(`xpath=//*[@aria-label="${xpathString(hints.label)}"]`);

  for (const [attr, val] of Object.entries(attributes)) {
    if (!val || val.length < 3 || !/^[a-zA-Z][\w-]*$/.test(val)) continue;
    const escaped = xpathString(val);
    if (["id", "name", "class"].includes(attr)) {
      selectors.push(`xpath=//${hints.tag || "*"}[contains(@${attr},"${escaped}")]`);
    }
    if (attr === "aria-label")  selectors.push(`xpath=//*[contains(@aria-label,"${escaped}")]`);
    if (attr === "placeholder") selectors.push(`xpath=//*[contains(@placeholder,"${escaped}")]`);
  }

  return unique(selectors);
}

// ============================================================================
//  BUILD HINTS
// ============================================================================
function buildHints(
  locator:          Locator,
  lastKnownBounds?: RuntimeHints["lastKnownBounds"]
): RuntimeHints {
  const raw        = locator.toString();
  const selector   = extractSelector(raw);
  const attributes = extractAttributes(selector || raw);

  const label = firstMatch(raw, [
    /getByLabel\(['"`]([^'"`]+)['"`]/,
    /aria-label=["']([^"']+)["']/,
    /@aria-label=["']([^"']+)["']/,
    /\[name=["']([^"']+)["']\]/,
    /@name=["']([^"']+)["']/,
  ]);

  const placeholder = firstMatch(raw, [
    /getByPlaceholder\(['"`]([^'"`]+)['"`]/,
    /placeholder=["']([^"']+)["']/,
    /@placeholder=["']([^"']+)["']/,
  ]);

  const texts = allTextValues(selector || raw);
  const name  = firstMatch(raw, [
    /getByRole\(['"`][^'"`]+['"`],\s*\{\s*name:\s*['"`]([^'"`]+)['"`]/,
    /title=["']([^"']+)["']/,
    /@title=["']([^"']+)["']/,
  ]) || texts[0] || label || placeholder;

  const tag  = extractTag(selector);
  const role = inferRole(selector, raw);

  const partialHints: Partial<RuntimeHints> & { texts: string[] } = {
    label, name, placeholder, role, texts, tag,
  };

  return {
    raw, selector, tag, attributes, role, name, label, placeholder, texts,
    cssSelectors:   inferCssSelectors(selector, raw),
    xpathSelectors: inferXPathSelectors(selector, partialHints, attributes),
    lastKnownBounds,
  };
}

// ============================================================================
//  LEVENSHTEIN + SIMILARITY
// ============================================================================
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = i - 1;
    prev[0]  = i;
    for (let j = 1; j <= b.length; j++) {
      const old = prev[j];
      prev[j]   = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last      = old;
    }
  }
  return prev[b.length];
}

function longestCommonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function similarity(a: string, b: string): number {
  const left  = a.toLowerCase();
  const right = b.toLowerCase();
  if (!left || !right)  return 0;
  if (left === right)   return 1;
  if (left.startsWith(right) || right.startsWith(left)) return 0.88;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const editScore   = 1 - levenshtein(left, right) / Math.max(left.length, right.length);
  const prefixScore = longestCommonPrefix(left, right) / Math.min(left.length, right.length);
  return Math.max(editScore, prefixScore);
}

// ============================================================================
//  DOM RECOVERY
// ============================================================================
async function buildDomRecoveryAttempts(
  page:  Page,
  hints: RuntimeHints
): Promise<HealingAttempt[]> {
  const scoredAttrs  = Object.entries(hints.attributes).filter(([n]) => SCORED_ATTRS.includes(n));
  const hasTextHints = hints.texts.length > 0;

  if (!hints.tag) return [];
  if (scoredAttrs.length === 0 && !hasTextHints) return [];

  try {
    if (page.isClosed()) return [];
    await page.evaluate(() => document.readyState);
  } catch {
    logger.debug("[AutoHeal] Page not ready for DOM scan — skipping");
    return [];
  }

  const candidates = await page.locator(hints.tag).evaluateAll(
    (elements, attrNames: string[]) => {
      function isVis(el: Element): boolean {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
      }
      return elements.filter(isVis).map(el => {
        const attrs: Record<string, string> = {};
        for (const name of attrNames) {
          const val = el.getAttribute(name);
          if (val) attrs[name] = val;
        }
        return {
          attrs,
          id:          el.getAttribute("id"),
          testId:      el.getAttribute("data-testid") || el.getAttribute("data-cy"),
          name:        el.getAttribute("name"),
          ariaLabel:   el.getAttribute("aria-label"),
          placeholder: el.getAttribute("placeholder"),
          text:        (el as HTMLElement).innerText?.trim().substring(0, 100) || "",
        };
      });
    },
    scoredAttrs.map(([name]) => name)
  );

  const ranked = candidates
    .map(candidate => {
      let score = scoredAttrs.reduce((best, [attrName, expected]) => {
        const actual = candidate.attrs[attrName];
        return actual ? Math.max(best, similarity(expected, actual)) : best;
      }, 0);
      if (hasTextHints && candidate.text) {
        for (const t of hints.texts) {
          score = Math.max(score, similarity(t, candidate.text));
        }
      }
      return { ...candidate, score };
    })
    .filter(c => c.score >= DOM_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  logger.debug(`[AutoHeal] DOM scan: ${ranked.length} candidates for <${hints.tag}>`);

  return ranked.slice(0, 3).map(candidate => {
    let preciseLocator: Locator;
    let preciseSelector: string;

    if (candidate.id) {
      preciseSelector = `#${candidate.id}`;
      preciseLocator  = page.locator(preciseSelector);
    } else if (candidate.testId) {
      preciseSelector = `[data-testid="${candidate.testId}"]`;
      preciseLocator  = page.locator(preciseSelector);
    } else if (candidate.name) {
      preciseSelector = `${hints.tag}[name="${candidate.name}"]`;
      preciseLocator  = page.locator(preciseSelector);
    } else if (candidate.ariaLabel) {
      preciseSelector = `[aria-label="${candidate.ariaLabel}"]`;
      preciseLocator  = page.locator(preciseSelector);
    } else if (candidate.placeholder) {
      preciseSelector = `[placeholder="${candidate.placeholder}"]`;
      preciseLocator  = page.locator(preciseSelector);
    } else if (candidate.text) {
      preciseSelector = `xpath=//${hints.tag}[normalize-space()="${xpathString(candidate.text)}"]`;
      preciseLocator  = page.locator(preciseSelector);
    } else {
      const [bestAttr, bestVal] = Object.entries(candidate.attrs)[0] ?? [];
      preciseSelector = bestAttr
        ? `xpath=//${hints.tag}[contains(@${bestAttr},"${bestVal}")]`
        : hints.tag!;
      preciseLocator  = page.locator(preciseSelector);
    }

    return {
      strategy:   "dom" as const,
      locator:    preciseLocator,
      selector:   `${preciseSelector} (score=${candidate.score.toFixed(2)} text="${candidate.text}")`,
      confidence: candidate.score,
    };
  });
}

// ============================================================================
//  POSITION STRATEGY
// ============================================================================
async function buildPositionAttempts(
  page:  Page,
  hints: RuntimeHints
): Promise<HealingAttempt[]> {
  if (!hints.lastKnownBounds || !hints.tag) return [];

  const bounds = hints.lastKnownBounds;

  try {
    if (page.isClosed()) return [];
    await page.evaluate(() => document.readyState);
  } catch {
    return [];
  }

  const closest = await page.locator(hints.tag).evaluateAll(
    (elements, target: { x: number; y: number; width: number; height: number }) => {
      function isVis(el: Element): boolean {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
      }
      function dist(
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number }
      ): number {
        return Math.sqrt(
          (a.x + a.width / 2 - (b.x + b.width / 2)) ** 2 +
          (a.y + a.height / 2 - (b.y + b.height / 2)) ** 2
        );
      }
      function sizeSim(
        a: { width: number; height: number },
        b: { width: number; height: number }
      ): number {
        return (
          Math.min(a.width, b.width)   / Math.max(a.width,  b.width  || 1) +
          Math.min(a.height, b.height) / Math.max(a.height, b.height || 1)
        ) / 2;
      }
      return elements.filter(isVis).map(el => {
        const r    = el.getBoundingClientRect();
        const rect = { x: r.x, y: r.y, width: r.width, height: r.height };
        const d    = dist(rect, target);
        const score = sizeSim(rect, target) / (1 + d / 100);
        return {
          score,
          distance:  Math.round(d),
          id:        el.getAttribute("id"),
          testId:    el.getAttribute("data-testid") || el.getAttribute("data-cy"),
          name:      el.getAttribute("name"),
          ariaLabel: el.getAttribute("aria-label"),
          text:      (el as HTMLElement).innerText?.trim().substring(0, 60) || "",
        };
      })
      .filter(c => c.score > 0.1 && c.distance < 300)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    },
    bounds
  );

  if (closest.length === 0) return [];

  return closest.map(c => {
    let selector: string;
    if      (c.id)        selector = `#${c.id}`;
    else if (c.testId)    selector = `[data-testid="${c.testId}"]`;
    else if (c.name)      selector = `${hints.tag}[name="${c.name}"]`;
    else if (c.ariaLabel) selector = `[aria-label="${c.ariaLabel}"]`;
    else if (c.text)      selector = `xpath=//${hints.tag}[normalize-space()="${xpathString(c.text)}"]`;
    else                  selector = hints.tag!;

    return {
      strategy:   "position" as const,
      locator:    page.locator(selector),
      selector:   `${selector}  [position dist=${c.distance}px]`,
      confidence: STRATEGY_CONFIDENCE["position"],
    };
  });
}

// ============================================================================
//  RELATIVE XPATH RECOVERY
// ============================================================================
async function buildRelativeXPathAttempts(
  page:  Page,
  hints: RuntimeHints
): Promise<HealingAttempt[]> {
  if (!hints.tag && hints.texts.length === 0) return [];

  try {
    if (page.isClosed()) return [];
    await page.evaluate(() => document.readyState);
  } catch {
    return [];
  }

  const targetTag = hints.tag || "*";

  const anchors = await page.evaluate((tt: string) => {
    const stableElements = Array.from(
      document.querySelectorAll("label,h1,h2,h3,h4,h5,legend,th,button,a,span,p,div")
    ).filter(el => {
      const text = (el as HTMLElement).innerText?.trim();
      const rect = el.getBoundingClientRect();
      return text && text.length > 1 && text.length < 60 && rect.width > 0 && rect.height > 0;
    });

    function getXPath(el: Element): string {
      const id = el.getAttribute("id");
      if (id) return `//*[@id="${id}"]`;
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur.nodeType === Node.ELEMENT_NODE) {
        let idx = 1;
        let sib = cur.previousElementSibling;
        while (sib) { if (sib.tagName === cur.tagName) idx++; sib = sib.previousElementSibling; }
        parts.unshift(idx === 1 ? cur.tagName.toLowerCase() : `${cur.tagName.toLowerCase()}[${idx}]`);
        cur = cur.parentElement;
      }
      return "/" + parts.join("/");
    }

    const results: Array<{ tag: string; text: string; id?: string; xpath: string; relation: string }> = [];

    for (const anchor of stableElements.slice(0, 100)) {
      const anchorText = (anchor as HTMLElement).innerText?.trim();
      if (!anchorText) continue;
      const anchorXPath = getXPath(anchor);

      const followSib = anchor.nextElementSibling;
      if (followSib && followSib.tagName.toLowerCase() === tt) {
        results.push({ tag: anchor.tagName.toLowerCase(), text: anchorText, id: anchor.getAttribute("id") || undefined, xpath: anchorXPath, relation: "sibling" });
      }

      const parent = anchor.closest("form,fieldset,section,div,nav,table,ul,ol");
      if (parent) {
        const childTargets = parent.querySelectorAll(tt);
        if (childTargets.length > 0 && childTargets.length < 5) {
          results.push({ tag: parent.tagName.toLowerCase(), text: parent.getAttribute("id") || parent.getAttribute("class")?.split(" ")[0] || "", id: parent.getAttribute("id") || undefined, xpath: getXPath(parent), relation: "ancestor" });
        }
      }

      const allTargets = anchor.closest("body")?.querySelectorAll(tt);
      if (allTargets) {
        for (const target of Array.from(allTargets).slice(0, 3)) {
          const aRect = anchor.getBoundingClientRect();
          const tRect = target.getBoundingClientRect();
          if (tRect.top > aRect.bottom && tRect.top - aRect.bottom < 200) {
            results.push({ tag: anchor.tagName.toLowerCase(), text: anchorText, id: anchor.getAttribute("id") || undefined, xpath: anchorXPath, relation: "following" });
            break;
          }
        }
      }
    }

    return results.slice(0, 20);
  }, targetTag);

  if (anchors.length === 0) return [];

  const attempts: HealingAttempt[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const anchorBase = anchor.id
      ? `//*[@id="${anchor.id}"]`
      : `//${anchor.tag}[normalize-space()="${xpathString(anchor.text)}"]`;

    const expressions: Array<{ xpath: string; label: string }> = [];

    switch (anchor.relation) {
      case "sibling":
        expressions.push(
          { xpath: `xpath=${anchorBase}/following-sibling::${targetTag}[1]`, label: `following-sibling of "${anchor.text}"` },
          { xpath: `xpath=${anchorBase}/preceding-sibling::${targetTag}[1]`, label: `preceding-sibling of "${anchor.text}"` }
        );
        break;
      case "ancestor":
        if (anchor.id) {
          expressions.push(
            { xpath: `xpath=//*[@id="${anchor.id}"]//${targetTag}[1]`, label: `first descendant of #${anchor.id}` }
          );
        }
        break;
      case "following":
        expressions.push(
          { xpath: `xpath=${anchorBase}/following::${targetTag}[1]`, label: `first following ${targetTag} after "${anchor.text}"` },
          { xpath: `xpath=${anchorBase}/following::${targetTag}[2]`, label: `second following ${targetTag} after "${anchor.text}"` }
        );
        if (hints.attributes["type"]) {
          expressions.push({ xpath: `xpath=${anchorBase}/following::${targetTag}[@type="${hints.attributes["type"]}"][1]`, label: `following typed ${targetTag} after "${anchor.text}"` });
        }
        break;
      case "preceding":
        expressions.push(
          { xpath: `xpath=${anchorBase}/preceding::${targetTag}[1]`, label: `preceding ${targetTag} before "${anchor.text}"` }
        );
        break;
    }

    for (const text of hints.texts) {
      expressions.push(
        { xpath: `xpath=//*[normalize-space()="${xpathString(text)}"]/parent::${targetTag}`,      label: `parent of "${text}"` },
        { xpath: `xpath=//*[normalize-space()="${xpathString(text)}"]/ancestor::${targetTag}[1]`, label: `ancestor of "${text}"` }
      );
    }

    for (const expr of expressions) {
      if (seen.has(expr.xpath)) continue;
      seen.add(expr.xpath);
      attempts.push({
        strategy:   "relative-xpath",
        locator:    page.locator(expr.xpath),
        selector:   `${expr.xpath}  [${expr.label}]`,
        confidence: STRATEGY_CONFIDENCE["relative-xpath"],
      });
    }
  }

  return attempts;
}

// ============================================================================
//  STANDARD HEALING ATTEMPTS
// ============================================================================
function buildHealingAttempts(page: Page, hints: RuntimeHints): HealingAttempt[] {
  const attempts: HealingAttempt[] = [];

  if (hints.role && hints.name) {
    attempts.push({
      strategy:   "getByRole",
      locator:    page.getByRole(hints.role, { name: hints.name, exact: false }),
      selector:   `getByRole(${hints.role}, name=${hints.name})`,
      confidence: STRATEGY_CONFIDENCE["getByRole"],
    });
  }

  if (hints.label) {
    attempts.push({
      strategy:   "getByLabel",
      locator:    page.getByLabel(hints.label, { exact: false }),
      selector:   `getByLabel(${hints.label})`,
      confidence: STRATEGY_CONFIDENCE["getByLabel"],
    });
  }

  if (hints.placeholder) {
    attempts.push({
      strategy:   "getByPlaceholder",
      locator:    page.getByPlaceholder(hints.placeholder, { exact: false }),
      selector:   `getByPlaceholder(${hints.placeholder})`,
      confidence: STRATEGY_CONFIDENCE["getByPlaceholder"],
    });
  }

  for (const text of hints.texts) {
    attempts.push({
      strategy:   "getByText",
      locator:    page.getByText(text, { exact: false }),
      selector:   `getByText(${text})`,
      confidence: STRATEGY_CONFIDENCE["getByText"],
    });
  }

  for (const selector of hints.cssSelectors) {
    attempts.push({ strategy: "css",   locator: page.locator(selector), selector, confidence: STRATEGY_CONFIDENCE["css"] });
  }

  for (const selector of hints.xpathSelectors) {
    attempts.push({ strategy: "xpath", locator: page.locator(selector), selector, confidence: STRATEGY_CONFIDENCE["xpath"] });
  }

  return attempts;
}

// ============================================================================
//  ✅ IMPROVED LOG HELPER — clean, structured, easy to read
// ============================================================================
function formatHealHeader(hints: RuntimeHints): string {
  const original = hints.selector ?? hints.raw.substring(0, 100);
  const tag      = hints.tag ? `<${hints.tag}>` : "<unknown>";
  return (
    `[AutoHeal] Healing → ${original} | tag: ${tag}`
  );
}

function formatHealMiss(strategy: string, selector: string): string {
  const clean = selector.replace(/\s+/g, " ").substring(0, 80);
  return `  [AutoHeal] ✗ ${strategy.padEnd(18)} ${clean}`;
}

function formatHealHit(
  strategy: string,
  selector: string,
  elapsed:  number
): string {
  const clean = selector.split("  [")[0].split(" (")[0];
  return (
    `[AutoHeal] ✅ HEALED via [${strategy}] → ${clean} (+${elapsed}ms)\n` +
    `[AutoHeal] 💡 UPDATE POM → ${clean}`
  );
}

function formatHealFail(hints: RuntimeHints, elapsed: number): string {
  const original = hints.selector ?? hints.raw.substring(0, 100);
  return `[AutoHeal] ❌ FAILED all strategies → ${original} (+${elapsed}ms)`;
}

// ============================================================================
//  MAIN
// ============================================================================
export async function autoHeal(
  locator:          Locator,
  context?:         HealContext,
  timeoutOverride?: number
): Promise<HealResult> {

  const startTime = Date.now();

  // ── Primary check ─────────────────────────────────────────────────────────
  if (await isVisible(locator, timeoutOverride ?? 5000)) {
    return { locator: locator.first(), healed: false, strategy: "primary", confidence: 1.0 };
  }

  const page = locator.page();
  try {
    if (page.isClosed()) return { locator, healed: false, strategy: "primary", confidence: 0 };
  } catch {
    return { locator, healed: false, strategy: "primary", confidence: 0 };
  }

  const lastKnownBounds = (locator as any)._lastKnownBounds;
  const hints           = buildHints(locator, lastKnownBounds);

  const standard = buildHealingAttempts(page, hints);
  const domBased = await buildDomRecoveryAttempts(page, hints);
  // ✅ Removed relative-xpath and position — they heal to wrong elements
  // Relative-xpath uses anchor text proximity which is unreliable in ERP apps
  // Position uses pixel coordinates which shift on every page load

  const attempts = [...standard, ...domBased];

  // ✅ Clean structured header log
  logger.warn(formatHealHeader(hints));

  // ── Try each strategy ─────────────────────────────────────────────────────
  for (const attempt of attempts) {
    const attemptStart = Date.now();
    const timeout      = STRATEGY_TIMEOUT[attempt.strategy] ?? 2000;
    const visible      = await isVisible(attempt.locator, timeout);
    const elapsed      = Date.now() - attemptStart;

    if (!visible) {
      // ✅ Clean miss log — one line per attempt, easy to scan
      logger.debug(formatHealMiss(attempt.strategy, attempt.selector));
      continue;
    }

    const resolved     = attempt.locator.first();
    const totalElapsed = Date.now() - startTime;

    // ✅ Clean success log — boxed, stands out clearly
    logger.pass(formatHealHit(attempt.strategy, attempt.selector, totalElapsed));

    return {
      locator:    resolved,
      healed:     true,
      strategy:   attempt.strategy,
      selector:   attempt.selector,
      confidence: attempt.confidence,
    };
  }

  // ✅ Clean fail log — all context in one block
  const totalElapsed = Date.now() - startTime;
  logger.error(formatHealFail(hints, totalElapsed));

  return { locator, healed: false, strategy: "primary", confidence: 0 };
}