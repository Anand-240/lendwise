/**
 * State of the screening form (report TC-10: "200 quick submissions, no old results left on screen").
 *
 * Every submission gets a sequence number. Only the response to the latest submission is shown;
 * responses that arrive late for an older submission are ignored. Starting a new submission and
 * receiving a validation error both clear any previous result, so a result is never displayed
 * next to inputs it was not computed for.
 */
import type { Screening } from "./types";

export type FieldError = { field: string | null; message: string };

export type ScreenState = {
  seq: number;
  status: "idle" | "loading" | "result" | "error";
  result: Screening | null;
  error: FieldError | null;
};

export type ScreenAction =
  | { type: "submit"; seq: number }
  | { type: "result"; seq: number; result: Screening }
  | { type: "error"; seq: number; error: FieldError }
  | { type: "reset" };

export const initialScreenState: ScreenState = { seq: 0, status: "idle", result: null, error: null };

export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  switch (action.type) {
    case "submit":
      return { seq: action.seq, status: "loading", result: null, error: null };
    case "result":
      if (action.seq !== state.seq) return state; // a late answer to an older submission
      return { ...state, status: "result", result: action.result, error: null };
    case "error":
      if (action.seq !== state.seq) return state;
      return { ...state, status: "error", result: null, error: action.error };
    case "reset":
      return { ...initialScreenState, seq: state.seq };
  }
}
