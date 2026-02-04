export interface ExpenseCategory {
  value: string;
  label: string;
}

export interface ExpenseCategoryGroup {
  group: string;
  categories: ExpenseCategory[];
}

export const EXPENSE_CATEGORIES: ExpenseCategoryGroup[] = [
  {
    group: "Operations & Day-to-Day",
    categories: [
      { value: "office_rent", label: "Office rent" },
      { value: "warehouse_rent", label: "Warehouse rent" },
      { value: "cam_maintenance", label: "CAM / maintenance charges" },
      { value: "property_tax", label: "Property tax" },
      { value: "utilities", label: "Utilities (electricity, water, gas)" },
      { value: "internet_telecom", label: "Internet & telecom" },
      { value: "office_supplies", label: "Office supplies & stationery" },
      { value: "cleaning_housekeeping", label: "Cleaning & housekeeping" },
      { value: "security_services", label: "Security services" },
    ],
  },
  {
    group: "Salary & Compensation",
    categories: [
      { value: "salary_wages", label: "Salary / wages" },
      { value: "overtime", label: "Overtime" },
      { value: "incentives_bonus", label: "Incentives / bonus" },
      { value: "commission", label: "Commission" },
    ],
  },
  {
    group: "HR & People Development",
    categories: [
      { value: "recruitment", label: "Recruitment" },
      { value: "training_workshops", label: "Training / workshops" },
      { value: "certifications", label: "Certifications" },
      { value: "employee_engagement", label: "Employee engagement" },
      { value: "uniforms_safety_gear", label: "Uniforms & safety gear" },
      { value: "cafeteria_expense", label: "Cafeteria expense" },
    ],
  },
  {
    group: "Sales, Marketing & Growth",
    categories: [
      { value: "sales_marketing", label: "Sales & marketing expenses" },
    ],
  },
  {
    group: "Finance, Banking & Compliance",
    categories: [
      { value: "bank_charges", label: "Bank charges" },
      { value: "pos_charges", label: "POS charges" },
      { value: "mdr_gateway_fees", label: "MDR / payment gateway fees" },
      { value: "gst", label: "GST" },
      { value: "tds", label: "TDS" },
      { value: "penalties_fines", label: "Penalties / fines" },
      { value: "loan_interest", label: "Loan interest" },
      { value: "emi", label: "EMI" },
      { value: "processing_fees", label: "Processing fees" },
    ],
  },
  {
    group: "Technology & Software",
    categories: [
      { value: "saas_subscriptions", label: "SaaS subscriptions" },
      { value: "erp_crm", label: "ERP / CRM" },
      { value: "accounting_software", label: "Accounting software" },
      { value: "cloud_server", label: "Cloud / server" },
      { value: "domain_hosting", label: "Domain & hosting" },
      { value: "api_usage", label: "API usage" },
      { value: "it_support", label: "IT support" },
      { value: "cybersecurity", label: "Cybersecurity" },
    ],
  },
  {
    group: "Legal & Audit",
    categories: [
      { value: "ca_audit_fees", label: "CA / audit fees" },
      { value: "legal_retainers", label: "Legal retainers" },
      { value: "company_secretarial", label: "Company secretarial" },
      { value: "licenses_permits", label: "Licenses & permits" },
      { value: "trademark_patent", label: "Trademark / patent" },
      { value: "contract_drafting", label: "Contract drafting" },
    ],
  },
  {
    group: "Admin & Miscellaneous",
    categories: [
      { value: "travel_conveyance", label: "Travel & conveyance" },
      { value: "lodging_meals", label: "Lodging & meals" },
      { value: "entertainment", label: "Entertainment" },
      { value: "gifts_hospitality", label: "Gifts & hospitality" },
      { value: "memberships", label: "Memberships" },
      { value: "printing_documentation", label: "Printing & documentation" },
      { value: "courier", label: "Courier" },
      { value: "miscellaneous", label: "Miscellaneous" },
    ],
  },
  {
    group: "Losses & Adjustments",
    categories: [
      { value: "bad_debts", label: "Bad debts" },
      { value: "write_offs", label: "Write-offs" },
      { value: "inventory_loss", label: "Inventory loss" },
      { value: "damage_claims", label: "Damage claims" },
      { value: "fraud_loss", label: "Fraud loss" },
      { value: "fx_loss", label: "FX loss" },
      { value: "refund_adjustments", label: "Refund adjustments" },
    ],
  },
  {
    group: "Capital Expenditure",
    categories: [
      { value: "land_building", label: "Land & building" },
      { value: "vehicles", label: "Vehicles" },
      { value: "it_hardware", label: "IT hardware" },
      { value: "furniture_fixtures", label: "Furniture & fixtures" },
    ],
  },
];

// Income categories (for non-core business income)
export const INCOME_CATEGORIES: ExpenseCategoryGroup[] = [
  {
    group: "Other Income",
    categories: [
      { value: "interest_income", label: "Interest income" },
      { value: "rental_income", label: "Rental income" },
      { value: "commission_received", label: "Commission received" },
      { value: "refunds_received", label: "Refunds received" },
      { value: "insurance_claims", label: "Insurance claims" },
      { value: "fx_gain", label: "FX gain" },
      { value: "other_income", label: "Other income" },
    ],
  },
];

// Helper to get label from value
export function getCategoryLabel(value: string): string {
  for (const group of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
    const category = group.categories.find((c) => c.value === value);
    if (category) return category.label;
  }
  return value;
}
