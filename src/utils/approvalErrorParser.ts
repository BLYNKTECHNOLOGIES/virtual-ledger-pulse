/**
 * Parses approval/mutation errors into user-friendly title + description pairs.
 * Used across all approval dialogs (sales, purchases, conversions, small orders).
 */
export interface ApprovalErrorInfo {
  title: string;
  description: string;
}

export function parseApprovalError(error: any, context?: string): ApprovalErrorInfo {
  const msg: string = error?.message || error?.toString() || 'Unknown error';
  const lowerMsg = msg.toLowerCase();

  // ── Balance / Negative checks ──
  if (lowerMsg.includes('cannot be negative') || lowerMsg.includes('it cannot be negative')) {
    return {
      title: 'Insufficient Balance',
      description: msg.includes('₹')
        ? msg
        : 'The transaction would result in a negative balance. Please check bank account or wallet balances before approving.',
    };
  }

  if (lowerMsg.includes('insufficient balance') || lowerMsg.includes('insufficient stock')) {
    return {
      title: 'Insufficient Balance / Stock',
      description: msg,
    };
  }

  // ── Payment limit exceeded ──
  if (lowerMsg.includes('payment limit') || lowerMsg.includes('limit exceeded') || lowerMsg.includes('payment method limit')) {
    return {
      title: 'Payment Limit Exceeded',
      description: msg,
    };
  }

  // ── Duplicate / conflict ──
  if (lowerMsg.includes('duplicate') || lowerMsg.includes('already exists') || lowerMsg.includes('unique constraint') || lowerMsg.includes('duplicate key')) {
    return {
      title: 'Duplicate Entry',
      description: 'This record has already been approved or a duplicate entry exists. Please refresh and try again.',
    };
  }

  // ── Not found ──
  if (lowerMsg.includes('not found') || lowerMsg.includes('no rows')) {
    return {
      title: 'Record Not Found',
      description: 'The record may have been deleted or already processed. Please refresh the list.',
    };
  }

  // ── Auth / permission ──
  if (lowerMsg.includes('session') || lowerMsg.includes('not authenticated') || lowerMsg.includes('user not found') || lowerMsg.includes('permission')) {
    return {
      title: 'Authentication Error',
      description: 'Your session may have expired. Please refresh the page and log in again.',
    };
  }

  // ── Check constraint (DB level) ──
  if (lowerMsg.includes('check constraint') || lowerMsg.includes('violates check')) {
    return {
      title: 'Validation Failed',
      description: 'The operation would result in invalid data (e.g. negative balance or stock). Please verify the amounts and try again.',
    };
  }

  // ── Foreign key ──
  if (lowerMsg.includes('foreign key') || lowerMsg.includes('violates foreign key')) {
    return {
      title: 'Reference Error',
      description: 'A linked record (bank account, wallet, client, or product) was not found. Please check your selections.',
    };
  }

  // ── Network / timeout ──
  if (lowerMsg.includes('network') || lowerMsg.includes('timeout') || lowerMsg.includes('fetch') || lowerMsg.includes('failed to fetch')) {
    return {
      title: 'Network Error',
      description: 'Could not reach the server. Please check your internet connection and try again.',
    };
  }

  // ── RPC overload ambiguity ──
  if (lowerMsg.includes('could not choose the best candidate function') || lowerMsg.includes('is not unique')) {
    return {
      title: 'Purchase Approval Failed',
      description: 'Could not process this approval right now. Please try again.',
    };
  }

  // ── Fallback ──
  const contextLabel = context ? `${context} Failed` : 'Action Failed';
  return {
    title: contextLabel,
    description: 'Something went wrong while processing this request. Please try again.',
  };
}
