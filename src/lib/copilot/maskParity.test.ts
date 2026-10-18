import { describe, expect, it } from 'vitest';
import { maskPII } from '../../../supabase/functions/_shared/copilot-playbook.ts';
import { maskPersonal } from './copilotText';

// The screen masks a question an approver adds to the Playbook with maskPersonal; the server masks everything else with
// maskPII. Both must give the same result, or the Playbook holds text the AI would never have been shown.
const SAMPLES = [
  'my upi is ravi.k@okaxis', 'pay on x@ybl or blynk @ ybl', 'mail me at ravi@gmail.com', 'call 9876543210 or +91 98765 43210',
  'call +44 7911 123456', 'acc 987-654-3210-12', 'landline 0755 2345 678 9', 'PAN ABCDE1234F, IFSC hdfc0001234', 'aadhaar 1234 5678 9012',
  'card 4111 1111 1111 1111', 'UTR 412345678901 ref', 'UTR123456789012', 'paid 45,000 for order in 15 minutes', 'account 50100123456789',
  'UTR 412345678901, ok. Ref 123456789.', 'total 1,00,00,000.50', 'Can I pay now?', '98765 43210ABCDE1234F',
  'wallet TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE and 0x52908400098527886E0F7030069857D2E4169EE7', 'order 22944071217231917056',
  'rate 92.50, 10:30 pm, 5-10 min', 'meet at 5 pm, pay ₹4,500 via upi', '1.234567890', 'v2.123456789',
  // Round 2: hashes and other wallets, one-letter and spaced UPI IDs, references, numbers in groups, odd digits.
  'tx 0x5d2c1f6a8b3e4d7c9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f', 'hash 5d2c1f6a8b3e4d7c9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f',
  'btc BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ', 'ltc ltc1qg82tq7kd3n0ldxmqzszsyd3jt5ad5xkfg5w6vd', 'ton EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n',
  'pay a@ybl', 'x@yz is fine', 'ravi @ ybl', 'meet @ home', 'a @ ybl', 'UTRABCDE1234F567890', 'id ABCD12345678XY',
  'list 10 20 30 40 50', '1 2 3 4 5 6 7 8 9', '12-34 56789 01234', '987.654.3210', '18-10-2026 10:30', 'card 4111 1111 1111 1111 now',
  'phone ९८७६५४३२१० pls', 'phone ９８７６５４３２１０', 'zero\u200bwidth 98765\u200b43210', 'aadhaar 1234 5678 9012 3456', '+919876543210',
  'pay ₹１，０００ now', 'Can I pay now? 🙏',
];

describe('maskPersonal gives the same result as the server maskPII', () => {
  for (const s of SAMPLES) it(s, () => expect(maskPersonal(s)).toBe(maskPII(s)));
});

// Strings made of pieces personal values are built from, in every order: the two must agree on all of them.
describe('maskPersonal and maskPII agree on random strings of number-like pieces', () => {
  it('20,000 strings', () => {
    const parts = ['9', '1', '0', '6', '5', '12', '345', '6789', '+', '+91', '+44', '91', ' ', ' ', '-', '.', ',', '@', ' @ ', 'ybl', 'ok', 'axis',
      'A', 'B', 'x', 'Q', '98765', '43210', '1234', '5678', '9012', 'ABCDE', 'F', 'HDFC0', '00123', 'UTR', 'T', 'EQ', 'Qn9Y2', '0x', 'bc1', 'ab',
      'sir', 'pay', '₹', '\u200b', '९', '１'];
    let seed = 20261018;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const wrong: string[] = [];
    for (let i = 0; i < 20000 && wrong.length < 5; i++) {
      let s = '';
      const n = 2 + Math.floor(rnd() * 14);
      for (let j = 0; j < n; j++) s += parts[Math.floor(rnd() * parts.length)];
      if (maskPersonal(s) !== maskPII(s)) wrong.push(`${JSON.stringify(s)} → screen ${JSON.stringify(maskPersonal(s))}, server ${JSON.stringify(maskPII(s))}`);
    }
    expect(wrong).toEqual([]);
  });
});
