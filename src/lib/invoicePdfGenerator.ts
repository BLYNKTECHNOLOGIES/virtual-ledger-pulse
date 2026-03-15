import jsPDF from "jspdf";
import type { InvoiceGroup, CompanyInfo, GSTConfig, SignatoryConfig } from "@/types/invoice";
import { numberToWords, formatDate } from "@/lib/csvParser";

interface PDFOptions {
  company: CompanyInfo;
  gst: GSTConfig;
  signatory: SignatoryConfig;
  note?: string;
}

// Green theme colors (RGB)
const GREEN_PRIMARY: [number, number, number] = [118, 185, 71]; // #76B947
const GREEN_DARK: [number, number, number] = [85, 150, 45];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY_TEXT: [number, number, number] = [80, 80, 80];
const LIGHT_BG: [number, number, number] = [245, 250, 242];

function formatINR(val: number): string {
  return `Rs. ${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


export function generateInvoicesPDF(invoices: InvoiceGroup[], options: PDFOptions): jsPDF {
  const { company, gst, signatory, note } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  const rightEdge = pageW - marginR;

  invoices.forEach((invoice, index) => {
    if (index > 0) doc.addPage();

    const isFinancial = invoice.category === "financial_intermediation";
    let y = 14;

    // ── Company Header ──
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLACK);
    doc.text(company.name, marginL, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY_TEXT);
    company.address.forEach((line) => {
      doc.text(line, marginL, y);
      y += 3.5;
    });
    if (company.email) {
      doc.text(`Email: ${company.email}`, marginL, y);
      y += 3.5;
    }
    if (company.gstin) {
      doc.text(`GSTIN Number: ${company.gstin}`, marginL, y);
      y += 3.5;
    }
    y += 2;

    // ── Green divider line ──
    doc.setDrawColor(...GREEN_PRIMARY);
    doc.setLineWidth(0.8);
    doc.line(marginL, y, rightEdge, y);
    y += 6;

    // ── "Tax Invoice" title ──
    const headerText = gst.enabled ? "Tax Invoice" : "Invoice";
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN_PRIMARY);
    doc.text(headerText, pageW / 2, y, { align: "center" });
    y += 3;

    // Green underline below title
    const titleWidth = doc.getTextWidth(headerText);
    doc.setLineWidth(0.5);
    doc.line(pageW / 2 - titleWidth / 2, y, pageW / 2 + titleWidth / 2, y);
    y += 8;

    // ── Bill To (left) & Invoice Details (right) ──
    doc.setTextColor(...BLACK);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Bill To", marginL, y);
    doc.text("Invoice Details", rightEdge, y, { align: "right" });
    y += 5;

    const billToStartY = y;

    // Buyer info
    if (invoice.buyerName) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.buyerName, marginL, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY_TEXT);
      if (invoice.buyerAddress) { doc.text(invoice.buyerAddress, marginL, y); y += 3.5; }
      if (invoice.buyerGstin) { doc.text(`GSTIN: ${invoice.buyerGstin}`, marginL, y); y += 3.5; }
      if (invoice.buyerContact) { doc.text(`Contact: ${invoice.buyerContact}`, marginL, y); y += 3.5; }
    }

    // Invoice details on right side
    let ry = billToStartY;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY_TEXT);
    doc.text(`Invoice No.: ${invoice.invoiceNumber}`, rightEdge, ry, { align: "right" });
    ry += 5;
    doc.text(`Date: ${formatDate(invoice.date)}`, rightEdge, ry, { align: "right" });

    y = Math.max(y, ry) + 10;

    // ── Items Table ──
    // Table header with green background
    const colX = {
      hash: marginL + 1,
      name: marginL + 10,
      sac: marginL + 82,
      qty: marginL + 102,
      unit: marginL + 115,
      price: marginL + 130,
      igst: marginL + 152,
      amount: rightEdge - 2,
    };

    const headerH = 7;

    // Green header bar
    doc.setFillColor(...GREEN_PRIMARY);
    doc.rect(marginL, y, contentW, headerH, "F");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    const headerY = y + 5;
    doc.text("#", colX.hash, headerY);
    doc.text("Item name", colX.name, headerY);
    doc.text("HSN/SAC", colX.sac, headerY);
    doc.text("Quantity", colX.qty, headerY);
    doc.text("Unit", colX.unit, headerY);
    doc.text("Price/unit", colX.price, headerY);
    if (gst.enabled && gst.rate > 0) {
      doc.text(gst.type === "IGST" ? "IGST" : "CGST/SGST", colX.igst, headerY);
    }
    doc.text("Amount", colX.amount, headerY, { align: "right" });
    y += headerH + 1;

    // Table rows
    let subtotal = 0;
    doc.setTextColor(...BLACK);

    invoice.items.forEach((item, itemIdx) => {
      // Alternate row background
      if (itemIdx % 2 === 0) {
        doc.setFillColor(...LIGHT_BG);
        doc.rect(marginL, y, contentW, 8, "F");
      }

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);

      let taxableValue: number;
      if (isFinancial) {
        taxableValue = item.serviceMargin || item.amount;
      } else {
        taxableValue = gst.enabled && gst.inclusive && gst.rate > 0
          ? item.amount / (1 + gst.rate / 100)
          : item.amount;
      }

      const unitLabel = item.unit || (isFinancial ? "Service" : "NOS");
      const rowY = y + 5.5;

      doc.text(String(itemIdx + 1), colX.hash, rowY);

      // Item name - wrap if needed
      const descLines = doc.splitTextToSize(item.description, 68);
      descLines.forEach((line: string, i: number) => {
        doc.text(line, colX.name, rowY + i * 3.5);
      });

      doc.text(item.hsnSac || "-", colX.sac, rowY);
      doc.text(item.quantity.toFixed(0), colX.qty + 5, rowY, { align: "center" });
      doc.text(unitLabel, colX.unit, rowY);
      doc.text(formatINR(taxableValue), colX.price, rowY);

      if (gst.enabled && gst.rate > 0) {
        if (gst.type === "IGST") {
          const igst = taxableValue * (gst.rate / 100);
          doc.text(`${formatINR(igst)}`, colX.igst, rowY);
          doc.setFontSize(6.5);
          doc.setTextColor(...GRAY_TEXT);
          doc.text(`(${gst.rate}%)`, colX.igst + doc.getTextWidth(`${formatINR(taxableValue * (gst.rate / 100))}`) + 1, rowY);
          doc.setFontSize(8);
          doc.setTextColor(...BLACK);
        } else {
          const half = taxableValue * (gst.rate / 200);
          doc.text(formatINR(half * 2), colX.igst, rowY);
        }
      }

      const rowTotal = gst.enabled && gst.rate > 0
        ? taxableValue + taxableValue * (gst.rate / 100)
        : taxableValue;
      doc.text(formatINR(rowTotal), colX.amount, rowY, { align: "right" });

      subtotal += taxableValue;
      y += Math.max(8, descLines.length * 3.5 + 5);
    });

    // Spacer after items
    y += 5;

    // ── Totals Section ──
    // Divider line
    doc.setDrawColor(...GREEN_DARK);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, rightEdge, y);
    y += 1;

    // Total row with IGST column value
    let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
    if (gst.enabled && gst.rate > 0) {
      if (gst.type === "IGST") {
        igstAmt = subtotal * (gst.rate / 100);
      } else {
        cgstAmt = subtotal * (gst.rate / 200);
        sgstAmt = subtotal * (gst.rate / 200);
      }
    }
    const totalWithTax = gst.enabled ? subtotal + igstAmt + cgstAmt + sgstAmt : subtotal;

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Total", marginL + 1, y + 5);
    if (gst.enabled && gst.rate > 0) {
      doc.text(formatINR(igstAmt + cgstAmt + sgstAmt), colX.igst, y + 5);
    }
    doc.text(formatINR(totalWithTax), colX.amount, y + 5, { align: "right" });
    y += 8;

    doc.setDrawColor(...GREEN_DARK);
    doc.line(marginL, y, rightEdge, y);
    y += 6;

    // Sub Total & GST breakdown (right-aligned section)
    const labelX = pageW / 2 + 10;
    const valX = rightEdge;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_TEXT);
    doc.text("Sub Total", labelX, y);
    doc.text(formatINR(subtotal), valX, y, { align: "right" });
    y += 5;

    if (gst.enabled && gst.rate > 0) {
      if (gst.type === "IGST") {
        doc.text(`GST(${gst.rate}%)`, labelX, y);
        doc.text(formatINR(igstAmt), valX, y, { align: "right" });
        y += 5;
      } else {
        doc.text(`CGST(${gst.rate / 2}%)`, labelX, y);
        doc.text(formatINR(cgstAmt), valX, y, { align: "right" });
        y += 5;
        doc.text(`SGST(${gst.rate / 2}%)`, labelX, y);
        doc.text(formatINR(sgstAmt), valX, y, { align: "right" });
        y += 5;
      }
    }

    // Green Total bar
    doc.setFillColor(...GREEN_PRIMARY);
    doc.rect(labelX - 2, y - 1, valX - labelX + 4, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    doc.text("Total", labelX, y + 4);
    doc.text(formatINR(totalWithTax), valX, y + 4, { align: "right" });
    y += 10;

    doc.setTextColor(...BLACK);

    // ── Invoice Amount In Words (left side) ──
    const wordsStartY = y - 20; // align with subtotal section
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("Invoice Amount In Words", marginL, wordsStartY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const wordsText = numberToWords(totalWithTax);
    const wordsLines = doc.splitTextToSize(wordsText, pageW / 2 - marginL - 5);
    wordsLines.forEach((line: string, i: number) => {
      doc.text(line, marginL, wordsStartY + 4 + i * 3.5);
    });

    y += 2;

    // ── Transaction Reference (Financial Intermediation only) ──
    if (isFinancial && invoice.items.length > 0) {
      const totalTransactionValue = invoice.items.reduce((s, it) => s + (it.transactionValue || 0), 0);
      const totalServiceMargin = invoice.items.reduce((s, it) => s + (it.serviceMargin || 0), 0);
      const totalGstOnMargin = totalServiceMargin * (gst.rate / 100);

      const utrs = invoice.items.map(it => it.utrReference).filter(Boolean);
      const marginPcts = invoice.items
        .filter(it => it.marginType === "percentage" && it.marginPercentage)
        .map(it => it.marginPercentage);
      const uniquePcts = [...new Set(marginPcts)];

      // Section header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GREEN_DARK);
      doc.text("Transaction Reference", marginL, y);
      y += 6;

      // Reference details in a clean format
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLACK);

      const refLabelX = marginL + 2;
      const refValX = marginL + 52;

      doc.setFont("helvetica", "normal");
      doc.text("Transaction Value:", refLabelX, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(totalTransactionValue), refValX, y);
      y += 5;

      if (utrs.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.text("UTR / Payment Reference:", refLabelX, y);
        doc.setFont("helvetica", "bold");
        doc.text(utrs.join(", "), refValX, y);
        y += 5;
      }

      if (uniquePcts.length > 0) {
        doc.setFont("helvetica", "normal");
        doc.text("Margin Percentage:", refLabelX, y);
        doc.setFont("helvetica", "bold");
        doc.text(`${uniquePcts.join(", ")}%`, refValX, y);
        y += 5;
      }

      doc.setFont("helvetica", "normal");
      doc.text("Service Margin:", refLabelX, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(totalServiceMargin), refValX, y);
      y += 5;

      doc.setFont("helvetica", "normal");
      doc.text(`GST (${gst.rate}%):`, refLabelX, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatINR(totalGstOnMargin), refValX, y);
      y += 8;
    }

    // ── Terms / Note ──
    const invoiceNote = isFinancial ? (note || "") : "";
    if (invoiceNote) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...BLACK);
      doc.text("Terms And Conditions", marginL, y);
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_TEXT);
      const noteLines = doc.splitTextToSize(invoiceNote, contentW);
      noteLines.forEach((line: string) => {
        doc.text(line, marginL, y);
        y += 3.5;
      });
      y += 5;
    }

    // ── Pay To ──
    if (company.bankName || company.accountNumber) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text("Pay To:", marginL, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_TEXT);
      if (company.bankName) { doc.text(`Bank Name: ${company.bankName}`, marginL, y); y += 4; }
      if (company.accountNumber) { doc.text(`Bank Account No.: ${company.accountNumber}`, marginL, y); y += 4; }
      if (company.accountName) { doc.text(`Account Holder's Name: ${company.accountName}`, marginL, y); y += 4; }
      y += 5;
    }

    // ── Declaration ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BLACK);
    doc.text("Declaration", marginL, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_TEXT);
    const declText = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    const declLines = doc.splitTextToSize(declText, contentW);
    declLines.forEach((line: string) => {
      doc.text(line, marginL, y);
      y += 3.5;
    });

    // ── Signatory (bottom right) ──
    let sigY = 255;
    if (signatory.enabled) {
      if (signatory.signatureDataUrl) {
        try {
          doc.addImage(signatory.signatureDataUrl, "PNG", rightEdge - 45, sigY - 18, 40, 15);
        } catch (e) { /* fallback */ }
      }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      doc.text(company.name, rightEdge, sigY, { align: "right" });
      sigY += 5;
      if (signatory.name) {
        doc.setFont("helvetica", "normal");
        doc.text(signatory.name, rightEdge, sigY, { align: "right" });
        sigY += 5;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Authorised Signatory", rightEdge, sigY, { align: "right" });
    } else {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      doc.text(company.name, rightEdge, sigY, { align: "right" });
      sigY += 8;
      doc.text("Authorised Signatory", rightEdge, sigY, { align: "right" });
    }

    // ── Footer ──
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_TEXT);
    doc.text('"This is a computer-generated invoice"', pageW / 2, 285, { align: "center" });
  });

  return doc;
}
