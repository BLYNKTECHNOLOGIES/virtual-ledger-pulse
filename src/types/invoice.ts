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
