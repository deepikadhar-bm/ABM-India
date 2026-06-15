// src/config/types.ts

export type Environment  = 'dev' | 'qa';   // ✅ removed staging + prod
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

export interface AppConfig {
  env:         Environment;
  baseURL:     string;
  easyURL?:    string;
  apiBaseURL?: string;
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