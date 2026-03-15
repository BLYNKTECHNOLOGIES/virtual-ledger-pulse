import jsPDF from "jspdf";
import type { InvoiceGroup, CompanyInfo, GSTConfig, SignatoryConfig } from "@/types/invoice";
import { numberToWords, formatDate } from "@/lib/csvParser";

interface PDFOptions {
  company: CompanyInfo;
  gst: GSTConfig;
  signatory: SignatoryConfig;
  note?: string;
}

export function generateInvoicesPDF(invoices: InvoiceGroup[], options: PDFOptions): jsPDF {
  const { company, gst, signatory, note } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;

  invoices.forEach((invoice, index) => {
    if (index > 0) doc.addPage();

    const isFinancial = invoice.category === "financial_intermediation";
    let y = 15;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const headerText = gst.enabled ? "TAX INVOICE" : "INVOICE";
    doc.text(headerText, pageW / 2, y + 5, { align: "center" });
    y += 12;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(company.name, pageW / 2, y + 5, { align: "center" });
    y += 10;

    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 5;

    // Invoice number & date
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice No.: ${invoice.invoiceNumber}`, marginL, y);
    doc.text(`Dated: ${formatDate(invoice.date)}`, pageW - marginR, y, { align: "right" });
    y += 7;

    // Company address
    doc.setFontSize(8);
    company.address.forEach((line) => {
      doc.text(line, marginL, y);
      y += 4;
    });
    if (company.email) {
      doc.text(`E-Mail: ${company.email}`, marginL, y);
      y += 4;
    }
    if (company.gstin) {
      doc.text(`GSTIN/UIN: ${company.gstin}`, marginL, y);
      y += 4;
    }
    y += 3;

    doc.line(marginL, y, pageW - marginR, y);
    y += 6;

    // Buyer details
    if (invoice.buyerName) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Buyer (Bill to)", marginL, y);
      y += 6;
      doc.setFontSize(11);
      doc.text(invoice.buyerName, marginL, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      if (invoice.buyerAddress) { doc.text(invoice.buyerAddress, marginL, y); y += 4; }
      if (invoice.buyerGstin) { doc.text(`GSTIN: ${invoice.buyerGstin}`, marginL, y); y += 4; }
      if (invoice.buyerContact) { doc.text(`Contact: ${invoice.buyerContact}`, marginL, y); y += 4; }
      y += 4;
    }

    // Table header
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Sl No.", marginL + 1, y + 5);
    doc.text("Description of Goods and Services", marginL + 15, y + 5);
    doc.text("HSN/SAC", marginL + 90, y + 5);
    doc.text("Qty", marginL + 110, y + 5);
    doc.text("Unit", marginL + 120, y + 5);
    doc.text("Taxable Value", marginL + 135, y + 5);

    if (gst.enabled) {
      if (gst.type === "IGST") {
        doc.text("IGST", marginL + 155, y + 5);
      } else {
        doc.text("CGST", marginL + 150, y + 5);
        doc.text("SGST", marginL + 163, y + 5);
      }
    }
    doc.text("Amount", pageW - marginR - 2, y + 5, { align: "right" });
    y += 8;

    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    // Table rows
    let subtotal = 0;
    invoice.items.forEach((item, itemIdx) => {
      doc.setFont("helvetica", "normal");
      doc.text(String(itemIdx + 1), marginL + 3, y + 5);

      const descLines = doc.splitTextToSize(item.description, 70);
      descLines.forEach((line: string, i: number) => {
        doc.text(line, marginL + 15, y + 5 + i * 4);
      });

      let taxableValue: number;
      if (isFinancial) {
        // For financial intermediation, taxable value = service margin
        taxableValue = item.serviceMargin || item.amount;
      } else {
        taxableValue = gst.enabled && gst.inclusive && gst.rate > 0
          ? item.amount / (1 + gst.rate / 100)
          : item.amount;
      }

      const unitLabel = item.unit || (isFinancial ? "Service" : "NOS");

      doc.text(item.hsnSac || "-", marginL + 90, y + 5);
      doc.text(item.quantity.toFixed(0), marginL + 110, y + 5);
      doc.text(unitLabel, marginL + 120, y + 5);
      doc.text(taxableValue.toFixed(2), marginL + 140, y + 5);

      if (gst.enabled && gst.rate > 0) {
        if (gst.type === "IGST") {
          const igst = taxableValue * (gst.rate / 100);
          doc.text(igst.toFixed(2), marginL + 155, y + 5);
        } else {
          const half = taxableValue * (gst.rate / 200);
          doc.text(half.toFixed(2), marginL + 150, y + 5);
          doc.text(half.toFixed(2), marginL + 163, y + 5);
        }
      }

      const rowTotal = gst.enabled && gst.rate > 0
        ? taxableValue + taxableValue * (gst.rate / 100)
        : taxableValue;

      doc.text(rowTotal.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });

      subtotal += taxableValue;
      y += Math.max(8, descLines.length * 4 + 4);
    });

    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    // Tax totals
    let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
    if (gst.enabled && gst.rate > 0) {
      if (gst.type === "IGST") {
        igstAmt = subtotal * (gst.rate / 100);
      } else {
        cgstAmt = subtotal * (gst.rate / 200);
        sgstAmt = subtotal * (gst.rate / 200);
      }
    }

    const totalWithTax = gst.enabled
      ? subtotal + igstAmt + cgstAmt + sgstAmt
      : subtotal;

    // Sub Total
    doc.setFont("helvetica", "normal");
    doc.text("Sub Total", marginL + 15, y + 5);
    doc.text(subtotal.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
    y += 7;

    if (gst.enabled && gst.rate > 0) {
      if (gst.type === "IGST") {
        doc.text(`IGST @ ${gst.rate}%`, marginL + 15, y + 5);
        doc.text(igstAmt.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
        y += 7;
      } else {
        doc.text(`CGST @ ${gst.rate / 2}%`, marginL + 15, y + 5);
        doc.text(cgstAmt.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
        y += 7;
        doc.text(`SGST @ ${gst.rate / 2}%`, marginL + 15, y + 5);
        doc.text(sgstAmt.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
        y += 7;
      }
    }

    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    // Total
    doc.setFont("helvetica", "bold");
    doc.text("Total", marginL + 15, y + 5);
    doc.text(totalWithTax.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
    y += 8;
    doc.line(marginL, y, pageW - marginR, y);
    y += 7;

    // Amount in words
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Amount Chargeable (in words): ${numberToWords(totalWithTax)}`, marginL, y);
    y += 8;

    // Transaction Reference section (Financial Intermediation only)
    if (isFinancial && invoice.items.length > 0) {
      const totalTransactionValue = invoice.items.reduce((s, it) => s + (it.transactionValue || 0), 0);
      const totalServiceMargin = invoice.items.reduce((s, it) => s + (it.serviceMargin || 0), 0);
      const totalGstOnMargin = totalServiceMargin * (gst.rate / 100);

      // Collect UTRs
      const utrs = invoice.items
        .map(it => it.utrReference)
        .filter(Boolean);

      // Determine margin percentage display
      const marginPcts = invoice.items
        .filter(it => it.marginType === "percentage" && it.marginPercentage)
        .map(it => it.marginPercentage);
      const uniquePcts = [...new Set(marginPcts)];

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Transaction Reference", marginL, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Transaction Value: \u20B9${totalTransactionValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, marginL, y);
      y += 4;
      if (utrs.length > 0) {
        doc.text(`UTR / Payment Reference: ${utrs.join(", ")}`, marginL, y);
        y += 4;
      }
      if (uniquePcts.length > 0) {
        doc.text(`Margin Percentage: ${uniquePcts.join(", ")}%`, marginL, y);
        y += 4;
      }
      doc.text(`Service Margin: \u20B9${totalServiceMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, marginL, y);
      y += 4;
      doc.text(`GST (${gst.rate}%): \u20B9${totalGstOnMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, marginL, y);
      y += 8;
    }

    // Bank details
    if (company.bankName || company.accountNumber) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Pay To:", marginL, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      if (company.bankName) { doc.text(`Bank: ${company.bankName}`, marginL, y); y += 4; }
      if (company.accountName) { doc.text(`Account: ${company.accountName}`, marginL, y); y += 4; }
      if (company.accountNumber) { doc.text(`A/C No: ${company.accountNumber}`, marginL, y); y += 4; }
      y += 6;
    }

    // Note (for financial intermediation)
    const invoiceNote = isFinancial ? (note || "") : "";
    if (invoiceNote) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      const noteLines = doc.splitTextToSize(`Note: ${invoiceNote}`, contentW);
      noteLines.forEach((line: string) => {
        doc.text(line, marginL, y);
        y += 3.5;
      });
      y += 4;
    }

    // Declaration
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Declaration", marginL, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const declText = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    const declLines = doc.splitTextToSize(declText, contentW);
    declLines.forEach((line: string) => {
      doc.text(line, marginL, y);
      y += 4;
    });

    // Signatory
    y = 245;
    if (signatory.enabled) {
      if (signatory.signatureDataUrl) {
        try {
          doc.addImage(signatory.signatureDataUrl, "PNG", pageW - marginR - 45, y - 20, 40, 15);
        } catch (e) {
          // Fallback if image fails
        }
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`For ${company.name}`, pageW - marginR, y, { align: "right" });
      y += 6;
      if (signatory.name) {
        doc.setFont("helvetica", "normal");
        doc.text(signatory.name, pageW - marginR, y, { align: "right" });
        y += 6;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Authorised Signatory", pageW - marginR, y, { align: "right" });
    } else {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Authorised Signatory", pageW - marginR, y, { align: "right" });
    }

    // Footer
    y = 282;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text("This is a Computer Generated Invoice", pageW / 2, y, { align: "center" });
  });

  return doc;
}
