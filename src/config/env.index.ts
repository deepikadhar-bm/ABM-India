// src/config/env.index.ts

import * as fs   from "fs";
import * as path from "path";
import { devConfig }       from "./env.dev";
import { qaConfig }        from "./env.qa";
import { AppConfigSchema } from "./env.schema";
import type { AppConfig, Environment, TimeoutKeys } from "./types";

const configs: Record<Environment, AppConfig> = {
  dev: devConfig,
  qa:  qaConfig,
};

class ConfigManager {
  private env:    Environment;
  private config: AppConfig;

  constructor() {
    const rawEnv = (
      process.env.ENVIRONMENT ||
      process.env.NODE_ENV    ||
      "qa"
    ).trim().toLowerCase();

    this.env = rawEnv === "dev" ? "dev" : "qa";

    const baseConfig = configs[this.env];

    const merged: AppConfig = {
      ...baseConfig,
      baseURL: process.env.BASE_URL || baseConfig.baseURL,
      testDataPath: process.env.TEST_DATA_PATH || baseConfig.testDataPath,
      credentials: {
        username: process.env.PLAYWRIGHT_USERNAME || baseConfig.credentials.username,
        password: process.env.PLAYWRIGHT_PASSWORD || baseConfig.credentials.password,
      },
      timeouts: {
        action:     Number(process.env.TIMEOUT_ACTION)     || baseConfig.timeouts.action,
        wait:       Number(process.env.TIMEOUT_WAIT)       || baseConfig.timeouts.wait,
        navigation: Number(process.env.TIMEOUT_NAVIGATION) || baseConfig.timeouts.navigation,
      },
    };

    const parsed = AppConfigSchema.safeParse(merged);
    if (!parsed.success) {
      console.error("Invalid environment configuration:", parsed.error.format());
      throw new Error(`Environment config validation failed for "${this.env}"`);
    }

    this.config = parsed.data;

    console.log(`\n▶ Running on ENV: ${this.env.toUpperCase()} | BASE URL: ${this.config.baseURL}\n`);
  }

  // ── Existing methods — untouched ───────────────────────────────────────────

  getEnvironment(): Environment       { return this.env; }
  getBaseURL(): string                { return this.config.baseURL; }
  getEasyURL(): string | undefined    { return this.config.easyURL; }
  getAPIBaseURL(): string | undefined { return this.config.apiBaseURL; }
  getTestDataPath(): string           { return this.config.testDataPath; }
  getCredentials()                    { return this.config.credentials; }
  getBrowserConfig()                  { return this.config.browser; }
  getLoggingConfig()                  { return this.config.logging; }
  getRequestOptions()                 { return this.config.requestOptions; }
  getRawConfig(): AppConfig           { return this.config; }

  getTimeout(type: TimeoutKeys): number {
    return this.config.timeouts[type];
  }

  // ── New path methods — single source of truth for all file paths ───────────
  //
  // testDataPath = "testdata/JSON Files"
  // so JSON files resolve directly under testDataPath
  // xlsx files are one level up: "testdata/excelDataFiles/..."

  // → testdata/JSON Files/test-data.json
  getTestDataJsonPath(): string {
    return path.join(
      process.cwd(),
      this.config.testDataPath,
      "test-data.json"
    );
  }

  // → testdata/JSON Files/excel.json
  getExcelJsonPath(): string {
    return path.join(
      process.cwd(),
      this.config.testDataPath,
      "excel.json"
    );
  }

  // filePath is relative to testdata/ root
  // e.g. "excelDataFiles/Sample_TestData.xlsx"
  // → testdata/excelDataFiles/Sample_TestData.xlsx
  getExcelFilePath(filePath: string): string {
    if (!filePath || filePath.trim() === "") {
      throw new Error(
        `ConfigManager.getExcelFilePath: filePath is required`
      );
    }

    // testDataPath = "testdata/JSON Files"
    // go one level up to get testdata/ root
    const testdataRoot = path.join(
      process.cwd(),
      this.config.testDataPath,
      ".."
    );

    const fullPath = path.normalize(
      path.join(testdataRoot, filePath)
    );

    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `ConfigManager.getExcelFilePath: file not found at "${fullPath}"\n` +
        `Received filePath: "${filePath}"\n` +
        `Resolved testdata root: "${testdataRoot}"`
      );
    }

    return fullPath;
  }
}

export const configManager = new ConfigManager();