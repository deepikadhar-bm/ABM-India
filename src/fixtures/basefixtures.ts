// src/fixtures/baseFixture.ts
// ============================================================================
//  BASE FIXTURE — Auto logger injection
// ============================================================================

import { test as base, TestInfo } from "@playwright/test";
import { logger }                  from "../helpers/logger";
import * as path                   from "path";

type BaseFixtures = {
  autoLogger: void;
};

export const test = base.extend<BaseFixtures>({

  autoLogger: [async ({ page }, use, testInfo: TestInfo) => {

    const suiteName = testInfo.titlePath
      .slice(0, -1)
      .filter(Boolean)
      .join(" › ") || undefined;

    const dataSet = extractDataSet(testInfo.title) || undefined;

    // ── filter suite name if it equals the file name ──────────────────────
    const fileBase    = path.basename(testInfo.file);
    const cleanSuite  = suiteName && suiteName !== fileBase
                        ? suiteName
                        : undefined;

    logger.testStart({
      testName:    testInfo.title,
      testFile:    testInfo.file,
      suiteName:   cleanSuite,
      environment: process.env.ENVIRONMENT ?? "qa",
      browser:     testInfo.project?.name  ?? process.env.BROWSER ?? "chromium",
      dataSet,
    });

    // ── filter noisy browser console errors ───────────────────────────────
    try {
      page.on("console", msg => {
        if (msg.type() === "error") {
          const text = msg.text();
          // ignore third-party resource errors — not our app
          if (
            text.includes("Failed to load resource") ||
            text.includes("ERR_BLOCKED_BY_CLIENT")   ||
            text.includes("ERR_ABORTED")              ||
            text.includes("Content Security Policy")  ||
            text.includes("frame-ancestors")
          ) return;
          logger.warn(`[Browser Console Error] ${text}`);
        }
      });

      page.on("crash", () => {
        logger.error(`[Page Crashed] during: ${testInfo.title}`);
      });
    } catch {
      // page not available in API-only tests
    }

    await use();

    const status = (testInfo.status ?? "failed") as "passed" | "failed" | "skipped";

    if (status === "failed") {
      try {
        const screenshot = await page.screenshot({ fullPage: true });
        await testInfo.attach("failure-screenshot", {
          body:        screenshot,
          contentType: "image/png",
        });
        logger.fail("Screenshot captured → attached to report");
      } catch {
        // page already closed
      }
    }

    logger.testEnd(status);

  }, { auto: true }],

});

export { expect } from "@playwright/test";

function extractDataSet(title: string): string | null {
  const setMatch = title.match(/Set\s+\d+(?:\s*\([^)]+\))?/i);
  if (setMatch) return setMatch[0].trim();
  const parenMatch = title.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  return null;
}