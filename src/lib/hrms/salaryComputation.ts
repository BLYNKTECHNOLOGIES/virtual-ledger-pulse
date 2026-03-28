/**
 * Shared salary computation utilities for HRMS payroll.
 * Single source of truth — used by SalaryStructureAssignments, PayrollDashboard, and payslip previews.
 */

export const toSnakeCase = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const evalFormula = (formula: string, vars: Record<string, number>): number => {
  try {
    let expr = formula.trim();
    Object.keys(vars).sort((a, b) => b.length - a.length).forEach(k => {
      expr = expr.replace(new RegExp(k, 'g'), String(vars[k]));
    });
    if (/^[\d\s+\-*/().]+$/.test(expr)) return new Function(`return (${expr})`)() as number;
    return 0;
  } catch { return 0; }
};

export const isEmployerComponent = (comp: any) => {
  if (comp?.component_type === 'employer_contribution') return true;
  // Fallback for legacy data
  const name = (comp?.name || '').toLowerCase();
  const code = (comp?.code || '').toLowerCase();
  return name.includes('employer') || code === 'pfc' || code === 'esic';
};

/**
 * Resolve basic pay from template items.
 */
export const resolveBasicPay = (items: any[], totalSalary: number): number => {
  const basicItem = items.find((i: any) =>
    i.hr_salary_components?.code === "BASIC" ||
    i.hr_salary_components?.name?.toLowerCase().includes("basic")
  );
  if (!basicItem) return 0;
  if (basicItem.calculation_type === "percentage") {
    return (Number(basicItem.value) / 100) * totalSalary;
  }
  return Number(basicItem.value) || 0;
};

/**
 * Build a variables map from template items for formula evaluation.
 */
export const buildVarsMap = (
  items: any[],
  totalSalary: number,
  basicPay: number,
  excludeIndex?: number
): Record<string, number> => {
  const codeAmounts: Record<string, number> = {};
  let tempDeductions = 0;
  let tempAllowances = 0;

  items.forEach((i: any) => {
    const comp = i.hr_salary_components;
    if (!comp || i.calculation_type === "formula" || i.is_variable) return;
    let amount = 0;
    if (i.calculation_type === "percentage") {
      const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
      amount = (Number(i.value) / 100) * base;
    } else {
      amount = Number(i.value) || 0;
    }
    const code = comp.code?.toLowerCase();
    if (code) codeAmounts[code] = amount;
    const sn = toSnakeCase(comp.name || '');
    if (sn && sn !== code) codeAmounts[sn] = amount;
    if (comp.component_type === "deduction") tempDeductions += amount;
    else tempAllowances += amount;
  });

  const vars: Record<string, number> = {
    total_salary: totalSalary,
    basic_pay: basicPay,
    total_deductions: tempDeductions,
    total_allowances: tempAllowances,
    ...codeAmounts,
  };

  // Resolve formula items iteratively
  items.forEach((i: any, idx: number) => {
    const comp = i.hr_salary_components;
    if (!comp || i.calculation_type !== "formula" || !i.formula) return;
    if (idx === excludeIndex) return;
    const amount = evalFormula(i.formula, vars);
    const code = comp.code?.toLowerCase();
    if (code) vars[code] = amount;
    const sn = toSnakeCase(comp.name || '');
    if (sn && sn !== code) vars[sn] = amount;
    if (comp.component_type === "deduction") vars.total_deductions += amount;
    else vars.total_allowances += amount;
  });

  return vars;
};

export interface ComponentBreakdown {
  earningsBreakdown: Record<string, number>;
  deductionsBreakdown: Record<string, number>;
  totalEarnings: number;
  totalDeductions: number;
}

/**
 * Compute earnings and deductions from salary structure template items.
 * Excludes employer-only components from employee deductions.
 */
export const computeComponentAmounts = (items: any[], totalSalary: number): ComponentBreakdown => {
  const basicPay = resolveBasicPay(items, totalSalary);
  const vars = buildVarsMap(items, totalSalary, basicPay);

  const earningsBreakdown: Record<string, number> = {};
  const deductionsBreakdown: Record<string, number> = {};
  let totalEarnings = 0;
  let totalDeductionsAmt = 0;

  items.forEach((i: any) => {
    const comp = i.hr_salary_components;
    if (!comp || i.is_variable) return;

    let amount: number;
    if (i.calculation_type === "formula" && i.formula) {
      amount = evalFormula(i.formula, vars);
    } else if (i.calculation_type === "percentage") {
      const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
      amount = (Number(i.value) / 100) * base;
    } else {
      amount = Number(i.value) || 0;
    }
    amount = Math.round(amount);

    if (comp.component_type === "allowance") {
      earningsBreakdown[comp.name] = amount;
      totalEarnings += amount;
    } else if (comp.component_type === "deduction" && !isEmployerComponent(comp)) {
      deductionsBreakdown[comp.name] = amount;
      totalDeductionsAmt += amount;
    }
  });

  return { earningsBreakdown, deductionsBreakdown, totalEarnings, totalDeductions: totalDeductionsAmt };
};

/**
 * Full breakdown for an employee (used in structure assignments preview).
 */
export const computeFullBreakdown = (items: any[], totalSalary: number, basicSalary?: number) => {
  const basicPay = resolveBasicPay(items, totalSalary) || (basicSalary || 0);
  const vars = buildVarsMap(items, totalSalary, basicPay);

  const earnings: { name: string; code: string; amount: number; isVariable: boolean }[] = [];
  const deductions: { name: string; code: string; amount: number; isVariable: boolean }[] = [];

  items.forEach((i: any) => {
    const comp = i.hr_salary_components;
    if (!comp) return;
    if (i.is_variable) {
      const entry = { name: comp.name, code: comp.code, amount: 0, isVariable: true };
      if (comp.component_type === "allowance") earnings.push(entry);
      else deductions.push(entry);
      return;
    }

    let amount: number;
    if (i.calculation_type === "formula" && i.formula) {
      amount = evalFormula(i.formula, vars);
    } else if (i.calculation_type === "percentage") {
      const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
      amount = (Number(i.value) / 100) * base;
    } else {
      amount = Number(i.value) || 0;
    }

    const entry = { name: comp.name, code: comp.code, amount: Math.round(amount), isVariable: false };
    if (comp.component_type === "allowance") earnings.push(entry);
    else deductions.push(entry);
  });

  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0);
  const totalDeductionsAmt = deductions.reduce((s, d) => s + d.amount, 0);
  const employeeDeductions = deductions
    .filter(d => {
      const nameLower = d.name?.toLowerCase() || '';
      const codeLower = d.code?.toLowerCase() || '';
      return !(nameLower.includes("employer") || codeLower.includes("employer") || codeLower.includes("pfc") || codeLower.includes("esic"));
    })
    .reduce((s, d) => s + d.amount, 0);

  return { earnings, deductions, totalEarnings, totalDeductions: totalDeductionsAmt, net: totalEarnings - employeeDeductions };
};
