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
  
  // Header - Tax Invoice
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text('Tax Invoice', 105, 20, { align: 'center' });
  
  // Main container rectangle
  doc.rect(15, 25, 180, 60);
  
  // Company details section (left side)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, 18, 33);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(company.address, 18, 38);
  doc.text(company.city, 18, 42);
  doc.text(`GSTIN/UIN: ${company.gstin}`, 18, 46);
  doc.text(`State Name: ${company.state}`, 18, 50);
  doc.text(`E-Mail: ${company.email}`, 18, 54);
  
  // Vertical divider
  doc.line(105, 25, 105, 85);
  
  // Invoice details table (right side)
  const invoiceNo = order.order_number || '352';
  const invoiceDate = new Date(order.order_date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  });
  
  // Create invoice details as table
  autoTable(doc, {
    body: [
      ['Invoice No.', invoiceNo, 'Dated', invoiceDate],
      ['Delivery Note', '', 'Mode/Terms of Payment', order.payment_status === 'COMPLETED' ? 'Paid' : 'Pending'],
      ['Reference No. & Date.', '', 'Other References', ''],
      ['Buyer\'s Order No.', '', 'Dated', ''],
      ['Dispatch Doc No.', '', 'Delivery Note Date', ''],
      ['Dispatched through', '', 'Destination', ''],
      ['Terms of Delivery', '', '', '']
    ],
    startY: 28,
    margin: { left: 107, right: 17 },
    tableWidth: 86,
    styles: {
      fontSize: 7,
      cellPadding: 1,
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 16 },
      2: { cellWidth: 26, fontStyle: 'bold' },
      3: { cellWidth: 16 }
    },
    theme: 'grid'
  });

  // Buyer section only (removed Consignee section)
  doc.rect(15, 90, 180, 25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer (Bill to)', 18, 98);
  doc.setFont('helvetica', 'normal');
  doc.text(order.client_name || 'Customer Name', 18, 103);
  doc.text(`C 74 Patel Nagar Bhopal`, 18, 107);
  if (order.client_phone) {
    doc.text(`Contact: ${order.client_phone}`, 18, 111);
  }
  
  // Items table
  const tableStartY = 125;
  
  // Calculate values based on FIFO logic
  const totalSalesValue = order.total_amount || 0;
  const serviceCharges = fifoCalculation.serviceCharges;
  const usdtValue = totalSalesValue - serviceCharges; // USDT value = Total Sales - Service Charges (FIFO)
  const quantity = order.quantity || 22;
  const usdtRate = usdtValue / quantity;
  
  // Service charges calculations
  const serviceChargesTaxableValue = serviceCharges / 1.18; // Remove tax to get taxable value
  const igstAmount = serviceChargesTaxableValue * 0.18; // 18% IGST on service charges
  const finalTotalAmount = usdtValue + serviceChargesTaxableValue + igstAmount;
  
  // USDT row data (first row - non-taxable)
  const usdtRowData = [
    '1',
    'USDT',
    '960899', // HSN for USDT
    `${quantity} NOS`,
    Number(usdtRate).toFixed(2),
    'NOS',
    Number(usdtValue).toFixed(2),
    '0.00', // Taxable Value = 0
    { content: '0.00', colSpan: 2 }, // Merged IGST Rate and Amount cells
    Number(usdtValue).toFixed(2)
  ];
  
  // Service Charges row data (second row - taxable)
  const serviceChargesRowData = [
    '2',
    'Service Charges',
    '997152', // HSN for Service Charges
    '1 Per Service',
    Number(serviceChargesTaxableValue).toFixed(2),
    'Per',
    Number(serviceChargesTaxableValue).toFixed(2),
    Number(serviceChargesTaxableValue).toFixed(2), // Taxable Value = Entire value
    '18%',
    Number(igstAmount).toFixed(2),
    Number(serviceChargesTaxableValue + igstAmount).toFixed(2)
  ];
  
  // IGST summary row
  const igstRow = [
    '', 'IGST', '', '', '', '', '', '', '18 %', Number(igstAmount).toFixed(2), ''
  ];
  
  // Total row
  const totalRow = [
    '', 'Total', '', `${quantity + 1} NOS`, '', '', '', 
    Number(serviceChargesTaxableValue).toFixed(2), '', Number(igstAmount).toFixed(2), Number(finalTotalAmount).toFixed(2)
  ];
  
  // Create table with proper structure matching reference exactly
  autoTable(doc, {
    head: [
      ['Sl\nNo.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount', 'Taxable\nValue', 'IGST', '', 'Total\nAmount'],
      ['', '', '', '', '', '', '', '', 'Rate', 'Amount', '']
    ],
    body: [
      usdtRowData,
      serviceChargesRowData,
      igstRow,
      totalRow
    ],
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
    bodyStyles: {
      lineWidth: 0.1,
      lineColor: [0, 0, 0]
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 40, halign: 'left' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 8, halign: 'center' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 15, halign: 'right' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 20, halign: 'right' },
      10: { cellWidth: 22, halign: 'right' }
    }
  });
  
  // Get table end position
  const tableEndY = (doc as any).lastAutoTable?.finalY || 190;
  
  // Amount in words
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Amount Chargeable (in words) INR ${numberToWords(Math.round(finalTotalAmount))} Only`, 20, tableEndY + 8);
  
  // Tax summary table on right side - matching reference exactly
  const taxSummaryY = tableEndY + 15;
  autoTable(doc, {
    body: [
      ['', '', '', '', '', '', '', 'Taxable\nValue', 'IGST', '', 'E. & O.E\nTotal\nTax Amount'],
      ['', '', '', '', '', '', '', 'Rate', 'Amount', '', ''],
      ['', '', '', '', '', '', 'Total:', Number(serviceChargesTaxableValue).toFixed(2), '18%', Number(igstAmount).toFixed(2), Number(igstAmount).toFixed(2)]
    ],
    startY: taxSummaryY,
    margin: { left: 90 },
    tableWidth: 105,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1,
      halign: 'center'
    },
    columnStyles: {
      6: { fontStyle: 'bold' },
      7: { fontStyle: 'bold', halign: 'right' },
      8: { fontStyle: 'bold' },
      9: { fontStyle: 'bold', halign: 'right' },
      10: { fontStyle: 'bold', halign: 'right' }
    }
  });
  
  // Tax amount in words
  const taxAmountY = (doc as any).lastAutoTable?.finalY + 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Tax Amount (in words) : INR ${numberToWords(Math.round(igstAmount))} Only`, 20, taxAmountY);
  
  // Left section - Company's Bank Details
  const bankDetailsY = taxAmountY + 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text("Company's Bank Details", 20, bankDetailsY);
  doc.setFont('helvetica', 'normal');
  
  if (bankAccountData) {
    doc.text(`A/C Holder's Name    : ${bankAccountData.account_name || company.name}`, 20, bankDetailsY + 6);
    doc.text(`Bank Name           : ${bankAccountData.bank_name || 'AXIS BANK'}`, 20, bankDetailsY + 11);
    doc.text(`A/C No.             : ${bankAccountData.account_number || '918020115301918'}`, 20, bankDetailsY + 16);
    doc.text(`Branch & IFS Code   : ${bankAccountData.ifsc_code || 'BAIRAGARH & UTIB0002979'}`, 20, bankDetailsY + 21);
    doc.text(`SWIFT Code          :`, 20, bankDetailsY + 26);
  } else {
    doc.text(`A/C Holder's Name    : ${company.name}`, 20, bankDetailsY + 6);
    doc.text(`Bank Name           : AXIS BANK`, 20, bankDetailsY + 11);
    doc.text(`A/C No.             : 918020115301918`, 20, bankDetailsY + 16);
    doc.text(`Branch & IFS Code   : BAIRAGARH & UTIB0002979`, 20, bankDetailsY + 21);
    doc.text(`SWIFT Code          :`, 20, bankDetailsY + 26);
  }
  
  // Declaration section (left bottom)
  const declarationY = bankDetailsY + 35;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Declaration', 20, declarationY);
  doc.setFont('helvetica', 'normal');
  doc.text('We declare that this invoice shows the actual price of the goods', 20, declarationY + 5);
  doc.text('described and that all particulars are true and correct.', 20, declarationY + 10);
  
  // Company signature (right side)
  doc.setFont('helvetica', 'bold');
  doc.text(`for ${company.name}`, 130, declarationY);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorised Signatory', 150, declarationY + 20);
  
  // Footer
  doc.setFontSize(8);
  doc.text('This is a Computer Generated Invoice', 105, 285, { align: 'center' });
  
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