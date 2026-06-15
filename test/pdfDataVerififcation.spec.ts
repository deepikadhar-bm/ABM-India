// ============================================================================
//  TEST — testotomasyonu.com — Download PDF + Verify P12_Test text
// ============================================================================

import { test, expect }          from '@playwright/test';
import { FileUtils }    from "../src/helpers/fileUtils";

test("Download bill PDF and verify Pdf content",
  async ({ page }, testInfo) => {

   
    await page.goto("https://sample-files.com/documents/pdf/");

   const pdfLink= page.locator('(//*[text()="PDF"])[2]');
    await pdfLink.click();
      await page.waitForTimeout(10000); 
    const DownloadButton  =page.locator('(//*[text()="Download"])[2]')

   
    const dl = await FileUtils.clickAndVerifyDownload(
      DownloadButton, 
      ".pdf",
      { testInfo }
    );

    expect(dl.downloaded).toBe(true);
    expect(dl.valid).toBe(true);

    

   
    const result = await FileUtils.verifyPdf(dl.filePath, {
     keywords: [

        "Sample Document for PDF Testing",
        "Basic text document"
      ],
      testInfo,
       writeReport: true,
    });
  
    
    expect(result.valid).toBe(true);
    const pdfPath = "C:/Users/Sysla-Sairaj/Downloads/ABM.pdf";
    const content = await FileUtils.verifyPdfContent(
          pdfPath,
  {
    fields: [

     {
        label: "KDMC",
        text: "ई-सेवा",
        match: "contains"
      },
      {
        label: "License",
        text: "परवाना",
        match: "contains"
      }


    ],
    testInfo,
    writeReport: true,
  }
);

expect(content.allFieldsFound).toBe(true);



  }); 