import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check if searchTerm matches the prefix of any word in text.
 * Words are delimited by whitespace.
 * 
 * @example
 * matchesWordPrefix("shi", "Verma Shikhar") // true (matches "Shikhar")
 * matchesWordPrefix("ver", "Verma Shikhar") // true (matches "Verma")
 * matchesWordPrefix("ik", "Verma Shikhar")  // false (mid-word match)
 * matchesWordPrefix("sh", "Usher")          // false (mid-word match)
 */
export function matchesWordPrefix(searchTerm: string, text: string): boolean {
  const normalizedSearch = searchTerm.toLowerCase().trim();
  if (!normalizedSearch) return false;
  
  const textWords = text.toLowerCase().split(/\s+/).filter(Boolean);
  const searchWords = normalizedSearch.split(/\s+/).filter(Boolean);
  
  // Every search word must match the start of at least one text word
  // Each text word can only be matched once
  const usedIndices = new Set<number>();
  return searchWords.every(sw => {
    const idx = textWords.findIndex((tw, i) => !usedIndices.has(i) && tw.startsWith(sw));
    if (idx === -1) return false;
    usedIndices.add(idx);
    return true;
  });
}

/**
 * Format a number using the Indian numbering system (e.g., 1,00,000).
 * Use this for all currency/amount displays in the ERP.
 */
export function formatIndianNumber(value: number | null | undefined, decimals?: number): string {
  if (value == null || isNaN(value)) return '0';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  });
}
