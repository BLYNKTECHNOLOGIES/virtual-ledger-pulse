import { createContext, useContext } from "react";
import type { AtsJob } from "@/lib/ats/api";

export interface AtsCtx {
  openJobEditor: (job?: AtsJob | null) => void;
  openAddCandidate: (jobId?: string | null) => void;
}
export const AtsContext = createContext<AtsCtx>({ openJobEditor: () => {}, openAddCandidate: () => {} });
export const useAts = () => useContext(AtsContext);
