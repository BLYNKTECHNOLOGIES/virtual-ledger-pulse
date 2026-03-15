import { useState, useCallback, useMemo } from "react";
import { Download, Receipt, Hash, FileText, FileDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CSVUploader from "@/components/invoice/CSVUploader";
import OrdersTable from "@/components/invoice/OrdersTable";
import CompanyForm from "@/components/invoice/CompanyForm";
import GSTSettings from "@/components/invoice/GSTSettings";
import SignatorySettings from "@/components/invoice/SignatorySettings";
import InvoiceCategorySelector from "@/components/invoice/InvoiceCategorySelector";
import FinancialIntermediationNote, { DEFAULT_FI_NOTE } from "@/components/invoice/FinancialIntermediationNote";
import TransactionReferenceDetails from "@/components/invoice/TransactionReferenceDetails";
import { generateInvoicesPDF } from "@/lib/invoicePdfGenerator";
import { generateCSVTemplate, groupByInvoice } from "@/lib/csvParser";
import type { OrderRecord, CompanyInfo, GSTConfig, SignatoryConfig, InvoiceCategory, MarginType, GSTDirection } from "@/types/invoice";

const emptyCompany: CompanyInfo = {
  name: "",
  address: [""],
  email: "",
  gstin: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
};

const defaultGST: GSTConfig = {
  enabled: false,
  rate: 18,
  type: "IGST",
  inclusive: false,
};

const defaultSignatory: SignatoryConfig = {
  enabled: false,
  name: "",
  signatureDataUrl: null,
};

const InvoiceCreatorPage = () => {
  const [records, setRecords] = useState<OrderRecord[]>([]);
  const [company, setCompany] = useState<CompanyInfo>(emptyCompany);
  const [gst, setGst] = useState<GSTConfig>(defaultGST);
  const [signatory, setSignatory] = useState<SignatoryConfig>(defaultSignatory);
  const [generating, setGenerating] = useState(false);
  const [category, setCategory] = useState<InvoiceCategory>("it_services");
  const [fiNote, setFiNote] = useState(DEFAULT_FI_NOTE);

  // Transaction Reference state (for manual single-invoice FI entry)
  const [fiTransactionValue, setFiTransactionValue] = useState(0);
  const [fiUtrReference, setFiUtrReference] = useState("");
  const [fiMarginType, setFiMarginType] = useState<MarginType>("percentage");
  const [fiMarginPercentage, setFiMarginPercentage] = useState(0);
  const [fiMarginAbsolute, setFiMarginAbsolute] = useState(0);
  const [fiGstDirection, setFiGstDirection] = useState<GSTDirection>("forward");

  const fiMarginAmount = useMemo(() => {
    if (fiMarginType === "percentage") {
      return fiTransactionValue * (fiMarginPercentage / 100);
    }
    return fiMarginAbsolute;
  }, [fiMarginType, fiTransactionValue, fiMarginPercentage, fiMarginAbsolute]);

  const fiTaxableValue = useMemo(() => {
    if (fiGstDirection === "reverse") {
      return fiMarginAmount / 1.18;
    }
    return fiMarginAmount;
  }, [fiMarginAmount, fiGstDirection]);

  const fiGstAmount = useMemo(() => fiTaxableValue * 0.18, [fiTaxableValue]);
  const fiTotalInvoice = useMemo(() => fiTaxableValue + fiGstAmount, [fiTaxableValue, fiGstAmount]);

  const handleCategoryChange = useCallback((newCategory: InvoiceCategory) => {
    setCategory(newCategory);
    setRecords([]);
    if (newCategory === "financial_intermediation") {
      setGst({ enabled: true, rate: 18, type: "IGST", inclusive: false });
    }
    // Reset FI fields
    setFiTransactionValue(0);
    setFiUtrReference("");
    setFiMarginType("percentage");
    setFiMarginPercentage(0);
    setFiMarginAbsolute(0);
  }, []);

  // When CSV is loaded for FI, records already have margin info from CSV.
  // The TransactionReferenceDetails component is for manual single-invoice entry
  // that populates a record when no CSV is uploaded.

  const handleGenerate = useCallback(() => {
    let finalRecords = records;

    // If FI mode and no CSV records, create a single record from manual fields
    if (category === "financial_intermediation" && records.length === 0 && fiMarginAmount > 0) {
      // Validation
      if (fiTransactionValue > 0 && fiMarginAmount > fiTransactionValue) {
        alert("Margin cannot exceed Transaction Value");
        return;
      }
      finalRecords = [{
        invoiceNumber: "FI-001",
        description: "Financial Intermediation Service",
        hsnSac: "997152",
        quantity: 1,
        rate: fiMarginAmount,
        amount: fiMarginAmount,
        buyerName: "",
        buyerAddress: "",
        buyerGstin: "",
        buyerContact: "",
        date: new Date().toLocaleDateString("en-GB"),
        unit: "Service",
        transactionValue: fiTransactionValue,
        serviceMargin: fiMarginAmount,
        utrReference: fiUtrReference,
        marginType: fiMarginType,
        marginPercentage: fiMarginType === "percentage" ? fiMarginPercentage : undefined,
      }];
    }

    if (finalRecords.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      try {
        const grouped = groupByInvoice(finalRecords, category);
        const doc = generateInvoicesPDF(grouped, {
          company,
          gst,
          signatory,
          note: category === "financial_intermediation" ? fiNote : undefined,
        });
        doc.save(`invoices_${grouped.length}_orders.pdf`);
      } catch (err) {
        console.error("PDF generation failed:", err);
      }
      setGenerating(false);
    }, 100);
  }, [records, company, gst, signatory, category, fiNote, fiMarginAmount, fiTransactionValue, fiUtrReference, fiMarginType, fiMarginPercentage]);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate(category);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = category === "financial_intermediation"
      ? "fi_invoice_template.csv"
      : "invoice_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [category]);

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
  const invoiceCount = new Set(records.map(r => r.invoiceNumber)).size;
  const isFinancial = category === "financial_intermediation";
  const canGenerate = records.length > 0 || (isFinancial && fiMarginAmount > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Swift Invoice Generator</h1>
            <p className="text-xs text-muted-foreground">Bulk CSV to PDF invoices</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
            <FileDown className="w-4 h-4" />
            Download CSV Template
          </Button>
          {canGenerate && (
            <Button onClick={handleGenerate} disabled={generating} size="lg" className="gap-2">
              <Download className="w-4 h-4" />
              {generating ? "Generating..." : records.length > 0
                ? `Download ${invoiceCount} Invoice${invoiceCount > 1 ? 's' : ''}`
                : "Generate Invoice"}
            </Button>
          )}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm rounded-md">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          <strong>Important:</strong> Please use only the provided CSV template (Download CSV Template) to upload data. Using any other format will cause errors.
          {isFinancial && (
            <> For Financial Intermediation, provide <strong>Transaction Value</strong>, <strong>UTR</strong>, and <strong>Margin</strong> details. GST will be auto-calculated on the margin.</>
          )}
        </span>
      </div>

      {/* Invoice Category Selector */}
      <InvoiceCategorySelector category={category} onChange={handleCategoryChange} />

      {/* Stats */}
      {records.length > 0 && (
        <div className={`grid grid-cols-2 ${isFinancial ? "md:grid-cols-5" : "md:grid-cols-4"} gap-4`}>
          {[
            { label: "Line Items", value: records.length.toString(), icon: Hash },
            ...(isFinancial
              ? [
                  {
                    label: "Total Txn Value",
                    value: `₹${records.reduce((s, r) => s + (r.transactionValue || 0), 0).toLocaleString()}`,
                    icon: Receipt,
                  },
                  {
                    label: "Total Margin",
                    value: `₹${totalAmount.toLocaleString()}`,
                    icon: Receipt,
                  },
                ]
              : [
                  { label: "Total Amount", value: `₹${totalAmount.toLocaleString()}`, icon: Receipt },
                ]),
            { label: "Unique Buyers", value: new Set(records.map(r => r.buyerName)).size.toString(), icon: FileText },
            { label: "Invoices", value: invoiceCount.toString(), icon: FileText },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Settings */}
      <CompanyForm company={company} onChange={setCompany} />
      <GSTSettings gst={gst} onChange={setGst} lockedForCategory={isFinancial} />
      <SignatorySettings signatory={signatory} onChange={setSignatory} />

      {/* Financial Intermediation: Transaction Reference Details (manual entry) */}
      {isFinancial && (
        <TransactionReferenceDetails
          transactionValue={fiTransactionValue}
          utrReference={fiUtrReference}
          marginType={fiMarginType}
          marginPercentage={fiMarginPercentage}
          marginAmount={fiMarginAmount}
          gstAmount={fiGstAmount}
          totalInvoice={fiTotalInvoice}
          onTransactionValueChange={setFiTransactionValue}
          onUtrChange={setFiUtrReference}
          onMarginTypeChange={setFiMarginType}
          onMarginPercentageChange={setFiMarginPercentage}
          onMarginAmountChange={setFiMarginAbsolute}
        />
      )}

      {/* Financial Intermediation Note */}
      {isFinancial && (
        <FinancialIntermediationNote note={fiNote} onChange={setFiNote} />
      )}

      {/* CSV Upload */}
      <CSVUploader onDataLoaded={setRecords} category={category} />

      {/* Orders Table */}
      {records.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Imported Orders ({records.length})
          </h2>
          <OrdersTable records={records} category={category} />
        </div>
      )}
    </div>
  );
};

export default InvoiceCreatorPage;
