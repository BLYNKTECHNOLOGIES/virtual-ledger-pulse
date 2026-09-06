import { absorbLop } from "../_shared/compoff.ts";

function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("LOP absorption applies comp-off before casual leave", () => {
  equal(absorbLop(1, 1, 4), {
    compoff_offset_days: 1,
    compoff_encash_days: 0,
    cl_offset_days: 1,
    cl_available: 1,
    lop_after_offset: 2,
  }, "ordered absorption");
});

Deno.test("Dilkhush: four raw days and one CL become three chargeable days", () => {
  const result = absorbLop(0, 1, 4);
  equal(result.lop_after_offset, 3, "Dilkhush chargeable LOP");
  equal(result.cl_offset_days, 1, "Dilkhush CL offset");
});

Deno.test("later or unavailable leave cannot reduce historical LOP", () => {
  equal(absorbLop(0, 0, 4).lop_after_offset, 4, "no eligible credit");
});

Deno.test("fully absorbed absence produces zero chargeable LOP", () => {
  const result = absorbLop(2, 1, 2.5);
  equal(result.lop_after_offset, 0, "fully absorbed LOP");
  equal(result.compoff_offset_days, 2, "comp-off use");
  equal(result.cl_offset_days, 0.5, "CL use");
});