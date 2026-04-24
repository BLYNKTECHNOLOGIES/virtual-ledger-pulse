import html2canvas from "html2canvas";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { ReceiptTemplate, ReceiptData } from "@/components/payer/ReceiptTemplate";

function generateUpiTxnId(): string {
  const firstDigit = ["5", "8", "9"][Math.floor(Math.random() * 3)];
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10).toString();
  return firstDigit + rest;
}

/**
 * Renders the same receipt template used by the Utility Hub generator into a
 * detached DOM node, captures it via html2canvas, and returns the PNG blob.
 * This guarantees the auto-screenshot output is byte-identical to the manual
 * one — no server-side SVG rendering, no font loading issues.
 */
export async function captureReceiptPng(data: ReceiptData): Promise<{ blob: Blob; upiTxnId: string }> {
  const upiTxnId = data.upiTransactionId || generateUpiTxnId();
  const filledData: ReceiptData = { ...data, upiTransactionId: upiTxnId };

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = "420px";
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    await new Promise<void>((resolve) => {
      root.render(createElement(ReceiptTemplate, { data: filledData, onReady: resolve }));
    });

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) throw new Error("receipt template did not mount");

    const canvas = await html2canvas(target, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas toBlob failed"))), "image/png");
    });

    return { blob, upiTxnId };
  } finally {
    root.unmount();
    host.remove();
  }
}