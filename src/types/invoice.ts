export type InvoiceCategory = "it_services" | "financial_intermediation";

export type MarginType = "percentage" | "absolute";
export type GSTDirection = "forward" | "reverse";

export interface OrderRecord {
  invoiceNumber: string;
  description: string;
  hsnSac: string;
  quantity: number;
  rate: number;
  amount: number;
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerContact: string;
  date: string;
  /** Only for financial intermediation invoices */
  transactionValue?: number;
  /** Only for financial intermediation invoices */
  serviceMargin?: number;
  /** Unit label (NOS, Service, etc.) */
  unit?: string;
  /** UTR / Payment Reference Number */
  utrReference?: string;
  /** Margin calculation type */
  marginType?: MarginType;
  /** Margin percentage (when marginType is "percentage") */
  marginPercentage?: number;
}

export interface InvoiceGroup {
  invoiceNumber: string;
  buyerName: string;
  buyerAddress: string;
  buyerGstin: string;
  buyerContact: string;
  date: string;
  items: OrderRecord[];
  totalAmount: number;
  /** Invoice category */
  category?: InvoiceCategory;
  /** Editable note for the invoice */
  note?: string;
}

export interface CompanyInfo {
  name: string;
  address: string[];
  email: string;
  gstin: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface GSTConfig {
  enabled: boolean;
  rate: number;
  type: "IGST" | "CGST_SGST";
  inclusive: boolean;
}

export interface SignatoryConfig {
  enabled: boolean;
  name: string;
  signatureDataUrl: string | null;
}

export interface InvoiceSettings {
  company: CompanyInfo;
  gst: GSTConfig;
  signatory: SignatoryConfig;
}
