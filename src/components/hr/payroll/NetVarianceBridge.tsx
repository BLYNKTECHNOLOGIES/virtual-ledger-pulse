/**
 * Net-pay variance bridge (shadow engine vs RazorpayX).
 *
 * Doctrine: the bridge is an IDENTITY, not an estimate. Every head below is
 * derived from the same two identities the two systems obey:
 *
 *   net = gross − deductions            (both sides)
 *   Δnet = Δgross − Δdeductions
 *
 * so the head list ALWAYS sums exactly to Δ net. Anything the labelled heads
 * cannot explain is surfaced as an explicit residual head rather than being
 * silently dropped — a non-zero residual is itself the finding.
 *
 * Sign convention: every head is expressed as its contribution to
 * (shadow net − razorpay net). Earnings heads pass through with their sign;
 * deduction heads are negated (a bigger shadow deduction pushes net down).
 */

export type BridgeLine = {
  monthly_gross: number;        // shadow earnings total (regular carve-out + one-off additions)
  additions_total: number;
  lop_amount: number;
  pf_employee: number;
  esi_employee: number;
  pt_amount: number;
  tds_amount: number;
  deductions_total: number;
  net_pay: number;
  razorpay_gross: number | null;
  razorpay_net: number | null;
  razorpay_pf: number | null;
  razorpay_esi: number | null;
  razorpay_pt: number | null;
  razorpay_tds: number | null;
  compute_notes: any;
};

export type BridgeHead = {
  key: string;
  label: string;
  hint: string;
  group: "earnings" | "deductions" | "residual";
  shadow: number | null;
  razorpay: number | null;
  delta: number; // contribution to (shadow net − razorpay net)
};

const r0 = (n: number) => Math.round(n);
const n0 = (v: number | null | undefined) => Number(v ?? 0);

export function buildVarianceBridge(l: BridgeLine): {
  heads: BridgeHead[];
  netDelta: number;
  tiesOut: boolean;
  available: boolean;
} {
  if (l.razorpay_net === null || l.razorpay_net === undefined) {
    return { heads: [], netDelta: 0, tiesOut: true, available: false };
  }

  const notes = l.compute_notes ?? {};
  const rzGross = n0(l.razorpay_gross);
  const rzNet = n0(l.razorpay_net);
  const netDelta = r0(l.net_pay - rzNet);

  const addPositive = Math.max(0, n0(l.additions_total));
  const shadowGross = n0(l.monthly_gross);            // already includes addPositive
  const employerCarve = r0(n0(notes.employer_cost_within_ctc));
  // ctc_post_lop is the post-LOP CTC ceiling before employer statutory carve-out.
  const ctcPost = notes.ctc_post_lop !== undefined && notes.ctc_post_lop !== null
    ? r0(n0(notes.ctc_post_lop))
    : r0(shadowGross - addPositive + employerCarve);

  // --- Earnings side ---------------------------------------------------
  const heads: BridgeHead[] = [
    {
      key: "base_lop",
      label: "Base pay & LOP",
      hint: "Post-LOP CTC ceiling from the HRMS salary structure vs the Razorpay regular gross for the month. Absorbs salary-structure drift, LOP-day disagreements and mid-month joiners/leavers.",
      group: "earnings",
      shadow: ctcPost,
      razorpay: rzGross,
      delta: r0(ctcPost - rzGross),
    },
    {
      key: "employer_carve",
      label: "Employer PF/ESI carved out of CTC",
      hint: "CTC-inclusive doctrine: employer PF, EDLI/admin and employer ESI are carved OUT of the CTC ceiling, so shadow gross sits below the Razorpay gross by exactly this amount. Razorpay reports gross before this carve-out.",
      group: "earnings",
      shadow: -employerCarve,
      razorpay: 0,
      delta: -employerCarve,
    },
    {
      key: "one_time",
      label: "One-time payouts / bonuses",
      hint: "Additions booked in HRMS payroll inputs that sit outside the CTC. Razorpay regular gross excludes one-time payouts, so anything here is a shadow-side add.",
      group: "earnings",
      shadow: addPositive,
      razorpay: 0,
      delta: addPositive,
    },
  ];

  // --- Deduction side ---------------------------------------------------
  const dedHead = (
    key: string,
    label: string,
    hint: string,
    shadow: number,
    razorpay: number,
  ): BridgeHead => ({
    key, label, hint, group: "deductions", shadow: r0(shadow), razorpay: r0(razorpay),
    delta: -r0(shadow - razorpay),
  });

  const shadowPf = n0(l.pf_employee);
  const shadowEsi = n0(l.esi_employee);
  const shadowPt = n0(l.pt_amount);
  const shadowTds = n0(l.tds_amount);
  const rzPf = n0(l.razorpay_pf);
  const rzEsi = n0(l.razorpay_esi);
  const rzPt = n0(l.razorpay_pt);
  const rzTds = n0(l.razorpay_tds);

  heads.push(
    dedHead("pf", "PF (employee)", "Employee provident fund withheld. Drift here usually means a different PF wage basis (basic-only vs gross-capped) or a VPF setting the mirror does not know about.", shadowPf, rzPf),
    dedHead("esi", "ESI (employee)", "Employee ESI at 0.75%. Drift usually follows the gross drift above, or an enrollment/exit mid contribution-period.", shadowEsi, rzEsi),
    dedHead("pt", "Professional tax", "State PT slab applied on gross. Drift means a different state mapping or slab boundary crossing.", shadowPt, rzPt),
    dedHead("tds", "TDS", "Income tax withheld. The shadow engine projects on the pre-LOP annual base; Razorpay uses its own declaration engine, so drift here is expected until declarations are mirrored.", shadowTds, rzTds),
  );

  // Everything else on both deduction stacks: loans, advances, recoveries,
  // LWF, register component gaps, unlabelled register deductions.
  const shadowOther = r0(n0(l.deductions_total) - (shadowPf + shadowEsi + shadowPt + shadowTds));
  const rzOther = r0((rzGross - rzNet) - (rzPf + rzEsi + rzPt + rzTds));
  heads.push(dedHead(
    "other_deductions",
    "Other deductions & recoveries",
    "Everything the two stacks deduct beyond PF/ESI/PT/TDS — loan EMIs, salary advances, security deposits, LWF, and any unlabelled deduction inside the imported Razorpay register (including a register whose gross does not equal the sum of its own pay heads).",
    shadowOther,
    rzOther,
  ));

  const explained = heads.reduce((s, h) => s + h.delta, 0);
  const residual = r0(netDelta - explained);
  if (residual !== 0) {
    heads.push({
      key: "residual",
      label: "Unexplained residual",
      hint: "Rounding between the two engines, or a Razorpay figure that does not reconcile with its own gross/net. Investigate whenever this exceeds a few rupees.",
      group: "residual",
      shadow: null,
      razorpay: null,
      delta: residual,
    });
  }

  return {
    heads,
    netDelta,
    tiesOut: Math.abs(netDelta - heads.reduce((s, h) => s + h.delta, 0)) < 1,
    available: true,
  };
}

function money(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
function signed(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN")}`;
}

export function NetVarianceBridge({ line }: { line: BridgeLine }) {
  const { heads, netDelta, tiesOut, available } = buildVarianceBridge(line);

  if (!available) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
        No Razorpay payslip imported for this month — variance bridge unavailable.
      </div>
    );
  }

  const material = heads.filter((h) => Math.abs(h.delta) >= 1);
  const maxAbs = Math.max(1, ...material.map((h) => Math.abs(h.delta)));

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
          Net variance bridge — head by head
        </span>
        <span className="text-[11px] text-muted-foreground">
          Shadow net − Razorpay net ={" "}
          <span className={netDelta === 0 ? "text-foreground" : netDelta > 0 ? "text-success" : "text-destructive"}>
            {signed(netDelta)}
          </span>
        </span>
      </div>

      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal px-3 py-1.5">Head</th>
            <th className="text-right font-normal px-2 py-1.5">Shadow</th>
            <th className="text-right font-normal px-2 py-1.5">Razorpay</th>
            <th className="text-right font-normal px-2 py-1.5">Impact on net</th>
            <th className="w-24 px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {material.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                Every head matches Razorpay to the rupee.
              </td>
            </tr>
          )}
          {material.map((h) => (
            <tr key={h.key} className="border-t border-border/60" title={h.hint}>
              <td className="px-3 py-1.5">
                <span className="text-foreground">{h.label}</span>
                <span className="ml-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {h.group === "earnings" ? "earning" : h.group === "deductions" ? "deduction" : ""}
                </span>
              </td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">{money(h.shadow)}</td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">{money(h.razorpay)}</td>
              <td className={`px-2 py-1.5 text-right font-medium ${h.delta > 0 ? "text-success" : "text-destructive"}`}>
                {signed(h.delta)}
              </td>
              <td className="px-3 py-1.5">
                <div className="h-1.5 w-full rounded bg-muted overflow-hidden flex">
                  <div className="w-1/2 flex justify-end">
                    {h.delta < 0 && (
                      <div className="h-full bg-destructive/70" style={{ width: `${(Math.abs(h.delta) / maxAbs) * 100}%` }} />
                    )}
                  </div>
                  <div className="w-1/2">
                    {h.delta > 0 && (
                      <div className="h-full bg-success/70" style={{ width: `${(Math.abs(h.delta) / maxAbs) * 100}%` }} />
                    )}
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/20">
            <td className="px-3 py-1.5 font-semibold text-foreground">Sum of heads</td>
            <td />
            <td />
            <td className={`px-2 py-1.5 text-right font-semibold ${netDelta > 0 ? "text-success" : netDelta < 0 ? "text-destructive" : "text-foreground"}`}>
              {signed(heads.reduce((s, h) => s + h.delta, 0))}
            </td>
            <td className="px-3 py-1.5 text-[10px] text-muted-foreground">
              {tiesOut ? "ties out ✓" : "does not tie out"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
