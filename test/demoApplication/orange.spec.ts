// test/demoApplication/orange.spec.ts

import { test } from "@fixtures/basefixtures";
//import { BasePage } from "@pages/basePage";
import { logger as log } from "@helpers/logger";
import { Orange } from "@pages/Element/Orange";
import { configManager } from "@config/env.index";
import { TestDataManager, testDataManager } from "../../testdata/TestDataManager";
import { BasePage } from "@pages/basePage";


interface OrangeLoginData {
  readonly Username: string;
  readonly Password: string;
}

const TC_ID_1 = "REG_TS_or_TC01";
const TC_ID_2 = "REG_TS_or_TC02";
const ORANGE_LOGIN_WORKBOOK = "excelDataFiles/Sample_TestData.xlsx";
const TEST_DATA_FILE = "test-data.json";

test.describe("Orange HRM - Login Module", () => {
  let el: Orange;
  //let base: BasePage;

  test.beforeEach(async ({ page }) => {
    el = new Orange(page);
    
  });

  test.afterAll(() => {
    TestDataManager.clearCache();
  });

  test(`@regression @smoke ${TC_ID_1} - Login using row data`, async ({basePage}) => {
    log.info(`${TC_ID_1} - Login using getTestDataByRow`);

    const data = await testDataManager.getTestDataByRow(
      ORANGE_LOGIN_WORKBOOK,
      2,
      "LoginTestData"
    );

    log.step("Navigate to OrangeHRM");
    await basePage.navigateTo(configManager.getEasyURL() ?? configManager.getBaseURL());

    log.step(`Login as: ${data.Username}`);
    await basePage.fill(el.username, String(data.Username));
    await basePage.fill(el.password, String(data.Password));
    await basePage.click(el.loginButton);

    log.step("Verify login successful");
    await basePage.waitForElementIsVisible(el.admin);
    await basePage.storeText(el.admin, "LoggedInUser");
    log.pass(`${TC_ID_1} - Login successful with row data`);
  });

  test(`@smoke ${TC_ID_2} - Login using JSON profile data`, async ({basePage}) => {
    log.info(`${TC_ID_2} - Login using JSON profile data`);

    const data = testDataManager.getJsonData<OrangeLoginData>("Orange_Login_Data")(
      TEST_DATA_FILE
    );

    log.step("Navigate to OrangeHRM");
    await basePage.navigateTo(configManager.getEasyURL() ?? configManager.getBaseURL());

    log.step(`Login as: ${data.Username}`);
    await basePage.fill(el.username, data.Username);
    await basePage.fill(el.password, data.Password);
    await basePage.click(el.loginButton);

    log.step("Verify login completed");
    await basePage.waitForElementToDisappear(el.admin);
    log.pass(`${TC_ID_2} - Login completed with JSON profile data`);
  });
});
