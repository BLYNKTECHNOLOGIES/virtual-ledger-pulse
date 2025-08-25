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
  
  // Use FIFO calculation for service charges and tax
  const serviceCharges = fifoCalculation.serviceCharges;
  const igstAmount = fifoCalculation.igstAmount;
  const totalAmount = fifoCalculation.totalAmount;
  
  // Table headers matching reference format exactly
  const headers = [['Sl No.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount', 'Taxable Value', 'IGST', '', 'Total Amount']];
  const subHeaders = [['', '', '', '', '', '', '', '', 'Rate', 'Amount', '']];
  
  // Table data - USDT product and Service Charges as separate lines
  const productName = order.description || 'USDT';
  const quantity = order.quantity || 1;
  const rate = order.price_per_unit || (order.total_amount / quantity);
  const hsnCode = '960899'; // HSN code for USDT
  
  const tableData = [
    [
      '1', 
      productName, 
      hsnCode, 
      quantity.toString(), 
      Number(rate).toFixed(2), 
      'NOS', 
      Number(order.total_amount).toFixed(2),
      '0.00', // USDT itself is not taxable
      '',
      '0.00',
      Number(order.total_amount).toFixed(2)
    ],
    [
      '2',
      'Service Charges',
      '998314', // SAC code for service charges
      '1',
      Number(serviceCharges).toFixed(2),
      'NOS',
      Number(serviceCharges).toFixed(2),
      Number(serviceCharges).toFixed(2), // Service charges are taxable
      '18%',
      Number(igstAmount).toFixed(2),
      Number(serviceCharges + igstAmount).toFixed(2)
    ]
  ];
  
  // Add IGST breakdown row
  tableData.push([
    '', 'IGST', '', '', '', '', '', '', '18%', Number(igstAmount).toFixed(2), ''
  ]);
  
  // Add total row
  tableData.push([
    '', 'Total', '', quantity.toString(), '', '', 
    Number(totalAmount).toFixed(2), 
    Number(serviceCharges).toFixed(2),
    '', Number(igstAmount).toFixed(2),
    Number(totalAmount).toFixed(2)
  ]);
  
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
      0: { cellWidth: 15 }, // Sl No
      1: { cellWidth: 40 }, // Description
      2: { cellWidth: 20 }, // HSN
      3: { cellWidth: 15 }, // Quantity
      4: { cellWidth: 20 }, // Rate
      5: { cellWidth: 10 }, // per
      6: { cellWidth: 20 }, // Amount
      7: { cellWidth: 20 }, // Taxable Value
      8: { cellWidth: 15 }, // IGST Rate
      9: { cellWidth: 20 }, // IGST Amount
      10: { cellWidth: 25 }, // Total Amount
    },
  });
  
  // Add summary table exactly like reference
  const taxSummaryY = (doc as any).lastAutoTable?.finalY + 10 || tableStartY + 80;
  
  autoTable(doc, {
    body: [
      ['', '', '', '', '', '', '', 'Taxable Value', 'IGST', 'Total Tax Amount'],
      ['', '', '', '', '', '', '', Number(serviceCharges).toFixed(2), Number(igstAmount).toFixed(2), Number(igstAmount).toFixed(2)],
      ['', '', '', '', '', '', 'Total:', Number(serviceCharges).toFixed(2), Number(igstAmount).toFixed(2), Number(totalAmount).toFixed(2)]
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
      9: { fontStyle: 'bold' }
    }
  });
  
  // Amount in words
  const tableEndY = (doc as any).lastAutoTable?.finalY || tableStartY + 50;
  const finalY = tableEndY + 10;
  doc.setFontSize(10);
  doc.text('Amount Chargeable (in words)  INR ' + numberToWords(Math.round(totalAmount)) + ' Only', 20, finalY);
  doc.setFontSize(9);
  doc.text('Tax Amount (in words) : INR ' + numberToWords(Math.round(igstAmount)) + ' Only', 20, finalY + 7);
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