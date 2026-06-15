// ============================================================================
//  BASE PAGE - ENTERPRISE LEVEL v2 (FINAL)
// ============================================================================

import { Page, Locator, FrameLocator, expect } from "@playwright/test";
import { WaitUtils }      from "../utils/waitUtils";
import { ErrorHandler }   from "../utils/errorHandler";
import { RetryOptions }   from "../utils/retryUtils";
import { configManager }  from "../config/env.index";
import { Runtime }        from "../utils/runtimeStore";
import { logger }         from "../helpers/logger";
import { autoHeal }       from "../utils/autoHeal";

type CompareOp = "==" | "!=" | "contains" | "!contains" | ">" | ">=" | "<" | "<=";

export class BasePage {
  protected page: Page;
  private _currentFrame: FrameLocator | null = null;
  private _softErrors:   string[]            = [];
  private _stepCounter                       = 0;

  constructor(page: Page) { this.page = page; }

  // ==========================================================================
  //  CORE: resolveLocator — auto-wait + auto-heal
  //  Used by: click, type, fill, clear, hover, check, uncheck, press, focus,
  //           selectOption, doubleClick, rightClick, dragAndDrop, getText
  //  NOT used by: isVisible, waitForElementToDisappear, ifVisible, whileVisible
  //               (these do NOT need healing)
  // ==========================================================================

  private async resolveLocator(selector: string | Locator, name: string): Promise<Locator> {
    const locator = this.getLocator(selector);
    const timeout = configManager.getTimeout("action");

    const visible = await locator.first()
      .waitFor({ state: "visible", timeout })
      .then(() => true).catch(() => false);

    if (visible) return locator.first();

    // ✅ autoHeal — only fires when element genuinely not found
    logger.warn(`[AutoHeal] "${name}" not visible after ${timeout}ms — attempting heal`);
    const { locator: healed, healed: wasHealed, strategy } =
      await autoHeal(locator, undefined, timeout);

    if (!wasHealed) {
      logger.error(`[AutoHeal] ❌ Failed → ${name}`);
      throw new Error(`Element not found after autoHeal → ${name}`);
    }

    logger.warn(`[AutoHeal] ✅ Healed via [${strategy}] → ${name}`);
    return healed.first();
  }

  // ==========================================================================
  //  SELECTOR + NAME
  // ==========================================================================

  protected getLocator(selector: string | Locator): Locator {
    try {
      if (typeof selector !== "string") return selector;
      if (selector.startsWith("xpath=")) return this.page.locator(selector);
      if (selector.startsWith("//") || selector.startsWith("(//"))
        return this.page.locator(`xpath=${selector}`);
      return this.page.locator(selector);
    } catch (e: any) {
      throw new Error(`getLocator failed → ${selector} → ${e.message}`);
    }
  }

  protected getElementName(selector: string | Locator, explicitLabel?: string): string {
    if (explicitLabel) return explicitLabel;
    if (typeof selector !== "string") {
      const n = (selector as any).__name;
      if (n) return n;
    }
    try {
      if (typeof selector !== "string") {
        for (const k of Object.getOwnPropertyNames(this))
          if ((this as any)[k] === selector) return k;
        try {
          const s = selector.toString();
          const r = s.match(/getByRole\((.*?)\)/);   if (r) return r[1].replace(/["{}]/g,"").trim();
          const t = s.match(/getByText\((.*?)\)/);   if (t) return `text=${t[1].replace(/["]/g,"")}`;
          const d = s.match(/getByTestId\((.*?)\)/); if (d) return `testId=${d[1].replace(/["]/g,"")}`;
          const c = s.match(/locator\("([^"]+)"\)/); if (c) return this.extractLabel(c[1]);
          const x = s.match(/locator\('xpath=(.*?)'\)/); if (x) return this.extractLabel(x[1]);
        } catch { /**/ }
        return "element";
      }
      return this.extractLabel(selector);
    } catch { return "element"; }
  }

  private extractLabel(sel: string): string {
    if (!sel) return "element";
    try {
      const clean = sel.replace(/^css=|^xpath=/,"").trim();
      if (clean.startsWith("#")) return clean.slice(1);
      if (clean.startsWith(".")) return clean.replace(/\./g,"-").replace(/^-/,"");
      const t = clean.match(/(?:text\(\)|normalize-space\(\))\s*=\s*["']([^"']+)["']/) ||
                clean.match(/contains\(text\(\),\s*["']([^"']+)["']\)/);
      if (t?.[1]) return t[1].trim().replace(/\s+/g,"_").substring(0,30);
      const a = clean.match(/@(?:id|name|placeholder|aria-label)=["']([^"']+)["']/);
      if (a?.[1]) return a[1].trim().substring(0,30);
      const td = clean.match(/data-testid=["']([^"']+)["']/);
      if (td?.[1]) return td[1];
      return clean.replace(/[^a-zA-Z0-9\s]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").substring(0,30)||"element";
    } catch { return "element"; }
  }

  private compare(actual: string, op: string, expected: string): boolean {
    const a=actual.trim(), e=expected.trim(), an=parseFloat(a), en=parseFloat(e);
    switch(op){
      case "==":        return a===e;
      case "!=":        return a!==e;
      case "contains":  return a.toLowerCase().includes(e.toLowerCase());
      case "!contains": return !a.toLowerCase().includes(e.toLowerCase());
      case ">":         return !isNaN(an)&&!isNaN(en)&&an>en;
      case ">=":        return !isNaN(an)&&!isNaN(en)&&an>=en;
      case "<":         return !isNaN(an)&&!isNaN(en)&&an<en;
      case "<=":        return !isNaN(an)&&!isNaN(en)&&an<=en;
      default:          return false;
    }
  }

  // ==========================================================================
  //  NAVIGATION
  //  Example: await base.navigateTo("https://example.com");
  //           await base.goto("/dashboard");
  //           await base.reload();
  //           await base.goBack();
  // ==========================================================================

  async navigateTo(url: string): Promise<this> {
    logger.step(`Navigate To → ${url}`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.goto(url, { waitUntil:"domcontentloaded", timeout: configManager.getTimeout("navigation") });
      await WaitUtils.waitForLoadState(this.page, "load", configManager.getTimeout("navigation"));
      logger.pass(`Navigated → ${url}`);
      return this;
    }, { context: `BasePage.navigateTo` });
  }

  async goto(path = "/"): Promise<this> {
    return this.navigateTo(`${configManager.getBaseURL()}${path}`);
  }

  async reload(): Promise<this> {
    logger.step("Reload Page");
    return ErrorHandler.handle<this>(async () => {
      await this.page.reload({ waitUntil:"domcontentloaded" });
      logger.pass("Page reloaded"); return this;
    }, { context:"BasePage.reload" });
  }

  async goBack(): Promise<this> {
    logger.step("Go Back");
    return ErrorHandler.handle<this>(async () => {
      await this.page.goBack({ waitUntil:"domcontentloaded" });
      logger.pass("Back"); return this;
    }, { context:"BasePage.goBack" });
  }

  async goForward(): Promise<this> {
    logger.step("Go Forward");
    return ErrorHandler.handle<this>(async () => {
      await this.page.goForward({ waitUntil:"domcontentloaded" });
      logger.pass("Forward"); return this;
    }, { context:"BasePage.goForward" });
  }

  async scrollIntoView(selector: string | Locator): Promise<this> {
    return this.scrollToElement(selector);
  }

  // ==========================================================================
  //  ELEMENT ACTIONS — all use resolveLocator (auto-wait + auto-heal)
  // ==========================================================================

  // ✅ click
  // Example: await base.click(el.submitButton);
  async click(selector: string | Locator, options?: { force?: boolean; label?: string }): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.click({ timeout: configManager.getTimeout("action"), force: options?.force });
      logger.pass(`Clicked → ${name}`);
      return this;
    }, { context:`BasePage.click (${name})` });
  }

  // ✅ type — pressSequentially (simulates keyboard)
  // Example: await base.type(el.searchField, "Purchase Order");
  async type(selector: string | Locator, text: string, delay?: number, options?: { label?: string }): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Type → ${name} | "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.pressSequentially(text, { delay: delay ?? 0 });
      logger.pass(`Typed → ${name}`);
      return this;
    }, { context:`BasePage.type (${name})` });
  }

  // ✅ fill — sets value directly (faster than type, no keyboard simulation)
  // Example: await base.fill(el.emailInput, "user@test.com");
  async fill(selector: string | Locator, text: string, options?: { label?: string }): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Fill → ${name} | "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.fill(text, { timeout: configManager.getTimeout("action") });
      logger.pass(`Filled → ${name}`);
      return this;
    }, { context:`BasePage.fill (${name})` });
  }

  // ✅ clear — clears input field
  // Example: await base.clear(el.quantityTextbox);
  async clear(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Clear → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.clear({ timeout: configManager.getTimeout("action") });
      logger.pass(`Cleared → ${name}`);
      return this;
    }, { context:`BasePage.clear (${name})` });
  }

  // ✅ hover — mouse over element
  // Example: await base.hover(el.menuItem);
  async hover(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Hover → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.hover({ timeout: configManager.getTimeout("action") });
      logger.pass(`Hovered → ${name}`);
      return this;
    }, { context:`BasePage.hover (${name})` });
  }

  // ✅ check — check a checkbox
  // Example: await base.check(el.agreeCheckbox);
  async check(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Check → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.check({ timeout: configManager.getTimeout("action") });
      logger.pass(`Checked → ${name}`);
      return this;
    }, { context:`BasePage.check (${name})` });
  }

  // ✅ uncheck — uncheck a checkbox
  // Example: await base.uncheck(el.notifyCheckbox);
  async uncheck(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Uncheck → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.uncheck({ timeout: configManager.getTimeout("action") });
      logger.pass(`Unchecked → ${name}`);
      return this;
    }, { context:`BasePage.uncheck (${name})` });
  }

  // ✅ press — press key on focused element
  // Example: await base.press(el.searchField, "Enter");
  async press(selector: string | Locator, key: string): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Press → ${name} | "${key}"`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.press(key, { timeout: configManager.getTimeout("action") });
      logger.pass(`Pressed "${key}" → ${name}`);
      return this;
    }, { context:`BasePage.press (${name})` });
  }

  // ✅ focus — focus an element
  // Example: await base.focus(el.emailInput);
  async focus(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Focus → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.focus({ timeout: configManager.getTimeout("action") });
      logger.pass(`Focused → ${name}`);
      return this;
    }, { context:`BasePage.focus (${name})` });
  }

  // ✅ selectOption — select from native <select> dropdown
  // Example: await base.selectOption(el.countryDropdown, "India");
  async selectOption(selector: string | Locator, value: string | string[]): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Select → ${name} | ${JSON.stringify(value)}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.selectOption(value, { timeout: configManager.getTimeout("action") });
      logger.pass(`Selected → ${name}`);
      return this;
    }, { context:`BasePage.selectOption (${name})` });
  }

  // ✅ doubleClick
  // Example: await base.doubleClick(el.fileItem);
  async doubleClick(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Double Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.dblclick({ timeout: configManager.getTimeout("action") });
      logger.pass(`Double-clicked → ${name}`);
      return this;
    }, { context:`BasePage.doubleClick (${name})` });
  }

  // ✅ rightClick
  // Example: await base.rightClick(el.tableRow);
  async rightClick(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Right Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      await resolved.click({ button:"right", timeout: configManager.getTimeout("action") });
      logger.pass(`Right-clicked → ${name}`);
      return this;
    }, { context:`BasePage.rightClick (${name})` });
  }

  // ✅ dragAndDrop
  // Example: await base.dragAndDrop(el.sourceCard, el.targetColumn);
  async dragAndDrop(source: string | Locator, target: string | Locator): Promise<this> {
    const sn = this.getElementName(source), tn = this.getElementName(target);
    logger.step(`Drag → ${sn} to ${tn}`);
    return ErrorHandler.handle<this>(async () => {
      const rs = await this.resolveLocator(source, sn);
      const rt = await this.resolveLocator(target, tn);
      await rs.dragTo(rt);
      logger.pass(`Dragged → ${sn} to ${tn}`);
      return this;
    }, { context:`BasePage.dragAndDrop` });
  }

  // ==========================================================================
  //  KEYBOARD & MOUSE — no resolveLocator (not element-specific)
  // ==========================================================================

  // ✅ pressKey — keyboard press without element focus
  // Example: await base.pressKey("Enter");
  //          await base.pressKey("Tab");
  //          await base.pressKey("Escape");
  async pressKey(key: string): Promise<this> {
    logger.step(`Press key → "${key}"`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.keyboard.press(key);
      logger.pass(`Key pressed → "${key}"`);
      return this;
    }, { context:`BasePage.pressKey (${key})` });
  }

  // ✅ typeText — type text without element (types at current focus)
  // Example: await base.typeText("Hello World");
  async typeText(text: string): Promise<this> {
    logger.step(`Type text → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.keyboard.type(text);
      logger.pass(`Typed → "${text}"`);
      return this;
    }, { context:"BasePage.typeText" });
  }

  // ✅ mouseClick — click at exact coordinates
  // Example: await base.mouseClick(250, 400);
  async mouseClick(x: number, y: number, button: "left"|"right"|"middle" = "left", clickCount = 1): Promise<this> {
    logger.step(`Mouse click → x=${x}, y=${y}`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.mouse.click(x, y, { button, clickCount });
      logger.pass(`Mouse clicked → x=${x}, y=${y}`);
      return this;
    }, { context:`BasePage.mouseClick` });
  }

  // ✅ mouseMove
  // Example: await base.mouseMove(100, 200);
  async mouseMove(x: number, y: number): Promise<this> {
    return ErrorHandler.handle<this>(async () => {
      await this.page.mouse.move(x, y); return this;
    }, { context:`BasePage.mouseMove` });
  }

  // ==========================================================================
  //  NEW TAB
  // ==========================================================================

  // ✅ clickAndGetNewTab — click link that opens new tab, return new page
  // Example: const newPage = await base.clickAndGetNewTab(el.openInNewTabLink);
  async clickAndGetNewTab(selector: string | Locator): Promise<Page> {
    const name = this.getElementName(selector);
    logger.step(`Click → new tab via ${name}`);
    return ErrorHandler.handle<Page>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent("page"),
        resolved.click(),
      ]);
      await newPage.waitForLoadState("domcontentloaded");
      logger.pass(`New tab → ${newPage.url()}`);
      return newPage;
    }, { context:`BasePage.clickAndGetNewTab` });
  }

  // ✅ switchToTab — switch between open tabs by index
  // Example: const tab2 = await base.switchToTab(1);
  async switchToTab(index: number): Promise<Page> {
    logger.step(`Switch to tab [${index}]`);
    return ErrorHandler.handle<Page>(async () => {
      const pages = this.page.context().pages();
      if (index >= pages.length) throw new Error(`Tab [${index}] out of range. Found ${pages.length}.`);
      const tab = pages[index];
      await tab.bringToFront();
      logger.pass(`Tab [${index}] → ${tab.url()}`);
      return tab;
    }, { context:`BasePage.switchToTab` });
  }

  getTabCount(): number { return this.page.context().pages().length; }

  // ==========================================================================
  //  WAIT METHODS
  // ==========================================================================

  // ✅ waitForElementIsVisible — auto-heal on failure
  // Example: await base.waitForElementIsVisible(el.spinner);
  //          await base.waitForElementIsVisible(el.modal, 10000);
  async waitForElementIsVisible(selector: string | Locator, timeout?: number): Promise<this> {
    const name     = this.getElementName(selector);
    const waitTime = timeout || configManager.getTimeout("wait");
    logger.step(`Wait visible → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      const locator = this.getLocator(selector);
      try {
        await locator.first().waitFor({ state:"visible", timeout: waitTime });
        logger.pass(`Visible → ${name}`);
        return this;
      } catch {
        logger.warn(`[AutoHeal] "${name}" not visible — attempting heal`);
      }
      const { locator: healed, healed: wasHealed, strategy } =
        await autoHeal(locator, undefined, waitTime);
      if (wasHealed) logger.warn(`[AutoHeal] ✅ Healed via [${strategy}] → ${name}`);
      await healed.first().waitFor({ state:"visible", timeout: waitTime });
      logger.pass(`Visible (healed) → ${name}`);
      return this;
    }, { context:`BasePage.waitForElementIsVisible (${name})` });
  }

  // ✅ waitForElementToDisappear — NO autoHeal (disappearing = correct)
  // Example: await base.waitForElementToDisappear(el.loadingSpinner);
  //          await base.waitForElementToDisappear(el.toast, 5000);
  async waitForElementToDisappear(selector: string | Locator, timeout?: number): Promise<this> {
    const name     = this.getElementName(selector);
    const waitTime = timeout || configManager.getTimeout("wait");
    logger.step(`Wait disappear → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      // ❌ NO autoHeal here — element disappearing is CORRECT behaviour
      await this.getLocator(selector).first().waitFor({ state:"hidden", timeout: waitTime });
      logger.pass(`Disappeared → ${name}`);
      return this;
    }, { context:`BasePage.waitForElementToDisappear (${name})` });
  }

  // ✅ waitForElementEnabled
  // Example: await base.waitForElementEnabled(el.submitButton);
  async waitForElementEnabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Wait enabled → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeEnabled({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Enabled → ${name}`);
      return this;
    }, { context:`BasePage.waitForElementEnabled (${name})` });
  }

  // ✅ waitForURL
  // Example: await base.waitForURL(/PO-[\w]+/);
  //          await base.waitForURL("https://example.com/dashboard");
  async waitForURL(url: string | RegExp): Promise<this> {
    logger.step(`Wait URL → ${url}`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.waitForURL(url, { timeout: configManager.getTimeout("navigation") });
      logger.pass(`URL matched → ${url}`);
      return this;
    }, { context:`BasePage.waitForURL` });
  }

  // ✅ waitForLoadState
  // Example: await base.waitForLoadState("networkidle");
  //          await base.waitForLoadState("domcontentloaded");
  async waitForLoadState(state: "load"|"domcontentloaded"|"networkidle" = "load"): Promise<this> {
    logger.debug(`Wait loadState → ${state}`);
    return ErrorHandler.handle<this>(async () => {
      await this.page.waitForLoadState(state, { timeout: configManager.getTimeout("navigation") });
      logger.debug(`LoadState reached → ${state}`);
      return this;
    }, { context:`BasePage.waitForLoadState` });
  }

  // ✅ waitForTextOnPage
  // Example: await base.waitForTextOnPage("Saved successfully");
  async waitForTextOnPage(text: string | RegExp, timeout?: number): Promise<this> {
    const waitTime = timeout || configManager.getTimeout("wait");
    logger.step(`Wait text → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.page.getByText(text)).toBeVisible({ timeout: waitTime });
      logger.pass(`Text visible → "${text}"`);
      return this;
    }, { context:`BasePage.waitForTextOnPage` });
  }

  // ✅ waitForTextDisappear
  // Example: await base.waitForTextDisappear("Loading...");
  async waitForTextDisappear(text: string | RegExp, timeout?: number): Promise<this> {
    const waitTime = timeout || configManager.getTimeout("wait");
    logger.step(`Wait text gone → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.page.getByText(text)).not.toBeVisible({ timeout: waitTime });
      logger.pass(`Text gone → "${text}"`);
      return this;
    }, { context:`BasePage.waitForTextDisappear` });
  }

  // ==========================================================================
  //  ASSERTIONS
  // ==========================================================================

  // ✅ assertElementVisible
  // Example: await base.assertElementVisible(el.successMessage);
  async assertElementVisible(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeVisible({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert visible → ${name}`);
      return this;
    }, { context:`BasePage.assertElementVisible (${name})` });
  }

  // ✅ assertElementHidden
  // Example: await base.assertElementHidden(el.errorMessage);
  async assertElementHidden(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeHidden({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert hidden → ${name}`);
      return this;
    }, { context:`BasePage.assertElementHidden (${name})` });
  }

  // ✅ assertElementEnabled
  // Example: await base.assertElementEnabled(el.saveButton);
  async assertElementEnabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeEnabled({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert enabled → ${name}`);
      return this;
    }, { context:`BasePage.assertElementEnabled (${name})` });
  }

  // ✅ assertElementDisabled
  // Example: await base.assertElementDisabled(el.submitButton);
  async assertElementDisabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeDisabled({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert disabled → ${name}`);
      return this;
    }, { context:`BasePage.assertElementDisabled (${name})` });
  }

  // ✅ assertText — exact text match
  // Example: await base.assertText(el.statusLabel, "Approved");
  async assertText(selector: string | Locator, text: string | RegExp): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toHaveText(text, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert text → ${name}`);
      return this;
    }, { context:`BasePage.assertText (${name})` });
  }

  // ✅ assertContainsText — partial text match
  // Example: await base.assertContainsText(el.titleBar, "Purchase Order");
  async assertContainsText(selector: string | Locator, text: string): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toContainText(text, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert contains → ${name}`);
      return this;
    }, { context:`BasePage.assertContainsText (${name})` });
  }

  // ✅ assertValue — input field value
  // Example: await base.assertValue(el.quantityInput, "10");
  async assertValue(selector: string | Locator, value: string | RegExp): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toHaveValue(value, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert value → ${name}`);
      return this;
    }, { context:`BasePage.assertValue (${name})` });
  }

  // ✅ assertAttributeValue
  // Example: await base.assertAttributeValue(el.checkbox, "checked", "true");
  async assertAttributeValue(selector: string | Locator, attribute: string, value: string): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toHaveAttribute(attribute, value, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert attr → ${name}[${attribute}]`);
      return this;
    }, { context:`BasePage.assertAttributeValue (${name})` });
  }

  // ✅ assertChecked / assertNotChecked
  // Example: await base.assertChecked(el.termsCheckbox);
  //          await base.assertNotChecked(el.newsletterCheckbox);
  async assertChecked(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).toBeChecked({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert checked → ${name}`); return this;
    }, { context:`BasePage.assertChecked (${name})` });
  }

  async assertNotChecked(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector).first()).not.toBeChecked({ timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert not checked → ${name}`); return this;
    }, { context:`BasePage.assertNotChecked (${name})` });
  }

  // ✅ assertURL / assertTitle / assertElementCount
  // Example: await base.assertURL(/dashboard/);
  //          await base.assertTitle("Home | MyApp");
  //          await base.assertElementCount(el.tableRows, 5);
  async assertURL(url: string | RegExp): Promise<this> {
    return ErrorHandler.handle<this>(async () => {
      await expect(this.page).toHaveURL(url, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert URL → ${url}`); return this;
    }, { context:`BasePage.assertURL` });
  }

  async assertTitle(title: string | RegExp): Promise<this> {
    return ErrorHandler.handle<this>(async () => {
      await expect(this.page).toHaveTitle(title, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert title → ${title}`); return this;
    }, { context:`BasePage.assertTitle` });
  }

  async assertElementCount(selector: string | Locator, count: number): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await expect(this.getLocator(selector)).toHaveCount(count, { timeout: configManager.getTimeout("wait") });
      logger.pass(`Assert count → ${name} = ${count}`); return this;
    }, { context:`BasePage.assertElementCount (${name})` });
  }

  // ✅ softAssertVisible / softAssertText — does NOT stop test on failure
  // Example: await base.softAssertVisible(el.optionalBanner);
  //          await base.softAssertText(el.badge, "New");
  //          base.assertNoSoftErrors(); // call at end to throw all collected failures
  async softAssertVisible(selector: string | Locator, label?: string): Promise<void> {
    const name = label ?? this.getElementName(selector);
    try {
      await expect(this.getLocator(selector).first()).toBeVisible({ timeout: configManager.getTimeout("wait") });
      logger.pass(`[Soft] Visible → ${name}`);
    } catch {
      const msg = `[Soft FAIL] Not visible → ${name}`;
      logger.warn(msg); this._softErrors.push(msg);
    }
  }

  async softAssertText(selector: string | Locator, expected: string, label?: string): Promise<void> {
    const name = label ?? this.getElementName(selector);
    try {
      await expect(this.getLocator(selector).first()).toContainText(expected, { timeout: configManager.getTimeout("wait") });
      logger.pass(`[Soft] Text → ${name} contains "${expected}"`);
    } catch {
      const msg = `[Soft FAIL] Text mismatch → ${name} expected "${expected}"`;
      logger.warn(msg); this._softErrors.push(msg);
    }
  }

  assertNoSoftErrors(): void {
    if (this._softErrors.length > 0) {
      const s = this._softErrors.join("\n");
      this._softErrors = [];
      throw new Error(`Soft assertion failures:\n${s}`);
    }
  }

  // ==========================================================================
  //  QUERY METHODS — NO autoHeal (read-only, instant checks)
  // ==========================================================================

  // ✅ isVisible — returns true/false instantly, no wait, no heal
  // Example: if (await base.isVisible(el.closeButton)) { ... }
  async isVisible(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isVisible(); }
    catch { return false; }
  }

  // ✅ isEnabled — returns true/false instantly
  // Example: if (await base.isEnabled(el.submitButton)) { ... }
  async isEnabled(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isEnabled(); }
    catch { return false; }
  }

  // ✅ isChecked — returns true/false instantly
  // Example: if (await base.isChecked(el.agreeBox)) { ... }
  async isChecked(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isChecked(); }
    catch { return false; }
  }

  // ✅ getText — gets text content, uses resolveLocator (element must be visible)
  // Example: const label = await base.getText(el.statusBadge);
  async getText(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string>(async () => {
      const resolved = await this.resolveLocator(selector, name);
      return (await resolved.textContent())?.trim() || "";
    }, { context:`BasePage.getText (${name})` });
  }

  // ✅ getInputValue — gets current value of input field, NO autoHeal
  // Example: const qty = await base.getInputValue(el.quantityField);
  async getInputValue(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string>(async () => {
      return await this.getLocator(selector).first().inputValue();
    }, { context:`BasePage.getInputValue (${name})` });
  }

  // ✅ getAttribute — gets element attribute, NO autoHeal
  // Example: const href = await base.getAttribute(el.link, "href");
  async getAttribute(selector: string | Locator, attribute: string): Promise<string | null> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string | null>(async () => {
      return await this.getLocator(selector).first().getAttribute(attribute);
    }, { context:`BasePage.getAttribute (${name})` });
  }

  // ✅ getElementCount — counts matching elements, NO autoHeal
  // Example: const rows = await base.getElementCount(el.tableRows);
  async getElementCount(selector: string | Locator): Promise<number> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<number>(async () => {
      return await this.getLocator(selector).count();
    }, { context:`BasePage.getElementCount (${name})` });
  }

  // ✅ getDisabledFieldValue — reads value from disabled/read-only inputs via JS
  // Example: const amount = await base.getDisabledFieldValue(el.amountField);
  async getDisabledFieldValue(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    logger.step(`Get disabled field value → ${name}`);
    return ErrorHandler.handle<string>(async () => {
      const locator = this.getLocator(selector);
      await locator.first().waitFor({ state:"attached", timeout: configManager.getTimeout("wait") });
      const raw   = await locator.first().evaluate((el: any) => el.value ?? el.getAttribute("value") ?? "");
      const value = String(raw).replace(/,/g,"");
      logger.pass(`Disabled field value → ${name} : "${value}"`);
      return value;
    }, { context:`BasePage.getDisabledFieldValue (${name})` });
  }

  // ==========================================================================
  //  RUNTIME STORE HELPERS
  //  All store methods auto-use element name as key if key not provided
  //  All return the stored value so it can be used inline
  // ==========================================================================

  // ✅ storeText — reads text content → stores in Runtime → returns value
  // Example: await base.storeText(el.orderName);
  //          await base.storeText(el.orderName, "OrderName");
  //          const name = await base.storeText(el.orderName);
  async storeText(selector: Locator | string, key?: string): Promise<string> {
    const name     = this.getElementName(selector);
    const storeKey = key || name;
    return ErrorHandler.handle<string>(async () => {
      const loc = this.getLocator(selector);
      await loc.first().waitFor({ state:"visible", timeout: configManager.getTimeout("wait") });
      const value = (await loc.first().textContent())?.trim() || "";
      Runtime.set(storeKey, value);
      logger.pass(`Stored text → ${storeKey}: "${value}"`);
      return value;
    }, { context:`BasePage.storeText (${storeKey})` });
  }

  // ✅ storeValue — reads input value → stores in Runtime → returns value
  // Example: await base.storeValue(el.quantityField);
  //          await base.storeValue(el.quantityField, "Quantity");
  //          const qty = await base.storeValue(el.quantityField);
  async storeValue(selector: Locator | string, key?: string): Promise<string> {
    const name     = this.getElementName(selector);
    const storeKey = key || name;
    return ErrorHandler.handle<string>(async () => {
      const value = (await this.getLocator(selector).first().inputValue())?.trim() || "";
      Runtime.set(storeKey, value);
      logger.pass(`Stored value → ${storeKey}: "${value}"`);
      return value;
    }, { context:`BasePage.storeValue (${storeKey})` });
  }

  // ✅ storeCount — counts elements → stores in Runtime → returns count
  // Example: await base.storeCount(el.tableRows, "RowCount");
  //          const count = await base.storeCount(el.tableRows);
  async storeCount(selector: Locator | string, key?: string): Promise<number> {
    const name     = this.getElementName(selector);
    const storeKey = key || `${name}_count`;
    return ErrorHandler.handle<number>(async () => {
      const count = await this.getLocator(selector).count();
      Runtime.set(storeKey, String(count));
      logger.pass(`Stored count → ${storeKey}: ${count}`);
      return count;
    }, { context:`BasePage.storeCount (${storeKey})` });
  }

  // ✅ storeAttribute — reads attribute → stores in Runtime → returns value
  // Example: await base.storeAttribute(el.link, "href", "LinkURL");
  async storeAttribute(selector: Locator | string, attribute: string, key?: string): Promise<string> {
    const name     = this.getElementName(selector);
    const storeKey = key || `${name}_${attribute}`;
    return ErrorHandler.handle<string>(async () => {
      const value = (await this.getLocator(selector).first().getAttribute(attribute))?.trim() || "";
      Runtime.set(storeKey, value);
      logger.pass(`Stored attr → ${storeKey} [${attribute}]: "${value}"`);
      return value;
    }, { context:`BasePage.storeAttribute (${storeKey})` });
  }

  // ==========================================================================
  //  IF CONDITIONS — NO autoHeal (checking state, not interacting)
  // ==========================================================================

  // ✅ ifVisible — run action if element is visible
  // Example: await base.ifVisible(el.alert, async () => {
  //              await base.click(el.closeAlert);
  //          });
  //          await base.ifVisible(el.alert, async () => { ... }, async () => { ... }, 3000);
  async ifVisible(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>, timeout = 5000): Promise<void> {
    const name  = this.getElementName(selector);
    const isVis = await this.getLocator(selector).waitFor({ state:"visible", timeout }).then(()=>true).catch(()=>false);
    logger.debug(`IF visible → ${name} : ${isVis}`);
    if (isVis) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifNotVisible
  // Example: await base.ifNotVisible(el.submitBtn, async () => {
  //              log.warn("Submit not available");
  //          });
  async ifNotVisible(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>, timeout = 5000): Promise<void> {
    const name  = this.getElementName(selector);
    const isVis = await this.getLocator(selector).waitFor({ state:"visible", timeout }).then(()=>true).catch(()=>false);
    logger.debug(`IF not visible → ${name} : ${!isVis}`);
    if (!isVis) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifEnabled / ifDisabled
  // Example: await base.ifEnabled(el.saveBtn, async () => { await base.click(el.saveBtn); });
  async ifEnabled(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name    = this.getElementName(selector);
    const enabled = await this.getLocator(selector).first().isEnabled().catch(()=>false);
    logger.debug(`IF enabled → ${name} : ${enabled}`);
    if (enabled) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifDisabled(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name     = this.getElementName(selector);
    const disabled = await this.getLocator(selector).first().isDisabled().catch(()=>true);
    logger.debug(`IF disabled → ${name} : ${disabled}`);
    if (disabled) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifChecked / ifUnchecked
  // Example: await base.ifChecked(el.termsBox, async () => { log.info("Already checked"); });
  async ifChecked(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name    = this.getElementName(selector);
    const checked = await this.getLocator(selector).first().isChecked().catch(()=>false);
    logger.debug(`IF checked → ${name} : ${checked}`);
    if (checked) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifUnchecked(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name    = this.getElementName(selector);
    const checked = await this.getLocator(selector).first().isChecked().catch(()=>false);
    logger.debug(`IF unchecked → ${name} : ${!checked}`);
    if (!checked) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifText — compare element text with operator
  // Example: await base.ifText(el.status, "==", "Approved", async () => {
  //              log.pass("Status is Approved");
  //          });
  async ifText(selector: string | Locator, op: CompareOp, expected: string | number, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name   = this.getElementName(selector);
    const raw    = (await this.getLocator(selector).first().textContent())?.trim() ?? "";
    const result = this.compare(raw, op, String(expected));
    logger.debug(`IF text → ${name} "${raw}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifInputValue — compare input value with operator
  // Example: await base.ifInputValue(el.qty, ">", 0, async () => { ... });
  async ifInputValue(selector: string | Locator, op: CompareOp, expected: string | number, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name   = this.getElementName(selector);
    const raw    = await this.getLocator(selector).first().inputValue().catch(()=>"");
    const result = this.compare(raw.trim(), op, String(expected));
    logger.debug(`IF inputValue → ${name} "${raw}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifPageContainsText / ifPageNotContainsText
  // Example: await base.ifPageContainsText("Error", async () => {
  //              await base.takeScreenshot("error_found");
  //          });
  async ifPageContainsText(text: string, thenDo: () => Promise<void>, elseDo?: () => Promise<void>, timeout = 5000): Promise<void> {
    const found = await this.page.getByText(text).waitFor({ state:"visible", timeout }).then(()=>true).catch(()=>false);
    logger.debug(`IF page text → "${text}" : ${found}`);
    if (found) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifPageNotContainsText(text: string, thenDo: () => Promise<void>, elseDo?: () => Promise<void>, timeout = 5000): Promise<void> {
    const found = await this.page.getByText(text).waitFor({ state:"visible", timeout }).then(()=>true).catch(()=>false);
    logger.debug(`IF page NOT text → "${text}" : ${!found}`);
    if (!found) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifCount — compare element count with operator
  // Example: await base.ifCount(el.errors, ">", 0, async () => {
  //              log.warn("Validation errors found");
  //          });
  async ifCount(selector: string | Locator, op: CompareOp, expected: number, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name   = this.getElementName(selector);
    const count  = await this.getLocator(selector).count();
    const result = this.compare(String(count), op, String(expected));
    logger.debug(`IF count → ${name} : ${count} ${op} ${expected} : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifEmpty — check if input is empty
  // Example: await base.ifEmpty(el.searchBox, async () => {
  //              await base.type(el.searchBox, "default");
  //          });
  async ifEmpty(selector: string | Locator, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const name  = this.getElementName(selector);
    const value = await this.getLocator(selector).first().inputValue().catch(()=>"");
    const empty = value.trim() === "";
    logger.debug(`IF empty → ${name} : ${empty}`);
    if (empty) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ✅ ifURL
  // Example: await base.ifURL("contains", "/dashboard", async () => {
  //              log.pass("On dashboard");
  //          });
  async ifURL(op: CompareOp, expected: string, thenDo: () => Promise<void>, elseDo?: () => Promise<void>): Promise<void> {
    const url    = this.page.url();
    const result = this.compare(url, op, expected);
    logger.debug(`IF URL → "${url}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ==========================================================================
  //  WHILE LOOPS — NO autoHeal (checking state repeatedly)
  // ==========================================================================

  // ✅ whileVisible — repeat action while element is visible
  // Example: await base.whileVisible(el.approveButton, async () => {
  //              await base.click(el.approveButton);
  //              await base.waitForLoadState("domcontentloaded");
  //          }, 5);
  async whileVisible(selector: string | Locator, doAction: () => Promise<void>, maxIterations = 10): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const visible = await this.getLocator(selector).waitFor({ state:"visible", timeout:3000 }).then(()=>true).catch(()=>false);
      if (!visible) break;
      logger.debug(`WHILE visible → ${name} | iteration ${i+1}`);
      await doAction();
      i++;
    }
  }

  // ✅ whileNotVisible — repeat action while element is NOT visible
  // Example: await base.whileNotVisible(el.successBanner, async () => {
  //              await base.pause(1000);
  //          }, 10);
  async whileNotVisible(selector: string | Locator, doAction: () => Promise<void>, maxIterations = 10): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const visible = await this.getLocator(selector).waitFor({ state:"visible", timeout:3000 }).then(()=>true).catch(()=>false);
      if (visible) break;
      logger.debug(`WHILE not visible → ${name} | iteration ${i+1}`);
      await doAction();
      i++;
    }
  }

  // ✅ whileEnabled / whileDisabled
  // Example: await base.whileEnabled(el.nextButton, async () => {
  //              await base.click(el.nextButton);
  //          }, 20);
  async whileEnabled(selector: string | Locator, doAction: () => Promise<void>, maxIterations = 10): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const enabled = await this.getLocator(selector).first().isEnabled().catch(()=>false);
      if (!enabled) break;
      logger.debug(`WHILE enabled → ${name} | iteration ${i+1}`);
      await doAction();
      i++;
    }
  }

  async whileDisabled(selector: string | Locator, doAction: () => Promise<void>, maxIterations = 10): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const disabled = await this.getLocator(selector).first().isDisabled().catch(()=>true);
      if (!disabled) break;
      logger.debug(`WHILE disabled → ${name} | iteration ${i+1}`);
      await doAction();
      i++;
    }
  }

  // ✅ closeUntilVisible — click close button until target element appears
  // Stops when: target visible OR close button gone OR maxAttempts reached
  // Example: await base.closeUntilVisible(el.closeButton, el.approvedStatus, 5);
  async closeUntilVisible(closeSelector: string | Locator, targetSelector: string | Locator, maxAttempts = 5): Promise<void> {
    const name = this.getElementName(targetSelector);
    let attempts = 0;
    while (attempts < maxAttempts) {
      // ✅ Target visible → done
      const targetVisible = await this.getLocator(targetSelector)
        .waitFor({ state:"visible", timeout:2000 }).then(()=>true).catch(()=>false);
      if (targetVisible) { logger.debug(`closeUntilVisible → ${name} visible — done`); return; }

      // ✅ Close button gone → stop (all panels closed)
      const closeVisible = await this.getLocator(closeSelector)
        .waitFor({ state:"visible", timeout:2000 }).then(()=>true).catch(()=>false);
      if (!closeVisible) { logger.debug(`closeUntilVisible → Close gone — stopping`); return; }

      logger.debug(`closeUntilVisible → attempt ${attempts+1}/${maxAttempts}`);
      await this.getLocator(closeSelector).first().click();
      await this.page.waitForTimeout(300);
      attempts++;
    }
  }

  // ==========================================================================
  //  RETRY ACTION
  // ==========================================================================

  // ✅ retryAction — retry any async action up to N times
  // Example: await base.retryAction(async () => {
  //              await base.click(el.unstableButton);
  //          }, 3, 1000, "click unstable button");
  async retryAction(action: () => Promise<void>, maxRetries = 3, delayMs = 1000, label = "action"): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await action();
        logger.pass(`Retry[${attempt}/${maxRetries}] ${label} succeeded`);
        return;
      } catch (err: any) {
        logger.warn(`Retry[${attempt}/${maxRetries}] ${label} failed → ${err.message}`);
        if (attempt === maxRetries) throw err;
        await this.page.waitForTimeout(delayMs);
      }
    }
  }

  // ==========================================================================
  //  STEP LOGGER
  // ==========================================================================

  // ✅ step — group actions under a named step with timing
  // Example: await base.step("Fill login form", async () => {
  //              await base.fill(el.email, "user@test.com");
  //              await base.fill(el.password, "pass123");
  //          });
  resetStepCounter(): void { this._stepCounter = 0; }

  async step(description: string, action: () => Promise<void>): Promise<void> {
    this._stepCounter++;
    const start = Date.now();
    logger.step(`▶ Step ${this._stepCounter} | ${description}`);
    await action();
    logger.pass(`✅ Step ${this._stepCounter} done | +${Date.now()-start}ms`);
  }

  // ==========================================================================
  //  TOAST HELPERS
  // ==========================================================================

  // ✅ waitForSuccessToast / waitForErrorToast — returns toast message text
  // Example: const msg = await base.waitForSuccessToast();
  //          expect(msg).toContain("saved");
  async waitForSuccessToast(timeout = 10000): Promise<string> {
    const loc = this.page.locator(
      "xpath=//*[contains(@class,'toast') and contains(@class,'success')] | " +
      "xpath=//*[contains(@class,'alert-success')]"
    );
    try {
      await loc.first().waitFor({ state:"visible", timeout });
      const msg = (await loc.first().textContent())?.trim() ?? "";
      logger.pass(`Toast success → "${msg}"`);
      return msg;
    } catch { logger.warn("No success toast appeared"); return ""; }
  }

  async waitForErrorToast(timeout = 10000): Promise<string> {
    const loc = this.page.locator(
      "xpath=//*[contains(@class,'toast') and contains(@class,'error')] | " +
      "xpath=//*[contains(@class,'alert-error')]"
    );
    try {
      await loc.first().waitFor({ state:"visible", timeout });
      const msg = (await loc.first().textContent())?.trim() ?? "";
      logger.warn(`Toast error → "${msg}"`);
      return msg;
    } catch { return ""; }
  }

  // ==========================================================================
  //  TABLE HELPERS
  // ==========================================================================

  // ✅ getTableRowCount — count table rows
  // Example: const count = await base.getTableRowCount(el.ordersTable);
  async getTableRowCount(tableSelector: string | Locator): Promise<number> {
    const count = await this.getLocator(tableSelector).locator("tr").count();
    logger.pass(`Table rows → ${count}`);
    return count;
  }

  // ✅ getTableCellText — get text from specific cell [row][col]
  // Example: const cell = await base.getTableCellText(el.table, 0, 2);
  async getTableCellText(tableSelector: string | Locator, rowIndex: number, colIndex: number): Promise<string> {
    const text = (await this.getLocator(tableSelector)
      .locator("tr").nth(rowIndex).locator("td").nth(colIndex).textContent())?.trim() ?? "";
    logger.pass(`Table[${rowIndex}][${colIndex}] → "${text}"`);
    return text;
  }

  // ✅ clickTableRowByText — find row containing text and click it
  // Example: await base.clickTableRowByText(el.table, "PO-001");
  async clickTableRowByText(tableSelector: string | Locator, searchText: string): Promise<void> {
    const rows  = this.getLocator(tableSelector).locator("tr");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText?.includes(searchText)) {
        await rows.nth(i).click();
        logger.pass(`Clicked table row → "${searchText}"`);
        return;
      }
    }
    throw new Error(`Table row with text "${searchText}" not found`);
  }

  // ==========================================================================
  //  NETWORK
  // ==========================================================================

  // ✅ waitForAPIResponse — intercept API call and get response
  // Example: const { status, body } = await base.waitForAPIResponse(
  //              "/api/orders",
  //              async () => { await base.click(el.saveButton); }
  //          );
  async waitForAPIResponse(urlPattern: string | RegExp, action: () => Promise<void>, timeout = 30000): Promise<{ status: number; body: any }> {
    const [response] = await Promise.all([
      this.page.waitForResponse((res) => {
        const url = res.url();
        return typeof urlPattern === "string" ? url.includes(urlPattern) : urlPattern.test(url);
      }, { timeout }),
      action(),
    ]);
    const status = response.status();
    let body: any = {};
    try { body = await response.json(); } catch { /**/ }
    logger.pass(`API response → ${response.url()} | status: ${status}`);
    return { status, body };
  }

  // ✅ mockAPIResponse — intercept and mock an API endpoint
  // Example: await base.mockAPIResponse("/api/products", { items: [] }, 200);
  async mockAPIResponse(urlPattern: string, responseBody: object, status = 200): Promise<this> {
    await this.page.route(urlPattern, async route => {
      await route.fulfill({ status, contentType:"application/json", body: JSON.stringify(responseBody) });
    });
    logger.pass(`API mocked → ${urlPattern}`);
    return this;
  }

  // ✅ blockRequest — block a network request
  // Example: await base.blockRequest("/api/ads");
  async blockRequest(urlPattern: string): Promise<this> {
    await this.page.route(urlPattern, route => route.abort());
    logger.pass(`Request blocked → ${urlPattern}`);
    return this;
  }

  // ==========================================================================
  //  DIALOG
  // ==========================================================================

  // ✅ acceptDialog / dismissDialog — handle browser alert/confirm/prompt
  // Example: base.acceptDialog();  // call BEFORE the action that triggers dialog
  //          await base.click(el.deleteButton);
  acceptDialog(promptText?: string): this {
    this.page.once("dialog", d => { logger.debug(`Dialog accepted → "${d.message()}"`); d.accept(promptText); });
    return this;
  }

  dismissDialog(): this {
    this.page.once("dialog", d => { logger.debug(`Dialog dismissed → "${d.message()}"`); d.dismiss(); });
    return this;
  }

  // ==========================================================================
  //  IFRAME
  // ==========================================================================

  // ✅ switchToFrame / switchToMainFrame
  // Example: const frame = await base.switchToFrame(el.iframeElement);
  //          await base.switchToMainFrame();
  async switchToFrame(selector: string | Locator): Promise<FrameLocator> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<FrameLocator>(async () => {
      const fl = this.getLocator(selector).contentFrame();
      this._currentFrame = fl;
      logger.pass(`Frame → ${name}`);
      return fl;
    }, { context:`BasePage.switchToFrame` });
  }

  async switchToMainFrame(): Promise<this> {
    this._currentFrame = null;
    logger.debug("Main frame restored");
    return this;
  }

  getCurrentFrame(): FrameLocator | null { return this._currentFrame; }
  getFrameCount(): number { return this.page.frames().length - 1; }

  // ==========================================================================
  //  FILE UPLOAD
  // ==========================================================================

  // ✅ uploadFile — set file on input[type=file]
  // Example: await base.uploadFile(el.fileInput, "src/testData/invoice.pdf");
  //          await base.uploadFile(el.fileInput, ["file1.pdf", "file2.pdf"]);
  async uploadFile(selector: string | Locator, filePaths: string | string[]): Promise<this> {
    const name  = this.getElementName(selector);
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    logger.step(`Upload → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      await this.getLocator(selector).setInputFiles(files);
      logger.pass(`Uploaded → ${name}`);
      return this;
    }, { context:`BasePage.uploadFile` });
  }

  // ✅ clearFileUpload — clear file input
  // Example: await base.clearFileUpload(el.fileInput);
  async clearFileUpload(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      await this.getLocator(selector).setInputFiles([]);
      logger.pass(`File cleared → ${name}`);
      return this;
    }, { context:`BasePage.clearFileUpload` });
  }

  // ==========================================================================
  //  COOKIES & STORAGE
  // ==========================================================================

  // Example: const token = await base.getCookie("auth_token");
  async getCookie(name: string): Promise<string | undefined> {
    const cookies = await this.page.context().cookies();
    return cookies.find(c => c.name === name)?.value;
  }

  async clearCookies(): Promise<this> {
    await this.page.context().clearCookies();
    logger.pass("Cookies cleared");
    return this;
  }

  // Example: const item = await base.getLocalStorageItem("user_id");
  async getLocalStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate(k => window.localStorage.getItem(k), key);
  }

  // Example: await base.setLocalStorageItem("theme", "dark");
  async setLocalStorageItem(key: string, value: string): Promise<this> {
    await this.page.evaluate(({k,v}) => window.localStorage.setItem(k,v), {k:key,v:value});
    return this;
  }

  async clearLocalStorage(): Promise<this> {
    await this.page.evaluate(() => window.localStorage.clear());
    return this;
  }

  // ==========================================================================
  //  JAVASCRIPT
  // ==========================================================================

  // ✅ executeScript — run JS in browser context
  // Example: await base.executeScript("document.body.style.zoom = '0.5'");
  //          const title = await base.executeScript<string>("return document.title");
  async executeScript<T = void>(script: string): Promise<T> {
    return ErrorHandler.handle<T>(async () => {
      const result = await this.page.evaluate(script);
      logger.pass("Script executed");
      return result as T;
    }, { context:"BasePage.executeScript" });
  }

  // ==========================================================================
  //  SCROLL
  // ==========================================================================

  // ✅ scrollToElement — scroll element into view, NO autoHeal
  // Example: await base.scrollToElement(el.footer);
  //          await base.scrollIntoView(el.footer); // alias
  async scrollToElement(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Scroll to → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      await this.getLocator(selector).first().scrollIntoViewIfNeeded({ timeout:5000 });
      logger.pass(`Scrolled → ${name}`);
      return this;
    }, { context:`BasePage.scrollToElement` });
  }

  // ✅ scrollToTop / scrollToBottom / scrollBy
  // Example: await base.scrollToTop();
  //          await base.scrollToBottom();
  //          await base.scrollBy(0, 500); // scroll down 500px
  async scrollToTop(): Promise<this> {
    await this.page.evaluate(() => window.scrollTo(0,0));
    logger.pass("Scrolled to top"); return this;
  }

  async scrollToBottom(): Promise<this> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    logger.pass("Scrolled to bottom"); return this;
  }

  async scrollBy(x: number, y: number): Promise<this> {
    await this.page.evaluate(({sx,sy}) => window.scrollBy(sx,sy), {sx:x,sy:y});
    return this;
  }

  // ==========================================================================
  //  SCREENSHOT
  // ==========================================================================

  // ✅ takeScreenshot — full page screenshot
  // Example: await base.takeScreenshot("order_created");
  async takeScreenshot(name = "screenshot"): Promise<void> {
    const fileName = `${name}_${Date.now()}.png`;
    await this.page.screenshot({ path:`test-results/screenshots/${fileName}`, fullPage:true });
    logger.pass(`Screenshot → ${fileName}`);
  }

  // ✅ takeElementScreenshot — screenshot of specific element
  // Example: await base.takeElementScreenshot(el.chart, "revenue_chart");
  async takeElementScreenshot(selector: string | Locator, name = "element"): Promise<void> {
    const fileName = `${name}_${Date.now()}.png`;
    await this.getLocator(selector).screenshot({ path:`test-results/screenshots/${fileName}` });
    logger.pass(`Element screenshot → ${fileName}`);
  }

  // ==========================================================================
  //  DATEPICKER
  // ==========================================================================

  // ✅ fillDatePicker — handles both calendar popup and text input date fields
  // Example: await base.fillDatePicker(el.supplierInvoiceDate, "15/06/2026");
  //          await base.fillDatePicker(el.documentDate, "15/06/2026");
  async fillDatePicker(selector: string | Locator, date: string): Promise<this> {
    const name    = this.getElementName(selector);
    const locator = this.getLocator(selector);
    logger.step(`Fill datepicker → ${name} | "${date}"`);
    return ErrorHandler.handle<this>(async () => {
      await locator.first().waitFor({ state:"visible", timeout: configManager.getTimeout("action") });
      await locator.first().click();
      const calendarOpened = await this.page.locator(
        "[class*='react-datepicker__month-container'], [class*='datepicker-dropdown'], [class*='calendar-popup']"
      ).waitFor({ state:"visible", timeout:3000 }).then(()=>true).catch(()=>false);

      if (calendarOpened) {
        const todayCell    = this.page.locator("[class*='react-datepicker__day--today']:not([class*='outside']), [class*='react-datepicker__day--selected']").first();
        const todayVisible = await todayCell.waitFor({ state:"visible", timeout:3000 }).then(()=>true).catch(()=>false);
        if (todayVisible) {
          await todayCell.click();
          logger.pass(`Datepicker (calendar) → ${name} : today selected`);
        } else {
          await this.page.keyboard.press("Escape");
          await locator.first().click({ clickCount:3 });
          await locator.first().fill(date);
          await locator.first().press("Enter");
          logger.pass(`Datepicker (fallback) → ${name} : "${date}"`);
        }
      } else {
        await locator.first().click({ clickCount:3 });
        await locator.first().fill(date);
        logger.pass(`Datepicker (text input) → ${name} : "${date}"`);
      }
      await this.page.keyboard.press("Tab");
      return this;
    }, { context:`BasePage.fillDatePicker (${name})` });
  }

  // ==========================================================================
  //  MISC
  // ==========================================================================

  getCurrentURL(): string           { return this.page.url(); }
  async getTitle(): Promise<string> { return this.page.title(); }
  getPage(): Page                   { return this.page; }

  // ✅ pause — wait N milliseconds (use sparingly)
  // Example: await base.pause(300);
  async pause(milliseconds = 1000): Promise<this> {
    logger.warn(`pause → ${milliseconds}ms`);
    await this.page.waitForTimeout(milliseconds);
    return this;
  }

  // ✅ highlight — visually highlight element (DEBUG=true only)
  // Example: await base.highlight(el.submitButton, "red");
  async highlight(selector: string | Locator, color = "red"): Promise<void> {
    if (process.env.DEBUG !== "true") return;
    try {
      await this.getLocator(selector).first().evaluate((el, c) => {
        (el as HTMLElement).style.outline = `3px solid ${c}`;
        setTimeout(() => { (el as HTMLElement).style.outline = ""; }, 2000);
      }, color);
    } catch { /**/ }
  }
}