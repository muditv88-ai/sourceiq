/**
 * Simple in-memory store to pass analysis results between pages.
 * Avoids prop drilling or a heavy state library.
 */
import type { AnalysisResult } from "./types";

let _result: AnalysisResult | null = null;
let _rfpId: string | null = null;

export const analysisStore = {
  setResult(rfpId: string, result: AnalysisResult) {
    _rfpId = rfpId;
    _result = result;
  },
  getResult(): AnalysisResult | null {
    return _result;
  },
  getRfpId(): string | null {
    return _rfpId;
  },
  clear() {
    _result = null;
    _rfpId = null;
  },
};
