import { test as base, expect } from '@playwright/test';
import { BasePage } from '../pages/basePage';

type TestFixtures = {
  basePage: BasePage;
};

export const test = base.extend<TestFixtures>({
  basePage: async ({ page }, use) => {
    const basePage = new BasePage(page);
    await use(basePage);
  },
});

export { expect };
