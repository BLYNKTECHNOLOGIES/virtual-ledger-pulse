import { useState } from 'react';
import { format } from 'date-fns';
import { ChatImageLightbox } from './ChatImageLightbox';

export interface UnifiedMessage {
  id: string;
  source: 'binance' | 'local';
  senderType: 'operator' | 'counterparty' | 'system';
  text: string | null;
  imageUrl?: string;
  timestamp: number;
  isQuickReply?: boolean;
}

export function ChatBubble({ message }: { message: UnifiedMessage }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isOperator = message.senderType === 'operator';
  const isSystem = message.senderType === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted/30 rounded px-3 py-1.5 max-w-[90%] border border-border/50">
          <p className="text-[10px] text-muted-foreground text-center">{message.text}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex ${isOperator ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 ${
            isOperator
              ? 'bg-primary/15 border border-primary/20 text-foreground'
              : 'bg-secondary border border-border text-foreground'
          }`}
        >
          {/* Sender label */}
          <p className={`text-[9px] font-semibold mb-0.5 ${
            isOperator ? 'text-primary' : 'text-trade-pending'
          }`}>
            {isOperator ? 'You' : 'Counterparty'}
          </p>

          {/* Image with inline thumbnail */}
          {message.imageUrl && (
            <div
              className="relative group cursor-pointer mb-1.5"
              onClick={() => setLightboxOpen(true)}
            >
              <img
                src={message.imageUrl}
                alt="Chat image"
                className="max-w-full rounded max-h-48 object-contain transition-all group-hover:brightness-75"
                loading="lazy"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-white bg-black/60 px-2 py-1 rounded">
                  Click to expand
                </span>
              </div>
            </div>
          )}

          {message.text && (
            <p className="text-xs whitespace-pre-wrap leading-relaxed">{message.text}</p>
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

      {/* Lightbox */}
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
