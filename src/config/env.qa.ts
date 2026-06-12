import type { AppConfig } from "./types";

export const qaConfig: AppConfig = {
  env: "qa",
  baseURL: "https://sandbox5101.projectlane.io/spa#/1/home",
  easyURL : "https://sandbox5101.projectlane.io/spa#/1/home",

  credentials: {
    username: "user2@gm.com",
    password: "12345",
  },

  timeouts: {
    action: 30000,
    wait: 30000,
    navigation: 30000,
  },

  browser: {
    headless: false,
    slowMo: 0,
    timeout: 600000,
  },

  requestOptions: {
    timeout: 30000,
    retries: 1,
  },

  logging: {
    level: "info",
    verbose: false,
  },
};
