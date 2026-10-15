import { useState } from 'react';
import { format } from 'date-fns';
import { ChatImageLightbox } from './ChatImageLightbox';
import { ChatAdCard, parseAdCard } from './ChatAdCard';

import { ImageOff, Clock, RefreshCw, AlertCircle, RotateCcw, ShieldAlert, Video, CreditCard, Languages, Loader2, MoreVertical, BookmarkPlus, Maximize2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface UnifiedMessage {
  id: string;
  source: 'binance' | 'local';
  senderType: 'operator' | 'counterparty' | 'system';
  text: string | null;
  imageUrl?: string;
  timestamp: number;
  isQuickReply?: boolean;
  senderName?: string | null;
  messageType?: string;
  isRecall?: boolean;
  isComplianceRelevant?: boolean;
  _deliveryStatus?: 'sending' | 'queued' | 'failed';
  _tempId?: number;
  _onRetry?: (tempId: number) => void;
}

// Render a Binance system/card payload the way the Binance app phrases it.
// NEVER label these "Shared ad" — only a real ADV_SHARE ad card is an ad.
function parseSystemMessage(text: string | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
  const type = String(parsed.type || '');
  const nick = parsed.nickName ? String(parsed.nickName) : '';
  const real = parsed.realName ? String(parsed.realName) : '';
  const who = nick && real ? `${nick} (real name: ${real})` : nick || real;
  const symbol = parsed.symbol ? String(parsed.symbol) : 'crypto';
  const orderNo = parsed.orderNo ? String(parsed.orderNo) : '';
  const shortOrder = orderNo ? `xx${orderNo.slice(-4)}` : '';

  // Identity-verification card (addKycVrfInfo) — Binance shows "Upload identity card".
  if (Array.isArray((parsed as { addKycVrfInfo?: unknown[] }).addKycVrfInfo)) {
    return `Upload identity card${orderNo ? ` · Order ID ${orderNo}` : ''}`;
  }

  switch (type) {
    case 'order_created':
      return `Order ${shortOrder || ''} created.`.trim();
    case 'order_created_with_additional_kyc_maker_sell':
    case 'order_created_with_additional_kyc_maker_buy':
      return `Order ${shortOrder} created. Please share the verification requirements and guide the counterparty to complete the verification.`.replace('Order  ', 'Order ');
    case 'order_created_with_additional_kyc_disclaimer':
      return 'Disclaimer: Binance is neither involved in nor responsible for your P2P transactions or the collection of your personal data for verification purposes.';
    case 'maker_verified_additional_kyc_maker_sell':
    case 'maker_verified_additional_kyc_maker_buy':
      return 'Order verified. Payment details have now been shared with the counterparty for the payment to be made.';
    case 'seller_payed':
      return `${who || 'Buyer'} has marked the order as paid. Please verify the payment in your account before releasing the crypto.`;
    case 'seller_completed':
      return `You have released the ${symbol}, the order ${shortOrder ? `(${shortOrder}) ` : ''}is now complete.`;
    case 'buyer_confirmed':
      return 'Buyer confirmed receipt of the crypto.';
    case 'order_cancelled':
      return `Order ${shortOrder} was cancelled.`.replace('Order  ', 'Order ');
    case 'order_appeal':
      return 'An appeal has been raised on this order.';
    default: {
      const parts: string[] = [];
      if (who) parts.push(who);
      if (type) parts.push(type.replace(/_/g, ' '));
      return parts.length > 0 ? parts.join(' — ') : 'Binance system notice';
    }
  }
}


interface ChatBubbleProps {
  message: UnifiedMessage;
  /** Copilot approvers: save one of our sent replies to the Playbook. */
  onSaveToPlaybook?: (msg: UnifiedMessage) => void;
}

export function ChatBubble({ message, onSaveToPlaybook }: ChatBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isOperator = message.senderType === 'operator';
  const isSystem = message.senderType === 'system';

  const adCard = parseAdCard(message.text);
  if (adCard) {
    return (
      <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex flex-col ${isOperator ? 'items-end' : 'items-start'}`}>
          <ChatAdCard ad={adCard} />
          <p className="text-[10px] t-mono text-muted-foreground mt-1 px-1">
            {message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : ''} · Shared ad
          </p>
        </div>
      </div>
    );
  }

  if (isSystem) {
    const normalizedType = String(message.messageType || 'system').toLowerCase();
    const displayText = parseSystemMessage(message.text);
    const isKycCard = displayText.startsWith('Upload identity card');

    const Icon = message.isRecall ? RotateCcw : normalizedType === 'video' ? Video : isKycCard || normalizedType === 'card' ? CreditCard : normalizedType === 'translate' ? Languages : ShieldAlert;
    const typeLabel = normalizedType === 'mark' ? 'Order status marker' : normalizedType === 'error' ? 'Binance chat error' : 'Binance system notice';

    return (
      <div className="flex justify-center py-0.5">
        <div className={`max-w-[88%] rounded-lg border px-3 py-1.5 flex items-start gap-1.5 ${normalizedType === 'error' ? 'border-destructive/25 bg-destructive/5' : 'border-border/60 bg-muted/40'}`}>
          <Icon className={`h-3 w-3 shrink-0 mt-0.5 ${normalizedType === 'error' ? 'text-destructive' : 'text-primary'}`} />
          <p className="text-[11px] leading-snug text-muted-foreground">
            {message.isRecall ? 'Counterparty recalled/retracted a Binance chat message' : displayText || typeLabel}
          </p>
          {message.timestamp ? (
            <span className="shrink-0 pl-1 text-[10px] t-mono text-muted-foreground/70">{format(new Date(message.timestamp), 'HH:mm')}</span>
          ) : null}
        </div>
      </div>
    );
  }


  return (
    <>
      <div className={`group flex items-center gap-1 ${isOperator ? 'justify-end' : 'justify-start'}`}>
        {onSaveToPlaybook && isOperator && message.text && message.source !== 'local' && String(message.messageType || '').toLowerCase() !== 'auto_reply' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Message actions"
                aria-label="Message actions"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => onSaveToPlaybook(message)}>
                <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Save to Playbook
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div
          className={`relative max-w-[78%] min-w-0 px-3 py-2 overflow-hidden ${
            isOperator
              ? 'bg-primary/10 border border-primary/20 text-foreground rounded-2xl rounded-br-md'
              : 'bg-secondary border border-border/70 text-foreground rounded-2xl rounded-bl-md'
          }`}
        >

          {isOperator ? (
            <p className="text-[10px] font-semibold mb-0.5 text-primary">
              {message.senderName || 'Operations Associate'}
            </p>
          ) : (
            <span className="sr-only">Counterparty: </span>
          )}

          {message.imageUrl && !imgError && (
            <div
              className="relative group cursor-pointer mb-1.5"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={message.imageUrl}
                alt="Chat image"
                className="max-w-full w-auto rounded-lg border border-border/60 max-h-56 object-contain transition-all group-hover:brightness-75"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="inline-flex items-center gap-1 text-[11px] text-white bg-black/60 px-2 py-1 rounded-md">
                  <Maximize2 className="h-3 w-3" /> Click to expand
                </span>
              </div>
            </div>
          )}

          {message.imageUrl && imgError && (
            <a
              href={message.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded-md bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors"
            >
              <ImageOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] text-primary underline">Open image in new tab</span>
            </a>
          )}

          {message.text && (
            <p className="text-[13px] whitespace-pre-wrap leading-relaxed break-words overflow-hidden">
              {message.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a
                    key={i}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                  >
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </p>
          )}


          <div className={`flex items-center gap-1.5 mt-1 ${isOperator ? 'justify-end' : ''}`}>
            <p className="text-[10px] t-mono text-muted-foreground" title={message.source === 'binance' ? 'Delivered through Binance' : undefined}>
              {message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : ''}
            </p>

            {message._deliveryStatus === 'sending' && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Sending
              </span>
            )}
            {message._deliveryStatus === 'queued' && (
              <span className="flex items-center gap-0.5 text-[10px] text-warning">
                <Clock className="h-2.5 w-2.5" />
                Queued
              </span>
            )}
            {message._deliveryStatus === 'failed' && (
              <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                <AlertCircle className="h-2.5 w-2.5" />
                Failed
                {message._onRetry && message._tempId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-0.5"
                    onClick={() => message._onRetry!(message._tempId!)}
                    aria-label="Retry sending"
                    title="Retry sending"
                  >
                    <RefreshCw className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </span>
            )}
            {!message._deliveryStatus && message.source === 'local' && (
              <span className="text-[10px] text-muted-foreground">· Local</span>
            )}
            {message.isQuickReply && (
              <Zap className="h-2.5 w-2.5 text-trade-pending" aria-label="Quick reply" />
            )}
          </div>
        </div>
      </div>

      {message.imageUrl && (
        <ChatImageLightbox
          isOpen={lightboxOpen}
          imageUrl={message.imageUrl}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
