import { test } from '@playwright/test';
import { BasePage } from '@pages/basePage';
import { logger as log } from '@helpers/logger';
import { Orange } from '@pages/Element/Orange';
import { configManager } from '@config/env.index';
import { testDataManager } from '../../testdata/testDataManager';

const data = testDataManager.getJsonData('Orange_Login_Data')('excel.json')
const data1 = testDataManager.getJsonData('Purchase_Order_Data')('excel.json')

//const Orange_Login_Data = 'Orange_Login_Data';

test.describe('Orange HRM - JSON Test Data', () => {
            
    let el: Orange;
    let base: BasePage;

    test.beforeEach(async ({ page }) => {
        el = new Orange(page);
        base = new BasePage(page);

    });

    test(
        '@smoke Login using JSON test data',
        async () => {
            
            const loginUrl = configManager.getEasyURL() ?? configManager.getBaseURL();

            log.step('Navigate to OrangeHRM');
            await base.navigateTo(loginUrl);

            

            log.step(`Login as: ${data.Username}`);
            await base.fill(el.username, data.Username);
            await base.fill(el.password, data.Password);
            await base.click(el.loginButton);

            log.step('Verify login successful');
            await base.waitForElementIsVisible(el.admin);
            log.pass('Login successful using JSON test data');
   });

test(
        '@smoke Login using JSON test data2',
        async () => {
            
            const loginUrl = configManager.getEasyURL() ?? configManager.getBaseURL();

            log.step('Navigate to OrangeHRM');
            await base.navigateTo(loginUrl);

            log.step(`Login as: ${data.Username}`);
            await base.fill(el.username, data1.Username);
            await base.fill(el.password, data1.Password);
            await base.click(el.loginButton);

            
            await base.waitForElementToDisappear(el.admin);
           
        }
    );
    
});

 
