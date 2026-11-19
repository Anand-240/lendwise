// Run: node --experimental-strip-types --test tests/screen-state.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialScreenState, screenReducer, type ScreenState } from "../src/lib/screen-state.ts";
import type { Screening } from "../src/lib/types.ts";

function fakeResult(loan: number): Screening {
  return {
    inputs: { loan_amount: loan, fico: 700, dti: 15 },
    eligibility: { score: 80, tier: "Likely" },
    charge_off: { probability: 12, tier: "Low", expected_loss: 6 },
    decision: "APPROVE",
    reasons: [],
    guard: { flagged: false, reasons: [] },
    counter_offer: null,
    model_version: "test",
  };
}

// A small deterministic random generator so the test is repeatable.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

test("TC-10: 200 quick submissions never leave an old result on screen", () => {
  const rand = rng(42);
  let state: ScreenState = initialScreenState;
  const submitted = new Map<number, { loan: number; valid: boolean }>();
  const inFlight: number[] = [];

  for (let seq = 1; seq <= 200; seq++) {
    const loan = 500 + seq * 100;
    const valid = seq % 4 !== 0;
    submitted.set(seq, { loan, valid });
    state = screenReducer(state, { type: "submit", seq });
    assert.equal(state.result, null, "a new submission clears the previous result");
    inFlight.push(seq);

    // Answers come back in random order, some long after newer submissions.
    while (inFlight.length && rand() < 0.6) {
      const i = Math.floor(rand() * inFlight.length);
      const done = inFlight.splice(i, 1)[0];
      const s = submitted.get(done)!;
      state = s.valid
        ? screenReducer(state, { type: "result", seq: done, result: fakeResult(s.loan) })
        : screenReducer(state, { type: "error", seq: done, error: { field: "fico", message: "FICO score must be a whole number." } });

      const latest = submitted.get(state.seq)!;
      if (state.result) {
        assert.equal(state.result.inputs.loan_amount, latest.loan, "shown result belongs to the latest submission");
        assert.equal(state.error, null);
      }
      if (state.error) assert.equal(state.result, null, "an error never sits next to an old result");
    }
  }
  for (const done of inFlight) {
    const s = submitted.get(done)!;
    state = s.valid
      ? screenReducer(state, { type: "result", seq: done, result: fakeResult(s.loan) })
      : screenReducer(state, { type: "error", seq: done, error: { field: "fico", message: "x" } });
  }
  assert.equal(state.seq, 200);
  // Submission 200 is invalid (200 % 4 === 0), so the screen ends on its error with no result.
  assert.equal(state.status, "error");
  assert.equal(state.result, null);
});

test("late answers to older submissions are ignored", () => {
  let s = screenReducer(initialScreenState, { type: "submit", seq: 1 });
  s = screenReducer(s, { type: "submit", seq: 2 });
  s = screenReducer(s, { type: "result", seq: 1, result: fakeResult(1000) });
  assert.equal(s.status, "loading");
  assert.equal(s.result, null);
  s = screenReducer(s, { type: "result", seq: 2, result: fakeResult(2000) });
  assert.equal(s.result?.inputs.loan_amount, 2000);
});
