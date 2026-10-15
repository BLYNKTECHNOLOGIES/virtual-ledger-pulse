import { createContext } from 'react';

/**
 * While a newly chosen period is still loading, Analytics keeps showing the
 * earlier rows; empty states then read this text ("Loading …") instead of
 * claiming there is no data.
 */
export const PendingContext = createContext<string | null>(null);
