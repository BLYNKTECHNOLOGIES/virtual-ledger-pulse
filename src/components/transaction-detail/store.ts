// Tiny module-level store used to drive the global transaction detail dialog
// from anywhere in the tree without prop-drilling or a React Context.
import { useSyncExternalStore } from 'react';
import type { TransactionType } from './types';

export interface OpenTransactionState {
  type: TransactionType;
  id: string;
}

type Listener = () => void;
let current: OpenTransactionState | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export const transactionDetailStore = {
  open(state: OpenTransactionState) {
    current = state;
    emit();
  },
  close() {
    current = null;
    emit();
  },
  get() {
    return current;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useTransactionDetailState(): OpenTransactionState | null {
  return useSyncExternalStore(
    transactionDetailStore.subscribe,
    transactionDetailStore.get,
    () => null,
  );
}

export function openTransaction(state: OpenTransactionState) {
  transactionDetailStore.open(state);
}

export function closeTransaction() {
  transactionDetailStore.close();
}
