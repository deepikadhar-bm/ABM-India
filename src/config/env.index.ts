// src/config/env.index.ts//

import { devConfig } from "./env.dev";
import { qaConfig } from "./env.qa";
import { AppConfigSchema } from "./env.schema";
import type { AppConfig, Environment, TimeoutKeys } from "./types";


const configs: Record<Environment, AppConfig> = {
  dev: devConfig,
  qa: qaConfig,
};

class ConfigManager {
  private env: Environment;
  private config: AppConfig;

  constructor() {
    const rawEnv = (process.env.ENVIRONMENT || process.env.NODE_ENV || "qa")
      .trim()
      .toLowerCase();

    this.env = (rawEnv === "dev" || rawEnv === "qa" ? rawEnv : "qa") as Environment;

    const baseConfig = configs[this.env];

    if (!baseConfig) {
      throw new Error(
        `No config found for ENV="${this.env}". Check env.dev.ts / env.qa.ts`
      );
    }

    const merged: AppConfig = {
      ...baseConfig,
      baseURL: process.env.BASE_URL || baseConfig.baseURL,
      credentials: {
        username: process.env.PLAYWRIGHT_USERNAME || baseConfig.credentials.username,
        password: process.env.PLAYWRIGHT_PASSWORD || baseConfig.credentials.password,
      },
      timeouts: {
        action: Number(process.env.TIMEOUT_ACTION) || baseConfig.timeouts.action,
        wait: Number(process.env.TIMEOUT_WAIT) || baseConfig.timeouts.wait,
        navigation:
          Number(process.env.TIMEOUT_NAVIGATION) || baseConfig.timeouts.navigation,
      },
    };

    const parsed = AppConfigSchema.safeParse(merged);

    if (!parsed.success) {
      console.error(
        " Invalid environment configuration:",
        parsed.error.format()
      );
      throw new Error(
        `Environment config validation failed for "${this.env}"`
      );
    }

    this.config = parsed.data;

    // =============================
    // 4. Logging (Optional Silent Mode)
    // =============================
    const DEBUG_ENV_LOGS = false; // <—— set true to enable logs

    if (DEBUG_ENV_LOGS) {
      console.log("\n===== ENVIRONMENT LOADED =====");
      console.log("ENV:", this.env);
      console.log("BASE URL:", this.config.baseURL);
      console.log("TIMEOUTS:", this.config.timeouts);
      console.log("==============================\n");
    }
  }

  getEnvironment(): Environment {
    return this.env;
  }

  getBaseURL(): string {
    return this.config.baseURL;
  }

  geteasyURL(): string | undefined {
    return this.config.easyURL;
  }

  getAPIBaseURL(): string | undefined {
    return this.config.apiBaseURL;
  }

  getCredentials() {
    return this.config.credentials;
  }

  getBrowserConfig() {
    return this.config.browser;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getRequestOptions() {
    return this.config.requestOptions;
  }

  getTimeout(type: TimeoutKeys): number {
    return this.config.timeouts[type];
  }

  getRawConfig(): AppConfig {
    return this.config;
  }
}

export const configManager = new ConfigManager();
