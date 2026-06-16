import type { AppConfig } from "./types";

export const qaConfig: AppConfig = {
  env: "qa",
  baseURL: "https://sandbox5101.projectlane.io/spa#/1/home",
  easyURL : "https://opensource-demo.orangehrmlive.com/web/index.php/auth/login",

  credentials: {
    username: "user2@gm.com",
    password: "12345",
  },

  timeouts: {
    action: 15000,
    wait: 30000,
    navigation: 5000,
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