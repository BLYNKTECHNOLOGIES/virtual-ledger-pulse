import { useState, useCallback } from "react";
import { Download, Receipt, Hash, FileText, FileDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import CSVUploader from "@/components/invoice/CSVUploader";
import OrdersTable from "@/components/invoice/OrdersTable";
import CompanyForm from "@/components/invoice/CompanyForm";
import GSTSettings from "@/components/invoice/GSTSettings";
import SignatorySettings from "@/components/invoice/SignatorySettings";
import { generateInvoicesPDF } from "@/lib/invoicePdfGenerator";
import { generateCSVTemplate, groupByInvoice } from "@/lib/csvParser";
import type { OrderRecord, CompanyInfo, GSTConfig, SignatoryConfig } from "@/types/invoice";

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

  const handleGenerate = useCallback(() => {
    if (records.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      try {
        const grouped = groupByInvoice(records);
        const doc = generateInvoicesPDF(grouped, { company, gst, signatory });
        doc.save(`invoices_${grouped.length}_orders.pdf`);
      } catch (err) {
        console.error("PDF generation failed:", err);
      }
      setGenerating(false);
    }, 100);
  }, [records, company, gst, signatory]);

  const handleDownloadTemplate = useCallback(() => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoice_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
  const invoiceCount = new Set(records.map(r => r.invoiceNumber)).size;

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
          {records.length > 0 && (
            <Button onClick={handleGenerate} disabled={generating} size="lg" className="gap-2">
              <Download className="w-4 h-4" />
              {generating ? "Generating..." : `Download ${invoiceCount} Invoice${invoiceCount > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm rounded-md">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          <strong>Important:</strong> Please use only the provided CSV template (Download CSV Template) to upload data. Using any other format will cause errors.
        </span>
      </div>

      {/* Stats */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Line Items", value: records.length.toString(), icon: Hash },
            { label: "Total Amount", value: `₹${totalAmount.toLocaleString()}`, icon: Receipt },
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
      <GSTSettings gst={gst} onChange={setGst} />
      <SignatorySettings signatory={signatory} onChange={setSignatory} />

      {/* CSV Upload */}
      <CSVUploader onDataLoaded={setRecords} />

      {/* Orders Table */}
      {records.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">
            Imported Orders ({records.length})
          </h2>
          <OrdersTable records={records} />
        </div>
      )}
    </div>
  );
};

export default InvoiceCreatorPage;
