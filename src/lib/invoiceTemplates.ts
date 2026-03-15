import type { InvoiceTemplateId } from "@/types/invoice";

type RGB = [number, number, number];

export interface InvoiceTemplate {
  id: InvoiceTemplateId;
  name: string;
  description: string;
  colors: {
    primary: RGB;
    primaryDark: RGB;
    secondary: RGB;
    accent: RGB;
    headerText: RGB;
    bodyText: RGB;
    mutedText: RGB;
    background: RGB;
    altRowBg: RGB;
    totalBarText: RGB;
    border: RGB;
  };
  style: {
    /** Show outer border rectangle */
    outerBorder: boolean;
    /** Header bar style: "filled" | "underline" | "none" */
    tableHeaderStyle: "filled" | "underline" | "none";
    /** Show alternating row backgrounds */
    altRows: boolean;
    /** Title alignment */
    titleAlign: "left" | "center";
    /** Title position: "top" | "after-company" */
    titlePosition: "top" | "after-company";
    /** Show colored total bar */
    totalBar: boolean;
    /** Show horizontal dividers between sections */
    sectionDividers: boolean;
    /** Company name in header: "left" | "center" */
    companyAlign: "left" | "center";
    /** Dark mode (inverted header) */
    darkHeader: boolean;
    /** Top accent bar height (0 = none) */
    topAccentBarHeight: number;
  };
}

export const INVOICE_TEMPLATES: InvoiceTemplate[] = [
  {
    id: "classic_green",
    name: "Classic Green",
    description: "Clean green theme with colored table headers — the default Blynk template",
    colors: {
      primary: [118, 185, 71],
      primaryDark: [85, 150, 45],
      secondary: [118, 185, 71],
      accent: [118, 185, 71],
      headerText: [255, 255, 255],
      bodyText: [0, 0, 0],
      mutedText: [80, 80, 80],
      background: [255, 255, 255],
      altRowBg: [245, 250, 242],
      totalBarText: [255, 255, 255],
      border: [200, 200, 200],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "modern_minimal",
    name: "Modern Minimal",
    description: "Ultra-clean white design with thin gray lines and minimal styling",
    colors: {
      primary: [50, 50, 50],
      primaryDark: [30, 30, 30],
      secondary: [150, 150, 150],
      accent: [50, 50, 50],
      headerText: [50, 50, 50],
      bodyText: [30, 30, 30],
      mutedText: [120, 120, 120],
      background: [255, 255, 255],
      altRowBg: [250, 250, 250],
      totalBarText: [255, 255, 255],
      border: [220, 220, 220],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "underline",
      altRows: false,
      titleAlign: "left",
      titlePosition: "top",
      totalBar: false,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "corporate_blue",
    name: "Corporate Blue",
    description: "Professional blue with bold header bar — ideal for corporate invoices",
    colors: {
      primary: [41, 98, 168],
      primaryDark: [25, 70, 130],
      secondary: [66, 133, 244],
      accent: [41, 98, 168],
      headerText: [255, 255, 255],
      bodyText: [0, 0, 0],
      mutedText: [80, 80, 80],
      background: [255, 255, 255],
      altRowBg: [240, 245, 252],
      totalBarText: [255, 255, 255],
      border: [200, 210, 225],
    },
    style: {
      outerBorder: true,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "top",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "center",
      darkHeader: false,
      topAccentBarHeight: 3,
    },
  },
  {
    id: "bold_dark",
    name: "Bold Dark",
    description: "Dark header strip with white body — strong visual contrast",
    colors: {
      primary: [35, 35, 35],
      primaryDark: [20, 20, 20],
      secondary: [60, 60, 60],
      accent: [220, 180, 50],
      headerText: [255, 255, 255],
      bodyText: [20, 20, 20],
      mutedText: [100, 100, 100],
      background: [255, 255, 255],
      altRowBg: [245, 245, 245],
      totalBarText: [255, 255, 255],
      border: [180, 180, 180],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "top",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "center",
      darkHeader: true,
      topAccentBarHeight: 4,
    },
  },
  {
    id: "elegant_maroon",
    name: "Elegant Maroon",
    description: "Rich maroon accents with a serif feel — distinguished and professional",
    colors: {
      primary: [128, 0, 32],
      primaryDark: [100, 0, 25],
      secondary: [160, 40, 60],
      accent: [128, 0, 32],
      headerText: [255, 255, 255],
      bodyText: [30, 30, 30],
      mutedText: [90, 70, 70],
      background: [255, 255, 255],
      altRowBg: [252, 245, 247],
      totalBarText: [255, 255, 255],
      border: [210, 190, 195],
    },
    style: {
      outerBorder: true,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 2,
    },
  },
  {
    id: "teal_business",
    name: "Teal Business",
    description: "Fresh teal/cyan palette — modern and clean for tech businesses",
    colors: {
      primary: [0, 150, 136],
      primaryDark: [0, 120, 108],
      secondary: [38, 166, 154],
      accent: [0, 150, 136],
      headerText: [255, 255, 255],
      bodyText: [0, 0, 0],
      mutedText: [80, 90, 88],
      background: [255, 255, 255],
      altRowBg: [240, 250, 249],
      totalBarText: [255, 255, 255],
      border: [190, 215, 210],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "royal_purple",
    name: "Royal Purple",
    description: "Deep purple tones — creative and distinctive for agencies",
    colors: {
      primary: [103, 58, 183],
      primaryDark: [81, 45, 148],
      secondary: [126, 87, 194],
      accent: [103, 58, 183],
      headerText: [255, 255, 255],
      bodyText: [20, 20, 30],
      mutedText: [90, 80, 110],
      background: [255, 255, 255],
      altRowBg: [245, 242, 252],
      totalBarText: [255, 255, 255],
      border: [200, 195, 215],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "sunset_orange",
    name: "Sunset Orange",
    description: "Warm orange accents — energetic and approachable billing style",
    colors: {
      primary: [230, 126, 34],
      primaryDark: [200, 100, 20],
      secondary: [243, 156, 18],
      accent: [230, 126, 34],
      headerText: [255, 255, 255],
      bodyText: [30, 30, 30],
      mutedText: [100, 85, 70],
      background: [255, 255, 255],
      altRowBg: [255, 248, 240],
      totalBarText: [255, 255, 255],
      border: [220, 200, 180],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "classic_bw",
    name: "Classic B&W",
    description: "Timeless black & white with borders — universally accepted formal style",
    colors: {
      primary: [0, 0, 0],
      primaryDark: [0, 0, 0],
      secondary: [60, 60, 60],
      accent: [0, 0, 0],
      headerText: [0, 0, 0],
      bodyText: [0, 0, 0],
      mutedText: [80, 80, 80],
      background: [255, 255, 255],
      altRowBg: [248, 248, 248],
      totalBarText: [0, 0, 0],
      border: [0, 0, 0],
    },
    style: {
      outerBorder: true,
      tableHeaderStyle: "underline",
      altRows: false,
      titleAlign: "center",
      titlePosition: "top",
      totalBar: false,
      sectionDividers: true,
      companyAlign: "center",
      darkHeader: false,
      topAccentBarHeight: 0,
    },
  },
  {
    id: "ocean_gradient",
    name: "Ocean Blue",
    description: "Navy to sky-blue gradient feel — premium look for high-value invoices",
    colors: {
      primary: [15, 52, 96],
      primaryDark: [10, 35, 70],
      secondary: [52, 152, 219],
      accent: [52, 152, 219],
      headerText: [255, 255, 255],
      bodyText: [20, 30, 40],
      mutedText: [70, 90, 110],
      background: [255, 255, 255],
      altRowBg: [238, 245, 252],
      totalBarText: [255, 255, 255],
      border: [180, 200, 220],
    },
    style: {
      outerBorder: false,
      tableHeaderStyle: "filled",
      altRows: true,
      titleAlign: "center",
      titlePosition: "after-company",
      totalBar: true,
      sectionDividers: true,
      companyAlign: "left",
      darkHeader: false,
      topAccentBarHeight: 3,
    },
  },
];

export function getTemplate(id: InvoiceTemplateId): InvoiceTemplate {
  return INVOICE_TEMPLATES.find(t => t.id === id) || INVOICE_TEMPLATES[0];
}
