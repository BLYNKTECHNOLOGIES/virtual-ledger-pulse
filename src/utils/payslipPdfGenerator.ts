
export interface PayslipData {
  employee: {
    id: string;
    name: string;
    employee_id: string;
    designation: string;
    department: string;
    date_of_joining: string;
  };
  payslip: {
    month_year: string;
    basic_salary: number;
    hra: number;
    conveyance_allowance: number;
    medical_allowance: number;
    other_allowances: number;
    total_earnings: number;
    epf: number;
    esi: number;
    professional_tax: number;
    total_deductions: number;
    net_salary: number;
    total_working_days: number;
    leaves_taken: number;
    lop_days: number;
    paid_days: number;
    gross_wages: number;
  };
}

export const generatePayslipPDF = (data: PayslipData) => {
  const { employee, payslip } = data;
  
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  
  const monthYear = new Date(payslip.month_year).toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payslip - ${employee.name} - ${monthYear}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          font-size: 12px;
          line-height: 1.3;
        }
        .payslip-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #000;
        }
        .header {
          background-color: #f8f9fa;
          padding: 15px;
          border-bottom: 2px solid #000;
          text-align: left;
        }
        .company-logo {
          width: 40px;
          height: 40px;
          background-color: #000;
          display: inline-block;
          margin-right: 15px;
          vertical-align: top;
        }
        .company-info {
          display: inline-block;
          vertical-align: top;
        }
        .company-name {
          font-size: 18px;
          font-weight: bold;
          margin: 0;
        }
        .company-address {
          color: #666;
          margin: 2px 0;
        }
        .payslip-title {
          color: #666;
          margin: 2px 0;
        }
        .employee-details {
          display: flex;
          padding: 15px;
          border-bottom: 1px solid #000;
        }
        .employee-left, .employee-right {
          flex: 1;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          padding: 2px 0;
        }
        .detail-label {
          font-weight: normal;
          color: #333;
        }
        .detail-value {
          font-weight: normal;
        }
        .attendance-section {
          padding: 15px;
          border-bottom: 1px solid #000;
        }
        .attendance-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 20px;
          margin-bottom: 10px;
        }
        .attendance-item {
          text-align: center;
        }
        .attendance-label {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .attendance-value {
          background-color: #f8f9fa;
          padding: 8px;
          border: 1px solid #ddd;
          font-size: 14px;
        }
        .earnings-deductions {
          display: flex;
          padding: 0;
        }
        .earnings, .deductions {
          flex: 1;
          border-right: 1px solid #000;
        }
        .deductions {
          border-right: none;
        }
        .section-header {
          background-color: #f8f9fa;
          padding: 10px;
          text-align: center;
          font-weight: bold;
          border-bottom: 1px solid #000;
        }
        .amount-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 15px;
          border-bottom: 1px solid #ddd;
        }
        .amount-row:last-child {
          border-bottom: 1px solid #000;
          font-weight: bold;
          background-color: #f8f9fa;
        }
        .net-salary {
          text-align: center;
          padding: 15px;
          background-color: #e3f2fd;
          font-size: 16px;
          font-weight: bold;
          border-bottom: 2px solid #000;
        }
        .currency {
          font-family: 'Arial', sans-serif;
        }
        @media print {
          body { margin: 0; padding: 10px; }
          .payslip-container { border: 2px solid #000; }
        }
      </style>
    </head>
    <body>
      <div class="payslip-container">
        <div class="header">
          <div class="company-logo"></div>
          <div class="company-info">
            <div class="company-name">Company Name</div>
            <div class="company-address">Company Address</div>
            <div class="payslip-title">Pay Slip for ${monthYear}</div>
          </div>
        </div>

        <div class="employee-details">
          <div class="employee-left">
            <div class="detail-row">
              <span class="detail-label">Employee ID</span>
              <span class="detail-value">: ${employee.employee_id}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Employee Name</span>
              <span class="detail-value">: ${employee.name}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Designation</span>
              <span class="detail-value">: ${employee.designation}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Department</span>
              <span class="detail-value">: ${employee.department}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date of Joining</span>
              <span class="detail-value">: ${new Date(employee.date_of_joining).toLocaleDateString()}</span>
            </div>
          </div>
          <div class="employee-right">
            <div class="detail-row">
              <span class="detail-label">UAN</span>
              <span class="detail-value">: -</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">PF No.</span>
              <span class="detail-value">: -</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">ESI No.</span>
              <span class="detail-value">: -</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Bank</span>
              <span class="detail-value">: -</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Account No.</span>
              <span class="detail-value">: -</span>
            </div>
          </div>
        </div>

        <div class="attendance-section">
          <div class="attendance-grid">
            <div class="attendance-item">
              <div class="attendance-label">Gross Wages</div>
              <div class="attendance-value currency">₹${payslip.gross_wages.toLocaleString()}</div>
            </div>
            <div class="attendance-item">
              <div class="attendance-label">Total Working Days</div>
              <div class="attendance-value">${payslip.total_working_days}</div>
            </div>
            <div class="attendance-item">
              <div class="attendance-label">Leaves</div>
              <div class="attendance-value">${payslip.leaves_taken}</div>
            </div>
            <div class="attendance-item">
              <div class="attendance-label">LOP Days</div>
              <div class="attendance-value">${payslip.lop_days}</div>
            </div>
          </div>
          <div style="text-align: center; padding-top: 10px; border-top: 1px solid #ddd;">
            <strong>Paid Days: ${payslip.paid_days}</strong>
          </div>
        </div>

        <div class="earnings-deductions">
          <div class="earnings">
            <div class="section-header">Earnings</div>
            <div class="amount-row">
              <span>Basic</span>
              <span class="currency">₹${payslip.basic_salary.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>HRA</span>
              <span class="currency">₹${payslip.hra.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>Conveyance Allowance</span>
              <span class="currency">₹${payslip.conveyance_allowance.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>Medical Allowance</span>
              <span class="currency">₹${payslip.medical_allowance.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>Other Allowances</span>
              <span class="currency">₹${payslip.other_allowances.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>Total Earnings</span>
              <span class="currency">₹${payslip.total_earnings.toLocaleString()}</span>
            </div>
          </div>
          <div class="deductions">
            <div class="section-header">Deductions</div>
            <div class="amount-row">
              <span>EPF</span>
              <span class="currency">₹${payslip.epf.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>ESI</span>
              <span class="currency">₹${payslip.esi.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span>Professional Tax</span>
              <span class="currency">₹${payslip.professional_tax.toLocaleString()}</span>
            </div>
            <div class="amount-row">
              <span></span>
              <span></span>
            </div>
            <div class="amount-row">
              <span></span>
              <span></span>
            </div>
            <div class="amount-row">
              <span>Total Deductions</span>
              <span class="currency">₹${payslip.total_deductions.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="net-salary">
          <strong>Net Salary: <span class="currency">₹${payslip.net_salary.toLocaleString()}</span></strong>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 500);
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
