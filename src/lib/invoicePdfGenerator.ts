import jsPDF from "jspdf";
import type { InvoiceGroup, CompanyInfo, GSTConfig, SignatoryConfig } from "@/types/invoice";
import { numberToWords, formatDate } from "@/lib/csvParser";

interface PDFOptions {
  company: CompanyInfo;
  gst: GSTConfig;
  signatory: SignatoryConfig;
}

export function generateInvoicesPDF(invoices: InvoiceGroup[], options: PDFOptions): jsPDF {
  const { company, gst, signatory } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;

  invoices.forEach((invoice, index) => {
    if (index > 0) doc.addPage();

    let y = 15;

    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(10, 10, 190, 277);

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

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Invoice No.: ${invoice.invoiceNumber}`, marginL, y);
    doc.text(`Dated: ${formatDate(invoice.date)}`, pageW - marginR, y, { align: "right" });
    y += 7;

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

    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Sl No.", marginL + 1, y + 5);
    doc.text("Description of Goods and Services", marginL + 15, y + 5);
    doc.text("HSN/SAC", marginL + 95, y + 5);
    doc.text("Quantity", marginL + 115, y + 5);
    doc.text("Rate", marginL + 135, y + 5);
    doc.text("Amount", pageW - marginR - 2, y + 5, { align: "right" });
    y += 8;

    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    let subtotal = 0;
    invoice.items.forEach((item, itemIdx) => {
      doc.setFont("helvetica", "normal");
      doc.text(String(itemIdx + 1), marginL + 3, y + 5);

      const descLines = doc.splitTextToSize(item.description, 75);
      descLines.forEach((line: string, i: number) => {
        doc.text(line, marginL + 15, y + 5 + i * 4);
      });

      const itemBase = gst.enabled && gst.inclusive && gst.rate > 0
        ? item.amount / (1 + gst.rate / 100)
        : item.amount;

      doc.text(item.hsnSac || "-", marginL + 95, y + 5);
      doc.text(item.quantity.toFixed(2), marginL + 115, y + 5);
      doc.text(item.rate.toFixed(2), marginL + 135, y + 5);
      doc.text(itemBase.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });

      subtotal += itemBase;
      y += Math.max(8, descLines.length * 4 + 4);
    });

    doc.line(marginL, y, pageW - marginR, y);
    y += 1;

    let taxableValue = subtotal;
    let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;

    if (gst.enabled && gst.rate > 0) {
      if (gst.type === "IGST") {
        igstAmt = taxableValue * (gst.rate / 100);
      } else {
        cgstAmt = taxableValue * (gst.rate / 200);
        sgstAmt = taxableValue * (gst.rate / 200);
      }
    }

    const totalWithTax = gst.enabled
      ? (gst.inclusive ? invoice.totalAmount : subtotal + igstAmt + cgstAmt + sgstAmt)
      : invoice.totalAmount;

    if (gst.enabled && gst.rate > 0) {
      doc.setFont("helvetica", "normal");
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
      doc.line(marginL, y, pageW - marginR, y);
      y += 1;
    }

    doc.setFont("helvetica", "bold");
    doc.text("Total", marginL + 15, y + 5);
    doc.text(totalWithTax.toFixed(2), pageW - marginR - 2, y + 5, { align: "right" });
    y += 8;
    doc.line(marginL, y, pageW - marginR, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Amount Chargeable (in words): ${numberToWords(totalWithTax)}`, marginL, y);
    y += 12;

    if (company.bankName || company.accountNumber) {
      doc.setFont("helvetica", "bold");
      doc.text("Payment Received In:", marginL, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      if (company.bankName) { doc.text(`Bank: ${company.bankName}`, marginL, y); y += 4; }
      if (company.accountName) { doc.text(`Account: ${company.accountName}`, marginL, y); y += 4; }
      if (company.accountNumber) { doc.text(`A/C No: ${company.accountNumber}`, marginL, y); y += 4; }
      y += 6;
    }

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

    y = 282;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text("This is a Computer Generated Invoice", pageW / 2, y, { align: "center" });
  });

  return doc;
}
