import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parsePreferredShifts } from "./index.ts";

Deno.test("cleans, de-duplicates and caps preferred shifts", () => {
  assertEquals(parsePreferredShifts([" Night Shift ", "night shift", "", 5, "Evening Shift"]), ["Night Shift", "Evening Shift"]);
  assertEquals(parsePreferredShifts(Array.from({ length: 15 }, (_, i) => `S${i}`))?.length, 10);
  assertEquals(parsePreferredShifts(["x".repeat(80)])?.[0].length, 60);
});

Deno.test("missing or invalid preferred shifts store nothing", () => {
  assertEquals(parsePreferredShifts(undefined), null);
  assertEquals(parsePreferredShifts("Night Shift"), null);
  assertEquals(parsePreferredShifts([]), null);
  assertEquals(parsePreferredShifts(["  "]), null);
});
