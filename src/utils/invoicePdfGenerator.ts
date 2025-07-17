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
    city: "Malviya Pralap Nagar Zone 2",
    state: "Bhopal, Madhya Pradesh",
    email: "blynkvirtualtechnologiespvtltd@gmail.com",
    gstin: "23AANCB2572J1ZK"
  };

  // Set font
  doc.setFont('helvetica');
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text('INVOICE', 105, 20, { align: 'center' });
  
  // Company details box
  doc.setFontSize(10);
  doc.rect(15, 30, 180, 40);
  
  // Left side - Company details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, 20, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(company.address, 20, 47);
  doc.text(company.city, 20, 52);
  doc.text(company.state, 20, 57);
  doc.text(`E-Mail: ${company.email}`, 20, 62);
  if (company.gstin) {
    doc.text(`GSTIN/UIN: ${company.gstin}`, 20, 67);
  }
  
  // Right side - Invoice details
  const invoiceNo = order.order_number || '47';
  const invoiceDate = new Date(order.order_date).toLocaleDateString('en-GB');
  
  doc.setFontSize(10);
  doc.text('Invoice No.', 120, 40);
  doc.text('Dated', 160, 40);
  doc.text(invoiceNo, 120, 45);
  doc.text(invoiceDate, 160, 45);
  
  doc.text('Delivery Note', 120, 52);
  doc.text('Mode/Terms of Payment', 160, 52);
  doc.text('', 120, 57);
  doc.text(order.payment_status === 'COMPLETED' ? 'Paid' : 'Pending', 160, 57);
  
  // Customer details box
  doc.rect(15, 75, 180, 25);
  
  // Customer details
  doc.setFontSize(10);
  doc.text('Buyer (Bill to)', 20, 85);
  doc.setFont('helvetica', 'bold');
  doc.text(order.client_name || 'Customer Name', 20, 92);
  doc.setFont('helvetica', 'normal');
  if (order.client_phone) {
    doc.text(`Phone: ${order.client_phone}`, 20, 97);
  }
  
  // Items table
  const tableStartY = 110;
  
  // Table headers
  const headers = [['Sl No.', 'Description of Goods and Services', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount']];
  
  // Table data
  const productName = order.description || 'USDT';
  const quantity = order.quantity || 1;
  const rate = order.price_per_unit || order.total_amount;
  const amount = order.total_amount;
  
  const tableData = [
    ['1', productName, '', quantity.toString(), `₹${Number(rate).toFixed(2)}`, 'NOS', `₹${Number(amount).toFixed(2)}`]
  ];
  
  // Add round off row if needed
  const roundOff = Math.round(amount) - amount;
  if (Math.abs(roundOff) > 0.01) {
    tableData.push(['', 'Round Off', '', '', '', '', `₹${roundOff.toFixed(2)}`]);
  }
  
  // Total row
  const totalAmount = Math.round(amount);
  tableData.push(['', '', '', '', '', 'Total', `₹${totalAmount.toFixed(2)}`]);
  
  autoTable(doc, {
    head: headers,
    body: tableData,
    startY: tableStartY,
    theme: 'grid',
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 60 },
      2: { cellWidth: 20 },
      3: { cellWidth: 20 },
      4: { cellWidth: 25 },
      5: { cellWidth: 15 },
      6: { cellWidth: 25 },
    },
  });
  
  // Amount in words
  // Get the final Y position from the table
  const tableEndY = (doc as any).lastAutoTable?.finalY || tableStartY + 50;
  const finalY = tableEndY + 10;
  doc.setFontSize(10);
  doc.text('Amount Chargeable (in words)', 20, finalY);
  doc.setFont('helvetica', 'bold');
  doc.text(numberToWords(totalAmount) + ' Only', 20, finalY + 7);
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
  doc.text(`for ${company.name}`, 130, declarationY + 7);
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