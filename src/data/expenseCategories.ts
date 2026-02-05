 export interface SubCategory {
   value: string;
   label: string;
 }
 
 export interface ExpenseCategory {
   value: string;
   label: string;
   subCategories: SubCategory[];
 }
 
 // Main expense categories with their sub-categories
 export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
   {
     value: "operations_day_to_day",
     label: "Operations & Day-to-Day Running",
     subCategories: [
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
     value: "employee_people_costs",
     label: "Employee & People Costs",
     subCategories: [
       { value: "salaries_wages", label: "Salaries & Wages" },
       { value: "reimbursement", label: "Reimbursement" },
       { value: "reimbursement_lien", label: "Reimbursement Lien" },
     ],
   },
   {
     value: "hr_people_development",
     label: "HR & People Development",
     subCategories: [
       { value: "employee_engagement", label: "Employee engagement activities" },
       { value: "cafeteria_expenses", label: "Cafeteria expenses" },
     ],
   },
   {
     value: "finance_banking_compliance",
     label: "Finance, Banking & Compliance",
     subCategories: [
       { value: "bank_charges", label: "Bank charges" },
       { value: "gst", label: "GST" },
       { value: "penalties_fines", label: "Penalties & fines" },
       { value: "loan_interest", label: "Loan interest" },
       { value: "emi_payments", label: "EMI payments" },
       { value: "processing_fees", label: "Processing fees" },
       { value: "overdraft_interest", label: "Overdraft interest" },
     ],
   },
   {
     value: "technology_software",
     label: "Technology & Software",
     subCategories: [
       { value: "saas_subscriptions", label: "SaaS subscriptions" },
       { value: "accounting_software", label: "Accounting software" },
       { value: "cloud_hosting", label: "Cloud hosting" },
       { value: "domain_hosting", label: "Domain & hosting" },
       { value: "it_support_maintenance", label: "IT support & maintenance" },
     ],
   },
   {
     value: "legal_audit_professional",
     label: "Legal, Audit & Professional Fees",
     subCategories: [
       { value: "ca_auditor_fees", label: "CA / auditor fees" },
       { value: "licensing_permits", label: "Licensing & permits" },
       { value: "trademark_patent_fees", label: "Trademark / patent fees" },
     ],
   },
   {
     value: "admin_miscellaneous",
     label: "Admin & Miscellaneous",
     subCategories: [
       { value: "travel_expenses", label: "Travel expenses" },
       { value: "lodging_meals", label: "Lodging & meals" },
       { value: "local_conveyance", label: "Local conveyance" },
       { value: "entertainment", label: "Entertainment" },
       { value: "gifts_hospitality", label: "Gifts & hospitality" },
       { value: "memberships_subscriptions", label: "Memberships & subscriptions" },
       { value: "printing_documentation", label: "Printing & documentation" },
       { value: "courier_non_sales", label: "Courier (non-sales)" },
       { value: "miscellaneous_expenses", label: "Miscellaneous expenses" },
     ],
   },
   {
     value: "losses_adjustments",
     label: "Losses, Adjustments & Exceptions",
     subCategories: [
       { value: "bad_debts", label: "Bad debts" },
       { value: "write_offs", label: "Write-offs" },
       { value: "inventory_loss", label: "Inventory loss" },
       { value: "damage_claims", label: "Damage claims" },
       { value: "fraud_losses", label: "Fraud losses" },
       { value: "exchange_rate_loss", label: "Exchange rate loss" },
       { value: "refund_adjustments", label: "Refund adjustments" },
     ],
   },
   {
     value: "capital_expenditure",
     label: "Capital Expenditure (CapEx)",
     subCategories: [
       { value: "land_building", label: "Land & building" },
       { value: "vehicles", label: "Vehicles" },
       { value: "it_hardware", label: "IT hardware" },
       { value: "furniture_fixtures", label: "Furniture & fixtures" },
       { value: "long_term_installations", label: "Long-term installations" },
     ],
   },
 ];
 
 // Income categories (for non-core business income)
 export const INCOME_CATEGORIES: ExpenseCategory[] = [
   {
     value: "other_income",
     label: "Other Income",
     subCategories: [
       { value: "interest_income", label: "Interest income" },
       { value: "rental_income", label: "Rental income" },
       { value: "commission_received", label: "Commission received" },
       { value: "refunds_received", label: "Refunds received" },
       { value: "insurance_claims", label: "Insurance claims" },
       { value: "fx_gain", label: "FX gain" },
       { value: "other_income_misc", label: "Other income" },
     ],
   },
 ];
 
 // Get sub-categories for a given category value
 export function getSubCategories(categoryValue: string): SubCategory[] {
   const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
   const category = allCategories.find((c) => c.value === categoryValue);
   return category?.subCategories || [];
 }
 
 // Helper to get category label from value
 export function getCategoryLabel(value: string): string {
   const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
   const category = allCategories.find((c) => c.value === value);
   if (category) return category.label;
   return value;
 }
 
 // Helper to get sub-category label from value
 export function getSubCategoryLabel(subCategoryValue: string): string {
   const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
   for (const category of allCategories) {
     const subCategory = category.subCategories.find((sc) => sc.value === subCategoryValue);
     if (subCategory) return subCategory.label;
   }
   return subCategoryValue;
 }
 
 // Get full label combining category and sub-category
 export function getFullCategoryLabel(categoryValue: string, subCategoryValue: string): string {
   const categoryLabel = getCategoryLabel(categoryValue);
   const subCategoryLabel = getSubCategoryLabel(subCategoryValue);
   return `${categoryLabel} > ${subCategoryLabel}`;
 }
