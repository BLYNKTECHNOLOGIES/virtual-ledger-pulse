import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InvoiceData {
  order: any;
  bankAccountData?: any;
  companyDetails?: {
    name: string;
    address: string;
    city: string;
    state: string;
    email: string;
    gstin?: string;
  };
}

export const generateInvoicePDF = ({ order, bankAccountData, companyDetails }: InvoiceData) => {
  console.log('Starting PDF generation for order:', order.order_number);
  const doc = new jsPDF();
  
  // Company details (default if not provided)
  const company = companyDetails || {
    name: "BLYNK VIRTUAL TECHNOLOGIES PRIVATE LIMITED",
    address: "Plot No.15 First Floor Balwant Arcade",
    city: "Maharana Pratap Nagar Zone 2",
    state: "Bhopal, Madhya Pradesh",
    email: "blynkvirtualtechnologiespvtltd@gmail.com",
    gstin: "23AANCB2572J1ZK"
  };

  // Set font
  doc.setFont('helvetica');
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text('Tax Invoice', 105, 20, { align: 'center' });
  
  // Company details box
  doc.setFontSize(10);
  doc.rect(15, 30, 180, 45);
  
  // Left side - Company details (adjust positioning for better alignment)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  // Split company name if too long
  const companyNameLines = doc.splitTextToSize(company.name, 90);
  let yPos = 40;
  companyNameLines.forEach((line: string) => {
    doc.text(line, 20, yPos);
    yPos += 5;
  });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(company.address, 20, yPos + 2);
  doc.text(company.city, 20, yPos + 7);
  doc.text(company.state, 20, yPos + 12);
  doc.text(`E-Mail: ${company.email}`, 20, yPos + 17);
  if (company.gstin) {
    doc.text(`GSTIN/UIN: ${company.gstin}`, 20, yPos + 22);
  }
  
  // Vertical divider line
  doc.line(115, 30, 115, 75);
  
  // Right side - Invoice details (better spacing)
  const invoiceNo = order.order_number || '47';
  const invoiceDate = new Date(order.order_date).toLocaleDateString('en-GB');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Invoice No.', 120, 40);
  doc.text('Dated', 160, 40);
  doc.setFont('helvetica', 'normal');
  doc.text(invoiceNo, 120, 45);
  doc.text(invoiceDate, 160, 45);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Delivery Note', 120, 52);
  doc.text('Mode/Terms of Payment', 120, 59);
  doc.setFont('helvetica', 'normal');
  doc.text('', 120, 57);
  doc.text(order.payment_status === 'COMPLETED' ? 'Paid' : 'Pending', 120, 64);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Reference No. & Date', 150, 52);
  doc.setFont('helvetica', 'normal');
  doc.text('', 150, 57);
  
  // Customer details box (adjust position to account for larger company box)
  doc.rect(15, 80, 180, 25);
  
  // Customer details
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer (Bill to)', 20, 90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(order.client_name || 'Customer Name', 20, 97);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (order.client_phone) {
    doc.text(`Phone: ${order.client_phone}`, 20, 102);
  }
  
  // Items table (adjust start position)
  const tableStartY = 115;
  
  // Tax calculations (P2P Trading Mechanism)
  const totalAmount = order.total_amount;
  const netAmountBeforeTax = totalAmount / 1.18; // Remove GST to get base amount
  const gstAmount = totalAmount - netAmountBeforeTax;
  const cgstAmount = gstAmount / 2; // CGST 9%
  const sgstAmount = gstAmount / 2; // SGST 9%
  
  // Table headers for tax invoice
  const headers = [['Sl No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount', 'Taxable Value', 'CGST', '', 'SGST/UTGST', '', 'Total Amount']];
  const subHeaders = [['', '', '', '', '', '', '', '', 'Rate', 'Amount', 'Rate', 'Amount', '']];
  
  // Table data
  const productName = order.description || 'USDT';
  const quantity = order.quantity || 1;
  const rate = order.price_per_unit || (totalAmount / quantity);
  const hsnCode = '960899'; // HSN code for USDT
  
  const tableData = [
    [
      '1', 
      productName, 
      hsnCode, 
      quantity.toString(), 
      Number(rate).toFixed(2), 
      'NOS', 
      Number(totalAmount).toFixed(2),
      Number(netAmountBeforeTax).toFixed(2),
      '9%',
      Number(cgstAmount).toFixed(2),
      '9%', 
      Number(sgstAmount).toFixed(2),
      Number(totalAmount).toFixed(2)
    ]
  ];
  
  // Add total tax summary row
  tableData.push([
    '', 'Total', '', quantity.toString(), '', '', 
    Number(totalAmount).toFixed(2), 
    Number(netAmountBeforeTax).toFixed(2),
    '', Number(cgstAmount).toFixed(2),
    '', Number(sgstAmount).toFixed(2),
    Number(totalAmount).toFixed(2)
  ]);
  
  // Add tax amount in words row
  const totalTaxAmount = cgstAmount + sgstAmount;
  const taxAmountInWords = `INR ${numberToWords(Math.round(totalTaxAmount))} Only`;
  
  autoTable(doc, {
    head: [headers[0], subHeaders[0]],
    body: tableData,
    startY: tableStartY,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 12 }, // Sl No
      1: { cellWidth: 35 }, // Description
      2: { cellWidth: 18 }, // HSN
      3: { cellWidth: 12 }, // Quantity
      4: { cellWidth: 15 }, // Rate
      5: { cellWidth: 8 },  // per
      6: { cellWidth: 18 }, // Amount
      7: { cellWidth: 18 }, // Taxable Value
      8: { cellWidth: 8 },  // CGST Rate
      9: { cellWidth: 15 }, // CGST Amount
      10: { cellWidth: 8 }, // SGST Rate
      11: { cellWidth: 15 }, // SGST Amount
      12: { cellWidth: 18 }, // Total Amount
    },
  });
  
  // Add tax summary table
  const taxSummaryY = (doc as any).lastAutoTable?.finalY + 10 || tableStartY + 80;
  
  autoTable(doc, {
    body: [
      ['', '', '', '', '', '', '', 'Taxable Value', 'CGST', 'SGST/UTGST', 'Total Tax Amount'],
      ['', '', '', '', '', '', '', Number(netAmountBeforeTax).toFixed(2), Number(cgstAmount).toFixed(2), Number(sgstAmount).toFixed(2), Number(totalTaxAmount).toFixed(2)],
      ['', '', '', '', '', '', 'Total:', Number(netAmountBeforeTax).toFixed(2), Number(cgstAmount).toFixed(2), Number(sgstAmount).toFixed(2), Number(totalAmount).toFixed(2)]
    ],
    startY: taxSummaryY,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
      halign: 'right'
    },
    columnStyles: {
      6: { fontStyle: 'bold' },
      7: { fontStyle: 'bold' },
      8: { fontStyle: 'bold' },
      9: { fontStyle: 'bold' },
      10: { fontStyle: 'bold' }
    }
  });
  
  // Amount in words
  // Get the final Y position from the table
  const tableEndY = (doc as any).lastAutoTable?.finalY || tableStartY + 50;
  const finalY = tableEndY + 10;
  doc.setFontSize(10);
  doc.text('Amount Chargeable (in words)  INR ' + numberToWords(Math.round(totalAmount)) + ' Only', 20, finalY);
  doc.setFontSize(9);
  doc.text('Tax Amount (in words) : ' + taxAmountInWords, 20, finalY + 7);
  doc.setFont('helvetica', 'normal');
  
  // Payment received section (if payment is completed)
  if (order.payment_status === 'COMPLETED' && bankAccountData) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Received In:', 20, finalY + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(`Bank: ${bankAccountData.bank_name}`, 20, finalY + 27);
    doc.text(`Account: ${bankAccountData.account_name}`, 20, finalY + 34);
    doc.text(`A/C No: ****${bankAccountData.account_number?.slice(-4) || 'N/A'}`, 20, finalY + 41);
  }
  
  // Declaration
  const declarationY = finalY + (order.payment_status === 'COMPLETED' && bankAccountData ? 55 : 25);
  doc.setFontSize(9);
  doc.text('Declaration', 20, declarationY);
  doc.text('We declare that this invoice shows the actual price of the', 20, declarationY + 7);
  doc.text('goods described and that all particulars are true and correct.', 20, declarationY + 14);
  
  // Signature
  doc.setFontSize(8);
  const signatureLines = doc.splitTextToSize(`for ${company.name}`, 80);
  let signatureY = declarationY + 7;
  signatureLines.forEach((line: string) => {
    doc.text(line, 130, signatureY);
    signatureY += 4;
  });
  doc.setFontSize(9);
  doc.text('Authorised Signatory', 150, declarationY + 25);
  
  // Footer
  doc.setFontSize(8);
  doc.text('This is a Computer Generated Invoice', 105, 280, { align: 'center' });
  
  return doc;
};

// Helper function to convert number to words (simplified version)
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  if (num === 0) return 'Zero';
  
  let result = '';
  
  // Handle lakhs
  if (num >= 100000) {
    const lakhs = Math.floor(num / 100000);
    result += numberToWords(lakhs) + ' Lakh ';
    num %= 100000;
  }
  
  // Handle thousands
  if (num >= 1000) {
    const thousands = Math.floor(num / 1000);
    result += numberToWords(thousands) + ' Thousand ';
    num %= 1000;
  }
  
  // Handle hundreds
  if (num >= 100) {
    result += ones[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  
  // Handle tens and ones
  if (num >= 20) {
    result += tens[Math.floor(num / 10)] + ' ';
    num %= 10;
  } else if (num >= 10) {
    result += teens[num - 10] + ' ';
    return result.trim();
  }
  
  if (num > 0) {
    result += ones[num] + ' ';
  }
  
  return result.trim();
}