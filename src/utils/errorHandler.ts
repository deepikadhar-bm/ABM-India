// ============================================================================
// ERROR HANDLER - ENTERPRISE VERSION
// ----------------------------------------------------------------------------
// PURPOSE:
//   Centralized error handling for *all* Playwright UI/API actions.
//   Provides:
//     ✔ Context-aware error logs
//     ✔ Auto screenshot capture
//     ✔ Error classifiers (network, timeout, fatal browser errors)
//     ✔ Works with BasePage, ElementUtils, API calls, workflows
//
// WHEN TO USE:
//   - Wrap any action that may fail (click, navigation, API call)
//   - Wrap complex page object functions to get automatic stack logs
//   - Capture screenshots on workflow failures
//
// EXAMPLE (BasePage):
//   return ErrorHandler.handle(() => this.page.click('#login'), {
//     context: "BasePage.click"
//   });
//
// EXAMPLE (Workflow):
//   try {
//     await this.addMapping();
//   } catch (err) {
//     await ErrorHandler.handleAsync(err, {
//       page: this.page,
//       context: "WorkflowPage.addMapping",
//       screenshotName: "addMapping_failed"
//     });
//   }
//
// NOTE:
//   It *does not swallow the error* — it always rethrows.
//   This ensures Playwright test still fails.
// ============================================================================

import { Page } from "@playwright/test";
import { logger } from "./logger";

export class ErrorHandler {

  // ============================================================================
  // STANDARD WRAPPER (MOST COMMON)
  // ----------------------------------------------------------------------------
  /**
   * Wraps an async UI/API function with enterprise logging.
   *
   * HOW IT WORKS:
   * 1. Executes your function
   * 2. If it throws → logs contextual error message
   * 3. Rethrows error so test still fails
   *
   * WHEN TO USE:
   * - BasePage actions (click, fill, type, wait)
   * - API helpers
   * - Page object mini functions (openDrawer(), selectWorkflow(), etc.)
   *
   * @example
   * await ErrorHandler.handle(async () => {
   *   await locator.click();
   * }, { context: "click-login" });
   */
  static async handle<T>(
    fn: () => Promise<T>,
    options?: { context?: string }
  ): Promise<T> {
    const context = options?.context ?? "";

    try {
      return await fn();
    } catch (error: any) {
      this.logError(error, context);
      throw error; // always rethrow
    }
  }

  // ============================================================================
  // ADVANCED HANDLER (WITH SCREENSHOT)
  // ----------------------------------------------------------------------------
  /**
   * Handles thrown error + captures full-page screenshot.
   *
   * WHEN TO USE:
   * - In page objects when a specific operation fails
   * - In long workflows where debugging is critical
   * - For fatal crashes during test execution
   *
   * HOW IT WORKS:
   * 1. Logs error w/ context
   * 2. Captures screenshot into /test-results/errors/
   * 3. Rethrows error so test still fails
   *
   * @example
   * try {
   *   await this.addActivity();
   * } catch (err) {
   *   await ErrorHandler.handleAsync(err, {
   *     page: this.page,
   *     context: "WorkflowPage.addActivity",
   *     screenshotName: "addActivity_failed"
   *   });
   * }
   */
  static async handleAsync(
    error: any,
    options?: {
      context?: string;
      page?: Page;
      screenshotName?: string;
    }
  ): Promise<void> {
    const context = options?.context ?? "";
    const page = options?.page;
    const screenshotName = options?.screenshotName;

    this.logError(error, context);

    if (page && screenshotName) {
      try {
        const file = `test-results/errors/${screenshotName}.png`;

        await page.screenshot({ path: file, fullPage: true });
        logger.error(`📸 Screenshot captured: ${file}`);

      } catch (ssError) {
        logger.error(`Failed to capture screenshot: ${ssError}`);
      }
    }

    throw error; // rethrow
  }

  // ============================================================================
  // INTERNAL LOGGING
  // ----------------------------------------------------------------------------
  /**
   * Logs error message + stack trace in enterprise format.
   *
   * INTERNAL USE ONLY. Do not call directly.
   */
  private static logError(error: any, context: string = "") {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : "";

    if (context) {
      logger.error(` Error in ${context}: ${message}`);
    } else {
      logger.error(`Error: ${message}`);
    }

    if (stack) logger.error(stack);
  }

  // ============================================================================
  // ERROR CLASSIFIERS (Used for retries / talent logic)
  // ----------------------------------------------------------------------------
  /**
   * Returns TRUE if error is caused by network issues.
   * Useful for retry-on-network-failure logic.
   */
  static isNetworkError(error: any): boolean {
    const msg = error?.message || "";
    return (
      msg.includes("net::") ||
      msg.includes("ERR_") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED")
    );
  }

  /**
   * Returns TRUE if error message contains "timeout".
   */
  static isTimeoutError(error: any): boolean {
    return (error?.message || "").toLowerCase().includes("timeout");
  }

  /**
   * Returns TRUE for element-level Playwright errors.
   *
   * Used to decide if a retry should be allowed.
   */
  static isElementError(error: any): boolean {
    const msg = error?.message || "";
    return (
      msg.includes("element") ||
      msg.includes("selector") ||
      msg.includes("not visible") ||
      msg.includes("not enabled")
    );
  }

  /**
   * Detects catastrophic Playwright errors:
   * - Browser closed
   * - Context destroyed
   * - Page crashed
   */
  static isFatalPlaywrightError(error: any): boolean {
    const msg = error?.message || "";
    return (
      msg.includes("Target page") ||
      msg.includes("browser has been closed") ||
      msg.includes("Context has been closed") ||
      msg.includes("Navigation failed") ||
      msg.includes("Invalid selector")
    );
  }
}
// ============================================================================