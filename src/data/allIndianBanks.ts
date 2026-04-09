// Comprehensive list of all banks in India (RBI listed)
// Sorted alphabetically within categories

export const PUBLIC_SECTOR_BANKS = [
  "Bank of Baroda",
  "Bank of India",
  "Bank of Maharashtra",
  "Canara Bank",
  "Central Bank of India",
  "Indian Bank",
  "Indian Overseas Bank",
  "Punjab & Sind Bank",
  "Punjab National Bank",
  "State Bank of India",
  "UCO Bank",
  "Union Bank of India",
];

export const PRIVATE_SECTOR_BANKS = [
  "Axis Bank Ltd.",
  "Bandhan Bank Ltd.",
  "CSB Bank Limited",
  "City Union Bank Ltd.",
  "DCB Bank Ltd.",
  "Dhanlaxmi Bank Ltd.",
  "Federal Bank Ltd.",
  "HDFC Bank Ltd",
  "ICICI Bank Ltd.",
  "IDBI Bank Limited",
  "IDFC FIRST Bank Limited",
  "IndusInd Bank Ltd",
  "Jammu & Kashmir Bank Ltd.",
  "Karnataka Bank Ltd.",
  "Karur Vysya Bank Ltd.",
  "Kotak Mahindra Bank Ltd",
  "Nainital Bank Ltd.",
  "RBL Bank Ltd.",
  "South Indian Bank Ltd.",
  "Tamilnad Mercantile Bank Ltd.",
  "YES Bank Ltd.",
];

export const SMALL_FINANCE_BANKS = [
  "Au Small Finance Bank Ltd.",
  "Capital Small Finance Bank Ltd",
  "Equitas Small Finance Bank Ltd",
  "ESAF Small Finance Bank Ltd.",
  "Jana Small Finance Bank Ltd",
  "North East Small Finance Bank Ltd",
  "Shivalik Small Finance Bank Ltd",
  "Suryoday Small Finance Bank Ltd.",
  "Ujjivan Small Finance Bank Ltd.",
  "Unity Small Finance Bank Ltd",
  "Utkarsh Small Finance Bank Ltd.",
];

export const PAYMENTS_BANKS = [
  "Airtel Payments Bank Ltd",
  "FINO Payments Bank Ltd",
  "India Post Payments Bank Ltd",
  "Jio Payments Bank Ltd",
  "NSDL Payments Bank Limited",
  "Paytm Payments Bank Ltd",
];

export const LOCAL_AREA_BANKS = [
  "Coastal Local Area Bank Ltd",
  "Krishna Bhima Samruddhi LAB Ltd",
];

export const FINANCIAL_INSTITUTIONS = [
  "Export-Import Bank of India",
  "National Bank for Agriculture and Rural Development",
  "National Housing Bank",
  "Small Industries Development Bank of India",
];

export const REGIONAL_RURAL_BANKS = [
  "Andhra Pradesh Grameena Bank",
  "Arunachal Pradesh Rural Bank",
  "Assam Gramin Bank",
  "Bihar Gramin Bank",
  "Chhattisgarh Gramin Bank",
  "Gujarat Gramin Bank",
  "Haryana Gramin Bank",
  "Himachal Pradesh Gramin Bank",
  "Jammu and Kashmir Grameen Bank",
  "Jharkhand Gramin Bank",
  "Karnataka Grameena Bank",
  "Kerala Grameena Bank",
  "Madhya Pradesh Gramin Bank",
  "Maharashtra Gramin Bank",
  "Manipur Rural Bank",
  "Meghalaya Rural Bank",
  "Mizoram Rural Bank",
  "Nagaland Rural Bank",
  "Odisha Grameen Bank",
  "Puducherry Grama Bank",
  "Punjab Gramin Bank",
  "Rajasthan Gramin Bank",
  "Tamil Nadu Grama Bank",
  "Telangana Grameena Bank",
  "Tripura Gramin Bank",
  "Uttar Pradesh Gramin Bank",
  "Uttarakhand Gramin Bank",
  "West Bengal Gramin Bank",
];

export const FOREIGN_BANKS = [
  "AB Bank Ltd.",
  "American Express Banking Corporation",
  "Australia and New Zealand Banking Group Ltd.",
  "Bank of America",
  "Bank of Bahrain and Kuwait B.S.C.",
  "Bank of Ceylon",
  "Bank of China Limited",
  "Bank of Nova Scotia",
  "Barclays Bank Plc.",
  "BNP Paribas",
  "Citibank N.A.",
  "Cooperatieve Rabobank U.A.",
  "Credit Agricole Corporate and Investment Bank",
  "CTBC Bank Co., Ltd.",
  "DBS Bank India Limited",
  "Deutsche Bank A.G.",
  "Doha Bank Q.P.S.C",
  "Emirates NBD Bank P.J.S.C",
  "First Abu Dhabi Bank PJSC",
  "FirstRand Bank Limited",
  "Hong Kong and Shanghai Banking Corporation Limited",
  "Industrial and Commercial Bank of China",
  "Industrial Bank of Korea",
  "J.P. Morgan Chase Bank N.A.",
  "JSC VTB Bank",
  "KEB Hana Bank",
  "Kookmin Bank",
  "Mashreq Bank P.S.C",
  "Mizuho Bank Ltd.",
  "MUFG Bank, Ltd.",
  "NatWest Markets Plc",
  "Nong Hyup Bank",
  "PT Bank Maybank Indonesia TBK",
  "Qatar National Bank (Q.P.S.C.)",
  "Sberbank",
  "SBM Bank (India) Limited",
  "Shinhan Bank",
  "Societe Generale",
  "Sonali Bank Ltd.",
  "Standard Chartered Bank",
  "Sumitomo Mitsui Banking Corporation",
  "UBS AG",
  "United Overseas Bank Limited",
  "Woori Bank",
];

// All banks combined and sorted alphabetically, with "Other" at the end
export const ALL_INDIAN_BANKS: { label: string; category: string }[] = [
  ...PUBLIC_SECTOR_BANKS.map(b => ({ label: b, category: "Public Sector Banks" })),
  ...PRIVATE_SECTOR_BANKS.map(b => ({ label: b, category: "Private Sector Banks" })),
  ...SMALL_FINANCE_BANKS.map(b => ({ label: b, category: "Small Finance Banks" })),
  ...PAYMENTS_BANKS.map(b => ({ label: b, category: "Payments Banks" })),
  ...LOCAL_AREA_BANKS.map(b => ({ label: b, category: "Local Area Banks" })),
  ...FINANCIAL_INSTITUTIONS.map(b => ({ label: b, category: "Financial Institutions" })),
  ...REGIONAL_RURAL_BANKS.map(b => ({ label: b, category: "Regional Rural Banks" })),
  ...FOREIGN_BANKS.map(b => ({ label: b, category: "Foreign Banks" })),
].sort((a, b) => a.label.localeCompare(b.label));

// Flat sorted list for simple dropdowns
export const ALL_BANK_NAMES: string[] = ALL_INDIAN_BANKS.map(b => b.label);
