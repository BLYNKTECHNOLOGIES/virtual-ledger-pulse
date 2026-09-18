import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, Flag, Loader2, Maximize, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CbtShell } from '@/components/cbt/CbtShell';
import { CbtEntry } from '@/components/cbt/CbtEntry';
import { CbtQuestion } from '@/components/cbt/CbtQuestion';
import { CbtTypingSection } from '@/components/cbt/CbtTypingSection';
import { useCbtProctor } from '@/hooks/useCbtProctor';
import {
  CbtError,
  cbtCall,
  clearSession,
  formatClock,
  loadSession,
  noteServerNow,
  secondsLeft,
} from '@/lib/cbt/api';
import type { CbtCurrentSection, CbtState } from '@/lib/cbt/types';

const FATAL_CODES = new Set(['no_token', 'expired', 'second_session']);

export default function CbtTestPage() {
  const [state, setState] = useState<CbtState | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Record<string, any> | null>>({});
  const [savingItems, setSavingItems] = useState<Record<string, boolean>>({});
  const [tick, setTick] = useState(0);

  const current = state?.current_section ?? null;
  const running = state?.attempt.status === 'in_progress' && current?.status === 'in_progress';
  const submittedStatus =
    state?.attempt.status === 'submitted' || state?.attempt.status === 'auto_submitted';

  const applyState = useCallback((next: CbtState) => {
    noteServerNow(next.server_now);
    setState(next);
    setDrafts((prev) => {
      const merged = { ...prev };
      (next.current_section?.items ?? []).forEach((item) => {
        if (!(item.id in merged)) merged[item.id] = item.response;
      });
      return merged;
    });
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof CbtError) {
      if (FATAL_CODES.has(e.code)) {
        setFatal({ code: e.code, message: e.message });
        return;
      }
      if (e.code === 'network') {
        setOffline(true);
        return;
      }
      setNotice(e.message);
      return;
    }
    setNotice('Something went wrong. Please try again.');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await cbtCall<CbtState>('cbt-get-state');
      setOffline(false);
      applyState(res);
    } catch (e) {
      handleError(e);
    }
  }, [applyState, handleError]);

  // ---------- boot: restore an existing session in this tab ----------
  useEffect(() => {
    (async () => {
      if (!loadSession()) {
        setBooting(false);
        return;
      }
      await refresh();
      setBooting(false);
    })();
  }, [refresh]);

  // ---------- 1s clock ----------
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void tick;
    return current?.status === 'in_progress' ? secondsLeft(current.deadline_at) : null;
  }, [current?.status, current?.deadline_at, tick]);

  // ---------- proctoring ----------
  const proctor = useCbtProctor({
    active: Boolean(running),
    onWarning: (count) =>
      setState((s) => (s ? { ...s, attempt: { ...s.attempt, warning_count: count } } : s)),
    onAutoSubmitted: () => {
      setNotice('Your test was closed because the rules were broken too many times.');
      void refresh();
    },
    onNotice: (m) => setNotice(m),
  });

  // ---------- heartbeat ----------
  const heartbeatSeconds = Number(state?.settings?.heartbeat_seconds ?? 15);
  useEffect(() => {
    if (!state || submittedStatus || state.attempt.status === 'registered') return;
    let stop = false;
    const beat = async () => {
      try {
        const res = await cbtCall<any>('cbt-heartbeat');
        if (stop) return;
        noteServerNow(res.server_now);
        setOffline(false);
        const statusChanged = res.attempt_status !== state.attempt.status;
        const sectionChanged =
          res.current_section?.id !== current?.id || res.current_section?.status !== current?.status;
        if (statusChanged || sectionChanged) await refresh();
        else
          setState((s) =>
            s ? { ...s, attempt: { ...s.attempt, warning_count: res.warning_count ?? s.attempt.warning_count } } : s,
          );
      } catch (e) {
        if (!stop) handleError(e);
      }
    };
    const id = window.setInterval(beat, Math.max(5, heartbeatSeconds) * 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [state, submittedStatus, current?.id, current?.status, heartbeatSeconds, refresh, handleError]);

  // ---------- autosave ----------
  const saveTimers = useRef<Record<string, number>>({});
  const saveItem = useCallback(
    async (itemId: string, response: Record<string, any> | null, extra: Record<string, unknown> = {}) => {
      setSavingItems((s) => ({ ...s, [itemId]: true }));
      try {
        const res = await cbtCall<any>('cbt-save-response', { item_id: itemId, response, ...extra });
        noteServerNow(res.server_now);
        setOffline(false);
      } catch (e) {
        if (e instanceof CbtError && e.code === 'late') {
          await refresh();
        } else {
          handleError(e);
        }
      } finally {
        setSavingItems((s) => ({ ...s, [itemId]: false }));
      }
    },
    [handleError, refresh],
  );

  const setDraft = useCallback(
    (itemId: string, response: Record<string, any> | null) => {
      setDrafts((d) => ({ ...d, [itemId]: response }));
      window.clearTimeout(saveTimers.current[itemId]);
      saveTimers.current[itemId] = window.setTimeout(() => void saveItem(itemId, response), 700);
    },
    [saveItem],
  );

  const flushDraft = useCallback(
    async (itemId: string) => {
      if (saveTimers.current[itemId]) {
        window.clearTimeout(saveTimers.current[itemId]);
        delete saveTimers.current[itemId];
        await saveItem(itemId, drafts[itemId] ?? null);
      }
    },
    [drafts, saveItem],
  );

  // ---------- section actions ----------
  const startAttempt = async () => {
    setBusy(true);
    try {
      const res = await cbtCall<CbtState>('cbt-start-attempt');
      applyState(res);
      await requestFullscreen();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const startSection = async (sectionId: string) => {
    setBusy(true);
    try {
      const res = await cbtCall<CbtState>('cbt-start-section', { section_id: sectionId });
      setIndex(0);
      applyState(res);
      await requestFullscreen();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const submitSection = useCallback(
    async (sectionId: string) => {
      setBusy(true);
      setConfirmSubmit(false);
      try {
        await Promise.all(Object.keys(saveTimers.current).map((id) => flushDraft(id)));
        const res = await cbtCall<CbtState>('cbt-submit-section', { section_id: sectionId });
        setIndex(0);
        applyState(res);
      } catch (e) {
        handleError(e);
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [applyState, flushDraft, handleError, refresh],
  );

  // ---------- auto-submit when the server deadline passes ----------
  const autoSubmitting = useRef(false);
  useEffect(() => {
    if (!running || !current || remaining === null) return;
    if (remaining > 0) {
      autoSubmitting.current = false;
      return;
    }
    if (autoSubmitting.current) return;
    autoSubmitting.current = true;
    setNotice('Time is up for this section. Your answers were submitted.');
    void submitSection(current.id);
  }, [remaining, running, current, submitSection]);

  const requestFullscreen = async () => {
    // Phones and tablets either refuse full screen or trap the keyboard behind it,
    // so we only ask for it on pointer devices.
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // the browser may refuse; the proctor log records the state anyway
    }
  };

  // ---------- render ----------
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (fatal) {
    return (
      <CbtShell brand="Assessment">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>This window is closed</CardTitle>
            <CardDescription>{fatal.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                clearSession();
                window.location.reload();
              }}
            >
              Start again
            </Button>
          </CardContent>
        </Card>
      </CbtShell>
    );
  }

  if (!state) {
    return (
      <CbtShell brand="Assessment">
        <CbtEntry onReady={(s) => applyState(s)} />
      </CbtShell>
    );
  }

  const settings = state.settings ?? {};
  const attempt = state.attempt;
  const sectionsDone = state.sections.filter((s) => s.status !== 'pending').length;
  const shellProps = {
    brand: settings.brand_name as string | undefined,
    company: settings.company_name as string | undefined,
    logoUrl: (settings.logo_url as string | null) ?? null,
    candidateName: attempt.candidate_name,
    roleName: attempt.role_name,
    publicRef: attempt.public_ref,
    warningCount: Number(attempt.warning_count ?? 0),
    maxWarnings: (settings.max_warnings as number | null) ?? null,
  };

  const banner = (
    <>
      {offline && (
        <p className="mb-4 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
          <WifiOff className="h-4 w-4" /> Your connection dropped. Your timer keeps running and we retry
          automatically — keep this window open.
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
          {notice}{' '}
          <button className="underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
    </>
  );

  // 1) instructions
  if (attempt.status === 'registered') {
    const planSections = state.sections.length ? state.sections : (state.blueprint ?? []);
    return (
      <CbtShell {...shellProps}>
        {banner}
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Before you begin</CardTitle>
            <CardDescription>
              {attempt.drive_name} · {attempt.role_name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>There are {planSections.length} sections. Each one is timed separately.</li>
              <li>Once a section's time ends it is submitted for you and cannot be reopened.</li>
              <li>Stay in this window and in full screen. Leaving is recorded as a warning.</li>
              <li>
                Copy and paste are switched off. Warnings above {(settings.max_warnings as number) ?? 3} may end your
                test.
              </li>
              <li>If your internet drops, stay on this page — your answers are saved as you go.</li>
            </ol>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Section</th>
                    <th className="px-3 py-2 text-left">Questions</th>
                    <th className="px-3 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {planSections.map((s) => (
                    <tr key={s.section_code} className="border-t border-border">
                      <td className="px-3 py-2">{s.title ?? s.section_code}</td>
                      <td className="px-3 py-2">{s.item_count ?? '—'}</td>
                      <td className="px-3 py-2">
                        {s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full" size="lg" disabled={busy} onClick={startAttempt}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Maximize className="mr-2 h-4 w-4" />}
              Start my test
            </Button>
          </CardContent>
        </Card>
      </CbtShell>
    );
  }

  // 4) finished
  if (submittedStatus || attempt.status === 'abandoned' || attempt.status === 'invalidated') {
    return (
      <CbtShell {...shellProps}>
        {banner}
        <Card className="mx-auto max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Your test has been submitted</CardTitle>
            <CardDescription>
              Reference {attempt.public_ref}. Please keep this for your records.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>You can close this window now. Our team will contact you about the next step.</p>
            {attempt.show_score_to_candidate && (
              <div className="rounded-lg border border-border p-3 text-left">
                {state.sections.map((s) => (
                  <div key={s.id} className="flex justify-between py-1">
                    <span>{s.title ?? s.section_code}</span>
                    <span className="font-medium text-foreground">
                      {typeof s.score === 'number' ? `${s.score}%` : 'Being reviewed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {settings.hr_email && (
              <p>
                Questions? Write to{' '}
                <a className="underline" href={`mailto:${settings.hr_email}`}>
                  {String(settings.hr_email)}
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      </CbtShell>
    );
  }

  // 2) transition screen between sections
  if (current && current.status === 'pending') {
    return (
      <CbtShell {...shellProps} progress={{ current: sectionsDone + 1, total: state.sections.length }}>
        {banner}
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>{current.title ?? current.section_code}</CardTitle>
            <CardDescription>
              {current.item_count ? `${current.item_count} questions · ` : ''}
              {current.duration_seconds ? `${Math.round(current.duration_seconds / 60)} minutes` : 'Timed section'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The timer starts the moment you press Start. You cannot pause or come back to this section later.
            </p>
            {current.section_type === 'typing' && (
              <p className="text-sm text-muted-foreground">
                Type the passage shown. Press space to lock each word — locked words cannot be changed.
              </p>
            )}
            {current.section_type === 'data_entry' && (
              <p className="text-sm text-muted-foreground">
                Copy each detail from the document into the boxes exactly as shown. Dates use DD/MM/YYYY.
              </p>
            )}
            <Button className="w-full" size="lg" disabled={busy} onClick={() => startSection(current.id)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Start this section
            </Button>
          </CardContent>
        </Card>
      </CbtShell>
    );
  }

  // 3) live section
  if (current && current.status === 'in_progress') {
    return (
      <CbtShell
        {...shellProps}
        secondsLeft={remaining}
        progress={{ current: sectionsDone, total: state.sections.length }}
      >
        {banner}
        <SectionBody
          section={current}
          index={index}
          setIndex={setIndex}
          drafts={drafts}
          setDraft={setDraft}
          flushDraft={flushDraft}
          savingItems={savingItems}
          busy={busy}
          onMarkReview={(itemId, marked) => void saveItem(itemId, drafts[itemId] ?? null, { marked_for_review: marked })}
          onSubmit={() => setConfirmSubmit(true)}
          onPasteBlocked={() => {
            setNotice('Copy and paste are switched off during the test.');
            void proctor.logEvent('paste_blocked');
          }}
          onBurst={() => void proctor.logEvent('burst_input')}
          onSessionError={(code, message) => setFatal({ code, message })}
        />

        <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit this section?</AlertDialogTitle>
              <AlertDialogDescription>
                You have {formatClock(remaining)} left. Once submitted you cannot come back to these questions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={() => void submitSection(current.id)}>Submit section</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CbtShell>
    );
  }

  return (
    <CbtShell {...shellProps}>
      {banner}
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Getting your test ready</CardTitle>
          <CardDescription>Please wait a moment.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </CardContent>
      </Card>
    </CbtShell>
  );
}

function SectionBody({
  section,
  index,
  setIndex,
  drafts,
  setDraft,
  flushDraft,
  savingItems,
  busy,
  onMarkReview,
  onSubmit,
  onPasteBlocked,
  onBurst,
  onSessionError,
}: {
  section: CbtCurrentSection;
  index: number;
  setIndex: (n: number) => void;
  drafts: Record<string, Record<string, any> | null>;
  setDraft: (itemId: string, response: Record<string, any> | null) => void;
  flushDraft: (itemId: string) => Promise<void>;
  savingItems: Record<string, boolean>;
  busy: boolean;
  onMarkReview: (itemId: string, marked: boolean) => void;
  onSubmit: () => void;
  onPasteBlocked: () => void;
  onBurst: () => void;
  onSessionError: (code: string, message: string) => void;
}) {
  if (section.section_type === 'typing') {
    return (
      <div className="space-y-5">
        <SectionHeading section={section} />
        <CbtTypingSection
          section={section}
          onBurst={onBurst}
          onPasteBlocked={onPasteBlocked}
          onSessionError={onSessionError}
        />
        <div className="flex justify-end">
          <Button size="lg" className="w-full sm:w-auto" disabled={busy} onClick={onSubmit}>
            I have finished typing
          </Button>
        </div>
      </div>
    );
  }

  const items = section.items ?? [];
  const item = items[Math.min(index, Math.max(0, items.length - 1))];
  if (!item) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No questions in this section</CardTitle>
          <CardDescription>Please tell HR — this section has nothing to answer.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onSubmit}>Continue</Button>
        </CardContent>
      </Card>
    );
  }

  const goTo = async (n: number) => {
    await flushDraft(item.id);
    setIndex(Math.max(0, Math.min(items.length - 1, n)));
  };

  const answered = items.filter((i) => {
    const d = drafts[i.id] ?? i.response;
    return d !== null && d !== undefined && Object.keys(d).length > 0;
  }).length;

  return (
    <div className="space-y-5">
      <SectionHeading section={section} extra={`${answered} of ${items.length} answered`} />

      {section.stimulus?.body && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          {section.stimulus.title && <p className="mb-2 text-sm font-semibold">{section.stimulus.title}</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed">{section.stimulus.body}</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:gap-3">
          <div>
            <CardTitle className="text-base">
              Question {index + 1} of {items.length}
            </CardTitle>
            {item.category_tag && <CardDescription>{item.category_tag}</CardDescription>}
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            {savingItems[item.id] && <span className="text-xs text-muted-foreground">Saving…</span>}
            <Button
              variant={item.marked_for_review ? 'default' : 'outline'}
              size="sm"
              onClick={() => onMarkReview(item.id, !item.marked_for_review)}
            >
              <Flag className="mr-1.5 h-3.5 w-3.5" />
              {item.marked_for_review ? 'Marked' : 'Mark for review'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <CbtQuestion
            item={item}
            response={drafts[item.id] ?? item.response}
            onChange={(r) => setDraft(item.id, r)}
            onPasteBlocked={onPasteBlocked}
            minWords={section.min_words}
            maxWords={section.max_words}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {items.map((it, i) => {
          const d = drafts[it.id] ?? it.response;
          const isAnswered = d !== null && d !== undefined && Object.keys(d).length > 0;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => void goTo(i)}
              aria-label={`Go to question ${i + 1}`}
              className={`h-9 w-9 rounded-md border text-xs font-semibold ${
                i === index
                  ? 'border-primary bg-primary text-primary-foreground'
                  : it.marked_for_review
                    ? 'border-amber-500 text-amber-600'
                    : isAnswered
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled={index === 0} onClick={() => void goTo(index - 1)}>
          Previous
        </Button>
        {index < items.length - 1 ? (
          <Button onClick={() => void goTo(index + 1)}>Next question</Button>
        ) : (
          <Button size="lg" disabled={busy} onClick={onSubmit}>
            Submit this section
          </Button>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ section, extra }: { section: CbtCurrentSection; extra?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-lg font-semibold">{section.title ?? section.section_code}</h1>
      {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
    </div>
  );
}
