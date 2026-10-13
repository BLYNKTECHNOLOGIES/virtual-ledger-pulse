import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { CalendarCheck, Clock, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewData {
  status: string;
  first_name?: string; job_title?: string; company_name?: string; title?: string; mode?: string; place?: string;
  duration_minutes?: number; expires_at?: string; booked_start?: string | null; slots?: string[];
}
type Booked = { start: string; place: string; moved: boolean };

const IST = "Asia/Kolkata";
const dayText = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const timeText = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toUpperCase();
const fullText = (iso: string) => `${dayText(iso)}, ${timeText(iso)} IST`;

async function call(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("ats-pick-slot", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try { return await error.context.json(); } catch { return { status: "error" }; }
    }
    return { status: "error" };
  }
  return data ?? { status: "error" };
}

const INVALID = "This link isn't valid any more. Reply to our email if you need help.";

export default function InterviewPickPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Choose your interview time";
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex";
    document.head.appendChild(meta);
    return () => { document.title = prevTitle; meta.remove(); };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await call({ action: "view", token });
    setView(r); setPicked(null); setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const confirm = async () => {
    if (!picked) return;
    setBusy(true); setNotice(null);
    const r = await call({ action: "book", token, start: picked });
    setBusy(false);
    if (r.status === "booked") { setBooked({ start: r.start, place: r.place, moved: !!r.moved }); return; }
    if (r.status === "gone") { setNotice("That time was just taken. Please choose another."); void load(); return; }
    setView({ status: r.status ?? "error" });
  };

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of view?.slots ?? []) { const d = dayText(s); m.set(d, [...(m.get(d) ?? []), s]); }
    return [...m.entries()];
  }, [view]);

  let content: React.ReactNode;
  if (loading && !view) {
    content = <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
  } else if (booked) {
    content = (
      <div className="space-y-3 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-primary" />
        <p className="text-lg font-semibold text-foreground">
          {booked.moved
            ? `Your interview is moved to ${fullText(booked.start)}. We've emailed you the details.`
            : `You're booked for ${fullText(booked.start)}. We've emailed you the details and a calendar invite.`}
        </p>
        {booked.place && <p className="flex items-start justify-center gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{booked.place}</p>}
      </div>
    );
  } else {
    const s = view?.status ?? "error";
    const msg = s === "expired" ? "This link has expired. Reply to our email and we'll send you new times."
      : s === "booked" ? `You've already booked: ${view?.booked_start ? fullText(view.booked_start) : ""}. Check your email for the details.`
      : s === "busy" ? "Too many tries. Please wait a few minutes and try again."
      : s === "error" ? "Something went wrong. Please try again."
      : s === "open" && !(view?.slots ?? []).length ? "All the times we offered are taken now. Reply to our email and we'll send you new times."
      : s === "open" ? null : INVALID;
    content = msg ? <p className="py-8 text-center text-base text-foreground">{msg}</p> : (
      <div className="space-y-5">
        <p className="text-base text-foreground">Hi {view?.first_name}, please choose a time for your {view?.title} for {view?.job_title}.</p>
        {notice && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-foreground" role="status">{notice}</p>}
        <div className="space-y-4" role="radiogroup" aria-label="Interview times">
          {groups.map(([day, slots]) => (
            <div key={day} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{day}</p>
              <div className="grid grid-cols-2 gap-2">
                {slots.map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={picked === t} onClick={() => setPicked(t)}
                    className={cn("rounded-xl border px-3 py-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      picked === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted")}>
                    {timeText(t)} IST
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          {view?.place && <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{view.place}</p>}
          {view?.duration_minutes && <p className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{view.duration_minutes} minutes</p>}
        </div>
        <Button className="h-12 w-full text-base" disabled={!picked || busy} onClick={confirm}>
          {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Booking…</> : "Confirm this time"}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <p className="mx-auto max-w-md text-sm font-semibold text-foreground">{view?.company_name ?? "Blynk Virtual Technologies"} · HR</p>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">{content}</main>
    </div>
  );
}
