// tests/demo/data-sources.spec.ts
import { test } from "@fixtures/basefixtures";
import { Orange }        from "@pages/Element/Orange";
import { logger as log } from "@helpers/logger";
import { configManager } from "@config/env.index";
import {
  TestData,
  ExcelData,
  ExcelValidator,
  ORANGE_LOGIN_WORKBOOK,
} from "../../testdata";

interface LoginData {
  readonly Username: string;
  readonly Password: string;
}

interface LoginExpected {
  readonly landingMenu: string;
}

const TC01 = "REG_TS_DS_TC01";
const TC02 = "REG_TS_DS_TC02";
const TC03 = "REG_TS_DS_TC03";
const TC04 = "REG_TS_DS_TC04";
const TC05 = "REG_TS_DS_TC05";
const TC06 = "REG_TS_DS_TC06";
const TC07 = "REG_TS_DS_TC07";
const TC08 = "REG_TS_DS_TC08";

test.describe("Data Sources — TestData | ExcelData | ExcelValidator", () => {

  let el: Orange;

  test.beforeAll(() => {
    const all = TestData.getAll();
    log.info(`Available test data: ${all.map(e => e.testDataName).join(", ")}`);
    const entry = ExcelValidator.getEntry("Orange_Login_Data");
    log.info(`Excel entry: ${entry.description} — sheet: ${entry.sheet}`);
  });

  test.beforeEach(async ({ page }) => {
    el = new Orange(page);
  });

  test.afterAll(() => {
    TestData.reload();
    ExcelData.reload();
    ExcelValidator.reload();
  });

  // ── TC01 ──────────────────────────────────────────────────────────────────

  test(`@smoke ${TC01} - Login using TestData`, async ({ basePage }) => {
    const data = TestData.getData<LoginData>("Orange_Login_Data");

    await basePage.navigateTo(configManager.getEasyURL() ?? configManager.getBaseURL());
    await basePage.fill(el.username, data.Username);
    await basePage.fill(el.password, data.Password);
    await basePage.click(el.loginButton);
    await basePage.waitForElementIsVisible(el.admin);

    log.pass(`${TC01} - Login successful`);
  });

  // ── TC02 ──────────────────────────────────────────────────────────────────

  test(`@smoke ${TC02} - Verify landing menu from expected`, async ({ basePage }) => {
    const data     = TestData.getData<LoginData>("Orange_Login_Data");
    const expected = TestData.getExpected<LoginExpected>("Orange_Login_Data");

    await basePage.navigateTo(configManager.getEasyURL() ?? configManager.getBaseURL());
    await basePage.fill(el.username, data.Username);
    await basePage.fill(el.password, data.Password);
    await basePage.click(el.loginButton);
    await basePage.waitForElementIsVisible(el.admin);
    await basePage.assertText(el.admin, expected.landingMenu);

    log.pass(`${TC02} - Landing menu verified`);
  });

  // ── TC03 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC03} - Verify Username cell from xlsx`, async () => {
    const headers = await ExcelData.getSheetHeaders(ORANGE_LOGIN_WORKBOOK, "LoginTestData");
    log.info(`Sheet headers: ${headers.join(", ")}`);

    await ExcelData.verifyCell(ORANGE_LOGIN_WORKBOOK, "LoginTestData", 2, "Username", "Admin");
    log.pass(`${TC03} - Cell verified`);
  });

  // ── TC04 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC04} - Verify full row from xlsx`, async () => {
    await ExcelData.verifyRow(ORANGE_LOGIN_WORKBOOK, "LoginTestData", 2, {
      Username: "Admin",
      Password: "admin123",
    });
    log.pass(`${TC04} - Row verified`);
  });

  // ── TC05 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC05} - Read raw cell value from xlsx`, async () => {
    const value = await ExcelData.getCellValue(ORANGE_LOGIN_WORKBOOK, "LoginTestData", 2, "Username");
    log.info(`Raw cell value: ${value}`);
    log.pass(`${TC05} - Raw value read: ${value}`);
  });

  // ── TC06 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC06} - Verify TotalPrice formula`, async () => {
    await ExcelValidator.verifyFormula("Orange_Login_Data", 2, "TotalPrice", 100000);
    log.pass(`${TC06} - Formula verified`);
  });

  // ── TC07 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC07} - Full validation of Orange_Login_Data`, async () => {
    const entry = ExcelValidator.getEntry("Orange_Login_Data");
    log.info(`Validating: ${entry.description} — sheet: ${entry.sheet}`);

    await TestData.validate("Orange_Login_Data");
    log.pass(`${TC07} - All validations passed`);
  });

  // ── TC08 ──────────────────────────────────────────────────────────────────

  test(`@excel ${TC08} - Verify all entries in excel.json`, async () => {
    const all = TestData.getAll();
    log.info(`Entries to validate: ${all.map(e => e.testDataName).join(", ")}`);

    await ExcelValidator.verifyAllEntries();
    log.pass(`${TC08} - All entries verified`);
  });
});