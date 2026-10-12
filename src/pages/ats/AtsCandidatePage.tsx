import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CandidateReviewPanel } from "@/components/ats/CandidateReviewPanel";
import { loadNavCtx } from "@/lib/ats/candidates";

const NEXT_KEY = "ats.candidates.goNext";

export default function AtsCandidatePage() {
  const [goNext, setGoNextState] = useState(() => { try { return localStorage.getItem(NEXT_KEY) !== "0"; } catch { return true; } });
  const setGoNext = (v: boolean) => { setGoNextState(v); try { localStorage.setItem(NEXT_KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  const { candidateId } = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const appId = sp.get("app");
  const fromList = !!(location.state as any)?.fromList;
  const ctx = useMemo(() => (fromList ? loadNavCtx() : null), [fromList]);
  const idx = ctx ? ctx.items.findIndex((i) => i.candidateId === candidateId && (!appId || i.appId === appId)) : -1;
  const showNav = !!ctx && idx >= 0 && ctx.items.length > 1;
  const go = (d: 1 | -1) => {
    const n = ctx!.items[idx + d];
    if (n) navigate(`/hrms/ats/candidates/${n.candidateId}?app=${n.appId}`, { state: { fromList: true }, replace: true });
  };
  const advance = () => { if (goNext && showNav && idx + 1 < ctx!.items.length) go(1); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link to={ctx?.from ?? "/hrms/ats/candidates"} className="inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4" /> Candidates
        </Link>
        {showNav && (
          <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <label className="mr-2 flex items-center gap-2">
              <Label htmlFor="ats-page-go-next" className="text-xs font-normal">After an action, go to the next candidate</Label>
              <Switch id="ats-page-go-next" checked={goNext} onCheckedChange={setGoNext} />
            </label>
            <span className="tabular-nums">{idx + 1} of {ctx!.items.length}</span>
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Previous candidate" disabled={idx === 0} onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Next candidate" disabled={idx + 1 >= ctx!.items.length} onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
      {candidateId && (
        <div className="overflow-hidden rounded-xl border border-border bg-card md:h-[calc(100vh-12rem)] md:min-h-[560px]">
          <CandidateReviewPanel key={candidateId} candidateId={candidateId} appId={appId}
            onAppChange={(a) => setSp((p) => { const n = new URLSearchParams(p); n.set("app", a); return n; }, { replace: true })}
            onActionDone={advance}
            className="h-full" />
        </div>
      )}
    </div>
  );
}
