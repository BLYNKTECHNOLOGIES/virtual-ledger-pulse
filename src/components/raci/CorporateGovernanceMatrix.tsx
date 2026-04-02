
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Shield, Landmark, Scale, Users, AlertTriangle, Layers,
  ArrowUpRight, Lock, Eye, Gavel, BarChart3, Cpu, Building2
} from 'lucide-react';

// Governance assignment types
const GOV_TYPES: Record<string, { label: string; color: string; bg: string; description: string }> = {
  O: { label: 'Owner', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-500/10 border-red-200 dark:border-red-800', description: 'Ultimate control and final authority' },
  C: { label: 'Controller', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-500/10 border-blue-200 dark:border-blue-800', description: 'Day-to-day authority and management' },
  S: { label: 'Supervisor', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10 border-amber-200 dark:border-amber-800', description: 'Oversight and supervisory responsibility' },
  A: { label: 'Auditor', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-200 dark:border-emerald-800', description: 'Independent check and verification' },
  '-': { label: 'None', color: 'text-muted-foreground/40', bg: '', description: 'No direct involvement' },
};

const ROLES = ['MD-A', 'MD-S', 'GM', 'OM', 'ICO', 'ECO'] as const;

interface DomainRow {
  domain: string;
  assignments: Record<string, string>;
}

interface GovernanceSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  rows: DomainRow[];
  insight?: { title: string; points: string[] };
}

const GOVERNANCE_SECTIONS: GovernanceSection[] = [
  {
    id: 'finance',
    title: 'Finance & Fund Governance',
    icon: <Landmark className="h-4 w-4" />,
    rows: [
      { domain: 'Fund Flow Architecture', assignments: { 'MD-A': 'O', 'MD-S': 'C', GM: 'C', OM: '-', ICO: 'A', ECO: 'S' } },
      { domain: 'Liquidity Management', assignments: { 'MD-A': 'O', 'MD-S': 'C', GM: 'C', OM: '-', ICO: 'A', ECO: 'S' } },
      { domain: 'Banking Relationships', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'Payment Recovery', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'Expense Control', assignments: { 'MD-A': 'O', 'MD-S': '-', GM: 'C', OM: '-', ICO: 'A', ECO: '-' } },
    ],
    insight: { title: 'Insight', points: ['MD-A = Financial Owner', 'GM = Controller', 'ECO = External Executor'] },
  },
  {
    id: 'compliance',
    title: 'Compliance & Risk Governance',
    icon: <Shield className="h-4 w-4" />,
    rows: [
      { domain: 'Internal Compliance', assignments: { 'MD-A': 'O', 'MD-S': '-', GM: 'C', OM: 'S', ICO: 'O', ECO: '-' } },
      { domain: 'KYC Framework', assignments: { 'MD-A': 'O', 'MD-S': '-', GM: 'C', OM: '-', ICO: 'O', ECO: '-' } },
      { domain: 'Risk Detection', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'C', ICO: 'O', ECO: '-' } },
      { domain: 'External Compliance', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'Regulatory Handling', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
    ],
    insight: { title: 'Dual Layer Control', points: ['ICO = Internal Shield', 'ECO = External Shield'] },
  },
  {
    id: 'operations',
    title: 'Operations Governance',
    icon: <BarChart3 className="h-4 w-4" />,
    rows: [
      { domain: 'Sales Operations', assignments: { 'MD-A': 'O', 'MD-S': 'C', GM: 'S', OM: 'C', ICO: 'A', ECO: '-' } },
      { domain: 'Order Lifecycle', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'O', ICO: 'A', ECO: '-' } },
      { domain: 'Appeals Management', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'O', ICO: 'A', ECO: '-' } },
      { domain: 'Execution Efficiency', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'O', ICO: '-', ECO: '-' } },
    ],
    insight: { title: 'Clear Split', points: ['OM = Execution Owner', 'GM = Control', 'MD-A = Strategic Owner'] },
  },
  {
    id: 'tech',
    title: 'Purchase & Technology Governance',
    icon: <Cpu className="h-4 w-4" />,
    rows: [
      { domain: 'Purchase Operations', assignments: { 'MD-A': 'C', 'MD-S': 'O', GM: 'S', OM: 'C', ICO: '-', ECO: '-' } },
      { domain: 'Tech Architecture', assignments: { 'MD-A': '-', 'MD-S': 'O', GM: 'S', OM: '-', ICO: 'A', ECO: '-' } },
      { domain: 'ERP & Systems', assignments: { 'MD-A': '-', 'MD-S': 'O', GM: 'C', OM: 'C', ICO: 'A', ECO: '-' } },
      { domain: 'Data & Research', assignments: { 'MD-A': 'C', 'MD-S': 'O', GM: 'S', OM: '-', ICO: '-', ECO: '-' } },
    ],
    insight: { title: 'Ownership', points: ['MD-S = Full Owner of Tech + Buy Side'] },
  },
  {
    id: 'legal',
    title: 'Legal, Enforcement & Banking Interface',
    icon: <Gavel className="h-4 w-4" />,
    rows: [
      { domain: 'Police / Notices', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'Legal Representation', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'Banking Escalations', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
      { domain: 'External Risk Handling', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: '-', ICO: '-', ECO: 'O' } },
    ],
    insight: { title: 'Key Principle', points: ['ECO = External Face of Company'] },
  },
  {
    id: 'hr',
    title: 'HR & Organizational Governance',
    icon: <Users className="h-4 w-4" />,
    rows: [
      { domain: 'Org Structure', assignments: { 'MD-A': 'O', 'MD-S': 'C', GM: 'C', OM: '-', ICO: '-', ECO: '-' } },
      { domain: 'Hiring Decisions', assignments: { 'MD-A': 'O', 'MD-S': '-', GM: 'C', OM: 'C', ICO: '-', ECO: '-' } },
      { domain: 'Performance Control', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'O', ICO: '-', ECO: '-' } },
      { domain: 'Discipline & PIP', assignments: { 'MD-A': 'S', 'MD-S': '-', GM: 'C', OM: 'O', ICO: '-', ECO: '-' } },
    ],
  },
  {
    id: 'strategy',
    title: 'Strategy & Enterprise Direction',
    icon: <ArrowUpRight className="h-4 w-4" />,
    rows: [
      { domain: 'Business Strategy', assignments: { 'MD-A': 'O', 'MD-S': 'O', GM: 'C', OM: '-', ICO: '-', ECO: '-' } },
      { domain: 'Expansion', assignments: { 'MD-A': 'O', 'MD-S': 'O', GM: 'C', OM: '-', ICO: '-', ECO: '-' } },
      { domain: 'High-Risk Decisions', assignments: { 'MD-A': 'O', 'MD-S': 'C', GM: 'C', OM: '-', ICO: 'C', ECO: 'C' } },
    ],
  },
];

const GOVERNANCE_LAYERS = [
  { layer: 'Board / Strategic Layer', role: 'MD-A (Abhishek), MD-S (Shubham)', nature: 'Strategy, oversight, final authority', color: 'border-l-red-500' },
  { layer: 'Executive Control Layer', role: 'General Manager (GM)', nature: 'Finance, compliance, system control', color: 'border-l-blue-500' },
  { layer: 'Execution Layer', role: 'Operations Manager (OM)', nature: 'Operations & revenue execution', color: 'border-l-amber-500' },
  { layer: 'Control Layer – Internal', role: 'Internal Compliance Officer (ICO)', nature: 'Internal compliance & KYC', color: 'border-l-purple-500' },
  { layer: 'Control Layer – External', role: 'External Compliance Officer (ECO)', nature: 'Legal, banking, enforcement', color: 'border-l-emerald-500' },
];

const THREE_LINE_DEFENSE = [
  { line: 'Line 1 – Execution', roles: 'OM + Teams', desc: 'Generates revenue, executes operations', icon: <BarChart3 className="h-5 w-5" />, color: 'bg-amber-500/10 border-amber-200 text-amber-700' },
  { line: 'Line 2 – Control', roles: 'GM + ICO', desc: 'Controls risk, compliance, funds', icon: <Shield className="h-5 w-5" />, color: 'bg-blue-500/10 border-blue-200 text-blue-700' },
  { line: 'Line 3 – External Defense', roles: 'ECO', desc: 'Handles law enforcement, banking, recovery', icon: <Gavel className="h-5 w-5" />, color: 'bg-emerald-500/10 border-emerald-200 text-emerald-700' },
  { line: 'Board Layer', roles: 'MD-A + MD-S', desc: 'Strategy + override authority', icon: <Layers className="h-5 w-5" />, color: 'bg-red-500/10 border-red-200 text-red-700' },
];

const POWER_DISTRIBUTION = [
  { function: 'Money', holder: 'GM', icon: <Landmark className="h-4 w-4" /> },
  { function: 'Execution', holder: 'OM', icon: <BarChart3 className="h-4 w-4" /> },
  { function: 'Internal Compliance', holder: 'ICO', icon: <Shield className="h-4 w-4" /> },
  { function: 'External Compliance', holder: 'ECO', icon: <Gavel className="h-4 w-4" /> },
  { function: 'Technology', holder: 'MD-S', icon: <Cpu className="h-4 w-4" /> },
  { function: 'Governance', holder: 'MD-A', icon: <Building2 className="h-4 w-4" /> },
];

const ESCALATION_MATRIX = [
  { trigger: 'Fund Release > Threshold', level1: 'GM approves', level2: 'MD-A final sign-off', level3: 'Dual MD approval if critical' },
  { trigger: 'Account Freeze Request', level1: 'ICO flags + GM reviews', level2: 'ECO executes freeze', level3: 'MD-A informed immediately' },
  { trigger: 'Suspicious Transaction', level1: 'ICO detects + OM halts', level2: 'GM + ECO investigate', level3: 'MD-A escalation if regulatory risk' },
  { trigger: 'Legal / Police Notice', level1: 'ECO receives & responds', level2: 'GM + MD-A informed', level3: 'Board-level decision if required' },
  { trigger: 'Compliance Breach', level1: 'ICO documents + flags', level2: 'GM enforces corrective action', level3: 'MD-A reviews systemic risk' },
  { trigger: 'Technology Failure / Outage', level1: 'OM escalates to MD-S', level2: 'MD-S activates recovery', level3: 'Both MDs if business impact' },
  { trigger: 'Revenue / Spread Anomaly', level1: 'OM detects + reports GM', level2: 'GM investigates controls', level3: 'MD-A reviews if loss > threshold' },
  { trigger: 'HR Disciplinary Action', level1: 'OM initiates PIP', level2: 'GM approves termination', level3: 'MD-A final authority' },
];

function GovCell({ type }: { type: string }) {
  const config = GOV_TYPES[type] || GOV_TYPES['-'];
  if (type === '-') {
    return <span className="text-muted-foreground/30 text-xs">—</span>;
  }
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold border ${config.bg} ${config.color}`}>
      {type}
    </span>
  );
}

export function CorporateGovernanceMatrix() {
  return (
    <div className="space-y-8">
      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Corporate Governance Control Types</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(GOV_TYPES).filter(([k]) => k !== '-').map(([letter, config]) => (
            <div key={letter} className={`rounded-md border ${config.bg} p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${config.color} bg-background border`}>
                  {letter}
                </span>
                <span className={`text-xs font-semibold ${config.color}`}>{config.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{config.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Governance Layers */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Governance Layers</h3>
        <div className="space-y-2">
          {GOVERNANCE_LAYERS.map((layer, i) => (
            <div key={i} className={`flex items-center gap-4 rounded-md border border-border p-3 border-l-4 ${layer.color}`}>
              <div className="min-w-[180px]">
                <span className="text-xs font-semibold text-foreground">{layer.layer}</span>
              </div>
              <div className="min-w-[220px]">
                <span className="text-xs text-muted-foreground">{layer.role}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{layer.nature}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Domain Ownership Sections */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Domain Ownership Matrix</h3>
        <div className="space-y-6">
          {GOVERNANCE_SECTIONS.map((section) => (
            <div key={section.id} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/30 px-4 py-3 flex items-center gap-2">
                {section.icon}
                <span className="text-sm font-semibold text-foreground">{section.title}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground min-w-[180px]">Domain</th>
                      {ROLES.map(role => (
                        <th key={role} className="text-center py-2.5 px-3 font-semibold text-muted-foreground w-[80px]">{role}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-foreground">{row.domain}</td>
                        {ROLES.map(role => (
                          <td key={role} className="text-center py-2.5 px-3">
                            <GovCell type={row.assignments[role]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {section.insight && (
                <div className="bg-muted/10 px-4 py-2.5 border-t border-border/50">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{section.insight.title}</span>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {section.insight.points.map((p, i) => (
                      <span key={i} className="text-xs text-muted-foreground">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Three-Line Defense Model */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Three-Line Defense Model</h3>
        <p className="text-xs text-muted-foreground mb-4">Critical institutional defense architecture</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {THREE_LINE_DEFENSE.map((line, i) => (
            <div key={i} className={`rounded-lg border p-4 ${line.color}`}>
              <div className="mb-2">{line.icon}</div>
              <h4 className="text-xs font-bold mb-1">{line.line}</h4>
              <p className="text-xs font-semibold mb-1">{line.roles}</p>
              <p className="text-[10px] opacity-80">{line.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Power Distribution */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Power Distribution</h3>
        <p className="text-xs text-muted-foreground mb-4">Actual power holders across critical functions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {POWER_DISTRIBUTION.map((item, i) => (
            <div key={i} className="rounded-lg border border-border p-4 text-center hover:shadow-sm transition-shadow">
              <div className="flex justify-center mb-2 text-muted-foreground">{item.icon}</div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{item.function}</p>
              <p className="text-sm font-bold text-foreground">{item.holder}</p>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Escalation Matrix */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Escalation Matrix</h3>
        <p className="text-xs text-muted-foreground mb-4">Threshold-based escalation paths for critical events</p>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground min-w-[200px]">Trigger Event</th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground min-w-[200px]">
                    <Badge variant="outline" className="text-[10px] font-normal bg-emerald-500/10 text-emerald-700 border-emerald-200">Level 1</Badge>
                    <span className="ml-1.5">Initial Response</span>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground min-w-[200px]">
                    <Badge variant="outline" className="text-[10px] font-normal bg-amber-500/10 text-amber-700 border-amber-200">Level 2</Badge>
                    <span className="ml-1.5">Escalation</span>
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground min-w-[200px]">
                    <Badge variant="outline" className="text-[10px] font-normal bg-red-500/10 text-red-700 border-red-200">Level 3</Badge>
                    <span className="ml-1.5">Critical</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ESCALATION_MATRIX.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium text-foreground">{row.trigger}</td>
                    <td className="py-3 px-4 text-muted-foreground">{row.level1}</td>
                    <td className="py-3 px-4 text-muted-foreground">{row.level2}</td>
                    <td className="py-3 px-4 text-muted-foreground">{row.level3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Separator />

      {/* Institutional Strength */}
      <div className="rounded-lg border border-border bg-muted/20 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Institutional Strength</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">No Single Point of Failure</p>
            <p className="text-[10px] text-muted-foreground">Every critical function has backup authority and escalation path</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Complete Separation</p>
            <div className="flex flex-wrap gap-1.5">
              {['Money', 'Operations', 'Compliance', 'Legal'].map(s => (
                <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Enterprise-Grade Architecture</p>
            <p className="text-[10px] text-muted-foreground">Scalable governance model aligned with exchanges, payment institutions, and fintech firms</p>
          </div>
        </div>
      </div>

      {/* Risk Warning */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Critical Dependency</h4>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This governance model depends heavily on <strong>GM + ECO integrity</strong>. If either role fails in its duties, financial and legal exposure rises immediately. 
              Recommended safeguards: Dual approval for fund release and account freeze, threshold-based escalations, and automated audit triggers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
