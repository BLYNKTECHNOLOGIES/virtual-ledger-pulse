/**
 * useTriFieldCalc
 *
 * A hook that manages bidirectional auto-calculation between three related fields:
 *   - quantity  (crypto units)
 *   - price     (price per unit in INR)
 *   - total     (total INR amount)
 *
 * RULE:
 *   The field being actively typed by the user is NEVER overwritten.
 *   Only the field that is NOT the "last two manually touched" gets auto-calculated.
 *
 *   When user edits:
 *     - quantity  → recalculate total (qty × price), if price exists
 *     - price     → if totalWasManual: recalculate quantity (total / price)
 *                   else: recalculate total (qty × price), if qty exists
 *     - total     → recalculate quantity (total / price), if price exists
 *
 *   Key invariant: `totalWasManual` is set to true ONLY when the user manually
 *   edits the total field. It resets to false when quantity or price changes
 *   cause a total recalculation (auto-calc). This prevents the cascading issue
 *   where auto-computed totals trigger further quantity back-calculation.
 *
 * Usage:
 *   const { handleFieldChange, fieldTouched } = useTriFieldCalc({ ... });
 */

import { useRef } from "react";

export interface TriFieldValues {
  quantity: string;
  price: string;
  total: string;
}

export interface TriFieldResult {
  quantity: string;
  price: string;
  total: string;
}

export function useTriFieldCalc() {
  /**
   * Track whether the TOTAL field was the last field MANUALLY edited by the user.
   * If true: changing price → recalculate quantity (keep total).
   * If false: changing price → recalculate total (keep quantity).
   */
  const totalWasManualRef = useRef<boolean>(false);

  /**
   * Process a field change and return the updated trio of values.
   * @param field - which field was just edited by the user
   * @param newValue - the new string value (raw, as user typed)
   * @param current - current values of all three fields
   */
  function handleFieldChange(
    field: "quantity" | "price" | "total",
    newValue: string,
    current: TriFieldValues
  ): TriFieldResult {
    const result: TriFieldResult = {
      quantity: current.quantity,
      price: current.price,
      total: current.total,
      [field]: newValue, // always accept what user typed
    };

    const qty = field === "quantity" ? parseFloat(newValue) || 0 : parseFloat(current.quantity) || 0;
    const price = field === "price" ? parseFloat(newValue) || 0 : parseFloat(current.price) || 0;
    const total = field === "total" ? parseFloat(newValue) || 0 : parseFloat(current.total) || 0;

    if (field === "quantity") {
      // User changed quantity → auto-calculate total
      // Quantity is now "known", so total should follow qty × price
      // Mark total as NOT manually set (it's being auto-calculated)
      totalWasManualRef.current = false;
      if (price > 0 && qty > 0) {
        result.total = (qty * price).toFixed(2);
      } else if (qty === 0) {
        // Clear total if quantity cleared
        result.total = "";
      }
    } else if (field === "price") {
      // User is typing price — determine what to recalculate
      if (totalWasManualRef.current && total > 0 && price > 0) {
        // Total was manually entered → keep total, recalculate quantity
        result.quantity = (total / price).toFixed(8);
      } else if (qty > 0 && price > 0) {
        // Quantity is known (prefilled or manually set) → recalculate total
        // Do NOT touch quantity
        result.total = (qty * price).toFixed(2);
        totalWasManualRef.current = false;
      } else if (price === 0) {
        // Price cleared, don't cascade
      }
    } else if (field === "total") {
      // User manually edited total
      totalWasManualRef.current = true;
      if (price > 0 && total > 0) {
        // Recalculate quantity from total / price
        result.quantity = (total / price).toFixed(8);
      } else if (total === 0 || newValue === "") {
        totalWasManualRef.current = false;
      }
    }

    return result;
  }

  /** Call this when the form resets / a pre-filled value is set programmatically */
  function resetManualFlags() {
    totalWasManualRef.current = false;
  }

  return { handleFieldChange, resetManualFlags };
}
