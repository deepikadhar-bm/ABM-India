import { BasePage } from '@pages/basePage';
import { PurchaseOrderLocators } from '@pages/Element/Purchaseorderlocators';

export async function stepGroup_HandleSubmitPopups(
    base: BasePage,
    el: PurchaseOrderLocators
) {
    await base.ifVisible(el.interstatePartnerAlert, async () => {
        await base.click(el.noContinueLocalGST);
    }, undefined, 3000);

    await base.ifVisible(el.yesSubmitButton, async () => {
        await base.click(el.yesSubmitButton);
    }, undefined, 3000);
}

export async function stepGroup_ApproveUntilDone(
    base: BasePage,
    el: PurchaseOrderLocators,
    maxApprovals = 3
) {

    // Already approved
    const alreadyApproved = await el.approvedStatus
        .isVisible()
        .catch(() => false);

    if (alreadyApproved) {
        console.log('✅ Already Approved - skipping approval');
        return;
    }

    for (let i = 0; i < maxApprovals; i++) {

        const visible = await el.approveThisDocumentButton
            .isVisible()
            .catch(() => false);

        if (!visible) {
            console.log('✅ Approval completed');
            break;
        }

        await base.click(el.approveThisDocumentButton);

        await base.ifVisible(
            el.yesApproveButton,
            async () => {
                await base.click(el.yesApproveButton);
            },
            undefined,
            3000
        );

        await base.waitForLoadState('domcontentloaded');

        // Optional if available in BasePage
        await base.waitForPageReady();

        // Give UI a chance to refresh
        await base.pause(1000);

        const stillVisible = await el.approveThisDocumentButton
            .isVisible()
            .catch(() => false);

        if (!stillVisible) {
            console.log('✅ Approve button disappeared');
            break;
        }
    }
}