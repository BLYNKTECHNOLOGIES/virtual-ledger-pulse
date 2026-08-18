// Single-field address capture, structured storage.
// The UI collects one free-text address line; we still persist
// address / city / state / zip / country separately so downstream
// payroll, statutory and RazorpayX syncs keep working unchanged.

export interface StructuredAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry",
];

const COUNTRIES = ["India"];

/** Join structured parts back into one readable line (no duplicates). */
export function composeAddress(parts: Partial<StructuredAddress>): string {
  const seen = new Set<string>();
  return [parts.address, parts.city, parts.state, parts.zip, parts.country]
    .map(v => (v || "").trim())
    .filter(v => {
      if (!v) return false;
      const k = v.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}

/**
 * Best-effort split of a free-text address into structured components.
 * Never throws; whatever cannot be classified stays in `address`.
 */
export function parseAddress(full: string): StructuredAddress {
  const raw = (full || "").trim();
  if (!raw) return { address: "", city: "", state: "", zip: "", country: "" };

  let tokens = raw.split(",").map(t => t.trim()).filter(Boolean);

  let zip = "";
  let state = "";
  let country = "";

  // PIN code — 6 digits, may be embedded in a token like "Bhopal 462001".
  for (let i = tokens.length - 1; i >= 0; i--) {
    const m = tokens[i].match(/\b(\d{6})\b/);
    if (m) {
      zip = m[1];
      const remainder = tokens[i].replace(m[0], "").replace(/[-–]/g, " ").trim();
      if (remainder) tokens[i] = remainder;
      else tokens.splice(i, 1);
      break;
    }
  }

  // Country
  for (let i = tokens.length - 1; i >= 0; i--) {
    const hit = COUNTRIES.find(c => c.toLowerCase() === tokens[i].toLowerCase());
    if (hit) { country = hit; tokens.splice(i, 1); break; }
  }

  // State
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toLowerCase();
    const hit = INDIAN_STATES.find(s => s.toLowerCase() === t);
    if (hit) { state = hit; tokens.splice(i, 1); break; }
  }
  if (!state) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i].toLowerCase();
      const hit = INDIAN_STATES.find(s => t.includes(s.toLowerCase()));
      if (hit) {
        state = hit;
        const remainder = tokens[i].replace(new RegExp(hit, "i"), "").trim().replace(/^[,\-\s]+|[,\-\s]+$/g, "");
        if (remainder) tokens[i] = remainder; else tokens.splice(i, 1);
        break;
      }
    }
  }

  // City = last remaining token when there is still street detail before it.
  let city = "";
  if (tokens.length > 1) city = tokens.pop() as string;

  if (!country && (state || zip)) country = "India";

  return {
    address: tokens.join(", "),
    city,
    state,
    zip,
    country,
  };
}
