/**
 * M1: PF/ESI Statutory Report Generation
 * Generates ECR file format (EPF monthly return) and ESI contribution statement
 */

export interface EmployeeStatutoryData {
  badge_id: string;
  first_name: string;
  last_name: string;
  uan_number?: string;
  pf_number?: string;
  esi_number?: string;
  pan_number?: string;
  gross_salary: number;
  basic_salary: number;
  pf_employee: number;
  pf_employer: number;
  esi_employee: number;
  esi_employer: number;
  days_worked: number;
}

/**
 * Generate EPF ECR (Electronic Challan cum Return) file content
 * Format: UAN#Member Name#Gross Wages#EPF Wages#EPS Wages#EDLI Wages#EPF Contribution(EE)#EPS Contribution(ER)#EPF Contribution(ER)#NCP Days#Refund of Advances
 */
export function generateECRFile(employees: EmployeeStatutoryData[], month: string): string {
  const lines: string[] = [];

  for (const emp of employees) {
    if (!emp.uan_number && !emp.pf_number) continue;
    
    const epfWages = Math.min(emp.basic_salary, 15000); // EPF ceiling ₹15,000
    const epsWages = Math.min(emp.basic_salary, 15000);
    const edliWages = Math.min(emp.basic_salary, 15000);
    const epfEE = Math.round(epfWages * 0.12); // 12% employee
    const epsER = Math.round(epsWages * 0.0833); // 8.33% EPS from employer
    const epfER = Math.round(epfWages * 0.0367); // 3.67% EPF from employer (12% - 8.33%)
    const ncpDays = 30 - emp.days_worked;

    lines.push([
      emp.uan_number || '',
      `${emp.first_name} ${emp.last_name}`.toUpperCase(),
      Math.round(emp.gross_salary),
      epfWages,
      epsWages,
      edliWages,
      epfEE,
      epsER,
      epfER,
      Math.max(0, ncpDays),
      0, // Refund of advances
    ].join('#'));
  }

  return lines.join('\n');
}

/**
 * Generate ESI Contribution Statement
 * Format: IP Number|IP Name|No. of Days|Total Wages|IP Contribution|Employer Contribution
 */
export function generateESIStatement(employees: EmployeeStatutoryData[], month: string): string {
  const header = 'IP Number|IP Name|No. of Days|Total Wages|IP Contribution|Employer Contribution';
  const lines: string[] = [header];

  for (const emp of employees) {
    if (!emp.esi_number) continue;
    if (emp.gross_salary > 21000) continue; // ESI applicable only if gross <= ₹21,000

    const ipContrib = Math.round(emp.gross_salary * 0.0075); // 0.75% employee
    const erContrib = Math.round(emp.gross_salary * 0.0325); // 3.25% employer

    lines.push([
      emp.esi_number,
      `${emp.first_name} ${emp.last_name}`.toUpperCase(),
      emp.days_worked,
      Math.round(emp.gross_salary),
      ipContrib,
      erContrib,
    ].join('|'));
  }

  return lines.join('\n');
}

/**
 * Generate PF summary for a payroll run
 */
export function generatePFSummary(employees: EmployeeStatutoryData[]): {
  totalEPFEmployee: number;
  totalEPFEmployer: number;
  totalEPSEmployer: number;
  totalEDLI: number;
  totalAdminCharges: number;
  grandTotal: number;
  employeeCount: number;
} {
  let totalEPFEmployee = 0;
  let totalEPFEmployer = 0;
  let totalEPSEmployer = 0;
  let employeeCount = 0;

  for (const emp of employees) {
    if (!emp.uan_number && !emp.pf_number) continue;
    
    const epfWages = Math.min(emp.basic_salary, 15000);
    totalEPFEmployee += Math.round(epfWages * 0.12);
    totalEPSEmployer += Math.round(epfWages * 0.0833);
    totalEPFEmployer += Math.round(epfWages * 0.0367);
    employeeCount++;
  }

  const totalEDLI = Math.round(employees.reduce((s, e) => s + Math.min(e.basic_salary, 15000), 0) * 0.005);
  const totalAdminCharges = Math.round(employees.reduce((s, e) => s + Math.min(e.basic_salary, 15000), 0) * 0.005);
  const grandTotal = totalEPFEmployee + totalEPFEmployer + totalEPSEmployer + totalEDLI + totalAdminCharges;

  return { totalEPFEmployee, totalEPFEmployer, totalEPSEmployer, totalEDLI, totalAdminCharges, grandTotal, employeeCount };
}

/**
 * Download helper
 */
export function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
