import { useState, useCallback } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { Download, Receipt, Hash, FileText, FileDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CSVUploader from "@/components/invoice/CSVUploader";
import OrdersTable from "@/components/invoice/OrdersTable";
import CompanyForm from "@/components/invoice/CompanyForm";
import SignatorySettings from "@/components/invoice/SignatorySettings";
import InvoiceCategorySelector from "@/components/invoice/InvoiceCategorySelector";
import FinancialIntermediationNote, { DEFAULT_FI_NOTE } from "@/components/invoice/FinancialIntermediationNote";
import TemplateSelector from "@/components/invoice/TemplateSelector";
import { generateInvoicesPDF } from "@/lib/invoicePdfGenerator";
import { generateCSVTemplate, groupByInvoice } from "@/lib/csvParser";
import type { OrderRecord, CompanyInfo, GSTConfig, SignatoryConfig, InvoiceCategory, InvoiceTemplateId } from "@/types/invoice";

const emptyCompany: CompanyInfo = {
  name: "",
  address: [""],
  email: "",
  gstin: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
};

const COMPANY_STORAGE_KEY = "invoice_active_company";
const SIGNATORY_STORAGE_KEY = "invoice_active_signatory";

function loadPersistedCompany(): CompanyInfo {
  try {
    const raw = localStorage.getItem(COMPANY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : emptyCompany;
  } catch {
    return emptyCompany;
  }
}

function loadPersistedSignatory(): SignatoryConfig {
  try {
    const raw = localStorage.getItem(SIGNATORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { enabled: false, name: "", signatureDataUrl: null };
  } catch {
    return { enabled: false, name: "", signatureDataUrl: null };
  }
}

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
  const [company, setCompany] = useState<CompanyInfo>(loadPersistedCompany);
  const [gst, setGst] = useState<GSTConfig>(defaultGST);
  const [signatory, setSignatory] = useState<SignatoryConfig>(loadPersistedSignatory);

  // Persist company & signatory to localStorage on change
  const handleCompanyChange = useCallback((c: CompanyInfo) => {
    setCompany(c);
    localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(c));
  }, []);

  const handleSignatoryChange = useCallback((s: SignatoryConfig) => {
    setSignatory(s);
    localStorage.setItem(SIGNATORY_STORAGE_KEY, JSON.stringify(s));
  }, []);
  const [generating, setGenerating] = useState(false);
  const [category, setCategory] = useState<InvoiceCategory>("it_services");
  const [fiNote, setFiNote] = useState(DEFAULT_FI_NOTE);
  const [templateId, setTemplateId] = useState<InvoiceTemplateId>("classic_green");

  const handleCategoryChange = useCallback((newCategory: InvoiceCategory) => {
    setCategory(newCategory);
    setRecords([]);
    setGst(defaultGST);
  }, []);

  const handleDataLoaded = useCallback((newRecords: OrderRecord[], csvGst: GSTConfig) => {
    setRecords(newRecords);
    setGst(csvGst);
  }, []);

  const handleGenerate = useCallback(() => {
    if (records.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      try {
        const grouped = groupByInvoice(records, category);
        const doc = generateInvoicesPDF(grouped, {
          company,
          gst,
          signatory,
          note: category === "financial_intermediation" ? fiNote : undefined,
          templateId,
        });
        doc.save(`invoices_${grouped.length}_orders.pdf`);
      } catch (err) {
        console.error("PDF generation failed:", err);
      }
      setGenerating(false);
    }, 100);
  }, [records, company, gst, signatory, category, fiNote, templateId]);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate(category);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = category === "financial_intermediation"
      ? "fi_invoice_template.csv"
      : category === "usdt_sales"
        ? "usdt_sales_template.csv"
        : "invoice_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [category]);

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
  const invoiceCount = new Set(records.map(r => r.invoiceNumber)).size;
  const isFinancial = category === "financial_intermediation";
  const isUsdtSales = category === "usdt_sales";

  return (
    <PermissionGate permissions={["utility_view"]}>
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
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
          {records.length > 0 && (
            <Button onClick={handleGenerate} disabled={generating} size="lg" className="gap-2">
              <Download className="w-4 h-4" />
              {generating ? "Generating..." : `Download ${invoiceCount} Invoice${invoiceCount > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm rounded-md">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Important:</strong> All invoice data including GST settings, margin details, and transaction references are controlled via the CSV.
          Download the template to see required columns.
        </span>
      </div>

      {/* Invoice Category */}
      <InvoiceCategorySelector category={category} onChange={handleCategoryChange} />

      {/* Template Selector */}
      <TemplateSelector selected={templateId} onChange={setTemplateId} />

      {/* Stats */}
      {records.length > 0 && (
        <div className={`grid grid-cols-2 ${isFinancial ? "md:grid-cols-5" : "md:grid-cols-4"} gap-4`}>
          {[
            { label: "Line Items", value: records.length.toString(), icon: Hash },
            ...(isFinancial
              ? [
                  {
                    label: "Total Txn Value",
                    value: `₹${records.reduce((s, r) => s + (r.transactionValue || 0), 0).toLocaleString('en-IN')}`,
                    icon: Receipt,
                  },
                  {
                    label: "Total Margin",
                    value: `₹${totalAmount.toLocaleString('en-IN')}`,
                    icon: Receipt,
                  },
                ]
              : isUsdtSales
                ? [
                    { label: "Total USDT Qty", value: records.reduce((s, r) => s + r.quantity, 0).toLocaleString('en-IN'), icon: Receipt },
                    { label: "Total Amount", value: `₹${totalAmount.toLocaleString('en-IN')}`, icon: Receipt },
                  ]
                : [
                    { label: "Total Amount", value: `₹${totalAmount.toLocaleString('en-IN')}`, icon: Receipt },
                  ]),
            { label: "Unique Buyers", value: new Set(records.map(r => r.buyerName)).size.toString(), icon: FileText },
            { label: "Invoices (grouped)", value: invoiceCount.toString(), icon: FileText },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-xl font-bold text-foreground mt-1 font-mono">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* GST detected */}
      {records.length > 0 && gst.enabled && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm rounded-md">
          <Receipt className="h-4 w-4 flex-shrink-0" />
          <span>
            GST detected from CSV: <strong>{gst.rate}% {gst.type === "IGST" ? "IGST" : "CGST+SGST"}</strong>
            {gst.inclusive && <span className="ml-1">(Inclusive / Reverse)</span>}
          </span>
        </div>
      )}

      {/* Company & Payment Details */}
      <CompanyForm company={company} onChange={handleCompanyChange} />

      {/* Signatory */}
      <SignatorySettings signatory={signatory} onChange={handleSignatoryChange} />

      {/* FI Note */}
      {isFinancial && (
        <FinancialIntermediationNote note={fiNote} onChange={setFiNote} />
      )}

      {/* CSV Upload */}
      <CSVUploader onDataLoaded={handleDataLoaded} category={category} />

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
    </PermissionGate>
  );
};

export default InvoiceCreatorPage;
