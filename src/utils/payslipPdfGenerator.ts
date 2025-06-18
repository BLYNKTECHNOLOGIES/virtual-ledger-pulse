
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
          padding: 15px;
          font-size: 12px;
          line-height: 1.2;
          position: relative;
          box-sizing: border-box;
          height: 100vh;
        }
        .payslip-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #000;
          position: relative;
          background-color: white;
          height: calc(100vh - 30px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .watermark {
          position: absolute;
          top: 50px;
          left: 50px;
          opacity: 0.08;
          z-index: 1;
          pointer-events: none;
        }
        .watermark img {
          width: 100px;
          height: 400px;
          object-fit: contain;
          transform: rotate(0deg);
        }
        .content {
          position: relative;
          z-index: 2;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .header {
          background-color: #f8f9fa;
          padding: 12px;
          border-bottom: 2px solid #000;
          text-align: left;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .company-logo {
          width: 80px;
          height: 80px;
          margin-right: 15px;
          flex-shrink: 0;
        }
        .company-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .company-info {
          flex: 1;
        }
        .company-name {
          font-size: 16px;
          font-weight: bold;
          margin: 0 0 4px 0;
          color: #1a365d;
        }
        .company-address {
          color: #666;
          margin: 2px 0;
          font-size: 10px;
        }
        .company-details {
          color: #666;
          margin: 2px 0;
          font-size: 9px;
          font-weight: 600;
        }
        .payslip-title {
          color: #666;
          margin: 8px 0 0 0;
          font-weight: 600;
          font-size: 12px;
        }
        .employee-details {
          display: flex;
          padding: 12px;
          border-bottom: 1px solid #000;
          flex-shrink: 0;
        }
        .employee-left, .employee-right {
          flex: 1;
        }
        .employee-left {
          padding-right: 20px;
        }
        .detail-row {
          display: flex;
          margin-bottom: 6px;
          padding: 1px 0;
        }
        .detail-label {
          font-weight: 600;
          color: #333;
          width: 120px;
          flex-shrink: 0;
        }
        .detail-value {
          font-weight: normal;
          flex: 1;
        }
        .attendance-section {
          padding: 12px;
          border-bottom: 1px solid #000;
          flex-shrink: 0;
        }
        .attendance-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          gap: 15px;
          margin-bottom: 8px;
        }
        .attendance-item {
          text-align: center;
        }
        .attendance-label {
          font-weight: bold;
          margin-bottom: 4px;
        }
        .attendance-value {
          background-color: #f8f9fa;
          padding: 6px;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .earnings-deductions {
          display: flex;
          flex: 1;
          min-height: 0;
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
          padding: 8px;
          text-align: center;
          font-weight: bold;
          border-bottom: 1px solid #000;
        }
        .amount-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid #ddd;
        }
        .amount-row:last-child {
          border-bottom: 1px solid #000;
          font-weight: bold;
          background-color: #f8f9fa;
        }
        .net-salary {
          text-align: center;
          padding: 12px;
          background-color: #e3f2fd;
          font-size: 14px;
          font-weight: bold;
          border-bottom: 1px solid #000;
          flex-shrink: 0;
        }
        .signature-section {
          padding: 20px 15px 15px 15px;
          text-align: left;
          flex-shrink: 0;
          margin-top: auto;
        }
        .signature-space {
          width: 200px;
          height: 40px;
          margin-bottom: 5px;
        }
        .signature-label {
          font-size: 10px;
          color: #666;
          font-weight: 600;
        }
        .currency {
          font-family: 'Arial', sans-serif;
        }
        @media print {
          body { 
            margin: 0; 
            padding: 10px; 
            height: 100vh;
          }
          .payslip-container { 
            border: 2px solid #000;
            height: calc(100vh - 20px);
          }
        }
      </style>
    </head>
    <body>
      <div class="payslip-container">
        <div class="watermark">
          <img src="/lovable-uploads/db260f9d-5303-4e6e-8f98-481f5f41698b.png" alt="Watermark" />
        </div>
        <div class="content">
          <div class="header">
            <div class="company-logo">
              <img src="/lovable-uploads/db260f9d-5303-4e6e-8f98-481f5f41698b.png" alt="Company Logo" />
            </div>
            <div class="company-info">
              <div class="company-name">BLYNK VIRTUAL TECHNOLOGIES PRIVATE LIMITED</div>
              <div class="company-address">First Floor Balwant Arcade, Plot No. 15, Zone 2</div>
              <div class="company-address">Maharana Pratap Nagar, 462011, Bhopal, Madhya Pradesh</div>
              <div class="company-details">CIN No. U62099MP2025PTC074915 | GST No. 23AANCB2572J1ZK</div>
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
            <div style="text-align: center; padding-top: 8px; border-top: 1px solid #ddd;">
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

          <div class="signature-section">
            <div class="signature-space"></div>
            <div class="signature-label">Authorised Signatory</div>
          </div>
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
