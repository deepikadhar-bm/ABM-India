import { test }               from '@playwright/test';
import { BasePage }           from '@pages/basePage';
import { logger as log }      from '@helpers/logger';
import { Orange }             from '@pages/Element/Orange';
import { testDataManager }    from '../../testdata/testDataManager';

// ── Constants ─────────────────────────────────────────────────────────────────
const EXCEL_FILE = 'excelDataFiles/Sample_TestData.xlsx';
const ORANGE_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';

// ✅ Match exactly what is in Excel column A
const TC_ID_1    = 'REG_TS_or_TC01';
const TC_ID_2    = 'REG_TS_or_TC02';

test.describe('Orange HRM - Login Module', () => {

    let el:   Orange;
    let base: BasePage;

    test.beforeEach(async ({ page }) => {
        el   = new Orange(page);
        base = new BasePage(page);
    });

    // =========================================================================
    //  TC01 — Login using getTestDataByRow (by row number)
    //  sheet = 'LoginTestData' by name OR 0 for first sheet by index
    // =========================================================================
    test(
        `@@smoke ${TC_ID_1} - Login using row data`,
        async ({ page }) => {

        log.info(`${TC_ID_1} - Login using getTestDataByRow`);

        // ── Load by row number ────────────────────────────────────────────────
        // getTestDataByRow(file, rowNumber, sheet?)
        // sheet by name  → 'LoginTestData'
        // sheet by index → 0  (first sheet)
        // no sheet arg   → first sheet automatically
        const data = await testDataManager.getTestDataByRow(
            EXCEL_FILE,
            2,                 // row 2 = first data row (row 1 = headers)
            'LoginTestData'    // sheet by name
        );

        log.step('Navigate to OrangeHRM');
        await base.navigateTo(ORANGE_URL);

        // ✅ Capital U and P — match Excel column headers exactly
        log.step(`Login as: ${data.Username}`);
        await base.fill(el.username, String(data.Username));
        await base.fill(el.password, String(data.Password));
        await base.click(el.loginButton);

        log.step('Verify login successful');
        await base.waitForElementIsVisible(el.admin);
        await base.storeText(el.admin, 'LoggedInUser');
        log.info(`Logged in as: ${'loggedInUser'}`);
        log.pass(`${TC_ID_1} - Login successful with row data`);
    });

    // =========================================================================
    //  TC02 — Login using getTestDataByTestCaseId (by TC ID lookup)
    //  sheet = 'LoginTestData' by name OR 0 for first sheet by index
    // =========================================================================
    test(
        `@smoke ${TC_ID_2} - Login using TC ID lookup`,
        async ({ page }) => {

        log.info(`${TC_ID_2} - Login using getTestDataByTestCaseId`);

        // ── Load by TC ID ─────────────────────────────────────────────────────
        // getTestDataByTestCaseId(file, testCaseId, sheet?, idColumnName?)
        // sheet by name  → 'LoginTestData'
        // sheet by index → 0  (first sheet)
        // no sheet arg   → first sheet automatically
        // ✅ idColumnName = 'TestCaseID' — match Excel column A header exactly
        const data = await testDataManager.getTestDataByTestCaseId(
            EXCEL_FILE,
            TC_ID_2,           // matches "TestCaseID" column in Excel
            'LoginTestData',   // sheet by name
            'TestCaseID'       // ✅ Excel column header is "TestCaseID" not "TestCaseId"
        );

        log.step('Navigate to OrangeHRM');
        await base.navigateTo(ORANGE_URL);

        // ✅ Capital U and P — match Excel column headers exactly
        log.step(`Login as: ${data.Username}`);
        await base.fill(el.username, String(data.Username));
        await base.fill(el.password, String(data.Password));
        await base.click(el.loginButton);

        log.step('Verify login successful');
        await base.waitForElementToDisappear(el.admin);

        

        log.pass(`${TC_ID_2} - Login successful with TC ID lookup`);
    });
});