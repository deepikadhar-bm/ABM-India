// ============================================================================
// LOGGER (Enterprise Edition v3)
// ============================================================================

import * as fs   from "fs";
import * as path from "path";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO  = "INFO",
  WARN  = "WARN",
  ERROR = "ERROR",
  PASS  = "PASS",
  FAIL  = "FAIL",
  STEP  = "STEP",
}

// ── Color scheme — designed for dark terminal, maximum contrast ───────────────
//
//  STEP  → Bold bright white    — most important, always stands out
//  PASS  → Bold bright green    — success, clearly positive
//  ERROR → Bold bright red      — failure, immediately visible
//  WARN  → Bold bright yellow   — warning, attention needed
//  INFO  → Bright cyan          — neutral information
//  DEBUG → Dark gray            — least important, stays in background
//  FAIL  → Bold red background  — catastrophic, impossible to miss
//  HEADER→ Bold bright blue     — test start/end banners
//  HEAL  → Bold bright magenta  — heal events stand apart from everything
//
const C: Record<string, string> = {
  STEP:   "\x1b[1m\x1b[97m",       // Bold bright white
  PASS:   "\x1b[1m\x1b[92m",       // Bold bright green
  ERROR:  "\x1b[1m\x1b[91m",       // Bold bright red
  WARN:   "\x1b[1m\x1b[93m",       // Bold bright yellow
  INFO:   "\x1b[96m",              // Bright cyan
  DEBUG:  "\x1b[2m\x1b[37m",       // Dim gray
  FAIL:   "\x1b[1m\x1b[97m\x1b[41m", // Bold white on red background
  HEADER: "\x1b[1m\x1b[94m",       // Bold bright blue
  HEAL:   "\x1b[1m\x1b[95m",       // Bold bright magenta
  RESET:  "\x1b[0m",
};

// ── Log level prefixes with fixed-width labels ────────────────────────────────
const PREFIX: Record<string, string> = {
  STEP:  "[STEP] ",
  PASS:  "[PASS] ",
  ERROR: "[ERROR]",
  WARN:  "[WARN] ",
  INFO:  "[INFO] ",
  DEBUG: "[DEBUG]",
  FAIL:  "[FAIL] ",
};

export interface TestContext {
  testName:    string;
  testFile:    string;
  environment: string;
  suiteName?:  string;
  dataSet?:    string;
  browser?:    string;
  startTime:   number;
}

export class Logger {
  private static instance: Logger;

  private readonly logDir:  string;
  private readonly logFile: string;
  private readonly currentLevel: LogLevel;

  private ctx:        TestContext | null = null;
  private stepCount   = 0;
  private stepStart   = Date.now();
  private testActive  = false;

  private constructor() {
    this.logDir = "logs";
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const today       = new Date().toISOString().split("T")[0];
    this.logFile      = path.join(this.logDir, `test-run-${today}.log`);
    const envLevel    = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
    this.currentLevel = LogLevel[envLevel] ? envLevel : LogLevel.DEBUG;
  }

  static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }

  // =========================================================================
  //  TEST LIFECYCLE
  // =========================================================================

  testStart(ctx: Omit<TestContext, "startTime">): void {
    const now       = Date.now();
    this.ctx        = { ...ctx, startTime: now };
    this.stepCount  = 0;
    this.stepStart  = now;
    this.testActive = true;

    const fileBase = path.basename(ctx.testFile);
    const suite    = ctx.suiteName && ctx.suiteName !== fileBase
                     ? ctx.suiteName : undefined;

    const line = "═".repeat(60);
    const rows = [
      ``,
      line,
      `  TEST    : ${ctx.testName}`,
      `  FILE    : ${fileBase}`,
      suite       ? `  SUITE   : ${suite}`        : null,
      `  ENV     : ${ctx.environment.toUpperCase()}`,
      ctx.browser ? `  BROWSER : ${ctx.browser}`  : null,
      ctx.dataSet ? `  DATASET : ${ctx.dataSet}`  : null,
      line,
    ].filter(Boolean).join("\n");

    this.print("HEADER", rows);
  }

  testEnd(status: "passed" | "failed" | "skipped"): void {
    if (!this.ctx) return;

    const duration = ((Date.now() - this.ctx.startTime) / 1000).toFixed(2);
    const icon     = status === "passed"  ? "✅ PASSED"
                   : status === "skipped" ? "⚠️  SKIPPED"
                   :                        "❌ FAILED";
    const line     = "═".repeat(60);

    const colorKey = status === "passed"  ? "PASS"
                   : status === "skipped" ? "WARN"
                   :                        "ERROR";

    const msg = [
      line,
      `  ${icon} — ${this.ctx.testName}`,
      `  Duration : ${duration}s  |  Steps completed : ${this.stepCount}`,
      line,
      ``,
    ].join("\n");

    this.print(colorKey, msg);

    this.ctx        = null;
    this.stepCount  = 0;
    this.stepStart  = Date.now();
    this.testActive = false;
  }

  // Convenience compatibility helpers used by older tests
  tcStart(id: string, title: string): void {
    const env = process.env.ENVIRONMENT || process.env.NODE_ENV || "local";
    this.testStart({ testName: `${id} - ${title}`, testFile: id, environment: env });
  }

  tcEnd(status: string): void {
    const s = String(status).toLowerCase();
    const mapped = s === "pass" || s === "passed" ? "passed"
                 : s === "fail" || s === "failed" ? "failed"
                 : "skipped";
    this.testEnd(mapped as "passed" | "failed" | "skipped");
  }

  stepPass(msg: string, data?: any): void {
    this.pass(msg, data);
  }

  // =========================================================================
  //  STEP — auto-numbered + elapsed time
  // =========================================================================

  step(msg: string, data?: any): void {
    if (!this.testActive) {
      this.stepStart  = this.stepStart || Date.now();
      this.testActive = true;
    }

    this.stepCount++;
    const now      = Date.now();
    const elapsed  = ((now - this.stepStart) / 1000).toFixed(2);
    this.stepStart = now;

    // Step gets a separator line above for clear visual grouping
    this.output(LogLevel.STEP,
      `▶ Step ${this.stepCount} | ${msg} | +${elapsed}s`,
      data
    );
  }

  // =========================================================================
  //  AUTO-HEAL
  // =========================================================================

  heal(
    elementName:     string,
    originalLocator: string,
    healedLocator:   string,
    strategy:        string
  ): void {
    const testName = this.ctx?.testName ?? "unknown test";
    const stepNo   = this.stepCount > 0 ? `Step ${this.stepCount}` : "before steps";

    const msg = [
      `[AutoHeal] ⚠️  Locator healed`,
      `  Test     : ${testName}`,
      `  At step  : ${stepNo}`,
      `  Element  : ${elementName}`,
      `  Original : ${originalLocator}`,
      `  Healed   : ${healedLocator}`,
      `  Strategy : ${strategy}`,
      `  Fix      : Update this locator in your POM file`,
    ].join("\n");

    this.print("HEAL", msg);
    this.writeFile(`[WARN] ${msg}`);
  }

  // =========================================================================
  //  STANDARD LOG METHODS
  // =========================================================================

  debug(msg: string, data?: any) { this.output(LogLevel.DEBUG, msg, data); }
  info (msg: string, data?: any) { this.output(LogLevel.INFO,  msg, data); }
  warn (msg: string, data?: any) { this.output(LogLevel.WARN,  msg, data); }
  error(msg: string, data?: any) { this.output(LogLevel.ERROR, msg, data); }
  pass (msg: string, data?: any) { this.output(LogLevel.PASS,  msg, data); }
  fail (msg: string, data?: any) { this.output(LogLevel.FAIL,  msg, data); }

  getLogFile(): string { return this.logFile; }

  // ── Private ───────────────────────────────────────────────────────────────

  private shouldLog(level: LogLevel): boolean {
    const p: Record<LogLevel, number> = {
      [LogLevel.ERROR]: 0,
      [LogLevel.FAIL]:  1,
      [LogLevel.WARN]:  2,
      [LogLevel.STEP]:  3,
      [LogLevel.INFO]:  3,
      [LogLevel.PASS]:  4,
      [LogLevel.DEBUG]: 5,
    };
    return p[level] <= p[this.currentLevel];
  }

  private format(level: string, message: string, data?: any): string {
    const ts      = new Date().toISOString();
    const prefix  = PREFIX[level] ?? `[${level}]`;
    const details = data ? `\n${JSON.stringify(data, null, 2)}` : "";
    return `${ts} ${prefix} ${message}${details}`;
  }

  private output(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;
    const formatted = this.format(level, message, data);
    console.log((C[level] ?? "") + formatted + C.RESET);
    this.writeFile(formatted);
  }

  private print(colorKey: string, message: string): void {
    console.log((C[colorKey] ?? "") + message + C.RESET);
    this.writeFile(message);
  }

  private writeFile(text: string): void {
    fs.appendFile(this.logFile, text + "\n", () => {});
  }
}

export const logger = Logger.getInstance();