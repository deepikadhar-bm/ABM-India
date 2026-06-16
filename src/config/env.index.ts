// src/config/env.index.ts

import { devConfig } from "./env.dev";
import { qaConfig }  from "./env.qa";
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
    // ✅ Fix: trim + lowercase + fallback to "qa"
    const rawEnv = (
      process.env.ENVIRONMENT ||
      process.env.NODE_ENV    ||
      "qa"
    ).trim().toLowerCase();

    
    this.env = rawEnv === "dev" ? "dev" : "qa";

    // ✅ Fix: direct lookup — configs always has dev + qa so this never fails
    const baseConfig = configs[this.env];

    const merged: AppConfig = {
      ...baseConfig,
      baseURL: process.env.BASE_URL || baseConfig.baseURL,
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

  getEnvironment(): Environment       { return this.env; }
  getBaseURL(): string                { return this.config.baseURL; }
  getEasyURL(): string | undefined    { return this.config.easyURL; }
  getAPIBaseURL(): string | undefined { return this.config.apiBaseURL; }
  getCredentials()                    { return this.config.credentials; }
  getBrowserConfig()                  { return this.config.browser; }
  getLoggingConfig()                  { return this.config.logging; }
  getRequestOptions()                 { return this.config.requestOptions; }
  getRawConfig(): AppConfig           { return this.config; }

  getTimeout(type: TimeoutKeys): number {
    return this.config.timeouts[type];
  }
}

export const configManager = new ConfigManager();