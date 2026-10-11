import { createContext, useContext } from "react";
import type { AtsJob } from "@/lib/ats/api";

export interface AtsCtx {
  openJobEditor: (job?: AtsJob | null) => void;
}
export const AtsContext = createContext<AtsCtx>({ openJobEditor: () => {} });
export const useAts = () => useContext(AtsContext);
