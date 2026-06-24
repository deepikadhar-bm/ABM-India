// src/config/types.ts

export type Environment  = 'dev' | 'qa';
export type TimeoutKeys  = 'action' | 'wait' | 'navigation';

export interface CredentialsConfig {
  username: string;
  password: string;
}

export interface BrowserConfig {
  headless: boolean;
  slowMo?:  number;
  timeout:  number;
}

// Defines which fields are mandatory in every test-data.json expected block
// Add new required fields here — TestData.validate() enforces them automatically
export interface ExpectedFieldsConfig {
  required: string[];   // e.g. ["landingMenu"] — must exist in every expected{}
}

export interface AppConfig {
  env:         Environment;
  baseURL:     string;
  easyURL?:    string;
  apiBaseURL?: string;
  readonly testDataPath: string;
  requestOptions?: {
    timeout?: number;
    retries?: number;
    headers?: Record<string, string>;
  };
  credentials: CredentialsConfig;
  timeouts: {
    action:     number;
    wait:       number;
    navigation: number;
  };
  browser: BrowserConfig;
  logging?: {
    level?:   'debug' | 'info' | 'warn' | 'error';
    verbose?: boolean;
  };
}