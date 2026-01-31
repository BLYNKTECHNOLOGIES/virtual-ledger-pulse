import { PanType } from './buy-order-types';

// Parse PAN type from order notes
// Format: "[pan_type:value]" stored in notes field
export function parsePanTypeFromNotes(notes: string | null): PanType | null {
  if (!notes) return null;
  
  const match = notes.match(/\[pan_type:(\w+)\]/);
  if (match) {
    const value = match[1] as PanType;
    if (['pan_provided', 'pan_not_provided', 'non_tds'].includes(value)) {
      return value;
    }
  }
  return null;
}

// Set PAN type in notes, preserving existing content
export function setPanTypeInNotes(notes: string | null, panType: PanType): string {
  const marker = `[pan_type:${panType}]`;
  
  if (!notes) return marker;
  
  // Remove existing marker if present
  const cleaned = notes.replace(/\[pan_type:\w+\]/g, '').trim();
  
  // Add new marker
  return cleaned ? `${cleaned} ${marker}` : marker;
}

// Parse safe fund status from notes
export function parseSafeFundFromNotes(notes: string | null): boolean {
  if (!notes) return false;
  return notes.includes('[safe_fund:true]');
}

// Set safe fund status in notes
export function setSafeFundInNotes(notes: string | null, isSafeFund: boolean): string {
  const marker = isSafeFund ? '[safe_fund:true]' : '';
  
  if (!notes) return marker;
  
  // Remove existing marker if present
  const cleaned = notes.replace(/\[safe_fund:\w+\]/g, '').trim();
  
  // Add new marker if true
  return isSafeFund && cleaned ? `${cleaned} ${marker}` : (isSafeFund ? marker : cleaned);
}
