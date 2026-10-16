import { describe, expect, it } from "vitest";
import { diffLinks } from "./jobRequirementDiff";

describe("diffLinks", () => {
  it("adds new and removes stale links", () => {
    expect(diffLinks(["a", "b"], ["b", "c"], null)).toEqual({ add: ["c"], remove: ["a"] });
  });
  it("never writes the primary requisition_id into the link table", () => {
    expect(diffLinks([], ["p", "x"], "p")).toEqual({ add: ["x"], remove: [] });
    expect(diffLinks(["p"], ["p"], "p")).toEqual({ add: [], remove: ["p"] });
  });
  it("is a no-op when sets match", () => {
    expect(diffLinks(["a"], ["a"], null)).toEqual({ add: [], remove: [] });
  });
  it("clears everything when desired is empty", () => {
    expect(diffLinks(["a", "b"], [], null)).toEqual({ add: [], remove: ["a", "b"] });
  });
});
