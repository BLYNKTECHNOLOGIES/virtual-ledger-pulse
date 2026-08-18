import {
  Landmark, Calculator, ShieldCheck, Crown, Megaphone, Cog, Headphones,
  Users, Code2, Briefcase, Truck, ShoppingCart, Scale, Wallet, Building2,
  type LucideIcon,
} from "lucide-react";

export interface DepartmentVisual {
  Icon: LucideIcon;
  /** tailwind classes for the icon tile (bg + text) */
  tone: string;
}

/** keyword → visual, evaluated in order (first match wins) */
const RULES: Array<{ match: RegExp; visual: DepartmentVisual }> = [
  { match: /account|taxation|banking|book\s?keep/i, visual: { Icon: Calculator, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" } },
  { match: /financ|treasur/i, visual: { Icon: Wallet, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" } },
  { match: /complian|audit|risk|kyc/i, visual: { Icon: ShieldCheck, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" } },
  { match: /legal|secretar/i, visual: { Icon: Scale, tone: "bg-slate-500/10 text-slate-600 dark:text-slate-300" } },
  { match: /manage|leadership|executive|director/i, visual: { Icon: Crown, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" } },
  { match: /market|relationship|brand|growth/i, visual: { Icon: Megaphone, tone: "bg-pink-500/10 text-pink-600 dark:text-pink-400" } },
  { match: /sales|business\s?dev|bd\b/i, visual: { Icon: ShoppingCart, tone: "bg-orange-500/10 text-orange-600 dark:text-orange-400" } },
  { match: /support|helpdesk|customer|service/i, visual: { Icon: Headphones, tone: "bg-teal-500/10 text-teal-600 dark:text-teal-400" } },
  { match: /operation|ops\b|trading|terminal/i, visual: { Icon: Cog, tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" } },
  { match: /admin/i, visual: { Icon: Building2, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" } },
  { match: /human\s?resource|hr\b|people|talent/i, visual: { Icon: Users, tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" } },
  { match: /tech|it\b|engineer|develop|software|product/i, visual: { Icon: Code2, tone: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" } },
  { match: /logistic|supply|procure|dispatch/i, visual: { Icon: Truck, tone: "bg-lime-500/10 text-lime-600 dark:text-lime-400" } },
  { match: /bank|bams/i, visual: { Icon: Landmark, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" } },
];

const FALLBACK: DepartmentVisual = { Icon: Briefcase, tone: "bg-primary/10 text-primary" };

/** Resolve a role-appropriate icon + tint for a department by its name/code. */
export function getDepartmentVisual(name?: string | null, code?: string | null): DepartmentVisual {
  const haystack = `${name || ""} ${code || ""}`.trim();
  if (!haystack) return FALLBACK;
  for (const rule of RULES) {
    if (rule.match.test(haystack)) return rule.visual;
  }
  return FALLBACK;
}
