import { format } from 'date-fns';

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

        {message.imageUrl && (
          <a href={message.imageUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={message.imageUrl}
              alt="Chat image"
              className="max-w-full rounded mb-1.5 max-h-48 object-contain cursor-pointer hover:opacity-80 transition-opacity"
            />
          </a>
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
  );
}
