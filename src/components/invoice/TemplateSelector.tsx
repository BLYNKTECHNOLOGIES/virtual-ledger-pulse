import { useRef, useEffect, useCallback } from "react";
import { Check } from "lucide-react";
import { INVOICE_TEMPLATES, type InvoiceTemplate } from "@/lib/invoiceTemplates";
import type { InvoiceTemplateId } from "@/types/invoice";

interface TemplateSelectorProps {
  selected: InvoiceTemplateId;
  onChange: (id: InvoiceTemplateId) => void;
}

/** Draw a mini invoice preview on a canvas */
function drawPreview(canvas: HTMLCanvasElement, t: InvoiceTemplate) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const scale = 2; // retina
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.scale(scale, scale);

  const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const ml = 8, mr = 8, cw = w - ml - mr;

  // Background
  ctx.fillStyle = rgb(t.colors.background);
  ctx.fillRect(0, 0, w, h);

  // Top accent bar
  if (t.style.topAccentBarHeight > 0) {
    ctx.fillStyle = rgb(t.colors.primary);
    ctx.fillRect(0, 0, w, t.style.topAccentBarHeight * 1.5);
  }

  // Outer border
  if (t.style.outerBorder) {
    ctx.strokeStyle = rgb(t.colors.border);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  }

  let y = t.style.topAccentBarHeight > 0 ? 8 : 5;

  // Title position
  if (t.style.titlePosition === "top") {
    ctx.font = "bold 7px sans-serif";
    ctx.fillStyle = rgb(t.colors.primary);
    ctx.textAlign = t.style.titleAlign === "center" ? "center" : "left";
    ctx.fillText("TAX INVOICE", t.style.titleAlign === "center" ? w / 2 : ml, y + 5);
    y += 10;
  }

  // Company name
  ctx.font = "bold 5px sans-serif";
  ctx.fillStyle = rgb(t.colors.bodyText);
  ctx.textAlign = t.style.companyAlign === "center" ? "center" : "left";
  ctx.fillText("Company Name", t.style.companyAlign === "center" ? w / 2 : ml, y + 4);
  y += 6;

  // Address lines (simulated)
  ctx.font = "3px sans-serif";
  ctx.fillStyle = rgb(t.colors.mutedText);
  ctx.textAlign = "left";
  ctx.fillText("123 Business Street, City", ml, y + 3);
  y += 4;
  ctx.fillText("GSTIN: 23AANCB2572J1ZK", ml, y + 3);
  y += 6;

  // Divider
  if (t.style.sectionDividers) {
    ctx.strokeStyle = rgb(t.colors.primary);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ml, y);
    ctx.lineTo(w - mr, y);
    ctx.stroke();
    y += 3;
  }

  // Title after company
  if (t.style.titlePosition === "after-company") {
    ctx.font = "bold 6px sans-serif";
    ctx.fillStyle = rgb(t.colors.primary);
    ctx.textAlign = "center";
    ctx.fillText("Tax Invoice", w / 2, y + 5);
    y += 9;
  }

  // Bill To / Invoice Details row
  ctx.font = "bold 3.5px sans-serif";
  ctx.fillStyle = rgb(t.colors.bodyText);
  ctx.textAlign = "left";
  ctx.fillText("Bill To", ml, y + 3);
  ctx.textAlign = "right";
  ctx.fillText("Invoice Details", w - mr, y + 3);
  y += 5;

  ctx.font = "bold 4px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Buyer Name", ml, y + 3);
  ctx.font = "3px sans-serif";
  ctx.fillStyle = rgb(t.colors.mutedText);
  ctx.textAlign = "right";
  ctx.fillText("INV-001  |  15/03/2026", w - mr, y + 3);
  y += 8;

  // Table header
  const tableY = y;
  const rowH = 6;

  if (t.style.tableHeaderStyle === "filled") {
    ctx.fillStyle = rgb(t.colors.primary);
    ctx.fillRect(ml, y, cw, rowH);
    ctx.font = "bold 3px sans-serif";
    ctx.fillStyle = rgb(t.colors.headerText);
  } else {
    ctx.font = "bold 3px sans-serif";
    ctx.fillStyle = rgb(t.colors.headerText[0] === 255 ? t.colors.bodyText : t.colors.headerText);
  }

  ctx.textAlign = "left";
  ctx.fillText("#", ml + 2, y + 4);
  ctx.fillText("Item", ml + 8, y + 4);
  ctx.fillText("SAC", ml + 40, y + 4);
  ctx.fillText("Qty", ml + 52, y + 4);
  ctx.fillText("Rate", ml + 62, y + 4);
  ctx.textAlign = "right";
  ctx.fillText("Amount", w - mr - 2, y + 4);

  if (t.style.tableHeaderStyle === "underline") {
    ctx.strokeStyle = rgb(t.colors.border);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(ml, y + rowH);
    ctx.lineTo(w - mr, y + rowH);
    ctx.stroke();
  }
  y += rowH;

  // Table rows (2 sample rows)
  for (let i = 0; i < 2; i++) {
    if (t.style.altRows && i % 2 === 0) {
      ctx.fillStyle = rgb(t.colors.altRowBg);
      ctx.fillRect(ml, y, cw, rowH);
    }
    ctx.font = "3px sans-serif";
    ctx.fillStyle = rgb(t.colors.bodyText);
    ctx.textAlign = "left";
    ctx.fillText(`${i + 1}`, ml + 2, y + 4);
    ctx.fillText(i === 0 ? "Web Development" : "Maintenance", ml + 8, y + 4);
    ctx.fillText("998314", ml + 40, y + 4);
    ctx.fillText("1", ml + 54, y + 4);
    ctx.fillText("50,000", ml + 62, y + 4);
    ctx.textAlign = "right";
    ctx.fillText("50,000", w - mr - 2, y + 4);
    y += rowH;
  }

  // Divider
  ctx.strokeStyle = rgb(t.colors.primaryDark);
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(ml, y);
  ctx.lineTo(w - mr, y);
  ctx.stroke();
  y += 2;

  // Totals section (right side)
  const totalsX = w / 2 + 5;
  ctx.font = "3px sans-serif";
  ctx.fillStyle = rgb(t.colors.mutedText);
  ctx.textAlign = "left";
  ctx.fillText("Sub Total", totalsX, y + 3);
  ctx.textAlign = "right";
  ctx.fillText("Rs. 1,00,000", w - mr, y + 3);
  y += 5;

  ctx.fillText("Rs. 18,000", w - mr, y + 3);
  ctx.textAlign = "left";
  ctx.fillText("GST (18%)", totalsX, y + 3);
  y += 5;

  // Total bar
  if (t.style.totalBar) {
    ctx.fillStyle = rgb(t.colors.primary);
    ctx.fillRect(totalsX - 2, y - 1, w - mr - totalsX + 4, rowH);
    ctx.font = "bold 3.5px sans-serif";
    ctx.fillStyle = rgb(t.colors.totalBarText);
    ctx.textAlign = "left";
    ctx.fillText("Total", totalsX, y + 3.5);
    ctx.textAlign = "right";
    ctx.fillText("Rs. 1,18,000", w - mr, y + 3.5);
  } else {
    ctx.font = "bold 3.5px sans-serif";
    ctx.fillStyle = rgb(t.colors.bodyText);
    ctx.textAlign = "left";
    ctx.fillText("Total", totalsX, y + 3.5);
    ctx.textAlign = "right";
    ctx.fillText("Rs. 1,18,000", w - mr, y + 3.5);
    ctx.strokeStyle = rgb(t.colors.border);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(totalsX - 2, y + rowH);
    ctx.lineTo(w - mr + 2, y + rowH);
    ctx.stroke();
  }
  y += 10;

  // Amount in words (left side, aligned with totals)
  ctx.font = "bold 3px sans-serif";
  ctx.fillStyle = rgb(t.colors.bodyText);
  ctx.textAlign = "left";
  ctx.fillText("Amount In Words", ml, y - 12);
  ctx.font = "3px sans-serif";
  ctx.fillText("One Lakh Eighteen Thousand Only", ml, y - 8);

  // Pay To section
  ctx.font = "bold 3.5px sans-serif";
  ctx.fillStyle = rgb(t.colors.bodyText);
  ctx.fillText("Pay To:", ml, y + 2);
  ctx.font = "3px sans-serif";
  ctx.fillStyle = rgb(t.colors.mutedText);
  ctx.fillText("Bank: INDUSIND BANK", ml, y + 6);
  ctx.fillText("A/C: 259266712788", ml, y + 10);

  // Footer
  ctx.font = "italic 2.5px sans-serif";
  ctx.fillStyle = rgb(t.colors.mutedText);
  ctx.textAlign = "center";
  ctx.fillText("Computer-generated invoice", w / 2, h - 3);

  // Signatory
  ctx.font = "bold 3px sans-serif";
  ctx.fillStyle = rgb(t.colors.bodyText);
  ctx.textAlign = "right";
  ctx.fillText("Authorised Signatory", w - mr, h - 8);
}

export default function TemplateSelector({ selected, onChange }: TemplateSelectorProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Invoice Template</h3>
        <p className="text-xs text-muted-foreground">Select a design style for your invoice PDF</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {INVOICE_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selected === template.id}
            onClick={() => onChange(template.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  onClick,
}: {
  template: InvoiceTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    if (canvasRef.current) {
      drawPreview(canvasRef.current, template);
    }
  }, [template]);

  useEffect(() => {
    draw();
  }, [draw]);

  const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

  return (
    <button
      onClick={onClick}
      className={`relative group rounded-lg border-2 p-1.5 transition-all duration-200 text-left ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-md"
          : "border-border hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      {/* Selection checkmark */}
      {isSelected && (
        <div className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      {/* Color accent strip */}
      <div
        className="h-1 rounded-t-sm mb-1"
        style={{ backgroundColor: rgb(template.colors.primary) }}
      />

      {/* Canvas preview */}
      <canvas
        ref={canvasRef}
        width={140}
        height={180}
        className="w-full rounded-sm"
        style={{ aspectRatio: "140/180" }}
      />

      {/* Template name */}
      <div className="mt-1.5 px-0.5">
        <p className="text-[11px] font-semibold text-foreground leading-tight truncate">
          {template.name}
        </p>
        <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
          {template.description}
        </p>
      </div>
    </button>
  );
}
