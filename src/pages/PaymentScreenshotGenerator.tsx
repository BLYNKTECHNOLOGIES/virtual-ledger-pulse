import { useState, useRef } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import { ReceiptTemplate } from "@/components/payer/ReceiptTemplate";

const PaymentScreenshotGenerator = () => {
  const navigate = useNavigate();
  const screenshotRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState({
    toUpiId: "",
    amount: "",
    paymentProviderFees: "",
    upiTransactionId: "",
    dateTime: "",
  });

  const fromName = "Blynk Virtual Technologies Pvt. Ltd.";
  const fromUpiId = "blynkex@aeronflyprivatelimited";

  const update = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  const amount = parseFloat(form.amount) || 0;
  const fees = parseFloat(form.paymentProviderFees) || 0;
  const totalDebited = amount + fees;

  const formatCurrency = (val: number) =>
    "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleDownload = async () => {
    if (!screenshotRef.current) return;
    try {
      const canvas = await html2canvas(screenshotRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `payment-receipt-${form.toUpiId || "screenshot"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Screenshot generation failed:", e);
    }
  };

  const isFormValid = form.toUpiId && form.amount && form.dateTime && form.upiTransactionId;

  return (
    <PermissionGate permissions={["utility_view"]}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/utility")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Screenshot Generator</h1>
            <p className="text-sm text-gray-500 mt-1">Generate payment receipt screenshots for transactions</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Date & Time <span className="text-red-500">*</span></Label>
                <Input type="datetime-local" value={form.dateTime} onChange={(e) => update("dateTime", e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>To UPI ID <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. 8839420199@omni" value={form.toUpiId} onChange={(e) => update("toUpiId", e.target.value)} />
                </div>
                <div>
                  <Label>Amount (₹) <span className="text-red-500">*</span></Label>
                  <Input type="number" placeholder="e.g. 100" value={form.amount} onChange={(e) => update("amount", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Provider Fees (₹)</Label>
                  <Input type="number" placeholder="e.g. 7.50" value={form.paymentProviderFees} onChange={(e) => update("paymentProviderFees", e.target.value)} />
                </div>
                <div>
                  <Label>UPI Transaction ID <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. S26032117..." value={form.upiTransactionId} onChange={(e) => update("upiTransactionId", e.target.value)} />
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border">
                <p><span className="text-gray-500">From:</span> <span className="font-medium">{fromName}</span></p>
                <p><span className="text-gray-500">UPI ID:</span> <span className="font-medium">{fromUpiId}</span></p>
                <p><span className="text-gray-500">Total Debited:</span> <span className="font-medium">{formatCurrency(totalDebited)}</span></p>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setShowPreview(true)} disabled={!isFormValid} className="flex-1">
                  <Eye className="h-4 w-4 mr-2" /> Preview
                </Button>
                <Button onClick={handleDownload} disabled={!isFormValid || !showPreview} variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" /> Download PNG
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center min-h-[500px]">
              {showPreview && isFormValid ? (
                <div className="w-full flex justify-center">
                  <div ref={screenshotRef}>
                    <ReceiptTemplate
                      data={{
                        toUpiId: form.toUpiId,
                        amount,
                        paymentProviderFees: fees,
                        upiTransactionId: form.upiTransactionId,
                        dateTime: form.dateTime,
                        fromName,
                        fromUpiId,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Fill in the details and click Preview to see the screenshot</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PermissionGate>
  );
};

export default PaymentScreenshotGenerator;
