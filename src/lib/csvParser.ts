import type { OrderRecord, InvoiceGroup } from "@/types/invoice";

export function parseCSV(csvText: string): OrderRecord[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const records: OrderRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const invoiceNumber = cols[0]?.trim() || "";
    const description = cols[1]?.trim() || "";
    const hsnSac = cols[2]?.trim() || "";
    const quantity = parseFloat(cols[3]?.trim()) || 0;
    const rate = parseFloat(cols[4]?.trim()) || 0;
    const amount = parseFloat(cols[5]?.trim()) || quantity * rate;
    const buyerName = cols[6]?.trim() || "";
    const buyerAddress = cols[7]?.trim() || "";
    const buyerGstin = cols[8]?.trim() || "";
    const buyerContact = cols[9]?.trim() || "";
    const date = cols[10]?.trim() || "";

    if (!invoiceNumber || !description) continue;

    records.push({
      invoiceNumber, description, hsnSac, quantity, rate, amount,
      buyerName, buyerAddress, buyerGstin, buyerContact, date,
    });
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function generateCSVTemplate(): string {
  const headers = ["Invoice Number", "Description", "HSN/SAC", "Quantity", "Rate", "Amount", "Buyer Name", "Buyer Address", "Buyer GSTIN", "Buyer Contact", "Date"];
  const rows = [
    ["INV-001", "Web Development Services", "998314", "1", "50000", "50000", "ABC Pvt Ltd", "123 Main Street New Delhi", "29ABCDE1234F1Z5", "9876543210", "16/02/2026"],
    ["INV-001", "Server Maintenance", "998314", "2", "10000", "20000", "ABC Pvt Ltd", "123 Main Street New Delhi", "29ABCDE1234F1Z5", "9876543210", "16/02/2026"],
    ["INV-002", "UI/UX Design", "998314", "1", "30000", "30000", "XYZ Corp", "456 Park Avenue Mumbai", "27FGHIJ5678K2Z3", "9123456780", "17/02/2026"],
  ];
  return headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n") + "\n";
}

export function groupByInvoice(records: OrderRecord[]): InvoiceGroup[] {
  const map = new Map<string, InvoiceGroup>();

  for (const record of records) {
    const existing = map.get(record.invoiceNumber);
    if (existing) {
      existing.items.push(record);
      existing.totalAmount += record.amount;
    } else {
      map.set(record.invoiceNumber, {
        invoiceNumber: record.invoiceNumber,
        buyerName: record.buyerName,
        buyerAddress: record.buyerAddress,
        buyerGstin: record.buyerGstin,
        buyerContact: record.buyerContact,
        date: record.date,
        items: [record],
        totalAmount: record.amount,
      });
    }
  }

  return Array.from(map.values());
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numberToWordsBelow1000(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numberToWordsBelow1000(n % 100) : "");
}

export function numberToWords(n: number): string {
  if (n === 0) return "Zero Only";
  
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const remainder = Math.floor(n);
  const paise = Math.round((n - Math.floor(n)) * 100);

  let result = "";
  if (crore) result += numberToWordsBelow1000(crore) + " Crore ";
  if (lakh) result += numberToWordsBelow1000(lakh) + " Lakh ";
  if (thousand) result += numberToWordsBelow1000(thousand) + " Thousand ";
  if (remainder) result += numberToWordsBelow1000(remainder);

  result = result.trim();
  if (paise) {
    result += " and " + numberToWordsBelow1000(paise) + " Paise";
  }
  result += " Only";
  return result;
}

export function formatDate(timestamp: string): string {
  if (!timestamp) return "";
  return timestamp.split(" ")[0] || timestamp;
}
