import { useState } from 'react';
import { format } from 'date-fns';
import { ChatImageLightbox } from './ChatImageLightbox';
import { ImageOff } from 'lucide-react';

export interface UnifiedMessage {
  id: string;
  source: 'binance' | 'local';
  senderType: 'operator' | 'counterparty' | 'system';
  text: string | null;
  imageUrl?: string;
  timestamp: number;
  isQuickReply?: boolean;
}

// Parse system message JSON content into readable text
function parseSystemMessage(text: string | null): string {
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    const type = parsed.type || '';
    switch (type) {
      case 'seller_payed': return '💰 Buyer has marked payment as completed';
      case 'seller_completed': return '✅ Seller has released the crypto';
      case 'buyer_confirmed': return '✅ Buyer confirmed receipt';
      case 'maker_verified_additional_kyc_maker_sell': return '🔒 Additional KYC verification completed';
      case 'maker_verified_additional_kyc_maker_buy': return '🔒 Additional KYC verification completed';
      case 'order_created': return '📋 Order created';
      case 'order_cancelled': return '❌ Order cancelled';
      case 'order_appeal': return '⚠️ Appeal raised';
      default: {
        const parts: string[] = [];
        if (parsed.nickName) parts.push(parsed.nickName);
        if (parsed.realName) parts.push(`(${parsed.realName})`);
        if (type) parts.push(`— ${type.replace(/_/g, ' ')}`);
        return parts.length > 0 ? parts.join(' ') : text;
      }
    }
  } catch {
    return text;
  }
}

export function ChatBubble({ message }: { message: UnifiedMessage }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isOperator = message.senderType === 'operator';
  const isSystem = message.senderType === 'system';

  if (isSystem) {
    const displayText = parseSystemMessage(message.text);
    return (
      <div className="flex justify-center">
        <div className="bg-muted/30 rounded px-3 py-1.5 max-w-[90%] border border-border/50">
          <p className="text-[10px] text-muted-foreground text-center">{displayText}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[80%] min-w-0 rounded-lg px-3 py-2 overflow-hidden ${
            isOperator
              ? 'bg-primary/15 border border-primary/20 text-foreground'
              : 'bg-secondary border border-border text-foreground'
          }`}
        >
          <p className={`text-[9px] font-semibold mb-0.5 ${
            isOperator ? 'text-primary' : 'text-trade-pending'
          }`}>
            {isOperator ? 'You' : 'Counterparty'}
          </p>

          {message.imageUrl && !imgError && (
            <div
              className="relative group cursor-pointer mb-1.5"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={message.imageUrl}
                alt="Chat image"
                className="max-w-full w-auto rounded max-h-48 object-contain transition-all group-hover:brightness-75"
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
            <p className="text-xs whitespace-pre-wrap leading-relaxed break-words overflow-hidden">{message.text}</p>
          )}

          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-[9px] text-muted-foreground">
              {message.timestamp ? format(new Date(message.timestamp), 'HH:mm') : ''}
            </p>
            {message.source === 'binance' && (
              <span className="text-[8px] text-primary bg-primary/10 px-1 rounded">Binance</span>
            )}
            {message.source === 'local' && (
              <span className="text-[8px] text-muted-foreground bg-muted/30 px-1 rounded">Local</span>
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
