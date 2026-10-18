// Copilot · Rephrase: the rewrite of the words in the message box, shown just above it. Use (Tab) puts it in the box;
// nothing is ever sent from here. Held-back rewrites say why; warnings repeat what the typed words themselves do.
// Screen readers hear one short line per change (a separate live region), not the whole strip.
import { AlertTriangle, Check, Languages, Loader2, RefreshCw, ShieldAlert, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RephraseView } from '@/hooks/useRephrase';
import { errorLine, heldBackText, rephraseAnnouncement } from '@/lib/copilot/rephraseController';

interface Props {
  view: RephraseView;
  /** id for the rewrite's text: the message box points at it (aria-describedby) while it is on show. */
  textId?: string;
  onUse: () => void;
  onAnother: () => void;
  onLang: (to: 'en' | 'hi') => void;
  onDismiss: () => void;
  onRetry: () => void;
}

/** Buttons keep the focus in the message box when clicked (the caret stays where it was). */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** Key hints only where there is a keyboard and a mouse (not on phones). */
const KEY_HINT = 'hidden [@media(pointer:fine)]:inline';

const Close = ({ onClick }: { onClick: () => void }) => (
  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground sm:h-6 sm:w-6" onMouseDown={keepFocus} onClick={onClick} aria-label="Hide the rewrite (Esc)">
    <X className="h-3.5 w-3.5" aria-hidden />
  </Button>
);

function Line({ icon, children, onDismiss, tone = 'muted' }: { icon: React.ReactNode; children: React.ReactNode; onDismiss: () => void; tone?: 'muted' | 'warning' }) {
  return (
    <div className={`mb-2 flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] ${tone === 'warning' ? 'border-warning/30 bg-warning/5 text-foreground' : 'border-border bg-secondary/30 text-muted-foreground'}`}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      <Close onClick={onDismiss} />
    </div>
  );
}

export function RephraseStrip({ view, textId, onUse, onAnother, onLang, onDismiss, onRetry }: Props) {
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">{rephraseAnnouncement(view)}</span>
      {view.status !== 'idle' && (
        <div data-rephrase-strip>
          {view.status === 'loading' && (
            <Line icon={<Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />} onDismiss={onDismiss}>Rewording…</Line>
          )}
          {view.status === 'same' && (
            <Line icon={<Check className="h-3 w-3 shrink-0 text-trade-buy" aria-hidden />} onDismiss={onDismiss}>Reads well as it is.</Line>
          )}
          {view.status === 'unclear' && (
            <Line icon={<Sparkles className="h-3 w-3 shrink-0" aria-hidden />} onDismiss={onDismiss}>Nothing to suggest: the Copilot could not tell what this should say.</Line>
          )}
          {view.status === 'blocked' && (
            <Line icon={<ShieldAlert className="h-3 w-3 shrink-0 text-warning" aria-hidden />} onDismiss={onDismiss} tone="warning">
              {heldBackText(view.reason)} Send your own words, or change them and try again.
            </Line>
          )}
          {view.status === 'error' && (
            <Line icon={<AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />} onDismiss={onDismiss}>
              {errorLine(view.message)}{' '}
              <button type="button" className="text-primary hover:underline" onMouseDown={keepFocus} onClick={onRetry}>Try again</button>
            </Line>
          )}
          {view.status === 'stopped' && (
            <Line icon={<Sparkles className="h-3 w-3 shrink-0" aria-hidden />} onDismiss={onDismiss}>{view.message}</Line>
          )}
          {view.status === 'ready' && view.text && (
            <div className="mb-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <p id={textId} className="max-h-16 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[12.5px] leading-snug text-foreground sm:max-h-28">{view.text}</p>
                <Close onClick={onDismiss} />
              </div>
              {view.warnings.map((w) => (
                <p key={w.code} className="mt-1 flex items-start gap-1 pl-5 text-[11px] leading-snug text-warning">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />{w.label}
                </p>
              ))}
              {view.message && <p className="mt-1 pl-5 text-[11px] leading-snug text-muted-foreground">{view.message}</p>}
              <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-5">
                <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onMouseDown={keepFocus} onClick={onUse} aria-label="Use the rewrite (Tab)">
                  Use<span className={`ml-1 rounded border border-primary-foreground/30 px-1 text-[10px] leading-4 opacity-80 ${KEY_HINT}`} aria-hidden>Tab</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onMouseDown={keepFocus} onClick={onAnother} disabled={!view.canAnother}
                  aria-label="Another wording" title={view.canAnother ? 'A different wording with the same meaning' : 'No more wordings for these words'}>
                  <RefreshCw className="mr-1 h-3 w-3" aria-hidden />Another
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onMouseDown={keepFocus} onClick={() => onLang(view.language === 'hi' ? 'en' : 'hi')}
                  aria-label={view.language === 'hi' ? 'Rewrite in English' : 'Rewrite in Hindi'}>
                  <Languages className="mr-1 h-3 w-3" aria-hidden />{view.language === 'hi' ? 'English' : 'Hindi'}
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {view.left !== null ? `${view.left} left today · ` : ''}Your meaning, reworded · check it before sending
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
