#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

const erpCatalog = read('src/lib/permissions/catalog.ts');
const terminalCatalog = read('src/lib/permissions/terminalCatalog.ts');

const erpKeys = new Set([...erpCatalog.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]));
const legacyKeys = new Set([...erpCatalog.matchAll(/^\s*([A-Za-z0-9_]+):\s*'[^']+'/gm)].map((m) => m[1]));
const aliasKeys = new Set([...erpCatalog.matchAll(/^\s*([A-Za-z0-9_]+):\s*\[/gm)].map((m) => m[1]));
const terminalKeys = new Set([...terminalCatalog.matchAll(/'((?:terminal)_[a-z0-9_]+)'/g)].map((m) => m[1]));

const sourceFiles = execFileSync('rg', [
  '-l',
  'PermissionGate|hasPermission\\(|hasAnyPermission\\(|hasAllPermissions\\(|TerminalPermissionGate|permissions:',
  'src',
  '--glob', '*.ts',
  '--glob', '*.tsx',
  '--glob', '!src/integrations/supabase/types.ts',
], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const erpUsage = new Map();
const terminalUsage = new Map();

const addUsage = (map, key, file, lineNo) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(`${relative(root, file)}:${lineNo}`);
};

const erpPermissionShape = /^(?:[A-Z_]+|[a-z0-9]+(?:_[a-z0-9]+)+)$/;
const nonPermissionPrefixes = [
  'terminal_',
  'sb_',
  'hr_',
  'binance_',
  'client_',
  'erp_task_',
  'public_',
  'razorpay_',
  'supabase_',
  'order_',
  'purchase_',
  'sales_',
  'wallet_',
  'bank_',
  'tax_',
  'ad_',
  'app_',
  'kyc_',
  'video_',
  'risk_',
  'support_',
  'help_',
  'report_',
  'shift_',
  'user_',
  'dashboard_',
  'compliance_',
  'stock_',
  'leads_',
  'tasks_',
  'utility_',
  'accounting_',
  'financials_',
  'statistics_',
  'bams_',
  'ems_',
  'payroll_',
];
const erpSuffixes = /_(view|manage|approve|destructive|create|export|sync|entry|formats|dashboard)$/;

const recordKey = (key, file, lineNo, line) => {
  if (key.startsWith('terminal_')) {
    if (terminalKeys.has(key) || /TerminalPermissionGate|terminalPermissions|TerminalPermission/.test(line)) {
      addUsage(terminalUsage, key, file, lineNo);
    } else {
      addUsage(erpUsage, key, file, lineNo);
    }
    return;
  }
  if (!erpPermissionShape.test(key)) return;
  if (!nonPermissionPrefixes.some((prefix) => key.startsWith(prefix)) && !erpSuffixes.test(key)) return;
  addUsage(erpUsage, key, file, lineNo);
};

const recordArrayLiteral = (arrayBody, file, lineNo, line) => {
  for (const match of arrayBody.matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) {
    recordKey(match[1], file, lineNo, line);
  }
};

for (const fileName of sourceFiles) {
  const abs = join(root, fileName);
  const lines = readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const inPermissionContext = /PermissionGate|TerminalPermissionGate|hasPermission\(|hasAnyPermission\(|hasAllPermissions\(|permissions:|permissions=/.test(line);
    if (!inPermissionContext) return;

    for (const match of line.matchAll(/hasPermission\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)/g)) {
      recordKey(match[1], abs, index + 1, line);
    }
    for (const match of line.matchAll(/has(?:Any|All)Permission[s]?\(\s*\[([^\]]*)\]/g)) {
      recordArrayLiteral(match[1], abs, index + 1, line);
    }
    for (const match of line.matchAll(/permissions\s*[:=]\s*\{?\s*\[([^\]]*)\]/g)) {
      recordArrayLiteral(match[1], abs, index + 1, line);
    }
  });
}

const knownErp = new Set([...erpKeys, ...legacyKeys, ...aliasKeys]);
const missingErp = [...erpUsage.keys()].filter((key) => !knownErp.has(key)).sort();
const missingTerminal = [...terminalUsage.keys()].filter((key) => !terminalKeys.has(key)).sort();

const printMissing = (title, missing, usage) => {
  if (missing.length === 0) return;
  console.error(`\n${title}`);
  for (const key of missing) {
    console.error(`- ${key}`);
    for (const location of usage.get(key).slice(0, 5)) console.error(`  ${location}`);
  }
};

printMissing('ERP permission strings missing from catalog/legacy map:', missingErp, erpUsage);
printMissing('Terminal permission strings missing from catalog:', missingTerminal, terminalUsage);

if (missingErp.length || missingTerminal.length) {
  process.exitCode = 1;
} else {
  console.log(`Permission catalog OK — ERP checked=${erpUsage.size}, Terminal checked=${terminalUsage.size}, ERP catalog=${erpKeys.size}, Terminal catalog=${terminalKeys.size}`);
}
