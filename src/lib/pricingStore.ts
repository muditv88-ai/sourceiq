/**
 * pricingStore.ts
 * Holds the latest pricing analysis result in memory.
 * Mirrors the shape returned by GET /pricing/result/{rfp_id}
 */

import type { PricingResult } from "@/lib/types";

let _result: PricingResult | null = null;
let _rfpId: string | null = null;

export const pricingStore = {
  setResult(rfpId: string, result: PricingResult) {
    _rfpId  = rfpId;
    _result = result;
  },
  getResult(): PricingResult | null {
    return _result;
  },
  getRfpId(): string | null {
    return _rfpId;
  },
  clear() {
    _result = null;
    _rfpId  = null;
  },
};
