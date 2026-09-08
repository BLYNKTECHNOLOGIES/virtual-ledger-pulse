import { useState } from 'react';
import { format } from 'date-fns';
import { ChatImageLightbox } from './ChatImageLightbox';
import { ChatAdCard, parseAdCard } from './ChatAdCard';

import { ImageOff, Clock, RefreshCw, AlertCircle, RotateCcw, ShieldAlert, Video, CreditCard, Languages, Loader2, MoreVertical, Pin, Ban } from 'lucide-react';
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
  /** Trainer-only teach controls on operator (self) messages. */
  teachEnabled?: boolean;
  onPin?: (msg: UnifiedMessage) => void;
  onBlacklist?: (msg: UnifiedMessage) => void;
}

export function ChatBubble({ message, teachEnabled, onPin, onBlacklist }: ChatBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isOperator = message.senderType === 'operator';
  const isSystem = message.senderType === 'system';

  const adCard = parseAdCard(message.text);
  if (adCard) {
    return (
      <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
        <div>
          <ChatAdCard ad={adCard} />
          <p className="text-[9px] t-mono text-muted-foreground mt-1">
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
      <div className="flex justify-center">
        <div className="bg-muted/30 rounded px-3 py-1.5 max-w-[90%] border border-border/50 flex items-start gap-1.5">
          <Icon className="h-3 w-3 text-primary shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground text-center">
            {message.isRecall ? 'Counterparty recalled/retracted a Binance chat message' : displayText || typeLabel}
          </p>
        </div>
      </div>
    );
  }


  return (
    <>
      <div className={`group flex items-center gap-1 ${isOperator ? 'justify-end' : 'justify-start'}`}>
        {teachEnabled && isOperator && message.text && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Teach copilot"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onPin?.(message)}>
                <Pin className="h-3.5 w-3.5 mr-2" /> Pin as golden reply
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onBlacklist?.(message)}>
                <Ban className="h-3.5 w-3.5 mr-2" /> Blacklist this pattern
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div
          className={`max-w-[75%] min-w-0 px-3 py-2 overflow-hidden ${
            isOperator
              ? 'bg-primary/12 border border-primary/25 text-foreground rounded-lg rounded-tr-sm'
              : 'bg-secondary border border-border text-foreground rounded-lg rounded-tl-sm'
          }`}
        >

          <p className={`text-[9px] font-semibold mb-0.5 ${
            isOperator ? 'text-primary' : 'text-trade-pending'
          }`}>
            {isOperator ? (message.senderName || 'Operator') : 'Counterparty'}
          </p>

          {message.imageUrl && !imgError && (
            <div
              className="relative group cursor-pointer mb-1.5"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={message.imageUrl}
                alt="Chat image"
                className="max-w-full w-auto rounded-md border border-border max-h-48 object-contain transition-all group-hover:brightness-75"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-white bg-black/60 px-2 py-1 rounded">
                  Click to expand
                </span>
              </div>
            </div>
          )}

          {message.imageUrl && imgError && (
            <a
              href={message.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 mb-1.5 px-3 py-2 rounded bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors"
            >
              <ImageOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-primary underline">Open image in new tab</span>
            </a>
          )}

          {message.text && (
            <p className="text-xs whitespace-pre-wrap leading-relaxed break-words overflow-hidden">
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


          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-[9px] t-mono text-muted-foreground">
              {message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : ''}
            </p>

            {message._deliveryStatus === 'sending' && (
              <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Sending
              </span>
            )}
            {message._deliveryStatus === 'queued' && (
              <span className="flex items-center gap-0.5 text-[8px] text-warning">
                <Clock className="h-2.5 w-2.5" />
                Queued
              </span>
            )}
            {message._deliveryStatus === 'failed' && (
              <span className="flex items-center gap-0.5 text-[8px] text-destructive">
                <AlertCircle className="h-2.5 w-2.5" />
                Failed
                {message._onRetry && message._tempId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-0.5"
                    onClick={() => message._onRetry!(message._tempId!)}
                  >
                    <RefreshCw className="h-2.5 w-2.5 text-destructive" />
                  </Button>
                )}
              </span>
            )}
            {!message._deliveryStatus && message.source === 'binance' && (
              <span className="text-[8px] text-primary bg-primary/10 px-1 rounded">Binance</span>
            )}
            {!message._deliveryStatus && message.source === 'local' && (
              <span className="text-[8px] text-muted-foreground bg-muted/30 px-1 rounded">Local</span>
            )}
            {isOperator && message.senderName && (
              <span className="text-[8px] text-accent-foreground bg-accent/50 px-1 rounded">{message.senderName}</span>
            )}
            {message.isQuickReply && (
              <span className="text-[8px] text-trade-pending">⚡</span>
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
