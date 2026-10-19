import test from "node:test";
import assert from "node:assert/strict";
import { executeCode, validateExecutionInput } from "../src/execution.js";

test("Code Mode's resolved error result is a failed execution", async () => {
  let executions = 0;
  const result = await executeCode({}, "throw new Error('buyer program failed')", "javascript", null, null, {
    executorFactory: () => ({
      async execute() {
        executions += 1;
        return { result: undefined, error: "buyer program failed", logs: [] };
      },
    }),
  });
  assert.equal(executions, 1);
  assert.equal(result.ok, false);
  assert.match(String(result.error), /buyer program failed/);
});

test("executor rejection is reported as failure and never as a paid success", async () => {
  const result = await executeCode({}, "return 42", "javascript", null, null, {
    executorFactory: () => ({ async execute() { throw new Error("isolate terminated"); } }),
  });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /isolate terminated/);
});

test("Code Mode success unwraps the execution result and reports progress", async () => {
  const progress = [];
  const result = await executeCode({}, "return { answer: 42 }", "javascript", null, {
    async report(stage, detail) { progress.push({ stage, detail }); },
  }, {
    executorFactory: () => ({ async execute() { return { result: { answer: 42 }, logs: [] }; } }),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { answer: 42 });
  assert.deepEqual(progress.map((event) => event.stage), ["start", "complete"]);
  assert.equal(progress[1].detail.ok, true);
});

test("a dropped progress callback cannot turn a completed execution into a retryable error", async () => {
  let executions = 0;
  const result = await executeCode({}, "return 42", "javascript", null, {
    async report() { throw new Error("WebSocket disconnected"); },
  }, {
    executorFactory: () => ({ async execute() { executions += 1; return { result: 42, logs: [] }; } }),
  });
  assert.equal(executions, 1);
  assert.equal(result.ok, true);
  assert.equal(result.result, 42);
});

test("missing or unsupported execution language is rejected before an isolate starts", () => {
  assert.throws(() => validateExecutionInput("return 42", undefined), /language/);
  assert.throws(() => validateExecutionInput("print(42)", "python"), /language/);
  assert.throws(() => validateExecutionInput("", "javascript"), /code/);
  assert.throws(() => validateExecutionInput("x".repeat(65537), "javascript"), /code/);
  assert.equal(validateExecutionInput("return 42", "javascript").language, "javascript");
});

test("an unresponsive callback is bounded and does not prevent completion", async () => {
  const result = await executeCode({}, "return 42", "javascript", null, {
    report() { return new Promise(() => {}); },
  }, {
    callbackTimeoutMs: 2,
    executorFactory: () => ({ async execute() { return { result: 42 }; } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.result, 42);
});
