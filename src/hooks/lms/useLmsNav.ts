import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { LMS_VIEWS, type LmsView } from "@/lib/lms/constants";

/** LMS sub-views live in the query string (?view=…), like the Quiz page. */
export function useLmsNav() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view") ?? "";
  const view: LmsView = (LMS_VIEWS as readonly string[]).includes(raw) ? (raw as LmsView) : "dashboard";

  const go = useCallback(
    (next: LmsView, extra: Record<string, string | null | undefined> = {}, replace = false) => {
      const p = new URLSearchParams();
      if (next !== "dashboard") p.set("view", next);
      for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
      setParams(p, { replace });
      if (!replace) document.querySelector("main.hrms-work-area")?.scrollTo({ top: 0 });
    },
    [setParams],
  );

  return { view, params, go };
}
