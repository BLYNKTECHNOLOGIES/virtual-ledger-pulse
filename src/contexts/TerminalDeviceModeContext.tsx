import { createContext, useContext, ReactNode } from 'react';

export type TerminalSessionMode = 'full' | 'view_only';

interface TerminalDeviceModeValue {
  /** Mode of the current terminal unlock. */
  mode: TerminalSessionMode;
  /** True when this device may only observe. */
  isViewOnly: boolean;
  /** Why the session was downgraded, when known. */
  reason: string | null;
}

const TerminalDeviceModeContext = createContext<TerminalDeviceModeValue>({
  mode: 'full',
  isViewOnly: false,
  reason: null,
});

export function TerminalDeviceModeProvider({
  mode,
  reason = null,
  children,
}: {
  mode: TerminalSessionMode;
  reason?: string | null;
  children: ReactNode;
}) {
  return (
    <TerminalDeviceModeContext.Provider
      value={{ mode, isViewOnly: mode === 'view_only', reason }}
    >
      {children}
    </TerminalDeviceModeContext.Provider>
  );
}

export function useTerminalDeviceMode() {
  return useContext(TerminalDeviceModeContext);
}

/** True when actions are permitted on this device. */
export function useTerminalWriteAllowed() {
  return !useContext(TerminalDeviceModeContext).isViewOnly;
}
