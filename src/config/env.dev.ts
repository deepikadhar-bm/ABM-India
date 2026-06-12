import type { AppConfig } from "./types";

export const devConfig: AppConfig = {
  env: "dev",
  baseURL: "https://www.easemytrip.com/",
  easyURL: "https://www.easemytrip.com/",

  credentials: {
    username: "testuser",
    password: "password123",
  },

  timeouts: {
    action: 30000,
    wait: 30000,
    navigation: 40000,
  },

  browser: {
    headless: false,
    slowMo: 100,
    timeout: 600000,
  },

  requestOptions: {
    timeout: 30000,
    retries: 1,
  },

  logging: {
    level: "debug",
    verbose: true,
  },
};
