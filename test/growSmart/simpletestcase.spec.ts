// ============================================================================
//  Purchase.spec.ts
//  el    = new PurchaseOrderLocators(page)  → locators only
//  base  = new BasePage(page)               → all methods
//  login = new LoginPage(page)              → login methods
// ============================================================================
import { test, expect}          from '@playwright/test';
import { BasePage } from '@pages/basePage';
import { LoginPage }from '@modules/loginPage';
import { logger as log }from '@helpers/logger';
import { Runtime }from '@utils/runtimeStore';
import { PurchaseOrderLocators }
from '@pages/Elements/purchaseOrderLocators'; 

import {


    stepGroup_HandleSubmitPopups,
    stepGroup_ApproveUntilDone
} from '@modules/purchaseOrder';

import {
    PO_STATUS,
    GRN_STATUS,
    SUPPLIER,
    WAREHOUSE,
    DELIVERY,
    PURCHASE_EXECUTIVE,
    ITEM,
    ORDER,
    CLOSE_MAX_ATTEMPTS
} from 'src/appConstant.ts/appConstants';

const TC_ID    = 'REG_TS_PO_TC01';
const TC_TITLE = 'Create Purchase Order - Full E2E';

test.describe('Purchase Order Module ', () => {

    let el:    PurchaseOrderLocators;
    let base:  BasePage;
    let login: LoginPage;

    test.beforeEach(async ({ page }) => {
        el    = new PurchaseOrderLocators(page);
        base  = new BasePage(page);
        login = new LoginPage(page);
    });

    test(`@regression ${TC_ID} - ${TC_TITLE}`  , async ({ page }) => {

        log.info(`${TC_ID} - ${TC_TITLE}`);

        // ── Login ─────────────────────────────────────────────────────────────
        log.step('Login to application');
        await login.navigateTo();
        await login.login();
        await login.verifyLoginSuccessful();
        log.pass('Login successful');

        // ── Open Purchase Order ───────────────────────────────────────────────
        log.step('Open Purchase Order form');
        await base.click(el.typeToSearchField);
        await base.type(el.searchField, ORDER.TYPE);
        await base.click(el.purchaseOrdersDropdown);
        await base.click(el.createPurchaseOrderButton);
        log.pass('Purchase Order form opened');

        // ── Select Warehouse ──────────────────────────────────────────────────
        log.step('Select Warehouse');
        await base.click(el.forStockRadio);
        await base.click(el.warehouseDropdown);
        await base.click(el.warehouseSelect);
        await base.click(el.taxUnit);
        await base.click(el.selectBranch);
        await base.click(el.doneButton);
        log.pass('Warehouse selected');

        // ── Select Supplier ───────────────────────────────────────────────────
        log.step(`Select Supplier: ${SUPPLIER.NAME}`);
        await base.click(el.supplierDropdown);
        await base.waitForElementIsVisible(el.supplierDropdown);
        await base.pause(300);
        await base.type(el.supplierDropdown, SUPPLIER.NAME);
        await base.pressKey('Enter');
        log.pass(`Supplier: ${SUPPLIER.NAME}`);

        // ── Select Delivery Address ───────────────────────────────────────────
        log.step(`Select Delivery Address: ${DELIVERY.ADDRESS}`);
        await base.scrollIntoView(el.deliveryAddressLabel);
        await base.click(el.deliveryAddressDropdown);
        await base.pause(300);
        await base.type(el.deliveryAddressDropdown, DELIVERY.ADDRESS);
        await base.pressKey('Enter');
        log.pass(`Delivery Address: ${DELIVERY.ADDRESS}`);

        // ── Select Purchase Executive ─────────────────────────────────────────
        log.step(`Select Purchase Executive: ${PURCHASE_EXECUTIVE.NAME}`);
        await base.click(el.purchaseExecutiveDropdown);
        await base.pause(300);
        await base.type(el.purchaseExecutiveDropdown, PURCHASE_EXECUTIVE.NAME);
        await base.pressKey('Enter');
        log.pass(`Purchase Executive: ${PURCHASE_EXECUTIVE.NAME}`);

        // ── Add Item ──────────────────────────────────────────────────────────
        log.step(`Add Item: ${ITEM.NAME}`);
        await base.click(el.addItemsButton);
        await base.waitForElementIsVisible(el.itemTextbox);
        await base.click(el.itemTextbox);
        await base.pause(300);
        await base.type(el.itemTextbox, ITEM.NAME);
        await base.click(el.itemOption1(ITEM.NAME));
        log.pass(`Item: ${ITEM.NAME}`);

        // ── Enter Quantity ────────────────────────────────────────────────────
        log.step(`Enter Quantity: ${ITEM.QUANTITY}`);
        await base.click(el.quantityTextbox);
        await base.pause(200);
        await base.clear(el.quantityTextbox);
        await base.type(el.quantityTextbox, ITEM.QUANTITY);
        await base.pressKey('Tab');
        log.pass(`Quantity: ${ITEM.QUANTITY}`);

        // ── Enter Rate ────────────────────────────────────────────────────────
        log.step(`Enter Rate: ${ITEM.RATE}`);
        await base.click(el.rateTextbox);
        await base.pause(200);
        await base.clear(el.rateTextbox);
        await base.type(el.rateTextbox, ITEM.RATE);
        await base.pressKey('Tab');
        log.pass(`Rate: ${ITEM.RATE}`);

        // ── Verify Amount ─────────────────────────────────────────────────────
        log.step(`Verify Amount: ${ITEM.AMOUNT}`);
        await page.waitForFunction(
            (sel) => {
                const node = document.evaluate(sel, document, null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE, null
                ).singleNodeValue as HTMLInputElement;
                return node && node.value !== '' && node.value !== '0';
            },
            '(//*[text()="Amount"]/../..//*[@type="number"])[last()]',
            { timeout: 10000 }
        );
        const rawAmount = await el.amountTextbox.first()
            .evaluate((e: HTMLInputElement) => e.value);
        expect(Number(rawAmount.replace(/,/g, ''))).toBe(ITEM.AMOUNT);
        log.pass(`Amount verified: ${ITEM.AMOUNT}`);

        // ── Select Order Brand ────────────────────────────────────────────────
        log.step('Select Order Brand');
        await base.click(el.orderBrandDropdown);
        await base.click(el.orderBrandOption);
        await base.click(el.doneButton);
        log.pass('Order Brand selected');

        // ── Save Order ────────────────────────────────────────────────────────
        log.step(`Save Order → verify ${PO_STATUS.DRAFT}`);
        await base.click(el.actionsButton);
        await base.click(el.saveOption);
        await stepGroup_HandleSubmitPopups(base, el);

    
        // ── Submit PO ─────────────────────────────────────────────────────────
        log.step('Submit Purchase Order');
        await base.click(el.actionsButton);
        await base.waitForElementIsVisible(el.submitOption);
        await base.click(el.submitOption);
        await stepGroup_HandleSubmitPopups(base, el);
        log.pass('Purchase Order submitted');

        // ── Approve PO ────────────────────────────────────────────────────────
        log.step('Approve Purchase Order');
        await stepGroup_ApproveUntilDone(base, el, 5);
        await base.assertElementVisible(el.approvedStatus);
        log.pass(`PO ${PO_STATUS.APPROVED}`);

        // ── Create GRN ────────────────────────────────────────────────────────
        log.step('Create Receipt Note (GRN)');
        await base.click(el.relatedDocs);
        await base.click(el.receiptNoteGRNButton);
        await base.click(el.selectItemsButtonGRN);
        await base.click(el.poNo);
        await base.click(el.doneButtonGRN);
        await base.click(el.actionsButton);
        await base.waitForElementIsVisible(el.submitOption);
        await base.click(el.submitOption);
        await stepGroup_HandleSubmitPopups(base, el);
        await stepGroup_ApproveUntilDone(base, el, 3);
        log.pass('GRN created and approved');

        // ── Create Purchase Invoice ───────────────────────────────────────────
        log.step('Create Purchase Invoice');
        const todayDate = new Date().toLocaleDateString('en-GB');
        const invoiceNo = String(Math.floor(Math.random() * 9000) + 1000);

        await base.click(el.relatedDocs1);
        await base.click(el.purchaseInvoiceButton);

        await base.ifVisible(el.supplierInvoiceDate, async () => {
            await base.fillDatePicker(el.supplierInvoiceDate, todayDate);
        }, undefined, 5000);
        await base.fillDatePicker(el.documentDate, todayDate);
        await base.fillDatePicker(el.dueDate, todayDate);

        await base.type(el.supplierInvoiceNo, invoiceNo);
        await base.click(el.selectItemsButtonPI);
        await base.click(el.receiptNo);
        await base.click(el.doneButton3);
        await base.click(el.actionsButton);
        await base.waitForElementIsVisible(el.submitOption);
        await base.click(el.submitOption);
        await stepGroup_HandleSubmitPopups(base, el);
        await stepGroup_ApproveUntilDone(base, el, 2);
        log.pass(`Purchase Invoice created (No: ${invoiceNo})`);

        // ── Close Panels ──────────────────────────────────────────────────────
        //  Fixed: replaced 4x copy-paste if blocks with clean loop
        log.step('Close panels');
        await base.whileVisible(el.closeButton , async () => {
            await el.closeButton.click();
        await base.ifVisible(el.approved1Status, async () => {
        });
         });

        // ── Verify Final Statuses ─────────────────────────────────────────────
        log.step('Verify final statuses');
        await base.assertElementVisible(el.approved1Status);
        log.info(`${PO_STATUS.APPROVED} ✅`);
        await base.assertElementVisible(el.fullyReceived1Status);
        log.info(`${GRN_STATUS.FULLY_RECEIVED} ✅`);
        await base.assertElementVisible(el.fullyInvoicedStatus);
        log.info(`${GRN_STATUS.FULLY_INVOICED} ✅`);
        log.pass('All final statuses verified');

        log.info('PASS');
    });
});