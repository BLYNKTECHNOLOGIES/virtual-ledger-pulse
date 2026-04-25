const STORAGE_KEY = 'terminal-read-binance-order-chats';
const EVENT_NAME = 'terminal-binance-chat-read-state-changed';

function readStoredOrderNumbers(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

const readOrderNumbers = readStoredOrderNumbers();

function persistReadOrderNumbers() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(readOrderNumbers)));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function isOrderChatRead(orderNumber: string | null | undefined) {
  return !!orderNumber && readOrderNumbers.has(String(orderNumber));
}

export function markOrderChatRead(orderNumber: string | null | undefined) {
  if (!orderNumber) return;
  const key = String(orderNumber);
  if (readOrderNumbers.has(key)) return;
  readOrderNumbers.add(key);
  persistReadOrderNumbers();
}

export function subscribeToChatReadState(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}