/**
 * Parses approval/mutation errors into user-friendly title + description pairs.
 * Used across all approval dialogs (sales, purchases, conversions, small orders).
 */
export interface ApprovalErrorInfo {
  title: string;
  description: string;
}

function extractErrorMessage(error: any): string {
  if (!error) return 'Unknown error';

  if (typeof error === 'string') {
    const trimmed = error.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return extractErrorMessage(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  const candidates = [
    error?.message,
    error?.error,
    error?.details,
    error?.hint,
    error?.cause?.message,
    error?.response?.data?.error,
    error?.response?.data?.message,
    error?.data?.error,
    error?.data?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function parseApprovalError(error: any, context?: string): ApprovalErrorInfo {
  const msg: string = extractErrorMessage(error);
  const lowerMsg = msg.toLowerCase();

  // ── Insufficient balance (specific bank/wallet) ──
  if (lowerMsg.includes('insufficient balance in ')) {
    return {
      title: 'Insufficient Bank Balance',
      description: msg,
    };
  }

  // ── Balance / Negative checks ──
  if (lowerMsg.includes('cannot be negative') || lowerMsg.includes('it cannot be negative')) {
    return {
      title: 'Insufficient Balance',
      description: msg.includes('₹')
        ? msg
        : 'The transaction would result in a negative balance. Please check bank account or wallet balances before approving.',
    };
  }

  if (lowerMsg.includes('insufficient bank balance')) {
    const available = msg.match(/available:\s*₹?\s*([\d,]+(?:\.\d+)?)/i)?.[1];
    const required = msg.match(/required:\s*₹?\s*([\d,]+(?:\.\d+)?)/i)?.[1];

    return {
      title: 'Insufficient Bank Balance',
      description:
        available && required
          ? `Bank balance is too low (Available: ₹${available}, Required: ₹${required}).`
          : 'Bank balance is too low for this purchase.',
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

  // ── Permission denied (from require_permission / RLS) ──
  if (lowerMsg.includes('permission') || lowerMsg.includes('access denied') || lowerMsg.includes('not authorized')) {
    return {
      title: 'Permission Denied',
      description: 'You do not have the required permission to perform this action. Contact your administrator to request access.',
    };
  }

  // ── Auth / session ──
  if (lowerMsg.includes('session') || lowerMsg.includes('not authenticated') || lowerMsg.includes('user not found')) {
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
      title: 'System Configuration Issue',
      description: 'Multiple versions of the same operation exist in the system, causing a conflict. Please refresh the page and try again. If it persists, contact support.',
    };
  }

  // ── Fallback ── always show the real error in plain language
  const contextLabel = context ? `${context} Failed` : 'Action Failed';
  return {
    title: contextLabel,
    description: msg || 'Something went wrong while processing this request. Please try again.',
  };
}
