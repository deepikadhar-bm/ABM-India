// ============================================================================
//  BASE PAGE - ENTERPRISE LEVEL v2
// ----------------------------------------------------------------------------

import { Page, Locator, FrameLocator, expect } from "@playwright/test";
import { ElementUtils }   from "../utils/elementUtils";
import { WaitUtils }      from "../utils/waitUtils";
import { ErrorHandler }   from "../utils/errorHandler";
import { RetryOptions }   from "../utils/retryUtils";
import { configManager }  from "../config/env.index";
import { Global_Timeout } from "../config/globalTimeout";
import { Runtime }        from "../utils/runtimeStore";
import { logger }         from "../utils/logger";
import { autoHeal }       from "../utils/autoHeal";

// ✅ CompareOp declared OUTSIDE class — TypeScript requires this
type CompareOp = "==" | "!=" | "contains" | "!contains" | ">" | ">=" | "<" | "<=";

export class BasePage {
  protected page: Page;
  private _currentFrame: FrameLocator | null = null;
  private _softErrors: string[] = [];
  private _stepCounter = 0;

  constructor(page: Page) {
    this.page = page;
  }

  // ==========================================================================
  //  SELECTOR NORMALIZATION + AUTO-NAME
  // ==========================================================================

  protected getLocator(selector: string | Locator): Locator {
    try {
      if (typeof selector !== "string") return selector;
      if (selector.startsWith("//") || selector.startsWith("xpath=")) {
        return this.page.locator(`xpath=${selector.replace("xpath=", "")}`);
      }
      return this.page.locator(selector);
    } catch (error: any) {
      logger.error(`getLocator failed → ${selector} → ${error.message}`);
      throw new Error(`getLocator failed → ${selector} → ${error.message}`);
    }
  }

 // ============================================================================
//  CHANGE ONLY THIS ONE METHOD in basePage.ts
//  Find: protected getElementName(selector: string | Locator, explicitLabel?: string)
//  Replace the first few lines with this:
// ============================================================================

protected getElementName(selector: string | Locator, explicitLabel?: string): string {

    // ✅ Priority 1 — explicit label passed in code
    if (explicitLabel) return explicitLabel;

    // ✅ Priority 2 — named() tag set on locator (__name property)
    // This gives clean names: "Supplier Dropdown", "Item Option (ABC)"
    if (typeof selector !== "string") {
        const customName = (selector as any).__name;
        if (customName) return customName;
    }

    // ✅ Priority 3 — auto-extract from selector string (existing logic)
    try {
        if (typeof selector !== "string") {
            for (const key of Object.getOwnPropertyNames(this)) {
                if ((this as any)[key] === selector) return key;
            }
            try {
                const s          = selector.toString();
                const roleMatch  = s.match(/getByRole\((.*?)\)/);
                const textMatch  = s.match(/getByText\((.*?)\)/);
                const testMatch  = s.match(/getByTestId\((.*?)\)/);
                const cssMatch   = s.match(/locator\("([^"]+)"\)/);
                const xpathMatch = s.match(/locator\('xpath=(.*?)'\)/);
                if (roleMatch)  return roleMatch[1].replace(/["{}]/g, "").trim();
                if (textMatch)  return `text=${textMatch[1].replace(/["]/g, "")}`;
                if (testMatch)  return `testId=${testMatch[1].replace(/["]/g, "")}`;
                if (cssMatch)   return this.extractLabelFromSelector(cssMatch[1]);
                if (xpathMatch) return this.extractLabelFromSelector(xpathMatch[1]);
            } catch { /* ignore */ }
            return "element";
        }
        return this.extractLabelFromSelector(selector);
    } catch {
        return "element";
    }
}

  private extractLabelFromSelector(selector: string): string {
    if (!selector || typeof selector !== "string") return "element";
    try {
      const clean = selector.replace(/^css=/, "").replace(/^xpath=/, "").trim();
      if (!clean) return "element";
      if (clean.startsWith("#")) return clean.slice(1);
      if (clean.startsWith(".")) return clean.replace(/\./g, "-").replace(/^-/, "");

      const textMatch = clean.match(/text\(\)\s*=\s*["']([^"']+)["']/) ||
                        clean.match(/normalize-space\(\)\s*=\s*["']([^"']+)["']/) ||
                        clean.match(/contains\(text\(\),\s*["']([^"']+)["']\)/);
      if (textMatch?.[1]) return textMatch[1].trim().replace(/\s+/g, "_").substring(0, 30);

      const attrMatch = clean.match(/@id=["']([^"']+)["']/) ||
                        clean.match(/@name=["']([^"']+)["']/) ||
                        clean.match(/@placeholder=["']([^"']+)["']/) ||
                        clean.match(/@aria-label=["']([^"']+)["']/);
      if (attrMatch?.[1]) return attrMatch[1].trim().substring(0, 30);

      const testIdMatch = clean.match(/data-testid=["']([^"']+)["']/);
      if (testIdMatch?.[1]) return testIdMatch[1];

      if (clean.startsWith("//") || clean.includes("@")) {
        return clean
          .replace(/[^a-zA-Z0-9\s]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .substring(0, 30) || "element";
      }

      return clean.substring(0, 30) || "element";
    } catch {
      return "element";
    }
  }

  // ==========================================================================
  //  PRIVATE: compare() — shared by all if/while conditions
  // ==========================================================================

  private compare(actual: string, op: string, expected: string): boolean {
    const a    = actual.trim();
    const e    = expected.trim();
    const aNum = parseFloat(a);
    const eNum = parseFloat(e);

    switch (op) {
      case "==":        return a === e;
      case "!=":        return a !== e;
      case "contains":  return a.toLowerCase().includes(e.toLowerCase());
      case "!contains": return !a.toLowerCase().includes(e.toLowerCase());
      case ">":         return !isNaN(aNum) && !isNaN(eNum) && aNum > eNum;
      case ">=":        return !isNaN(aNum) && !isNaN(eNum) && aNum >= eNum;
      case "<":         return !isNaN(aNum) && !isNaN(eNum) && aNum < eNum;
      case "<=":        return !isNaN(aNum) && !isNaN(eNum) && aNum <= eNum;
      default:          return false;
    }
  }

  // ==========================================================================
  //  NAVIGATION
  // ==========================================================================

  async navigateTo(url: string): Promise<this> {
    logger.step(`Navigate To → ${url}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout:   Global_Timeout.navigation,
        });
        await WaitUtils.waitForLoadState(this.page, "load", Global_Timeout.navigation);
        logger.pass(`Navigated → ${url}`);
        return this;
      } catch (error: any) {
        logger.error(`navigateTo failed → ${url} → ${error.message}`);
        throw new Error(`navigateTo failed → ${url} → ${error.message}`);
      }
    }, { context: `BasePage.navigateTo (${url})` });
  }

  async goto(path = "/"): Promise<this> {
    const fullUrl = `${configManager.getBaseURL()}${path}`;
    logger.step(`Goto → ${fullUrl}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.navigateTo(fullUrl);
        return this;
      } catch (error: any) {
        logger.error(`goto failed → ${path} → ${error.message}`);
        throw new Error(`goto failed → ${path} → ${error.message}`);
      }
    }, { context: `BasePage.goto (${path})` });
  }

  async reload(): Promise<this> {
    logger.step("Reload Page");
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.reload({ waitUntil: "domcontentloaded" });
        logger.pass("Page reloaded");
        return this;
      } catch (error: any) {
        logger.error(`reload failed → ${error.message}`);
        throw new Error(`reload failed → ${error.message}`);
      }
    }, { context: "BasePage.reload" });
  }

  async goBack(): Promise<this> {
    logger.step("Go Back");
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.goBack({ waitUntil: "domcontentloaded" });
        logger.pass("Back navigation done");
        return this;
      } catch (error: any) {
        logger.error(`goBack failed → ${error.message}`);
        throw new Error(`goBack failed → ${error.message}`);
      }
    }, { context: "BasePage.goBack" });
  }

  async goForward(): Promise<this> {
    logger.step("Go Forward");
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.goForward({ waitUntil: "domcontentloaded" });
        logger.pass("Forward navigation done");
        return this;
      } catch (error: any) {
        logger.error(`goForward failed → ${error.message}`);
        throw new Error(`goForward failed → ${error.message}`);
      }
    }, { context: "BasePage.goForward" });
  }

  // ==========================================================================
  //  SCROLL HELPERS
  // ==========================================================================

  async scrollIntoView(selector: string | Locator): Promise<this> {
    return this.scrollToElement(selector);
  }

  // ==========================================================================
  //  ELEMENT ACTIONS
  // ==========================================================================

  async click(
    selector: string | Locator,
    options?: { force?: boolean; label?: string; retryOptions?: RetryOptions }
  ): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await ElementUtils.click(
          this.getLocator(selector),
          { timeout: Global_Timeout.action, ...options, label: name }
        );
        logger.pass(`Clicked → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`click failed → ${name} → ${error.message}`);
        throw new Error(`click failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.click (${name})` });
  }

  async doubleClick(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Double Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] doubleClick healed via [${strategy}] → ${name}`);
        await healed.first().dblclick({ timeout: Global_Timeout.action });
        logger.pass(`Double-clicked → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`doubleClick failed → ${name} → ${error.message}`);
        throw new Error(`doubleClick failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.doubleClick (${name})` });
  }

  async rightClick(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Right Click → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] rightClick healed via [${strategy}] → ${name}`);
        await healed.first().click({ button: "right", timeout: Global_Timeout.action });
        logger.pass(`Right-clicked → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`rightClick failed → ${name} → ${error.message}`);
        throw new Error(`rightClick failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.rightClick (${name})` });
  }

  async fill(
    selector: string | Locator,
    text: string,
    options?: { label?: string; retryOptions?: RetryOptions }
  ): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Fill → ${name} | "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await ElementUtils.fill(
          this.getLocator(selector),
          text,
          { timeout: Global_Timeout.action, ...options, label: name }
        );
        logger.pass(`Filled → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`fill failed → ${name} → ${error.message}`);
        throw new Error(`fill failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.fill (${name})` });
  }

  async type(
    selector: string | Locator,
    text: string,
    delay?: number,
    options?: { label?: string; retryOptions?: RetryOptions }
  ): Promise<this> {
    const name = this.getElementName(selector, options?.label);
    logger.step(`Type → ${name} | "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await ElementUtils.type(
          this.getLocator(selector),
          text,
          { timeout: Global_Timeout.action, delay, ...options, label: name }
        );
        logger.pass(`Typed → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`type failed → ${name} → ${error.message}`);
        throw new Error(`type failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.type (${name})` });
  }

  async clear(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Clear → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await ElementUtils.clear(this.getLocator(selector));
        logger.pass(`Cleared → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`clear failed → ${name} → ${error.message}`);
        throw new Error(`clear failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.clear (${name})` });
  }

  async selectOption(selector: string | Locator, value: string | string[]): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Select → ${name} | ${JSON.stringify(value)}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] selectOption healed via [${strategy}] → ${name}`);
        await healed.first().selectOption(value, { timeout: Global_Timeout.action });
        logger.pass(`Selected → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`selectOption failed → ${name} → ${error.message}`);
        throw new Error(`selectOption failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.selectOption (${name})` });
  }

  async check(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Check → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] check healed via [${strategy}] → ${name}`);
        await healed.first().check({ timeout: Global_Timeout.action });
        logger.pass(`Checked → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`check failed → ${name} → ${error.message}`);
        throw new Error(`check failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.check (${name})` });
  }

  async uncheck(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Uncheck → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] uncheck healed via [${strategy}] → ${name}`);
        await healed.first().uncheck({ timeout: Global_Timeout.action });
        logger.pass(`Unchecked → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`uncheck failed → ${name} → ${error.message}`);
        throw new Error(`uncheck failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.uncheck (${name})` });
  }

  async hover(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Hover → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] hover healed via [${strategy}] → ${name}`);
        await healed.first().hover({ timeout: Global_Timeout.action });
        logger.pass(`Hovered → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`hover failed → ${name} → ${error.message}`);
        throw new Error(`hover failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.hover (${name})` });
  }

  async focus(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Focus → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] focus healed via [${strategy}] → ${name}`);
        await healed.first().focus({ timeout: Global_Timeout.action });
        logger.pass(`Focused → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`focus failed → ${name} → ${error.message}`);
        throw new Error(`focus failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.focus (${name})` });
  }

  async press(selector: string | Locator, key: string): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Press → ${name} | "${key}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Global_Timeout.action);
        if (wasHealed) logger.warn(`[AutoHeal] press healed via [${strategy}] → ${name}`);
        await healed.first().press(key, { timeout: Global_Timeout.action });
        logger.pass(`Pressed "${key}" → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`press failed → ${name} → ${error.message}`);
        throw new Error(`press failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.press (${name})` });
  }

  // ==========================================================================
  //  KEYBOARD & MOUSE
  // ==========================================================================

  async pressKey(key: string): Promise<this> {
    logger.step(`Press key → "${key}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.keyboard.press(key);
        logger.pass(`Key pressed → "${key}"`);
        return this;
      } catch (error: any) {
        logger.error(`pressKey failed → "${key}" → ${error.message}`);
        throw new Error(`pressKey failed → "${key}" → ${error.message}`);
      }
    }, { context: `BasePage.pressKey (${key})` });
  }

  async typeText(text: string): Promise<this> {
    logger.step(`Type text → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.keyboard.type(text);
        logger.pass(`Typed → "${text}"`);
        return this;
      } catch (error: any) {
        logger.error(`typeText failed → ${error.message}`);
        throw new Error(`typeText failed → ${error.message}`);
      }
    }, { context: "BasePage.typeText" });
  }

  async mouseClick(x: number, y: number, button: "left" | "right" | "middle" = "left", clickCount = 1): Promise<this> {
    logger.step(`Mouse click → x=${x}, y=${y}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.mouse.click(x, y, { button, clickCount });
        logger.pass(`Mouse clicked → x=${x}, y=${y}`);
        return this;
      } catch (error: any) {
        logger.error(`mouseClick failed → ${error.message}`);
        throw new Error(`mouseClick failed → ${error.message}`);
      }
    }, { context: `BasePage.mouseClick (${x}, ${y})` });
  }

  async mouseMove(x: number, y: number): Promise<this> {
    logger.debug(`Mouse move → x=${x}, y=${y}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.mouse.move(x, y);
        return this;
      } catch (error: any) {
        logger.error(`mouseMove failed → ${error.message}`);
        throw new Error(`mouseMove failed → ${error.message}`);
      }
    }, { context: `BasePage.mouseMove (${x}, ${y})` });
  }

  async dragAndDrop(source: string | Locator, target: string | Locator): Promise<this> {
    const sourceName = this.getElementName(source);
    const targetName = this.getElementName(target);
    logger.step(`Drag → ${sourceName} to ${targetName}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.getLocator(source).dragTo(this.getLocator(target));
        logger.pass(`Dragged → ${sourceName} to ${targetName}`);
        return this;
      } catch (error: any) {
        logger.error(`dragAndDrop failed → ${sourceName} → ${targetName} → ${error.message}`);
        throw new Error(`dragAndDrop failed → ${sourceName} → ${targetName} → ${error.message}`);
      }
    }, { context: `BasePage.dragAndDrop (${sourceName} → ${targetName})` });
  }

  // ==========================================================================
  //  NEW TAB / WINDOW
  // ==========================================================================

  async clickAndGetNewTab(selector: string | Locator): Promise<Page> {
    const name = this.getElementName(selector);
    logger.step(`Click → new tab via ${name}`);
    return ErrorHandler.handle<Page>(async () => {
      try {
        const [newPage] = await Promise.all([
          this.page.context().waitForEvent("page"),
          this.getLocator(selector).click(),
        ]);
        await newPage.waitForLoadState("domcontentloaded");
        logger.pass(`New tab → ${newPage.url()}`);
        return newPage;
      } catch (error: any) {
        logger.error(`clickAndGetNewTab failed → ${name} → ${error.message}`);
        throw new Error(`clickAndGetNewTab failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.clickAndGetNewTab (${name})` });
  }

  async switchToTab(index: number): Promise<Page> {
    logger.step(`Switch to tab [${index}]`);
    return ErrorHandler.handle<Page>(async () => {
      try {
        const pages = this.page.context().pages();
        if (index >= pages.length) throw new Error(`Tab [${index}] out of range. Found ${pages.length}.`);
        const tab = pages[index];
        await tab.bringToFront();
        logger.pass(`Tab [${index}] → ${tab.url()}`);
        return tab;
      } catch (error: any) {
        logger.error(`switchToTab failed → [${index}] → ${error.message}`);
        throw new Error(`switchToTab failed → [${index}] → ${error.message}`);
      }
    }, { context: `BasePage.switchToTab (${index})` });
  }

  getTabCount(): number { return this.page.context().pages().length; }

  // ==========================================================================
  //  WAIT METHODS
  // ==========================================================================

  async waitForElementIsVisible(selector: string | Locator, timeout?: number): Promise<this> {
    const name     = this.getElementName(selector);
    const waitTime = timeout || Global_Timeout.wait;
    logger.step(`Wait visible → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Math.min(10000, waitTime));
        if (wasHealed) logger.warn(`[AutoHeal] waitForElementIsVisible healed via [${strategy}] → ${name}`);
        await WaitUtils.waitForElementIsVisible(healed, waitTime);
        logger.pass(`Visible → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`waitForElementIsVisible failed → ${name} → ${error.message}`);
        throw new Error(`waitForElementIsVisible failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.waitForElementIsVisible (${name})` });
  }

  async waitForElementToDisappear(selector: string | Locator, timeout?: number): Promise<this> {
    const name     = this.getElementName(selector);
    const waitTime = timeout || Global_Timeout.wait;
    logger.step(`Wait disappear → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, Math.min(10000, waitTime));
        if (wasHealed) logger.warn(`[AutoHeal] waitForElementToDisappear healed via [${strategy}] → ${name}`);
        await WaitUtils.waitForElementToDisappear(healed, waitTime);
        logger.pass(`Disappeared → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`waitForElementToDisappear failed → ${name} → ${error.message}`);
        throw new Error(`waitForElementToDisappear failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.waitForElementToDisappear (${name})` });
  }

  async waitForElementEnabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Wait enabled → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, 3000);
        if (wasHealed) logger.warn(`[AutoHeal] waitForElementEnabled healed via [${strategy}] → ${name}`);
        await expect(healed.first()).toBeEnabled({ timeout: Global_Timeout.wait });
        logger.pass(`Enabled → ${name}`);
        return this;
      } catch (error: any) {
        logger.error(`waitForElementEnabled failed → ${name} → ${error.message}`);
        throw new Error(`waitForElementEnabled failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.waitForElementEnabled (${name})` });
  }

  async waitForURL(url: string | RegExp): Promise<this> {
    logger.step(`Wait URL → ${url}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.waitForURL(url, { timeout: Global_Timeout.navigation });
        logger.pass(`URL matched → ${url}`);
        return this;
      } catch (error: any) {
        logger.error(`waitForURL failed → expected: ${url} | current: ${this.page.url()}`);
        throw new Error(`waitForURL failed → expected: ${url} → ${error.message}`);
      }
    }, { context: `BasePage.waitForURL (${url})` });
  }

  async waitForLoadState(state: "load" | "domcontentloaded" | "networkidle" = "load"): Promise<this> {
    logger.debug(`Wait loadState → ${state}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.page.waitForLoadState(state, { timeout: Global_Timeout.navigation });
        logger.debug(`LoadState reached → ${state}`);
        return this;
      } catch (error: any) {
        logger.error(`waitForLoadState failed → ${state} → ${error.message}`);
        throw new Error(`waitForLoadState failed → ${state} → ${error.message}`);
      }
    }, { context: `BasePage.waitForLoadState (${state})` });
  }

  async waitForTextOnPage(text: string | RegExp, timeout?: number): Promise<this> {
    const waitTime = timeout || Global_Timeout.wait;
    logger.step(`Wait text → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.page.getByText(text)).toBeVisible({ timeout: waitTime });
        logger.pass(`Text visible → "${text}"`);
        return this;
      } catch (error: any) {
        logger.error(`waitForTextOnPage failed → "${text}" → ${error.message}`);
        throw new Error(`waitForTextOnPage failed → ${text} → ${error.message}`);
      }
    }, { context: `BasePage.waitForTextOnPage (${text})` });
  }

  async waitForTextDisappear(text: string | RegExp, timeout?: number): Promise<this> {
    const waitTime = timeout || Global_Timeout.wait;
    logger.step(`Wait text gone → "${text}"`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.page.getByText(text)).not.toBeVisible({ timeout: waitTime });
        logger.pass(`Text gone → "${text}"`);
        return this;
      } catch (error: any) {
        logger.error(`waitForTextDisappear failed → "${text}" → ${error.message}`);
        throw new Error(`waitForTextDisappear failed → ${text} → ${error.message}`);
      }
    }, { context: `BasePage.waitForTextDisappear (${text})` });
  }

  async waitForPageReady(timeout = 10000): Promise<this> {
    logger.debug("Wait → page ready");
    try {
      await this.page.waitForLoadState("networkidle", { timeout });
      for (const s of [
        "//div[contains(@class,'loading')]",
        "//div[contains(@class,'spinner')]",
        "//div[contains(@class,'skeleton')]",
        "//*[@data-loading='true']",
      ]) {
        await this.page.locator(`xpath=${s}`)
          .waitFor({ state: "hidden", timeout: 3000 })
          .catch(() => {});
      }
      logger.debug("Page ready ✅");
    } catch { /* networkidle not always reachable */ }
    return this;
  }

  // ==========================================================================
  //  ASSERTIONS
  // ==========================================================================

  async assertElementVisible(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toBeVisible({ timeout: Global_Timeout.wait });
        logger.pass(`Assert visible → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertElementVisible failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertElementVisible (${name})` });
  }

  async assertElementHidden(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toBeHidden({ timeout: Global_Timeout.wait });
        logger.pass(`Assert hidden → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertElementHidden failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertElementHidden (${name})` });
  }

  async assertElementEnabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toBeEnabled({ timeout: Global_Timeout.wait });
        logger.pass(`Assert enabled → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertElementEnabled failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertElementEnabled (${name})` });
  }

  async assertElementDisabled(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toBeDisabled({ timeout: Global_Timeout.wait });
        logger.pass(`Assert disabled → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertElementDisabled failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertElementDisabled (${name})` });
  }

  async assertText(selector: string | Locator, text: string | RegExp): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toHaveText(text, { timeout: Global_Timeout.wait });
        logger.pass(`Assert text → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertText failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertText (${name})` });
  }

  async assertContainsText(selector: string | Locator, text: string): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toContainText(text, { timeout: Global_Timeout.wait });
        logger.pass(`Assert contains text → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertContainsText failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertContainsText (${name})` });
  }

  async assertValue(selector: string | Locator, value: string | RegExp): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toHaveValue(value, { timeout: Global_Timeout.wait });
        logger.pass(`Assert value → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertValue failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertValue (${name})` });
  }

  async assertAttributeValue(selector: string | Locator, attribute: string, value: string): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toHaveAttribute(attribute, value, { timeout: Global_Timeout.wait });
        logger.pass(`Assert attr → ${name}[${attribute}]`);
        return this;
      } catch (error: any) {
        throw new Error(`assertAttributeValue failed → ${name}[${attribute}] → ${error.message}`);
      }
    }, { context: `BasePage.assertAttributeValue (${name})` });
  }

  async assertChecked(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).toBeChecked({ timeout: Global_Timeout.wait });
        logger.pass(`Assert checked → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertChecked failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertChecked (${name})` });
  }

  async assertNotChecked(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector).first()).not.toBeChecked({ timeout: Global_Timeout.wait });
        logger.pass(`Assert not checked → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`assertNotChecked failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertNotChecked (${name})` });
  }

  async assertURL(url: string | RegExp): Promise<this> {
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.page).toHaveURL(url, { timeout: Global_Timeout.wait });
        logger.pass(`Assert URL → ${url}`);
        return this;
      } catch (error: any) {
        logger.error(`assertURL failed → expected: ${url} | actual: ${this.page.url()}`);
        throw new Error(`assertURL failed → expected: ${url} → ${error.message}`);
      }
    }, { context: `BasePage.assertURL (${url})` });
  }

  async assertTitle(title: string | RegExp): Promise<this> {
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.page).toHaveTitle(title, { timeout: Global_Timeout.wait });
        logger.pass(`Assert title → ${title}`);
        return this;
      } catch (error: any) {
        const actual = await this.page.title();
        logger.error(`assertTitle failed → expected: "${title}" | actual: "${actual}"`);
        throw new Error(`assertTitle failed → expected: ${title} → ${error.message}`);
      }
    }, { context: `BasePage.assertTitle (${title})` });
  }

  async assertElementCount(selector: string | Locator, count: number): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await expect(this.getLocator(selector)).toHaveCount(count, { timeout: Global_Timeout.wait });
        logger.pass(`Assert count → ${name} = ${count}`);
        return this;
      } catch (error: any) {
        const actual = await this.getLocator(selector).count();
        logger.error(`assertElementCount failed → ${name} | expected: ${count} | actual: ${actual}`);
        throw new Error(`assertElementCount failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.assertElementCount (${name})` });
  }

  // ── Soft Assertions ───────────────────────────────────────────────────────

  async softAssertVisible(selector: string | Locator, label?: string): Promise<void> {
    const name = label ?? this.getElementName(selector);
    try {
      await expect(this.getLocator(selector).first()).toBeVisible({ timeout: Global_Timeout.wait });
      logger.pass(`[Soft] Visible → ${name}`);
    } catch {
      const msg = `[Soft FAIL] Not visible → ${name}`;
      logger.warn(msg);
      this._softErrors.push(msg);
    }
  }

  async softAssertText(selector: string | Locator, expected: string, label?: string): Promise<void> {
    const name = label ?? this.getElementName(selector);
    try {
      await expect(this.getLocator(selector).first()).toContainText(expected, { timeout: Global_Timeout.wait });
      logger.pass(`[Soft] Text → ${name} contains "${expected}"`);
    } catch {
      const msg = `[Soft FAIL] Text mismatch → ${name} expected "${expected}"`;
      logger.warn(msg);
      this._softErrors.push(msg);
    }
  }

  assertNoSoftErrors(): void {
    if (this._softErrors.length > 0) {
      const summary = this._softErrors.join("\n");
      this._softErrors = [];
      throw new Error(`Soft assertion failures:\n${summary}`);
    }
  }

  // ==========================================================================
  //  QUERY METHODS
  // ==========================================================================

  async isVisible(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isVisible(); }
    catch { return false; }
  }

  async isEnabled(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isEnabled(); }
    catch { return false; }
  }

  async isChecked(selector: string | Locator): Promise<boolean> {
    try { return await this.getLocator(selector).first().isChecked(); }
    catch { return false; }
  }

  async getText(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, 3000);
        if (wasHealed) logger.warn(`[AutoHeal] getText healed via [${strategy}] → ${name}`);
        await healed.first().waitFor({ state: "visible", timeout: Global_Timeout.wait });
        return (await healed.first().textContent())?.trim() || "";
      } catch (error: any) {
        throw new Error(`getText failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.getText (${name})` });
  }

  async getInputValue(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, 3000);
        if (wasHealed) logger.warn(`[AutoHeal] getInputValue healed via [${strategy}] → ${name}`);
        return await healed.first().inputValue();
      } catch (error: any) {
        throw new Error(`getInputValue failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.getInputValue (${name})` });
  }

  async getAttribute(selector: string | Locator, attribute: string): Promise<string | null> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<string | null>(async () => {
      try { return await this.getLocator(selector).first().getAttribute(attribute); }
      catch (error: any) { throw new Error(`getAttribute failed → ${name}[${attribute}] → ${error.message}`); }
    }, { context: `BasePage.getAttribute (${name})` });
  }

  async getElementCount(selector: string | Locator): Promise<number> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<number>(async () => {
      try { return await this.getLocator(selector).count(); }
      catch (error: any) { throw new Error(`getElementCount failed → ${name} → ${error.message}`); }
    }, { context: `BasePage.getElementCount (${name})` });
  }

  async getDisabledFieldValue(selector: string | Locator): Promise<string> {
    const name = this.getElementName(selector);
    logger.step(`Get disabled field value → ${name}`);
    return ErrorHandler.handle<string>(async () => {
      try {
        const locator = this.getLocator(selector);
        await locator.first().waitFor({ state: "attached", timeout: Global_Timeout.wait });
        const raw = await locator.first().evaluate((el: any) => {
          return el.value ?? el.getAttribute("value") ?? "";
        });
        const value = String(raw).replace(/,/g, "");
        logger.pass(`Disabled field value → ${name} : "${value}"`);
        return value;
      } catch (error: any) {
        logger.error(`getDisabledFieldValue failed → ${name} → ${error.message}`);
        throw new Error(`getDisabledFieldValue failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.getDisabledFieldValue (${name})` });
  }

  // ==========================================================================
  //  IF CONDITIONS
  // ==========================================================================

  async ifVisible(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>,
    timeout = 5000
  ): Promise<void> {
    const name = this.getElementName(selector);
    const isVis = await this.getLocator(selector)
      .waitFor({ state: "visible", timeout })
      .then(() => true).catch(() => false);
    logger.debug(`IF visible → ${name} : ${isVis}`);
    if (isVis) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifNotVisible(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>,
    timeout = 5000
  ): Promise<void> {
    const name = this.getElementName(selector);
    const isVis = await this.getLocator(selector)
      .waitFor({ state: "visible", timeout })
      .then(() => true).catch(() => false);
    logger.debug(`IF not visible → ${name} : ${!isVis}`);
    if (!isVis) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifEnabled(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name    = this.getElementName(selector);
    const enabled = await this.getLocator(selector).first().isEnabled().catch(() => false);
    logger.debug(`IF enabled → ${name} : ${enabled}`);
    if (enabled) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifDisabled(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name     = this.getElementName(selector);
    const disabled = await this.getLocator(selector).first().isDisabled().catch(() => true);
    logger.debug(`IF disabled → ${name} : ${disabled}`);
    if (disabled) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifChecked(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name    = this.getElementName(selector);
    const checked = await this.getLocator(selector).first().isChecked().catch(() => false);
    logger.debug(`IF checked → ${name} : ${checked}`);
    if (checked) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifUnchecked(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name    = this.getElementName(selector);
    const checked = await this.getLocator(selector).first().isChecked().catch(() => false);
    logger.debug(`IF unchecked → ${name} : ${!checked}`);
    if (!checked) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifText(
    selector: string | Locator,
    op: CompareOp,
    expected: string | number,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name   = this.getElementName(selector);
    const raw    = (await this.getLocator(selector).first().textContent())?.trim() ?? "";
    const result = this.compare(raw, op, String(expected));
    logger.debug(`IF text → ${name} "${raw}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifInputValue(
    selector: string | Locator,
    op: CompareOp,
    expected: string | number,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name   = this.getElementName(selector);
    const raw    = await this.getLocator(selector).first().inputValue().catch(() => "");
    const result = this.compare(raw.trim(), op, String(expected));
    logger.debug(`IF inputValue → ${name} "${raw}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifPageContainsText(
    text: string,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>,
    timeout = 5000
  ): Promise<void> {
    const found = await this.page.getByText(text)
      .waitFor({ state: "visible", timeout })
      .then(() => true).catch(() => false);
    logger.debug(`IF page text → "${text}" : ${found}`);
    if (found) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifPageNotContainsText(
    text: string,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>,
    timeout = 5000
  ): Promise<void> {
    const found = await this.page.getByText(text)
      .waitFor({ state: "visible", timeout })
      .then(() => true).catch(() => false);
    logger.debug(`IF page NOT text → "${text}" : ${!found}`);
    if (!found) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifPageTitleContains(
    text: string,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const title = await this.page.title();
    const match = title.includes(text);
    logger.debug(`IF title contains → "${text}" in "${title}" : ${match}`);
    if (match) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifURL(
    op: CompareOp,
    expected: string,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const url    = this.page.url();
    const result = this.compare(url, op, expected);
    logger.debug(`IF URL → "${url}" ${op} "${expected}" : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifCount(
    selector: string | Locator,
    op: CompareOp,
    expected: number,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name   = this.getElementName(selector);
    const count  = await this.getLocator(selector).count();
    const result = this.compare(String(count), op, String(expected));
    logger.debug(`IF count → ${name} : ${count} ${op} ${expected} : ${result}`);
    if (result) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifEmpty(
    selector: string | Locator,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const name  = this.getElementName(selector);
    const value = await this.getLocator(selector).first().inputValue().catch(() => "");
    const empty = value.trim() === "";
    logger.debug(`IF empty → ${name} : ${empty}`);
    if (empty) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifBrowserIs(
    expected: string,
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>
  ): Promise<void> {
    const browserType = this.page.context().browser()?.browserType().name() ?? "";
    const match       = browserType.toLowerCase() === expected.toLowerCase();
    logger.debug(`IF browser → "${browserType}" == "${expected}" : ${match}`);
    if (match) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  async ifPageLoaded(
    thenDo: () => Promise<void>,
    elseDo?: () => Promise<void>,
    timeout = 10000
  ): Promise<void> {
    const loaded = await this.page
      .waitForLoadState("load", { timeout })
      .then(() => true).catch(() => false);
    logger.debug(`IF page loaded : ${loaded}`);
    if (loaded) { await thenDo(); } else if (elseDo) { await elseDo(); }
  }

  // ==========================================================================
  //  WHILE LOOPS
  // ==========================================================================

  async whileVisible(
    selector: string | Locator,
    doAction: () => Promise<void>,
    maxIterations = 10
  ): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const visible = await this.getLocator(selector)
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true).catch(() => false);
      if (!visible) break;
      logger.debug(`WHILE visible → ${name} | iteration ${i + 1}`);
      await doAction();
      i++;
    }
  }

  async closeUntilVisible(
    closeSelector: string | Locator,
    targetSelector: string | Locator,
    maxAttempts = 5
  ): Promise<void> {
    const name = this.getElementName(targetSelector);
    let attempts = 0;
    while (attempts < maxAttempts) {
      const visible = await this.getLocator(targetSelector)
        .waitFor({ state: "visible", timeout: 2000 })
        .then(() => true).catch(() => false);
      if (visible) {
        logger.debug(`closeUntilVisible → ${name} already visible`);
        return;
      }
      logger.debug(`closeUntilVisible → ${name} not visible, trying close (${attempts + 1}/${maxAttempts})`);
      await this.click(closeSelector);
      attempts += 1;
    }
    await this.getLocator(targetSelector).waitFor({ state: "visible", timeout: 10000 });
  }

  async whileNotVisible(
    selector: string | Locator,
    doAction: () => Promise<void>,
    maxIterations = 10
  ): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const visible = await this.getLocator(selector)
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true).catch(() => false);
      if (visible) break;
      logger.debug(`WHILE not visible → ${name} | iteration ${i + 1}`);
      await doAction();
      i++;
    }
  }

  async whileEnabled(
    selector: string | Locator,
    doAction: () => Promise<void>,
    maxIterations = 10
  ): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const enabled = await this.getLocator(selector).first().isEnabled().catch(() => false);
      if (!enabled) break;
      logger.debug(`WHILE enabled → ${name} | iteration ${i + 1}`);
      await doAction();
      i++;
    }
  }

  async whileDisabled(
    selector: string | Locator,
    doAction: () => Promise<void>,
    maxIterations = 10
  ): Promise<void> {
    const name = this.getElementName(selector);
    let i = 0;
    while (i < maxIterations) {
      const disabled = await this.getLocator(selector).first().isDisabled().catch(() => true);
      if (!disabled) break;
      logger.debug(`WHILE disabled → ${name} | iteration ${i + 1}`);
      await doAction();
      i++;
    }
  }

  async whileValue(
    count1: number,
    op: "==" | "!=" | ">" | ">=" | "<" | "<=",
    count2: number,
    doAction: () => Promise<void>,
    maxIterations = 20
  ): Promise<void> {
    let i = 0;
    while (i < maxIterations) {
      const result = this.compare(String(count1), op, String(count2));
      if (!result) break;
      logger.debug(`WHILE value → ${count1} ${op} ${count2} | iteration ${i + 1}`);
      await doAction();
      i++;
    }
  }

  // ==========================================================================
  //  RETRY ACTION
  // ==========================================================================

  async retryAction(
    action: () => Promise<void>,
    maxRetries = 3,
    delayMs = 1000,
    label = "action"
  ): Promise<void> {
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

  resetStepCounter(): void { this._stepCounter = 0; }

  async step(description: string, action: () => Promise<void>): Promise<void> {
    this._stepCounter++;
    const start = Date.now();
    logger.step(`▶ Step ${this._stepCounter} | ${description}`);
    await action();
    logger.pass(`✅ Step ${this._stepCounter} done | +${Date.now() - start}ms`);
  }

  // ==========================================================================
  //  TOAST HELPERS
  // ==========================================================================

  async waitForSuccessToast(timeout = 10000): Promise<string> {
    const loc = this.page.locator(
      "xpath=//*[contains(@class,'toast') and contains(@class,'success')] | " +
      "xpath=//*[contains(@class,'alert-success')] | " +
      "xpath=//*[contains(@class,'notification') and contains(@class,'success')]"
    );
    try {
      await loc.first().waitFor({ state: "visible", timeout });
      const msg = (await loc.first().textContent())?.trim() ?? "";
      logger.pass(`Toast success → "${msg}"`);
      return msg;
    } catch {
      logger.warn("No success toast appeared");
      return "";
    }
  }

  async waitForErrorToast(timeout = 10000): Promise<string> {
    const loc = this.page.locator(
      "xpath=//*[contains(@class,'toast') and contains(@class,'error')] | " +
      "xpath=//*[contains(@class,'alert-error')] | " +
      "xpath=//*[contains(@class,'notification') and contains(@class,'error')]"
    );
    try {
      await loc.first().waitFor({ state: "visible", timeout });
      const msg = (await loc.first().textContent())?.trim() ?? "";
      logger.warn(`Toast error → "${msg}"`);
      return msg;
    } catch {
      return "";
    }
  }

  // ==========================================================================
  //  TABLE HELPERS
  // ==========================================================================

  async getTableRowCount(tableSelector: string | Locator): Promise<number> {
    const count = await this.getLocator(tableSelector).locator("tr").count();
    logger.pass(`Table rows → ${count}`);
    return count;
  }

  async getTableCellText(
    tableSelector: string | Locator,
    rowIndex: number,
    colIndex: number
  ): Promise<string> {
    const text = (await this.getLocator(tableSelector)
      .locator("tr").nth(rowIndex)
      .locator("td").nth(colIndex)
      .textContent())?.trim() ?? "";
    logger.pass(`Table[${rowIndex}][${colIndex}] → "${text}"`);
    return text;
  }

  async clickTableRowByText(tableSelector: string | Locator, searchText: string): Promise<void> {
    const rows  = this.getLocator(tableSelector).locator("tr");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).textContent();
      if (rowText?.includes(searchText)) {
        await rows.nth(i).click();
        logger.pass(`Clicked table row containing → "${searchText}"`);
        return;
      }
    }
    throw new Error(`Table row with text "${searchText}" not found`);
  }

  // ==========================================================================
  //  NETWORK RESPONSE CAPTURE
  // ==========================================================================

  async waitForAPIResponse(
    urlPattern: string | RegExp,
    action: () => Promise<void>,
    timeout = 30000
  ): Promise<{ status: number; body: any }> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => {
          const url = res.url();
          return typeof urlPattern === "string"
            ? url.includes(urlPattern)
            : urlPattern.test(url);
        },
        { timeout }
      ),
      action(),
    ]);
    const status = response.status();
    let body: any = {};
    try { body = await response.json(); } catch { /* not JSON */ }
    logger.pass(`API response → ${response.url()} | status: ${status}`);
    return { status, body };
  }

  // ==========================================================================
  //  DIALOG HANDLING
  // ==========================================================================

  acceptDialog(promptText?: string): this {
    this.page.once("dialog", dialog => {
      logger.debug(`Dialog accepted → "${dialog.message()}"`);
      dialog.accept(promptText);
    });
    return this;
  }

  dismissDialog(): this {
    this.page.once("dialog", dialog => {
      logger.debug(`Dialog dismissed → "${dialog.message()}"`);
      dialog.dismiss();
    });
    return this;
  }

  // ==========================================================================
  //  IFRAME HANDLING
  // ==========================================================================

  async switchToFrame(selector: string | Locator): Promise<FrameLocator> {
    const name = this.getElementName(selector);
    logger.step(`Switch frame → ${name}`);
    return ErrorHandler.handle<FrameLocator>(async () => {
      try {
        const frameLocator = this.getLocator(selector).contentFrame();
        this._currentFrame = frameLocator;
        logger.pass(`Frame → ${name}`);
        return frameLocator;
      } catch (error: any) {
        throw new Error(`switchToFrame failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.switchToFrame (${name})` });
  }

  async switchToFrameByIndex(index: number): Promise<FrameLocator> {
    logger.step(`Switch frame [${index}]`);
    return ErrorHandler.handle<FrameLocator>(async () => {
      try {
        const frames = this.page.frames();
        if (index + 1 >= frames.length) throw new Error(`Frame [${index}] out of range.`);
        const frameLocator = this.page.frameLocator(`iframe:nth-of-type(${index + 1})`);
        this._currentFrame = frameLocator;
        logger.pass(`Frame [${index}]`);
        return frameLocator;
      } catch (error: any) {
        throw new Error(`switchToFrameByIndex failed → [${index}] → ${error.message}`);
      }
    }, { context: `BasePage.switchToFrameByIndex (${index})` });
  }

  async switchToFrameByName(name: string): Promise<FrameLocator> {
    logger.step(`Switch frame → "${name}"`);
    return ErrorHandler.handle<FrameLocator>(async () => {
      try {
        const frameLocator = this.page.frameLocator(`iframe[name="${name}"]`);
        this._currentFrame = frameLocator;
        logger.pass(`Frame → "${name}"`);
        return frameLocator;
      } catch (error: any) {
        throw new Error(`switchToFrameByName failed → "${name}" → ${error.message}`);
      }
    }, { context: `BasePage.switchToFrameByName (${name})` });
  }

  async switchToFrameById(id: string): Promise<FrameLocator> {
    logger.step(`Switch frame → #${id}`);
    return ErrorHandler.handle<FrameLocator>(async () => {
      try {
        const frameLocator = this.page.frameLocator(`iframe#${id}`);
        this._currentFrame = frameLocator;
        logger.pass(`Frame → #${id}`);
        return frameLocator;
      } catch (error: any) {
        throw new Error(`switchToFrameById failed → "${id}" → ${error.message}`);
      }
    }, { context: `BasePage.switchToFrameById (${id})` });
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

  async uploadFile(selector: string | Locator, filePaths: string | string[]): Promise<this> {
    const name  = this.getElementName(selector);
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    logger.step(`Upload → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.getLocator(selector).setInputFiles(files);
        logger.pass(`Uploaded → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`uploadFile failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.uploadFile (${name})` });
  }

  async clearFileUpload(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    return ErrorHandler.handle<this>(async () => {
      try {
        await this.getLocator(selector).setInputFiles([]);
        logger.pass(`File cleared → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`clearFileUpload failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.clearFileUpload (${name})` });
  }

  // ==========================================================================
  //  COOKIES & LOCAL STORAGE
  // ==========================================================================

  async getCookie(name: string): Promise<string | undefined> {
    const cookies = await this.page.context().cookies();
    return cookies.find(c => c.name === name)?.value;
  }

  async clearCookies(): Promise<this> {
    await this.page.context().clearCookies();
    logger.pass("Cookies cleared");
    return this;
  }

  async getLocalStorageItem(key: string): Promise<string | null> {
    return this.page.evaluate(k => window.localStorage.getItem(k), key);
  }

  async setLocalStorageItem(key: string, value: string): Promise<this> {
    await this.page.evaluate(({ k, v }) => window.localStorage.setItem(k, v), { k: key, v: value });
    return this;
  }

  async clearLocalStorage(): Promise<this> {
    await this.page.evaluate(() => window.localStorage.clear());
    return this;
  }

  // ==========================================================================
  //  NETWORK INTERCEPTION
  // ==========================================================================

  async mockAPIResponse(urlPattern: string, responseBody: object, status = 200): Promise<this> {
    await this.page.route(urlPattern, async route => {
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(responseBody) });
    });
    logger.pass(`API mocked → ${urlPattern}`);
    return this;
  }

  async blockRequest(urlPattern: string): Promise<this> {
    await this.page.route(urlPattern, route => route.abort());
    logger.pass(`Request blocked → ${urlPattern}`);
    return this;
  }

  // ==========================================================================
  //  JAVASCRIPT EXECUTION
  // ==========================================================================

  async executeScript<T = void>(script: string): Promise<T> {
    return ErrorHandler.handle<T>(async () => {
      try {
        const result = await this.page.evaluate(script);
        logger.pass("Script executed");
        return result as T;
      } catch (error: any) {
        throw new Error(`executeScript failed → ${error.message}`);
      }
    }, { context: "BasePage.executeScript" });
  }

  // ==========================================================================
  //  CLIPBOARD
  // ==========================================================================

  async getClipboardText(): Promise<string> {
    return ErrorHandler.handle<string>(async () => {
      try {
        const text = await this.page.evaluate(() => navigator.clipboard.readText());
        logger.pass(`Clipboard → "${text}"`);
        return text;
      } catch (error: any) {
        throw new Error(`getClipboardText failed → ${error.message}`);
      }
    }, { context: "BasePage.getClipboardText" });
  }

  // ==========================================================================
  //  SCROLL
  // ==========================================================================

  async scrollToElement(selector: string | Locator): Promise<this> {
    const name = this.getElementName(selector);
    logger.step(`Scroll to → ${name}`);
    return ErrorHandler.handle<this>(async () => {
      try {
        const { locator: healed, healed: wasHealed, strategy } =
          await autoHeal(this.getLocator(selector), undefined, 3000);
        if (wasHealed) logger.warn(`[AutoHeal] scrollToElement healed via [${strategy}] → ${name}`);
        await healed.first().scrollIntoViewIfNeeded({ timeout: 5000 });
        logger.pass(`Scrolled → ${name}`);
        return this;
      } catch (error: any) {
        throw new Error(`scrollToElement failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.scrollToElement (${name})` });
  }

  async scrollToTop(): Promise<this> {
    logger.step("Scroll to top");
    await this.page.evaluate(() => window.scrollTo(0, 0));
    logger.pass("Scrolled to top");
    return this;
  }

  async scrollToBottom(): Promise<this> {
    logger.step("Scroll to bottom");
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    logger.pass("Scrolled to bottom");
    return this;
  }

  async scrollBy(x: number, y: number): Promise<this> {
    await this.page.evaluate(({ sx, sy }) => window.scrollBy(sx, sy), { sx: x, sy: y });
    return this;
  }

  // ==========================================================================
  //  SCREENSHOT
  // ==========================================================================

  async takeScreenshot(name = "screenshot"): Promise<void> {
    const fileName = `${name}_${Date.now()}.png`;
    try {
      await this.page.screenshot({ path: `test-results/screenshots/${fileName}`, fullPage: true });
      logger.pass(`Screenshot → ${fileName}`);
    } catch (error: any) {
      throw new Error(`takeScreenshot failed → ${fileName} → ${error.message}`);
    }
  }

  async takeElementScreenshot(selector: string | Locator, name = "element"): Promise<void> {
    const elemName = this.getElementName(selector);
    const fileName = `${name}_${Date.now()}.png`;
    try {
      await this.getLocator(selector).screenshot({ path: `test-results/screenshots/${fileName}` });
      logger.pass(`Element screenshot → ${fileName}`);
    } catch (error: any) {
      throw new Error(`takeElementScreenshot failed → ${elemName} → ${error.message}`);
    }
  }

  // ==========================================================================
  //  MISC
  // ==========================================================================

  getCurrentURL(): string  { return this.page.url(); }
  async getTitle(): Promise<string> { return this.page.title(); }
  getPage(): Page { return this.page; }

  async pause(milliseconds = 1000): Promise<this> {
    logger.warn(`pause → ${milliseconds}ms`);
    await this.page.waitForTimeout(milliseconds);
    return this;
  }

  async highlight(selector: string | Locator, color = "red"): Promise<void> {
    if (process.env.DEBUG !== "true") return;
    try {
      await this.getLocator(selector).first().evaluate((el, c) => {
        (el as HTMLElement).style.outline = `3px solid ${c}`;
        setTimeout(() => { (el as HTMLElement).style.outline = ""; }, 2000);
      }, color);
    } catch { /* ignore */ }
  }
  // ==========================================================================
  //  DATEPICKER HELPER
  //  Add this inside BasePage class under the MISC section
  // ==========================================================================

  // ✅ fillDatePicker — handles both dropdown calendar + text input datepickers
  //
  // Two types detected automatically:
  //   Type A — Dropdown calendar (Supplier Invoice Date, Due Date)
  //            → clicks input → calendar opens → clicks today's circled date
  //   Type B — Text input (Document Date)
  //            → fill() sets value directly → Tab commits
  //
  // Usage in any POM:
  //   await this.fillDatePicker(this.supplierInvoiceDate, "10/06/2026");
  //   await this.fillDatePicker(this.documentDate, "10/06/2026");
  //   await this.fillDatePicker(this.dueDate, "10/06/2026");

  async fillDatePicker(selector: string | Locator, date: string): Promise<this> {
    const name    = this.getElementName(selector);
    const locator = this.getLocator(selector);

    logger.step(`Fill datepicker → ${name} | "${date}"`);

    return ErrorHandler.handle<this>(async () => {
      try {
        await locator.first().waitFor({ state: "visible", timeout: 10000 });

        // Step 1: Click to open the datepicker
        await locator.first().click();

        // Step 2: Check if a calendar popup appeared (dropdown type)
        const calendarLocator = this.page.locator(
          "[class*='react-datepicker__month-container'], " +
          "[class*='datepicker-dropdown'], " +
          "[class*='calendar-popup']"
        );

        const calendarOpened = await calendarLocator
          .waitFor({ state: "visible", timeout: 3000 })
          .then(() => true)
          .catch(() => false);

        if (calendarOpened) {
          // ── Type A: Dropdown calendar ──────────────────────────────────────
          // Click today's highlighted date cell
          const todayCell = this.page.locator(
            "[class*='react-datepicker__day--today']:not([class*='outside']), " +
            "[class*='react-datepicker__day--selected']"
          ).first();

          const todayVisible = await todayCell
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (todayVisible) {
            await todayCell.click();
            logger.pass(`Datepicker (calendar) → ${name} : today selected`);
          } else {
            // Fallback: close calendar and try text input
            await this.page.keyboard.press("Escape");
            await locator.first().click({ clickCount: 3 });
            await locator.first().fill(date);
            await locator.first().press("Enter");
            logger.pass(`Datepicker (calendar fallback) → ${name} : "${date}"`);
          }

        } else {
          // ── Type B: Text input datepicker ─────────────────────────────────
          // fill() sets value directly without React re-render issue
          await locator.first().click({ clickCount: 3 }); // select all
          await locator.first().fill(date);
          logger.pass(`Datepicker (text input) → ${name} : "${date}"`);
        }

        // Step 3: Tab to commit value and move to next field
        await this.page.keyboard.press("Tab");

        return this;

      } catch (error: any) {
        logger.error(`fillDatePicker failed → ${name} → ${error.message}`);
        throw new Error(`fillDatePicker failed → ${name} → ${error.message}`);
      }
    }, { context: `BasePage.fillDatePicker (${name})` });
  }

  // ==========================================================================
  //  RUNTIME STORE HELPERS
  // ==========================================================================

  async storeTextContent(selector: Locator | string, key: string): Promise<void> {
    return ErrorHandler.handle<void>(async () => {
      try {
        const loc   = this.getLocator(selector);
        await loc.first().waitFor({ state: "visible", timeout: Global_Timeout.wait });
        const value = (await loc.first().textContent())?.trim() || "";
        Runtime.set(key, value);
        logger.pass(`Stored → ${key}: "${value}"`);
      } catch (error: any) {
        throw new Error(`storeTextContent failed → ${key} → ${error.message}`);
      }
    }, { context: `BasePage.storeTextContent (${key})` });
  }

  async storeInputValue(selector: Locator | string, key: string): Promise<void> {
    return ErrorHandler.handle<void>(async () => {
      try {
        const value = (await this.getLocator(selector).first().inputValue())?.trim() || "";
        Runtime.set(key, value);
        logger.pass(`Stored → ${key}: "${value}"`);
      } catch {
        Runtime.set(key, "");
      }
    }, { context: `BasePage.storeInputValue (${key})` });
  }

  async storeAttributeValue(selector: Locator | string, attribute: string, key: string): Promise<void> {
    return ErrorHandler.handle<void>(async () => {
      try {
        const value = (await this.getLocator(selector).first().getAttribute(attribute))?.trim() || "";
        Runtime.set(key, value);
        logger.pass(`Stored → ${key} [${attribute}]: "${value}"`);
      } catch (error: any) {
        throw new Error(`storeAttributeValue failed → ${key} → ${error.message}`);
      }
    }, { context: `BasePage.storeAttributeValue (${key})` });
  }
}