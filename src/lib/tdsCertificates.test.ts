import { describe, expect, test } from "vitest";
import { parseCertPath, parseCertText } from "./tdsCertificates";

describe("TDS certificate import", () => {
  test("reads PAN, quarter and tax year from the folder and file name", () => {
    expect(parseCertPath("TDS/131_AANCB2572J_Q1_2026-27/131_AAAPX7803N_Q1_2026-27.pdf")).toEqual({
      formCode: "131", deducteePan: "AAAPX7803N", deductorPan: "AANCB2572J", quarter: "Q1", taxYear: "2026-27",
    });
  });
  test("rejects files that do not carry a valid PAN", () => {
    expect(parseCertPath("TDS/x/131_BADPAN_Q1_2026-27.pdf")).toBeNull();
  });
  test("sums tax deducted across quarter rows and reads amount paid", () => {
    const t = "Total | ₹1,13,44,191.50 | Q1 | 031679600791996 | ₹15,000.00 | Q1 | 031679600791996 | ₹5,051.00 | Certificate Number: AAK262742101651 | TAN";
    expect(parseCertText(t)).toMatchObject({ certificateNo: "AAK262742101651", amountPaid: 11344191.5, tdsAmount: 20051 });
  });
});
