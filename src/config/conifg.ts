// ============================================================================
// CONFIG MANAGER (Enterprise Grade) WITH .env SUPPORT
// ============================================================================



export class ConfigManager {
  private static instance: ConfigManager;

  private config: {
    baseURL: string;
    timeout: number;
    retryAttempts: number;
    environment: string;
  };

  private constructor() {
    this.config = {
      baseURL: process.env.API_BASE_URL || "https://api.restful-api.dev",
      timeout: Number(process.env.API_TIMEOUT ?? 30000),
      retryAttempts: Number(process.env.RETRY_ATTEMPTS ?? 1),
      environment: process.env.ENV || "local",
    };

    this.validateConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  get(key: keyof ConfigManager["config"]): any {
    return this.config[key];
  }

  getBaseURL(): string {
    return this.config.baseURL;
  }

  getTimeout(): number {
    return this.config.timeout;
  }

  getRetryAttempts(): number {
    return this.config.retryAttempts;
  }

  private validateConfig() {
    if (!this.config.baseURL) {
      throw new Error("CONFIG ERROR: Missing API_BASE_URL variable.");
    }

    if (isNaN(this.config.timeout) || this.config.timeout <= 0) {
      throw new Error("CONFIG ERROR: Invalid API_TIMEOUT value.");
    }

    if (isNaN(this.config.retryAttempts) || this.config.retryAttempts < 0) {
      throw new Error("CONFIG ERROR: Invalid RETRY_ATTEMPTS value.");
    }
  }
}

// Global singleton
export const configManager = ConfigManager.getInstance();
