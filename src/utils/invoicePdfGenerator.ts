import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

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

interface FIFOCalculation {
  totalCost: number;
  serviceCharges: number;
  taxableValue: number;
  igstAmount: number;
  totalAmount: number;
}

// FIFO calculation function
async function calculateFIFOProfit(order: any): Promise<FIFOCalculation> {
  try {
    // Get all purchase order items for USDT to calculate FIFO cost  
    const { data: purchaseItems } = await supabase
      .from('purchase_order_items')
      .select(`
        quantity,
        unit_price,
        purchase_orders!inner(
          order_date,
          status
        )
      `)
      .eq('purchase_orders.status', 'COMPLETED')
      .order('purchase_orders.order_date', { ascending: true });

    let totalCost = 0;
    let remainingQuantity = order.quantity || 1;
    
    // Apply FIFO logic to calculate buy price
    for (const item of purchaseItems || []) {
      if (remainingQuantity <= 0) break;
      
      const purchaseQuantity = item.quantity || 0;
      const purchasePrice = item.unit_price || 0;
      
      if (purchaseQuantity >= remainingQuantity) {
        totalCost += remainingQuantity * purchasePrice;
        remainingQuantity = 0;
      } else {
        totalCost += purchaseQuantity * purchasePrice;
        remainingQuantity -= purchaseQuantity;
      }
    }
    
    // If no purchase data available, use a default cost
    if (totalCost === 0) {
      totalCost = (order.total_amount || 0) * 0.95; // Assume 5% margin as fallback
    }
    
    const serviceCharges = (order.total_amount || 0) - totalCost;
    const igstAmount = serviceCharges * 0.18; // 18% IGST on service charges only
    const taxableValue = serviceCharges; // Service charges are taxable
    const totalAmount = totalCost + serviceCharges + igstAmount;
    
    return {
      totalCost,
      serviceCharges,
      taxableValue,
      igstAmount,
      totalAmount
    };
  } catch (error) {
    console.error('FIFO calculation error:', error);
    // Fallback calculation
    const serviceCharges = (order.total_amount || 0) * 0.05; // 5% service charge
    const igstAmount = serviceCharges * 0.18;
    return {
      totalCost: (order.total_amount || 0) - serviceCharges,
      serviceCharges,
      taxableValue: serviceCharges,
      igstAmount,
      totalAmount: order.total_amount || 0
    };
  }
}

export const generateInvoicePDF = async ({ order, bankAccountData, companyDetails }: InvoiceData) => {
  console.log('Starting PDF generation for order:', order.order_number);
  const doc = new jsPDF();
  
  // Calculate FIFO-based buy price and service charges
  const fifoCalculation = await calculateFIFOProfit(order);
  
  // Company details (default if not provided)
  const company = companyDetails || {
    name: "BLYNK VIRTUAL TECHNOLOGIES PRIVATE LIMITED", 
    address: "Plot No.15 First Floor Balwant Arcade",
    city: "Maharana Pratap Nagar Zone 2",
    state: "Bhopal, Madhya Pradesh, Code : 23",
    email: "blynkvirtualtechnologiespvtltd@gmail.com",
    gstin: "23AANCB2572J1ZK"
  };

  // Set font
  doc.setFont('helvetica');
  
  // Header
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('Tax Invoice', 105, 20, { align: 'center' });
  
  // Main header box
  doc.rect(15, 25, 180, 55);
  
  // Left side - Company details
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const companyNameLines = doc.splitTextToSize(company.name, 85);
  let yPos = 33;
  companyNameLines.forEach((line: string) => {
    doc.text(line, 18, yPos);
    yPos += 4;
  });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(company.address, 18, yPos + 2);
  doc.text(company.city, 18, yPos + 6);
  doc.text(company.state, 18, yPos + 10);
  doc.text(`E-Mail: ${company.email}`, 18, yPos + 14);
  if (company.gstin) {
    doc.text(`GSTIN/UIN: ${company.gstin}`, 18, yPos + 18);
  }
  
  // Vertical divider line
  doc.line(105, 25, 105, 80);
  
  // Right side - Invoice details in table format
  const invoiceNo = order.order_number || '47';
  const invoiceDate = new Date(order.order_date).toLocaleDateString('en-GB');
  
  // Create invoice details table
  const invoiceDetailsData = [
    ['Invoice No.', invoiceNo, 'Dated', invoiceDate],
    ['Delivery Note', '', 'Mode/Terms of Payment', order.payment_status === 'COMPLETED' ? 'Paid' : 'Pending'],
    ['Reference No. & Date.', '', 'Other References', ''],
    ['Buyer\'s Order No.', '', 'Dated', ''],
    ['Dispatch Doc No.', '', 'Delivery Note Date', ''],
    ['Dispatched through', '', 'Destination', ''],
    ['Terms of Delivery', '', '', '']
  ];
  
  autoTable(doc, {
    body: invoiceDetailsData,
    startY: 28,
    margin: { left: 107, right: 17 },
    tableWidth: 86,
    styles: {
      fontSize: 7,
      cellPadding: 1,
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold' },
      1: { cellWidth: 20 },
      2: { cellWidth: 22, fontStyle: 'bold' },
      3: { cellWidth: 14 }
    },
    theme: 'grid'
  });

  // Consignee section
  doc.rect(15, 85, 180, 20);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Consignee (Ship to)', 18, 93);
  doc.setFont('helvetica', 'normal');
  doc.text(order.client_name || 'Customer Name', 18, 98);
  if (order.client_phone) {
    doc.text(`Phone: ${order.client_phone}`, 18, 102);
  }
  
  // Buyer section
  doc.rect(15, 110, 180, 20);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer (Bill to)', 18, 118);
  doc.setFont('helvetica', 'normal');
  doc.text(order.client_name || 'Customer Name', 18, 123);
  if (order.client_phone) {
    doc.text(`Phone: ${order.client_phone}`, 18, 127);
  }
  
  // Items table start position
  const tableStartY = 140;
  
  // Use FIFO calculation for service charges and tax
  const serviceCharges = fifoCalculation.serviceCharges;
  const igstAmount = fifoCalculation.igstAmount;
  const totalAmount = fifoCalculation.totalAmount;
  
  // Table headers matching reference format exactly
  const headers = [['Sl\nNo.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount', 'Taxable\nValue', 'CGST', '', 'SGST/UTGST', '', 'Total\nAmount']];
  const subHeaders = [['', '', '', '', '', '', '', '', 'Rate', 'Amount', 'Rate', 'Amount', '']];
  
  // Table data - Only USDT as main product
  const productName = order.description || 'USDT';
  const quantity = order.quantity || 1;
  const rate = fifoCalculation.totalCost / quantity; // FIFO buy price
  const hsnCode = '960899'; // HSN code for USDT
  
  const tableData = [
    [
      '1', 
      productName, 
      hsnCode, 
      quantity.toString(), 
      Number(rate).toFixed(2), 
      'NOS', 
      Number(fifoCalculation.totalCost).toFixed(2),
      Number(serviceCharges).toFixed(2), // Service charges are taxable
      '9%',
      Number(igstAmount/2).toFixed(2), // Split IGST as CGST for display
      '9%',
      Number(igstAmount/2).toFixed(2), // Split IGST as SGST for display
      Number(totalAmount).toFixed(2)
    ]
  ];
  
  // Add CGST and SGST breakdown rows
  tableData.push([
    '', 'CGST', '', '', '', '', '', '', '9%', Number(igstAmount/2).toFixed(2), '', '', ''
  ]);
  
  tableData.push([
    '', 'SGST', '', '', '', '', '', '', '', '', '9%', Number(igstAmount/2).toFixed(2), ''
  ]);
  
  // Add total row
  tableData.push([
    '', 'Total', '', quantity.toString(), '', 'NOS', '', 
    Number(serviceCharges).toFixed(2),
    '', Number(igstAmount/2).toFixed(2),
    '', Number(igstAmount/2).toFixed(2),
    Number(totalAmount).toFixed(2)
  ]);
  
  autoTable(doc, {
    head: [headers[0], subHeaders[0]],
    body: tableData,
    startY: tableStartY,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      valign: 'middle',
      halign: 'center'
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' }, // Sl No
      1: { cellWidth: 35, halign: 'left' }, // Description
      2: { cellWidth: 15, halign: 'center' }, // HSN
      3: { cellWidth: 12, halign: 'center' }, // Quantity
      4: { cellWidth: 15, halign: 'right' }, // Rate
      5: { cellWidth: 8, halign: 'center' }, // per
      6: { cellWidth: 18, halign: 'right' }, // Amount
      7: { cellWidth: 15, halign: 'right' }, // Taxable Value
      8: { cellWidth: 10, halign: 'center' }, // CGST Rate
      9: { cellWidth: 15, halign: 'right' }, // CGST Amount
      10: { cellWidth: 10, halign: 'center' }, // SGST Rate
      11: { cellWidth: 15, halign: 'right' }, // SGST Amount
      12: { cellWidth: 20, halign: 'right' }, // Total Amount
    },
  });
  
  // Add bottom summary section exactly like reference
  const tableEndY = (doc as any).lastAutoTable?.finalY + 5;
  
  // Amount in words section
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Amount Chargeable (in words) INR ${numberToWords(Math.round(totalAmount))} Only`, 20, tableEndY + 10);
  
  // Tax summary table (right side)
  autoTable(doc, {
    body: [
      ['', '', '', '', '', '', '', '', '', '', '', 'Taxable\nValue', 'CGST', 'SGST/UTGST', 'E. & O.E\nTotal\nTax Amount'],
      ['', '', '', '', '', '', '', '', '', '', '', 'Rate', 'Amount', 'Rate', 'Amount', ''],
      ['', '', '', '', '', '', '', '', '', 'Total:', Number(serviceCharges).toFixed(2), '9%', Number(igstAmount/2).toFixed(2), '9%', Number(igstAmount/2).toFixed(2), Number(igstAmount).toFixed(2)]
    ],
    startY: tableEndY + 15,
    margin: { left: 95 },
    tableWidth: 100,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1,
      halign: 'center'
    },
    columnStyles: {
      9: { fontStyle: 'bold' },
      10: { fontStyle: 'bold' },
      11: { fontStyle: 'bold' },
      12: { fontStyle: 'bold' },
      13: { fontStyle: 'bold' },
      14: { fontStyle: 'bold' }
    }
  });
  
  // Tax Amount in words
  const taxWordsY = (doc as any).lastAutoTable?.finalY + 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tax Amount (in words) : INR ${numberToWords(Math.round(igstAmount))} Only`, 20, taxWordsY);
  
  // Company's Bank Details section
  const bankDetailsY = taxWordsY + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text("Company's Bank Details", 20, bankDetailsY);
  doc.setFont('helvetica', 'normal');
  
  if (bankAccountData) {
    doc.text(`A/C Holder's Name : ${bankAccountData.account_name || company.name}`, 20, bankDetailsY + 6);
    doc.text(`Bank Name : ${bankAccountData.bank_name || 'AXIS BANK'}`, 20, bankDetailsY + 11);
    doc.text(`A/C No. : ${bankAccountData.account_number || '918020115301918'}`, 20, bankDetailsY + 16);
    doc.text(`Branch & IFS Code : ${bankAccountData.ifsc_code || 'BAIRAGARH & UTIB0002979'}`, 20, bankDetailsY + 21);
    doc.text(`SWIFT Code :`, 20, bankDetailsY + 26);
  } else {
    doc.text(`A/C Holder's Name : ${company.name}`, 20, bankDetailsY + 6);
    doc.text(`Bank Name : AXIS BANK`, 20, bankDetailsY + 11);
    doc.text(`A/C No. : 918020115301918`, 20, bankDetailsY + 16);
    doc.text(`Branch & IFS Code : BAIRAGARH & UTIB0002979`, 20, bankDetailsY + 21);
    doc.text(`SWIFT Code :`, 20, bankDetailsY + 26);
  }
  
  // Declaration section
  const declarationY = bankDetailsY + 35;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration', 20, declarationY);
  doc.setFont('helvetica', 'normal');
  doc.text('We declare that this invoice shows the actual price of the goods described and that all', 20, declarationY + 5);
  doc.text('particulars are true and correct.', 20, declarationY + 10);
  
  // Company signature (right side)
  doc.setFont('helvetica', 'bold');
  doc.text(`for ${company.name}`, 130, declarationY + 5);
  doc.setFont('helvetica', 'normal');
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