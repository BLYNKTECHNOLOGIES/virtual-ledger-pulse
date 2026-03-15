import jsPDF from "jspdf";
import type { InvoiceGroup, CompanyInfo, GSTConfig, SignatoryConfig, InvoiceTemplateId } from "@/types/invoice";
import { numberToWords, formatDate } from "@/lib/csvParser";
import { getTemplate, type InvoiceTemplate } from "@/lib/invoiceTemplates";

interface PDFOptions {
  company: CompanyInfo;
  gst: GSTConfig;
  signatory: SignatoryConfig;
  note?: string;
  templateId?: InvoiceTemplateId;
}

function formatINR(val: number): string {
  return `Rs. ${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateInvoicesPDF(invoices: InvoiceGroup[], options: PDFOptions): jsPDF {
  const { company, gst, signatory, note, templateId } = options;
  const t = getTemplate(templateId || "classic_green");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  const rightEdge = pageW - marginR;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  invoices.forEach((invoice, index) => {
    if (index > 0) doc.addPage();

    const isFinancial = invoice.category === "financial_intermediation";
    let y = 10;

    // ── Top accent bar ──
    if (t.style.topAccentBarHeight > 0) {
      setFill(t.colors.primary);
      doc.rect(0, 0, pageW, t.style.topAccentBarHeight, "F");
      y = t.style.topAccentBarHeight + 6;
    }

    // ── Outer border ──
    if (t.style.outerBorder) {
      setDraw(t.colors.border);
      doc.setLineWidth(0.5);
      doc.rect(8, Math.max(t.style.topAccentBarHeight, 5), 194, 282 - Math.max(t.style.topAccentBarHeight, 5));
      y = Math.max(y, t.style.topAccentBarHeight + 6);
    }

    // ── Title (top position) ──
    if (t.style.titlePosition === "top") {
      const headerText = gst.enabled ? "TAX INVOICE" : "INVOICE";
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.primary);
      if (t.style.titleAlign === "center") {
        doc.text(headerText, pageW / 2, y + 5, { align: "center" });
      } else {
        doc.text(headerText, marginL, y + 5);
      }
      y += 14;
    }

    // ── Company Header ──
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    setColor(t.colors.bodyText);
    if (t.style.companyAlign === "center") {
      doc.text(company.name, pageW / 2, y, { align: "center" });
    } else {
      doc.text(company.name, marginL, y);
    }
    y += 6;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setColor(t.colors.mutedText);
    company.address.forEach((line) => {
      if (t.style.companyAlign === "center") {
        doc.text(line, pageW / 2, y, { align: "center" });
      } else {
        doc.text(line, marginL, y);
      }
      y += 3.5;
    });
    if (company.email) {
      const emailText = `Email: ${company.email}`;
      if (t.style.companyAlign === "center") {
        doc.text(emailText, pageW / 2, y, { align: "center" });
      } else {
        doc.text(emailText, marginL, y);
      }
      y += 3.5;
    }
    if (company.gstin) {
      const gstinText = `GSTIN Number: ${company.gstin}`;
      if (t.style.companyAlign === "center") {
        doc.text(gstinText, pageW / 2, y, { align: "center" });
      } else {
        doc.text(gstinText, marginL, y);
      }
      y += 3.5;
    }
    y += 2;

    // ── Divider line ──
    if (t.style.sectionDividers) {
      setDraw(t.colors.primary);
      doc.setLineWidth(0.8);
      doc.line(marginL, y, rightEdge, y);
      y += 6;
    }

    // ── Title (after-company position) ──
    if (t.style.titlePosition === "after-company") {
      const headerText = gst.enabled ? "Tax Invoice" : "Invoice";
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.primary);
      doc.text(headerText, pageW / 2, y, { align: "center" });
      y += 3;
      const titleW = doc.getTextWidth(headerText);
      setDraw(t.colors.primary);
      doc.setLineWidth(0.5);
      doc.line(pageW / 2 - titleW / 2, y, pageW / 2 + titleW / 2, y);
      y += 8;
    }

    // ── Bill To & Invoice Details ──
    setColor(t.colors.bodyText);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Bill To", marginL, y);
    doc.text("Invoice Details", rightEdge, y, { align: "right" });
    y += 5;

    const billToStartY = y;

    if (invoice.buyerName) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.buyerName, marginL, y);
      y += 5;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setColor(t.colors.mutedText);
      if (invoice.buyerAddress) { doc.text(invoice.buyerAddress, marginL, y); y += 3.5; }
      if (invoice.buyerGstin) { doc.text(`GSTIN: ${invoice.buyerGstin}`, marginL, y); y += 3.5; }
      if (invoice.buyerContact) { doc.text(`Contact: ${invoice.buyerContact}`, marginL, y); y += 3.5; }
    }

    let ry = billToStartY;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    setColor(t.colors.mutedText);
    doc.text(`Invoice No.: ${invoice.invoiceNumber}`, rightEdge, ry, { align: "right" });
    ry += 5;
    doc.text(`Date: ${formatDate(invoice.date)}`, rightEdge, ry, { align: "right" });

    y = Math.max(y, ry) + 10;

    // ── Items Table ──
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

    // Table header
    if (t.style.tableHeaderStyle === "filled") {
      setFill(t.colors.primary);
      doc.rect(marginL, y, contentW, headerH, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.headerText);
    } else {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.bodyText);
    }

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

    if (t.style.tableHeaderStyle === "underline") {
      setDraw(t.colors.border);
      doc.setLineWidth(0.5);
      doc.line(marginL, y + headerH, rightEdge, y + headerH);
    }
    y += headerH + 1;

    // Table rows
    let subtotal = 0;

    invoice.items.forEach((item, itemIdx) => {
      if (t.style.altRows && itemIdx % 2 === 0) {
        setFill(t.colors.altRowBg);
        doc.rect(marginL, y, contentW, 8, "F");
      }

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setColor(t.colors.bodyText);

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
          doc.text(formatINR(igst), colX.igst, rowY);
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

    y += 5;

    // ── Totals Section ──
    setDraw(t.colors.primaryDark);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, rightEdge, y);
    y += 1;

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

    // Total row
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setColor(t.colors.bodyText);
    doc.text("Total", marginL + 1, y + 5);
    if (gst.enabled && gst.rate > 0) {
      doc.text(formatINR(igstAmt + cgstAmt + sgstAmt), colX.igst, y + 5);
    }
    doc.text(formatINR(totalWithTax), colX.amount, y + 5, { align: "right" });
    y += 8;

    setDraw(t.colors.primaryDark);
    doc.line(marginL, y, rightEdge, y);
    y += 6;

    // Sub Total & GST breakdown (right side)
    const labelX = pageW / 2 + 10;
    const valX = rightEdge;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setColor(t.colors.mutedText);
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

    // Total bar or line
    if (t.style.totalBar) {
      setFill(t.colors.primary);
      doc.rect(labelX - 2, y - 1, valX - labelX + 4, 7, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.totalBarText);
      doc.text("Total", labelX, y + 4);
      doc.text(formatINR(totalWithTax), valX, y + 4, { align: "right" });
    } else {
      setDraw(t.colors.border);
      doc.setLineWidth(0.5);
      doc.line(labelX - 2, y - 1, valX + 2, y - 1);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.bodyText);
      doc.text("Total", labelX, y + 4);
      doc.text(formatINR(totalWithTax), valX, y + 4, { align: "right" });
      doc.line(labelX - 2, y + 6, valX + 2, y + 6);
    }
    y += 10;

    setColor(t.colors.bodyText);

    // ── Amount In Words (left side) ──
    const wordsStartY = y - 20;
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

    // ── Transaction Reference (FI only) ──
    if (isFinancial && invoice.items.length > 0) {
      const totalTransactionValue = invoice.items.reduce((s, it) => s + (it.transactionValue || 0), 0);
      const totalServiceMargin = invoice.items.reduce((s, it) => s + (it.serviceMargin || 0), 0);
      const totalGstOnMargin = totalServiceMargin * (gst.rate / 100);

      const utrs = invoice.items.map(it => it.utrReference).filter(Boolean);
      const marginPcts = invoice.items
        .filter(it => it.marginType === "percentage" && it.marginPercentage)
        .map(it => it.marginPercentage);
      const uniquePcts = [...new Set(marginPcts)];

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      setColor(t.colors.primaryDark);
      doc.text("Transaction Reference", marginL, y);
      y += 6;

      doc.setFontSize(8.5);
      setColor(t.colors.bodyText);
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
      setColor(t.colors.bodyText);
      doc.text("Terms And Conditions", marginL, y);
      y += 4;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      setColor(t.colors.mutedText);
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
      setColor(t.colors.bodyText);
      doc.text("Pay To:", marginL, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setColor(t.colors.mutedText);
      if (company.bankName) { doc.text(`Bank Name: ${company.bankName}`, marginL, y); y += 4; }
      if (company.accountNumber) { doc.text(`Bank Account No.: ${company.accountNumber}`, marginL, y); y += 4; }
      if (company.accountName) { doc.text(`Account Holder's Name: ${company.accountName}`, marginL, y); y += 4; }
      y += 5;
    }

    // ── Declaration ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setColor(t.colors.bodyText);
    doc.text("Declaration", marginL, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setColor(t.colors.mutedText);
    const declText = "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.";
    const declLines = doc.splitTextToSize(declText, contentW);
    declLines.forEach((line: string) => {
      doc.text(line, marginL, y);
      y += 3.5;
    });

    // ── Signatory ──
    let sigY = 255;
    if (signatory.enabled) {
      if (signatory.signatureDataUrl) {
        try {
          doc.addImage(signatory.signatureDataUrl, "PNG", rightEdge - 45, sigY - 18, 40, 15);
        } catch (e) { /* fallback */ }
      }
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      setColor(t.colors.bodyText);
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
      setColor(t.colors.bodyText);
      doc.text(company.name, rightEdge, sigY, { align: "right" });
      sigY += 8;
      doc.text("Authorised Signatory", rightEdge, sigY, { align: "right" });
    }

    // ── Footer ──
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    setColor(t.colors.mutedText);
    doc.text('"This is a computer-generated invoice"', pageW / 2, 285, { align: "center" });
  });

  return doc;
}
