
# Plan: Fix Client Search to Match Word Prefixes Only

## Problem Summary
The current client search uses `.includes()` which matches any substring within the name. For example, typing "sh" incorrectly matches "Usher" because "sh" exists in the middle of the word.

## Solution Overview
Create a reusable utility function that performs **word-boundary prefix matching** and apply it to both autocomplete components.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Add new `matchesWordPrefix()` utility function |
| `src/components/sales/CustomerAutocomplete.tsx` | Update filter logic to use new matching function |
| `src/components/purchase/SupplierAutocomplete.tsx` | Update filter logic to use new matching function |

## Implementation Details

### 1. New Utility Function (`src/lib/utils.ts`)

Add a `matchesWordPrefix` function that:
- Splits the target string by spaces into words
- Checks if the search term is a prefix of any word
- Handles case-insensitivity and whitespace trimming
- Normalizes multiple spaces

```text
matchesWordPrefix("shi", "Verma Shikhar") → true   (matches "Shikhar")
matchesWordPrefix("ver", "Verma Shikhar") → true   (matches "Verma")
matchesWordPrefix("ik", "Verma Shikhar")  → false  (mid-word match)
matchesWordPrefix("sh", "Usher")          → false  (mid-word match)
```

### 2. Update CustomerAutocomplete (`src/components/sales/CustomerAutocomplete.tsx`)

Replace the current filter logic:
```
// Current (incorrect)
client.name.toLowerCase().includes(searchTerm)

// Updated (word-prefix matching)
matchesWordPrefix(searchTerm, client.name)
```

Phone and PAN searches will continue to use `.includes()` since they are numeric/ID fields where substring matching is appropriate.

### 3. Update SupplierAutocomplete (`src/components/purchase/SupplierAutocomplete.tsx`)

Apply the same word-prefix matching logic for name searches.

---

## Technical Details

### Matching Function Logic
```text
function matchesWordPrefix(searchTerm: string, text: string): boolean
  1. Normalize both strings: lowercase, trim
  2. Split text by whitespace (handles multiple spaces)
  3. For each word in text:
     - Check if word.startsWith(normalizedSearchTerm)
  4. Return true if any word matches, false otherwise
```

### Edge Cases Handled
- Multiple spaces between words → normalized via split/filter
- Leading/trailing spaces → trimmed
- Empty search term → returns false (no suggestions)
- Case variations → case-insensitive comparison

### What Stays the Same
- Phone search: Uses `.includes()` (partial phone number lookup is valid)
- PAN search: Uses `.includes()` (PAN lookup by partial code is valid)
- Exact match detection logic remains unchanged
