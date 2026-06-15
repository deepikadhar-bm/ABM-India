# Enterprise Playwright Automation Framework

An enterprise-grade TypeScript + Playwright framework for web UI, file-download, and document-validation testing. Built with auto-healing locators, structured logging, environment-based configuration, and reusable business workflow modules.

---

## Table of Contents

- [Main Features](#main-features)
- [Framework Architecture](#framework-architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Run Tests](#run-tests)
- [Test Tags](#test-tags)
- [Creating a New Test — Full Guide](#creating-a-new-test--full-guide)
- [Locators and Page Modules](#locators-and-page-modules)
- [BasePage Methods](#basepage-methods)
- [Configuration and Environments](#configuration-and-environments)
- [App Constants](#app-constants)
- [Fixtures and Logging](#fixtures-and-logging)
- [Prerequisite Tests](#prerequisite-tests)
- [Test Data](#test-data)
- [Runtime Store](#runtime-store)
- [File and PDF Validation](#file-and-pdf-validation)
- [Auto-Healing](#auto-healing)
- [Reports and Debugging](#reports-and-debugging)
- [CI Execution](#ci-execution)
- [Coding Conventions](#coding-conventions)
- [Troubleshooting](#troubleshooting)
- [Current Repository Notes](#current-repository-notes)
- [Quick Reference](#quick-reference)

---

## Main Features

- Playwright with TypeScript and strict type-checking
- QA and development environment support with Zod validation
- `BasePage` — single source of truth for all browser actions
- Page-object and locator separation (`el` + `base` pattern)
- Reusable business workflow modules and step groups
- Runtime locator auto-healing with strategy logging
- Automatic waits, retries, and structured error handling
- Structured console and file logging with step numbers
- Smoke, sanity, regression, priority, and custom tags
- HTML, JUnit, and Allure reports
- Screenshots, videos, and traces on failure
- PDF, Excel, CSV, DOCX, TXT, and download validation
- JSON and Excel test-data utilities
- Cross-worker prerequisite test tracking
- Runtime value storage between test steps
- CI-specific retries, workers, and browser settings
- App constants — no hardcoded strings in tests

---

## Framework Architecture

```
Test Specification (.spec.ts)
        |
        |── el    = new XxxLocators(page)   ← locators only, no logic
        |── base  = new BasePage(page)      ← all browser actions
        |── login = new LoginPage(page)     ← login module
        |
        └── BasePage
                |── resolveLocator()        ← auto-wait + auto-heal
                |── configManager          ← timeout from qaConfig/devConfig
                |── logger                 ← structured step logs
                |── Runtime                ← store values between steps
                └── autoHeal              ← fires only when element not found
```

### Action Flow — what happens inside base.click()

```
await base.click(el.submitButton)
        |
        ├─ Step 1: waitFor visible (timeout from qaConfig.timeouts.action)
        |       └─ Found → click ✅
        |
        └─ Step 2: Not found → autoHeal
                ├─ Try getByRole, getByLabel, getByText, CSS, XPath, DOM
                ├─ Healed → click ✅
                └─ Failed → throw error ❌
```

### autoHeal — when it fires and when it does NOT

| Method | autoHeal? | Reason |
|--------|-----------|--------|
| `click, type, fill, clear, hover, check, press, focus, selectOption` | ✅ YES | Interacting — element must be found |
| `waitForElementIsVisible` | ✅ YES on failure only | Element should appear, heal if locator changed |
| `waitForElementToDisappear` | ❌ NO | Disappearing = correct behaviour, do not try to find it |
| `isVisible, isEnabled, isChecked` | ❌ NO | Instant boolean read, no wait |
| `getInputValue, getAttribute, getElementCount` | ❌ NO | Read-only, no interaction |
| `ifVisible, ifNotVisible, ifEnabled` | ❌ NO | State check only, not interacting |
| `whileVisible, whileNotVisible` | ❌ NO | Polling state, not interacting |
| `closeUntilVisible` | ❌ NO | Uses direct click, stops when button gone |

---

## Project Structure

```
ABM-India/
├── playwright.config.ts          # Playwright runtime configuration
├── package.json                  # Scripts and dependencies
├── tsconfig.json                 # TypeScript settings and import aliases
├── src/
│   ├── appConstant.ts            # Fixed business constants (statuses, labels)
│   ├── config/
│   │   ├── env.qa.ts             # QA environment config
│   │   ├── env.dev.ts            # Dev environment config
│   │   ├── env.index.ts          # ConfigManager — single export
│   │   ├── env.schema.ts         # Zod schema validation
│   │   ├── globalTimeout.ts      # Reads from configManager (no hardcoded values)
│   │   └── types.ts              # Environment and config types
│   ├── fixtures/                 # Custom fixtures, global setup, prerequisites
│   ├── helpers/                  # Logger, file utilities, validation helpers
│   ├── Modules/                  # Reusable business workflows and step groups
│   ├── pages/
│   │   ├── basePage.ts           # Main reusable browser API
│   │   └── Elements/             # Locator-only classes (no logic)
│   └── utils/                    # Auto-heal, retry, waits, runtime store
├── test/
│   ├── ABM_testCase/             # ABM application tests
│   └── growSmart/                # GrowSmart application tests
├── testdata/                     # JSON and Excel test data
├── reports/                      # JUnit and prerequisite state
├── logs/                         # Framework execution logs
├── test-results/                 # Playwright artifacts
├── playwright-report/            # Playwright HTML report
└── allure-results/               # Allure raw results
```

---

## Prerequisites

- Node.js 20 or compatible LTS
- npm
- Git
- Access to target QA or dev application

---

## Installation

```bash
npm install
npm run pw:install
npx playwright test --list
npm run typecheck
```

---

## Run Tests

```bash
# Default (QA)
npm test

# By environment
npm run test:qa
npm run test:dev

# Headed / headless
npm run test:qa:headed
npm run test:qa:headless
npm run test:dev:headed
npm run test:dev:headless

# Interactive / debug
npm run test:qa:ui
npm run test:qa:debug
npm run codegen

# Specific file
npx playwright test test/growSmart/simpletestcase.spec.ts

# Specific test by title
npx playwright test --grep "Create Purchase Order"

# Parallel
npm run test:parallel
```

The framework uses four local workers and two CI workers by default.

---

## Test Tags

| Tag | Purpose |
|-----|---------|
| `@smoke` | Critical checks, fast |
| `@sanity` | Focused checks after a change |
| `@regression` | Full business flow validation |
| `@p1` | Highest priority |
| `@p2` | Medium priority |
| `@slow` | Long-running tests |
| `@wip` | Work in progress |
| `@flaky` | Known unstable |

### Add a tag

```ts
test(
  "Create Purchase Order",
  { tag: ["@regression", "@p1"] },
  async ({ page }) => { ... }
);
```

### Run by tag

```bash
npm run smoke
npm run regression
npm run sanity
npm run p1
npm run p2
npm run smoke:ci
npm run regression:ci
npx playwright test --grep "@payments"
npx playwright test --grep-invert "@slow"
```

---

## Creating a New Test — Full Guide

This section explains exactly how to create a new test from scratch, step by step.

---

### Step 1 — Understand the 3-Object Pattern

Every test uses exactly three objects:

```
el    = new XxxLocators(page)   → holds ALL element locators, no actions
base  = new BasePage(page)      → performs ALL browser actions
login = new LoginPage(page)     → handles login flow
```

**Rule:** Never call `page.click()` or `page.locator()` directly in a spec file.
Always use `base.click(el.someElement)`.

---

### Step 2 — Create a Locator File

Save as: `src/pages/Elements/yourModuleLocators.ts`

```typescript
import { Page, Locator } from "@playwright/test";

export class YourModuleLocators {

    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    // ── Named helper — gives clean names in logs ──────────────────────────────
    // Logs show: [STEP] Click → Submit Button   instead of: [STEP] Click → element
    private named(name: string, locator: Locator): Locator {
        (locator as any).__name = name;
        return locator;
    }

    // ── Static locators ───────────────────────────────────────────────────────

    get submitButton(): Locator {
        return this.named("Submit Button",
            this.page.locator("//span[normalize-space()='Submit']"));
    }

    get approvedStatus(): Locator {
        return this.named("Approved Status",
            this.page.locator("//*[normalize-space()='Approved']"));
    }

    get searchField(): Locator {
        return this.named("Search Field",
            this.page.locator("//div[contains(@class,'main-container')]//input[@type='text']"));
    }

    get warehouseDropdown(): Locator {
        return this.named("Warehouse Dropdown",
            this.page.locator('//*[text()="Warehouse"]/../..//div[contains(@class,"select-control__input-container css")]'));
    }

    // ── Dynamic locators — take a parameter ───────────────────────────────────

    get supplierOption() {
        return (name: string): Locator =>
            this.named(
                `Supplier (${name})`,
                this.page.locator(`//*[text()='${name}']`)
            );
    }

    get itemOption() {
        return (itemName: string): Locator =>
            this.named(
                `Item (${itemName})`,
                this.page.locator(`//div[@role='listbox']//*[contains(normalize-space(),'${itemName}')][1]`)
            );
    }
}
```

**Locator rules:**

| Rule | Wrong | Correct |
|------|-------|---------|
| Class match | `@class='select-control__input'` | `contains(@class,'select-control__input')` |
| Text match | `page.getByText("Approved")` | `//*[normalize-space()='Approved']` |
| Placeholder | `page.getByPlaceholder("Type here")` | `//input[@placeholder='Type here']` |
| Static locator | returns `Locator` directly | `get name(): Locator { return this.named(...) }` |
| Dynamic locator | — | `get name() { return (param): Locator => this.named(...) }` |

---

### Step 3 — Create Step Groups (optional)

Save as: `src/Modules/yourModule.ts`

Extract only repeated action sequences (used 2+ times). One-off actions stay inline in the spec.

```typescript
import { BasePage }           from "@pages/basePage";
import { YourModuleLocators } from "@pages/Elements/yourModuleLocators";

// ── Used 4 times: Save, Submit PO, GRN Submit, PI Submit ─────────────────────
export async function stepGroup_HandlePopups(
    base: BasePage,
    el:   YourModuleLocators
): Promise<void> {
    await base.ifVisible(el.alertDialog, async () => {
        await base.click(el.dismissAlert);
    }, undefined, 3000);

    await base.ifVisible(el.confirmButton, async () => {
        await base.click(el.confirmButton);
    }, undefined, 3000);
}

// ── Used 3 times: Approve PO, GRN, PI ────────────────────────────────────────
export async function stepGroup_ApproveUntilDone(
    base:         BasePage,
    el:           YourModuleLocators,
    maxApprovals  = 5
): Promise<void> {
    // Skip if already approved (auto-approval policy)
    const alreadyApproved = await el.approvedStatus
        .waitFor({ state: "visible", timeout: 3000 })
        .then(() => true).catch(() => false);
    if (alreadyApproved) return;

    // Skip if approve button never appears
    const approveVisible = await el.approveButton
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => true).catch(() => false);
    if (!approveVisible) return;

    // Click approve until button disappears
    await base.whileVisible(el.approveButton, async () => {
        await base.click(el.approveButton);
        await base.ifVisible(el.yesApproveButton, async () => {
            await base.click(el.yesApproveButton);
        }, undefined, 3000);
        await base.waitForLoadState("domcontentloaded");
    }, maxApprovals);
}
```

---

### Step 4 — Create the Spec File

Save as: `test/growSmart/yourModule.spec.ts`

```typescript
// ============================================================================
//  yourModule.spec.ts
//
//  3-object pattern:
//    el    = new YourModuleLocators(page)  → locators only
//    base  = new BasePage(page)            → all browser actions
//    login = new LoginPage(page)           → login
//
//  Step groups (repeated flows only — 2+ times):
//    stepGroup_HandlePopups       → handles popups after Save/Submit
//    stepGroup_ApproveUntilDone   → approves PO, GRN, PI
//
//  Constants from appConstant.ts — no hardcoded strings in spec
// ============================================================================
import { test, expect }          from "@playwright/test";
import { BasePage }              from "@pages/basePage";
import { YourModuleLocators }    from "@pages/Elements/yourModuleLocators";
import { LoginPage }             from "@modules/loginPage";
import { logger as log }         from "@helpers/logger";
import { Runtime }               from "@utils/runtimeStore";
import {
    stepGroup_HandlePopups,
    stepGroup_ApproveUntilDone,
} from "@modules/yourModule";
import {
    PO_STATUS,
    SUPPLIER,
    ITEM,
    GRN_STATUS,
} from "@src/appConstant";

const TC_ID    = "REG_TS_PO_TC01";
const TC_TITLE = "Create Purchase Order - Full E2E";

test.describe("Your Module Name", () => {

    let el:    YourModuleLocators;
    let base:  BasePage;
    let login: LoginPage;

    test.beforeEach(async ({ page }) => {
        el    = new YourModuleLocators(page);
        base  = new BasePage(page);
        login = new LoginPage(page);
    });

    test(
        `${TC_ID} - ${TC_TITLE}`,
        { tag: ["@regression", "@p1"] },
        async ({ page }) => {

        log.info(`${TC_ID} - ${TC_TITLE}`);

        // ── Login ─────────────────────────────────────────────────────────────
        log.step("Login to application");
        await login.navigateTo();
        await login.login();
        await login.verifyLoginSuccessful();
        log.pass("Login successful");

        // ── Open module ───────────────────────────────────────────────────────
        log.step("Open Purchase Order form");
        await base.click(el.typeToSearchField);
        await base.type(el.searchField, "Purchase Order");
        await base.click(el.purchaseOrdersDropdown);
        await base.click(el.createPurchaseOrderButton);
        log.pass("Purchase Order form opened");

        // ── Fill dropdown with type + Enter ───────────────────────────────────
        log.step(`Select Supplier: ${SUPPLIER.NAME}`);
        await base.click(el.supplierDropdown);
        await base.waitForElementIsVisible(el.supplierDropdown);
        await base.pause(300);
        await base.type(el.supplierDropdown, SUPPLIER.NAME);
        await base.pressKey("Enter");
        log.pass(`Supplier: ${SUPPLIER.NAME}`);

        // ── Dynamic locator — called with () ──────────────────────────────────
        log.step(`Add Item: ${ITEM.NAME}`);
        await base.click(el.addItemsButton);
        await base.waitForElementIsVisible(el.itemTextbox);
        await base.type(el.itemTextbox, ITEM.NAME);
        await base.click(el.itemOption(ITEM.NAME));   // ← dynamic locator with ()
        log.pass(`Item: ${ITEM.NAME}`);

        // ── Enter quantity ────────────────────────────────────────────────────
        log.step(`Enter Quantity: ${ITEM.QUANTITY}`);
        await base.click(el.quantityTextbox);
        await base.pause(200);
        await base.clear(el.quantityTextbox);
        await base.type(el.quantityTextbox, ITEM.QUANTITY);
        await base.pressKey("Tab");
        log.pass(`Quantity: ${ITEM.QUANTITY}`);

        // ── Conditional: run only if element exists ───────────────────────────
        await base.ifVisible(el.alertBanner, async () => {
            await base.click(el.dismissAlert);
        }, undefined, 3000);

        // ── Save → wait for URL → extract order name ──────────────────────────
        log.step("Save order");
        await base.click(el.actionsButton);
        await base.click(el.saveOption);
        await stepGroup_HandlePopups(base, el);

        // ✅ Always wait for URL before extracting or asserting status
        await page.waitForURL(/PO-[\w]+/, { timeout: 15000 });
        const poMatch   = page.url().match(/PO-[\w]+/);
        const orderName = poMatch ? poMatch[0] : "";
        Runtime.set("OrderName", orderName);
        log.info(`Order: ${orderName}`);

        await base.assertElementVisible(el.draftStatus);
        log.pass(`Saved as ${PO_STATUS.DRAFT}: ${orderName}`);

        // ── Submit ────────────────────────────────────────────────────────────
        log.step("Submit order");
        await base.click(el.actionsButton);
        // ✅ Always wait for Submit to render after Actions menu opens
        await base.waitForElementIsVisible(el.submitOption);
        await base.click(el.submitOption);
        await stepGroup_HandlePopups(base, el);
        log.pass("Order submitted");

        // ── Approve ───────────────────────────────────────────────────────────
        log.step("Approve order");
        await stepGroup_ApproveUntilDone(base, el, 5);
        await base.assertElementVisible(el.approvedStatus);
        log.pass(`PO ${PO_STATUS.APPROVED}`);

        // ── Store text directly — auto key from element name ──────────────────
        // storeText reads text → saves to Runtime → returns the value
        const status = await base.storeText(el.statusLabel, "FinalStatus");
        log.info(`Stored status: ${status}`);
        // Runtime.get("FinalStatus") === status  → use anywhere after this point

        // storeValue reads input value → saves to Runtime → returns the value
        const qty = await base.storeValue(el.quantityField, "Qty");
        log.info(`Stored qty: ${qty}`);

        // storeCount counts matching elements → saves → returns number
        const rowCount = await base.storeCount(el.tableRows, "RowCount");
        log.info(`Rows: ${rowCount}`);

        // ── Close panels ──────────────────────────────────────────────────────
        log.step("Close panels");
        // closeUntilVisible clicks Close until target is visible OR Close button gone
        await base.closeUntilVisible(el.closeButton, el.approvedStatus, 5);

        // ── Final assertions ──────────────────────────────────────────────────
        log.step("Verify final statuses");
        await base.assertElementVisible(el.approvedStatus);
        log.info(`${PO_STATUS.APPROVED} ✅`);
        await base.assertElementVisible(el.fullyReceived);
        log.info(`${GRN_STATUS.FULLY_RECEIVED} ✅`);
        await base.assertElementVisible(el.fullyInvoiced);
        log.info(`${GRN_STATUS.FULLY_INVOICED} ✅`);
        log.pass("All final statuses verified");

        log.info("PASS");
    });
});
```

---

### Step 5 — Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Spec file | `moduleName.spec.ts` | `purchaseOrder.spec.ts` |
| Locator class | `ModuleNameLocators` | `PurchaseOrderLocators` |
| Locator file | `moduleNameLocators.ts` in `Elements/` | `purchaseOrderLocators.ts` |
| Step group file | `moduleName.ts` in `Modules/` | `purchaseOrder.ts` |
| Step group function | `stepGroup_ActionName` | `stepGroup_ApproveUntilDone` |
| TC ID | `REG_TS_<MODULE>_TC<NN>` | `REG_TS_PO_TC01` |
| Constants | Grouped `UPPER_SNAKE` objects | `PO_STATUS.APPROVED` |

---

### Step 6 — Common Patterns Reference

```typescript
// ── Click ─────────────────────────────────────────────────────────────────────
await base.click(el.submitButton);

// ── Type (simulates keyboard — for React dropdowns) ───────────────────────────
await base.type(el.searchField, "Purchase Order");

// ── Fill (sets value directly — faster, for plain inputs) ────────────────────
await base.fill(el.emailInput, "user@test.com");

// ── Clear then type ───────────────────────────────────────────────────────────
await base.clear(el.quantityField);
await base.type(el.quantityField, "10");

// ── Keyboard ──────────────────────────────────────────────────────────────────
await base.pressKey("Enter");
await base.pressKey("Tab");
await base.pressKey("Escape");

// ── Dynamic locator (getter returning function — call with ()) ────────────────
await base.click(el.supplierOption("Mohamed Supplier"));
await base.click(el.itemOption("Item 1"));

// ── Wait for element ──────────────────────────────────────────────────────────
await base.waitForElementIsVisible(el.modal);
await base.waitForElementToDisappear(el.loadingSpinner);  // NO autoHeal
await base.waitForURL(/PO-[\w]+/);                        // wait for URL change first

// ── Conditional ───────────────────────────────────────────────────────────────
await base.ifVisible(el.alertBanner, async () => {
    await base.click(el.closeAlert);
}, undefined, 3000);

await base.ifEnabled(el.saveButton, async () => {
    await base.click(el.saveButton);
});

await base.ifText(el.status, "==", "Approved", async () => {
    log.pass("Status is Approved");
});

// ── Loop while element visible ────────────────────────────────────────────────
await base.whileVisible(el.approveButton, async () => {
    await base.click(el.approveButton);
    await base.waitForLoadState("domcontentloaded");
}, 5);

// ── Close panels until target visible ─────────────────────────────────────────
await base.closeUntilVisible(el.closeButton, el.approvedStatus, 5);

// ── Store text → Runtime → returns value ──────────────────────────────────────
const status   = await base.storeText(el.statusLabel, "FinalStatus");
// Runtime.get("FinalStatus") === status

const qty      = await base.storeValue(el.quantityField, "Qty");
// Runtime.get("Qty") === qty

const rowCount = await base.storeCount(el.tableRows, "RowCount");
// Runtime.get("RowCount") === String(rowCount)

const href     = await base.storeAttribute(el.link, "href", "URL");
// Runtime.get("URL") === href

// Auto-key from element name (no key parameter needed)
await base.storeText(el.orderLabel);
// Runtime.get("Order Label") === value

// ── Read stored value anywhere after ─────────────────────────────────────────
const orderName = Runtime.get("OrderName");

// ── Assertions ────────────────────────────────────────────────────────────────
await base.assertElementVisible(el.successMsg);
await base.assertContainsText(el.statusLabel, "Approved");
await base.assertValue(el.quantityField, "10");
await base.assertURL(/dashboard/);
await base.assertElementCount(el.tableRows, 5);
await base.assertText(el.label, "Draft");

// ── Quick boolean checks (no wait, no autoHeal) ───────────────────────────────
if (await base.isVisible(el.optionalBanner))  { ... }
if (await base.isEnabled(el.submitButton))    { ... }
if (await base.isChecked(el.termsCheckbox))   { ... }

// ── Get values (no autoHeal) ─────────────────────────────────────────────────
const text  = await base.getText(el.label);
const value = await base.getInputValue(el.field);
const attr  = await base.getAttribute(el.link, "href");
const count = await base.getElementCount(el.rows);

// ── Date picker ───────────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString("en-GB");
await base.fillDatePicker(el.invoiceDateField, today);

// ── Screenshot ────────────────────────────────────────────────────────────────
await base.takeScreenshot("order_created");

// ── Pause (use sparingly) ─────────────────────────────────────────────────────
await base.pause(300);
```

---

### Step 7 — What NOT to do

```typescript
// ❌ Never use raw page methods in spec
await page.click("//span[text()='Submit']");
await page.locator("button").click();

// ❌ Never call el without base
await el.submitButton.click();           // use: await base.click(el.submitButton)

// ❌ Never hardcode strings in spec
await base.type(el.supplier, "Mohamed Supplier");   // use: SUPPLIER.NAME

// ❌ Never extract URL before waiting for it
const match = page.url().match(/PO-[\w]+/);
// use: await page.waitForURL(/PO-[\w]+/) first, then extract

// ❌ Never click Submit without waiting for it to render
await base.click(el.actionsButton);
await base.click(el.submitOption);      // may timeout — menu needs time
// use: await base.waitForElementIsVisible(el.submitOption) between them

// ❌ Never use base.click inside whileVisible for close button
await base.whileVisible(el.closeButton, async () => {
    await base.click(el.closeButton);   // autoHeal fires when button is gone → error
});
// use: await base.closeUntilVisible(el.closeButton, el.approvedStatus, 5)

// ❌ Never use exact class match in XPath
this.page.locator("(//*[@class='select-control__input'])[last()]");
// use: contains(@class,'select-control__input')

// ❌ Never use page.getByText for status assertions
this.approvedStatus = this.page.getByText("Approved");
// use: this.page.locator("//*[normalize-space()='Approved']")
```

---

## Locators and Page Modules

### XPath Quick Rules

| Rule | Wrong | Correct |
|------|-------|---------|
| Class match | `@class='select-control__input'` | `contains(@class,'select-control__input')` |
| Text match | `page.getByText("Approved")` | `//*[normalize-space()='Approved']` |
| Placeholder | `page.getByPlaceholder("Type here")` | `//input[@placeholder='Type here']` |
| Contains text | `//span[@class='btn active focused']` | `//span[contains(@class,'btn')]` |

---

## BasePage Methods

### Navigation
```typescript
await base.navigateTo("https://example.com");
await base.goto("/dashboard");
await base.reload();
await base.goBack();
await base.goForward();
```

### Element Actions — all auto-wait + auto-heal via resolveLocator()
```typescript
await base.click(el.button);
await base.type(el.field, "text");         // simulates keyboard
await base.fill(el.field, "text");         // sets value directly
await base.clear(el.field);
await base.check(el.checkbox);
await base.uncheck(el.checkbox);
await base.hover(el.menu);
await base.press(el.field, "Enter");
await base.pressKey("Tab");
await base.selectOption(el.dropdown, "India");
await base.doubleClick(el.item);
await base.rightClick(el.row);
await base.dragAndDrop(el.source, el.target);
await base.focus(el.field);
```

### Waits
```typescript
await base.waitForElementIsVisible(el.button);         // autoHeal on failure
await base.waitForElementToDisappear(el.spinner);      // NO autoHeal
await base.waitForElementEnabled(el.submitBtn);
await base.waitForURL(/dashboard/);
await base.waitForLoadState("domcontentloaded");
await base.waitForTextOnPage("Saved successfully");
await base.waitForTextDisappear("Loading...");
```

### Assertions
```typescript
await base.assertElementVisible(el.msg);
await base.assertElementHidden(el.error);
await base.assertElementEnabled(el.btn);
await base.assertElementDisabled(el.btn);
await base.assertText(el.label, "Approved");
await base.assertContainsText(el.title, "Purchase");
await base.assertValue(el.input, "10");
await base.assertAttributeValue(el.box, "checked", "true");
await base.assertChecked(el.checkbox);
await base.assertNotChecked(el.checkbox);
await base.assertURL(/dashboard/);
await base.assertTitle("Home | App");
await base.assertElementCount(el.rows, 5);
```

### Soft Assertions — collect failures, throw at end
```typescript
await base.softAssertVisible(el.optionalBanner);
await base.softAssertText(el.badge, "New");
base.assertNoSoftErrors();   // throws all collected failures here
```

### Quick Checks — no wait, no autoHeal, instant
```typescript
const visible  = await base.isVisible(el.banner);
const enabled  = await base.isEnabled(el.btn);
const checked  = await base.isChecked(el.box);
const text     = await base.getText(el.label);
const value    = await base.getInputValue(el.field);
const attr     = await base.getAttribute(el.link, "href");
const count    = await base.getElementCount(el.rows);
```

### Store to Runtime — reads page → saves to Runtime → returns value

```typescript
// With explicit key
const status = await base.storeText(el.statusLabel, "FinalStatus");
// Saves: Runtime.set("FinalStatus", "Approved")
// Returns: "Approved"   ← use directly without Runtime.get()

const qty = await base.storeValue(el.quantityField, "Qty");
// Saves: Runtime.set("Qty", "10")
// Returns: "10"

const rowCount = await base.storeCount(el.tableRows, "RowCount");
// Saves: Runtime.set("RowCount", "5")
// Returns: 5   ← number

const href = await base.storeAttribute(el.link, "href", "LinkURL");
// Saves: Runtime.set("LinkURL", "/path/to/page")
// Returns: "/path/to/page"

// Without key — auto-key from element name
await base.storeText(el.orderLabel);
// Saves: Runtime.set("Order Label", value)
// element.__name is used as the key automatically

// Read stored value later
const orderName = Runtime.get("OrderName");
const finalQty  = Runtime.get("Qty");
```

### Conditional
```typescript
await base.ifVisible(el.btn, async () => { await base.click(el.btn); }, undefined, 3000);
await base.ifNotVisible(el.err, async () => { ... });
await base.ifEnabled(el.btn, async () => { await base.click(el.btn); });
await base.ifDisabled(el.btn, async () => { log.warn("Button disabled"); });
await base.ifChecked(el.box, async () => { ... });
await base.ifUnchecked(el.box, async () => { await base.check(el.box); });
await base.ifText(el.status, "==", "Approved", async () => { ... });
await base.ifInputValue(el.qty, ">", 0, async () => { ... });
await base.ifPageContainsText("Error", async () => { await base.takeScreenshot("error"); });
await base.ifPageNotContainsText("Error", async () => { ... });
await base.ifCount(el.errors, ">", 0, async () => { ... });
await base.ifEmpty(el.field, async () => { await base.type(el.field, "default"); });
await base.ifURL("contains", "/dashboard", async () => { ... });
```

### Loops
```typescript
await base.whileVisible(el.approveBtn, async () => {
    await base.click(el.approveBtn);
    await base.waitForLoadState("domcontentloaded");
}, 5);

await base.whileNotVisible(el.successMsg, async () => {
    await base.pause(1000);
}, 10);

await base.whileEnabled(el.nextButton, async () => {
    await base.click(el.nextButton);
}, 20);

// Close panels until target element visible — stops when button gone
await base.closeUntilVisible(el.closeBtn, el.approvedStatus, 5);
```

### Misc
```typescript
await base.fillDatePicker(el.dateField, "15/06/2026");
await base.uploadFile(el.fileInput, "testdata/invoice.pdf");
await base.takeScreenshot("order_created");
await base.takeElementScreenshot(el.chart, "revenue_chart");
await base.pause(300);
await base.retryAction(async () => { await base.click(el.btn); }, 3, 1000);
const successMsg = await base.waitForSuccessToast();
const errorMsg   = await base.waitForErrorToast();
await base.scrollToElement(el.footer);
await base.scrollToTop();
await base.scrollToBottom();
const url   = base.getCurrentURL();
const title = await base.getTitle();
await base.highlight(el.btn, "red");    // DEBUG=true only
await base.clearCookies();
await base.clearLocalStorage();
const token = await base.getCookie("auth_token");
await base.executeScript("document.body.style.zoom = '0.5'");
```

---

## Configuration and Environments

```
src/config/
├── types.ts         → Environment = 'dev' | 'qa', TimeoutKeys
├── env.qa.ts        → QA URL, credentials, timeouts
├── env.dev.ts       → Dev URL, credentials, timeouts
├── env.schema.ts    → Zod validation (fails fast with clear error)
├── env.index.ts     → ConfigManager — single export used everywhere
└── globalTimeout.ts → reads from configManager (no hardcoded values)
```

### Timeout inheritance

```
qaConfig.timeouts.action = 30000
        ↓
configManager.getTimeout("action")
        ↓
BasePage.resolveLocator() → waits 30s → then autoHeal
```

Change timeout in `env.qa.ts` or `env.dev.ts` — it applies to all methods automatically.

### Environment variable overrides

| Variable | Purpose |
|----------|---------|
| `ENVIRONMENT` | `qa` or `dev` |
| `BASE_URL` | Override app URL |
| `PLAYWRIGHT_USERNAME` | Override login username |
| `PLAYWRIGHT_PASSWORD` | Override login password |
| `TIMEOUT_ACTION` | Override action timeout (ms) |
| `TIMEOUT_WAIT` | Override wait timeout (ms) |
| `TIMEOUT_NAVIGATION` | Override navigation timeout (ms) |
| `HEADLESS` | `true` or `false` |
| `LOG_LEVEL` | `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `TEST_SETS` | Select test-data sets |
| `CI` | Enables CI workers and retries |

```bash
npx cross-env ENVIRONMENT=qa HEADLESS=true BASE_URL=https://staging.example.com npx playwright test
```

Do not commit real credentials. Use CI secrets or environment variables.

---

## App Constants

All fixed business values live in `src/appConstant.ts`. Never hardcode strings in spec files.

```typescript
// src/appConstant.ts
export const PO_STATUS = {
    DRAFT:     "Draft",
    SUBMITTED: "Submitted",
    APPROVED:  "Approved",
} as const;

export const GRN_STATUS = {
    FULLY_RECEIVED: "Fully received",
    FULLY_INVOICED: "Fully invoiced",
} as const;

export const SUPPLIER = {
    NAME: "Mohamed Supplier",
} as const;

export const ITEM = {
    NAME:     "Item 1",
    QUANTITY: "10",
    RATE:     "100",
    AMOUNT:   1000,
} as const;

export const CLOSE_MAX_ATTEMPTS = 5;
```

```typescript
// Usage in spec
import { PO_STATUS, SUPPLIER, ITEM, GRN_STATUS } from "@src/appConstant";

await base.type(el.supplierField, SUPPLIER.NAME);
await base.assertContainsText(el.status, PO_STATUS.APPROVED);
await base.closeUntilVisible(el.closeButton, el.approvedStatus, CLOSE_MAX_ATTEMPTS);
```

---

## Fixtures and Logging

```typescript
// Automatic fixture — provides logging, console monitoring, failure screenshots
import { test, expect } from "@fixtures/basefixtures";

test("Automatically logged test", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/home/);
});
```

```typescript
// Manual logging
import { logger } from "@helpers/logger";

logger.info("Opening purchase order");
logger.step("Select supplier");
logger.pass("Supplier selected");
logger.warn("Optional popup appeared");
logger.error("Submission failed");
```

Log files: `logs/test-run-YYYY-MM-DD.log`

---

## Prerequisite Tests

Prerequisite tests run only after another named test passes. State is shared between workers via `reports/prereq-state.json`.

### Format

```typescript
import { test, preReqTest, expect } from "@fixtures/preReqFixture";

// ── Step 1: The prerequisite test ─────────────────────────────────────────────
test("Create customer", { tag: ["@regression"] }, async ({ page }) => {
    const base  = new BasePage(page);
    const login = new LoginPage(page);
    const el    = new CustomerLocators(page);

    await login.navigateTo();
    await login.login();
    await base.click(el.createCustomerButton);
    await base.fill(el.customerName, "Test Customer");
    await base.click(el.saveButton);
    await base.assertElementVisible(el.successMessage);
});

// ── Step 2: The dependent test ────────────────────────────────────────────────
preReqTest(
    "Create customer order",
    {
        tag: ["@regression"],
        annotation: [
            {
                type: "preRequisite",
                description: "Create customer"    // ← must match EXACTLY the test title above
            }
        ]
    },
    async ({ page }) => {
        // Only runs when "Create customer" has passed
        const base  = new BasePage(page);
        const login = new LoginPage(page);
        const el    = new OrderLocators(page);

        await login.navigateTo();
        await login.login();
        await base.click(el.createOrderButton);
        await base.assertElementVisible(el.orderForm);
    }
);
```

### Rules

- The `description` must match the prerequisite test title **exactly** — including spaces and capitalisation
- If the prerequisite test failed or was skipped, the dependent test is skipped automatically
- State is written to `reports/prereq-state.json` — do not delete this file between workers
- Import `preReqTest` from `@fixtures/preReqFixture`, not from `@playwright/test`
- Both tests must be in the same test run for the dependency to resolve

### Multiple prerequisites

```typescript
preReqTest(
    "Approve and invoice order",
    {
        annotation: [
            { type: "preRequisite", description: "Create customer" },
            { type: "preRequisite", description: "Create customer order" }
        ]
    },
    async ({ page }) => {
        // Runs only when BOTH prerequisites have passed
    }
);
```

---

## Test Data

### JSON format

```json
{
    "profile": "Purchase Order",
    "sets": [
        {
            "setName": "Set 1",
            "enabled": true,
            "supplier": "Mohamed Supplier",
            "quantity": 10,
            "price": 100
        },
        {
            "setName": "Set 2",
            "enabled": true,
            "supplier": "ABC Supplier",
            "quantity": 5,
            "price": 200
        }
    ]
}
```

### set utility — single set by index or name

```typescript
import { set } from "@utils/set";

const data  = set("purchaseOrderData", 1);      // first set (index 1)
const data2 = set("purchaseOrderData", "Set 2"); // by setName

await base.type(el.supplierField, data.supplier);
await base.type(el.quantityField, String(data.quantity));
```

### loadTestData — filter and loop

```typescript
import { loadTestData } from "@utils/dataFilter";

const dataSets = loadTestData<{
    setName:  string;
    enabled:  boolean;
    supplier: string;
    quantity: number;
}>("purchaseOrderData", {
    filterType: "setName",
    comparison: "between",
    from: "Set 1",
    to:   "Set 3"
});

for (const data of dataSets) {
    test(`Create PO - ${data.setName}`, { tag: ["@regression"] }, async ({ page }) => {
        await base.type(el.supplierField, data.supplier);
    });
}
```

### Select sets from command line

```bash
npx cross-env TEST_SETS="Set 1,Set 3" npx playwright test
```

### TestDataManager — JSON, CSV, Excel

```typescript
import { testDataManager } from "../../testdata/testDataManager";

const json     = testDataManager.loadJSON("customers.json");
const workbook = await testDataManager.loadExcel("orders.xlsx");
const rows     = await testDataManager.getSheetData("orders.xlsx", "Orders");
```

---

## Runtime Store

Use `Runtime` to share values between steps in the same worker.

```typescript
import { Runtime } from "@utils/runtimeStore";

// Set manually
Runtime.set("OrderName", "PO-001");

// Read
const order = Runtime.get("OrderName");

// Check
if (Runtime.has("OrderName")) { ... }

// Remove / clear
Runtime.remove("OrderName");
Runtime.clear();
```

### Using BasePage store methods — read from page + save to Runtime in one call

```typescript
// storeText — reads textContent → Runtime.set(key, value) → returns value
const status = await base.storeText(el.statusLabel, "FinalStatus");
// status === "Approved"
// Runtime.get("FinalStatus") === "Approved"

// storeValue — reads inputValue → Runtime.set(key, value) → returns value
const qty = await base.storeValue(el.quantityField, "Qty");
// qty === "10"
// Runtime.get("Qty") === "10"

// storeCount — counts elements → Runtime.set(key, String(count)) → returns number
const rows = await base.storeCount(el.tableRows, "RowCount");
// rows === 5
// Runtime.get("RowCount") === "5"

// storeAttribute — reads attribute → Runtime.set(key, value) → returns value
const href = await base.storeAttribute(el.link, "href", "LinkURL");
// href === "/path/to/page"
// Runtime.get("LinkURL") === "/path/to/page"

// Auto-key from element name — no key needed
await base.storeText(el.orderLabel);
// Runtime.set("Order Label", value)  ← uses element's __name as key
```

Do not use Runtime as a cross-worker database — Playwright workers are separate processes.

---

## File and PDF Validation

```typescript
import { FileUtils } from "@helpers/fileUtils";

// Download and verify
const result = await FileUtils.clickAndVerifyDownload(
    el.downloadButton,
    ".pdf",
    { keywords: ["Invoice", "Total"], testInfo, writeReport: true }
);
expect(result.downloaded).toBe(true);
expect(result.valid).toBe(true);

// Verify existing PDF
const pdf = await FileUtils.verifyPdf("test-results/downloads/invoice.pdf", {
    keywords: ["Invoice", "Approved"]
});
expect(pdf.valid).toBe(true);

// Other formats
await FileUtils.verifyExcel("report.xlsx");
await FileUtils.verifyCsv("report.csv");
await FileUtils.verifyDocx("document.docx");
const rows = await FileUtils.readExcel("report.xlsx");
const data = FileUtils.readJSON("data.json");
```

---

## Auto-Healing

When a locator fails, the auto-heal engine tries these strategies in order:

1. `getByRole`
2. `getByLabel`
3. `getByPlaceholder`
4. `getByText`
5. CSS class
6. XPath normalize-space
7. XPath contains
8. DOM similarity

When healing succeeds, the log shows:

```
[WARN]  [AutoHeal] "Submit Button" not visible after 30000ms — attempting heal
[WARN]  [AutoHeal] ✅ Healed via [getByText] → Submit Button
[💡]    UPDATE POM → xpath=//*[contains(normalize-space(),"Submit")]
```

**Action required:** update the locator in your locator file with the suggested XPath. Auto-healing is a recovery mechanism, not a substitute for maintaining locators.

---

## Reports and Debugging

| Report | Location |
|--------|---------|
| Playwright HTML | `playwright-report/` |
| JUnit XML | `reports/results.xml` |
| Allure | `allure-results/` |
| Logs | `logs/` |
| Artifacts | `test-results/` |

```bash
npm run report:show
npm run report:allure
npx playwright show-trace test-results/path/trace.zip
```

Failure evidence retained automatically: screenshot, video, trace, logs.

---

## CI Execution

```bash
npm run test:ci
npm run smoke:ci
npm run regression:ci
```

When `CI=true`:
- Headless mode
- 2 workers
- 1 retry on failure
- Stops after 20 failures
- Forbids `test.only`
- Produces HTML, JUnit, Allure reports

```bash
# CI pipeline steps
npm ci
npm run pw:install
npm run typecheck
npm run smoke:ci
```

---

## Coding Conventions

- Test files under `test/`, named `*.spec.ts`
- Locators in `src/pages/Elements/`, named `*Locators.ts`
- Business workflows in `src/Modules/`
- Always `base.method(el.locator)` — never raw `page.click()`
- Always use constants from `appConstant.ts` — never hardcode strings
- Always `contains(@class,'name')` — never `@class='exact'`
- Always `waitForURL` before extracting URL or asserting status after save
- Always `waitForElementIsVisible(el.submitOption)` after opening Actions menu
- Use `closeUntilVisible` for close button loops — never `whileVisible + base.click`
- `@smoke` = fast critical checks only
- `@regression` = full business flow
- Keep tests independent unless prerequisite is intentional
- Clear test titles — prerequisite matching depends on exact title

---

## Troubleshooting

### No tests found
```bash
npx playwright test --list
# File must be under test/, end with .spec.ts, not filtered by --grep
```

### OrderName is empty
```typescript
// ❌ URL not updated yet
const match = page.url().match(/PO-[\w]+/);

// ✅ Wait for URL first
await page.waitForURL(/PO-[\w]+/, { timeout: 15000 });
const match = page.url().match(/PO-[\w]+/);
```

### Submit button times out (30+ seconds)
```typescript
// ❌ Actions menu needs time to render Submit
await base.click(el.actionsButton);
await base.click(el.submitOption);

// ✅ Wait for Submit to appear after menu opens
await base.click(el.actionsButton);
await base.waitForElementIsVisible(el.submitOption);
await base.click(el.submitOption);
```

### Close button loops forever with autoHeal
```typescript
// ❌ base.click triggers autoHeal when button is gone → error
await base.whileVisible(el.closeButton, async () => {
    await base.click(el.closeButton);
});

// ✅ closeUntilVisible stops when button gone or target visible
await base.closeUntilVisible(el.closeButton, el.approvedStatus, 5);
```

### Draft Status not found after save
```typescript
// ❌ Page not loaded yet
await base.assertElementVisible(el.draftStatus);

// ✅ Wait for URL change first — confirms page fully loaded
await page.waitForURL(/PO-[\w]+/, { timeout: 15000 });
await base.assertElementVisible(el.draftStatus);
```

### Prerequisite test not running
- Check that `description` matches prerequisite title **exactly**
- Import `preReqTest` from `@fixtures/preReqFixture`
- Both tests must be in the same test run
- Check `reports/prereq-state.json` — prerequisite must be `passed`

### TypeScript import not found
```
Check tsconfig.json aliases:
@pages/*   @helpers/*   @modules/*   @utils/*   @config/*   @fixtures/*   @src/*
```

### Test is flaky
```bash
npx playwright test path/to/test.spec.ts --headed --workers=1
# Review trace and video — replace pauses with waitForElementIsVisible
# Check whether locator is healing — update POM if so
```

---

## Current Repository Notes

The repository is being migrated from an older folder layout.

- `src/Modules/purchaseOrder.ts` references `src/pages/Element/` — should be `src/pages/Elements/`
- New tests should use `@fixtures/basefixtures` for automatic logging
- `dataFilter.ts` and `set.ts` expect `test-data/ui/` — existing data is under `testdata/JSON Files/`
- `TestDataManager` expects `test-data/`
- Firefox and WebKit are commented out in `playwright.config.ts`
- Some package scripts reference `src/tests/ui/` which does not exist yet

Run `npm run typecheck` after any migration change.

---

## Quick Reference

```bash
# Install
npm install && npm run pw:install

# Validate
npx playwright test --list
npm run typecheck

# Run
npm run test:qa
npm run test:dev
npm run smoke
npm run regression
npm run sanity
npm run p1

# Debug
npm run test:qa:debug
npm run test:qa:ui

# Reports
npm run report:show
npm run report:allure

# CI
npm run test:ci
npm run smoke:ci
npm run regression:ci
```