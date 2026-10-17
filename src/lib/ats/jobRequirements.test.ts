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

import { matchingJobsForRequirement } from "./jobRequirements";

describe("Link to an existing job (WF6)", () => {
  const jobs = [
    { id: "j2", job_code: "JOB-0002", title: "Operation Associate", department_id: "ops", position_id: "assoc", shift_ids: ["m"] },
    { id: "j3", job_code: "JOB-0003", title: "KYC Associate", department_id: "kyc", position_id: "kyc", shift_ids: ["e"] },
  ];
  it("offers the open job of the same department and role whose shifts include the line's shift", () => {
    expect(matchingJobsForRequirement(jobs as any, { department_id: "ops", position_id: "assoc" }, ["assoc"], ["m"]).map((j) => j.id)).toEqual(["j2"]);
  });
  it("does not offer a job whose shifts miss the line's shift", () => {
    expect(matchingJobsForRequirement(jobs as any, { department_id: "ops", position_id: "assoc" }, ["assoc"], ["n"])).toEqual([]);
  });
});
