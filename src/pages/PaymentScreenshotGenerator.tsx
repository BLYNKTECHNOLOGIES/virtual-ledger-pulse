import { useState, useRef } from "react";
import { PermissionGate } from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Eye, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";

const PaymentScreenshotGenerator = () => {
  const navigate = useNavigate();
  const screenshotRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState({
    serialNumber: "",
    toAccount: "",
    toUpiId: "",
    amount: "",
    paymentProviderFees: "",
    oldBalance: "",
    upiTransactionId: "",
    dateTime: "",
    description: "",
  });

  const fromName = "Blynk Virtual Technologies Pvt. Ltd.";
  const fromUpiId = "blynkex@aeronflyprivatelimited";

  const update = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  const amount = parseFloat(form.amount) || 0;
  const fees = parseFloat(form.paymentProviderFees) || 0;
  const totalDebited = amount + fees;
  const oldBalance = parseFloat(form.oldBalance) || 0;
  const newBalance = oldBalance - totalDebited;

  const formatCurrency = (val: number) =>
    "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDateTime = (val: string) => {
    if (!val) return "";
    const d = new Date(val);
    const day = d.getDate().toString().padStart(2, "0");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${day} ${month} ${year}, ${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;
  };

  const handleDownload = async () => {
    if (!screenshotRef.current) return;
    try {
      const canvas = await html2canvas(screenshotRef.current, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `payment-receipt-${form.toAccount || "screenshot"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("Screenshot generation failed:", e);
    }
  };

  const isFormValid = form.toAccount && form.amount && form.dateTime && form.upiTransactionId;

  return (
    <PermissionGate permissions={["utility_view"]}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/utility")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Screenshot Generator</h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate payment receipt screenshots for transactions
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Serial Number</Label>
                  <Input placeholder="e.g. 8" value={form.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} />
                </div>
                <div>
                  <Label>Date & Time <span className="text-red-500">*</span></Label>
                  <Input type="datetime-local" value={form.dateTime} onChange={(e) => update("dateTime", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>To Account Number <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. 8839420199" value={form.toAccount} onChange={(e) => update("toAccount", e.target.value)} />
                </div>
                <div>
                  <Label>To UPI ID</Label>
                  <Input placeholder="e.g. 8839420199@omni" value={form.toUpiId} onChange={(e) => update("toUpiId", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (₹) <span className="text-red-500">*</span></Label>
                  <Input type="number" placeholder="e.g. 100" value={form.amount} onChange={(e) => update("amount", e.target.value)} />
                </div>
                <div>
                  <Label>Payment Provider Fees (₹)</Label>
                  <Input type="number" placeholder="e.g. 7.50" value={form.paymentProviderFees} onChange={(e) => update("paymentProviderFees", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Old Balance (₹)</Label>
                  <Input type="number" placeholder="e.g. 103203.11" value={form.oldBalance} onChange={(e) => update("oldBalance", e.target.value)} />
                </div>
                <div>
                  <Label>UPI Transaction ID <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. S26032117..." value={form.upiTransactionId} onChange={(e) => update("upiTransactionId", e.target.value)} />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  placeholder="e.g. Paid for UPI PAYMENT account no. ..."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 border">
                <p><span className="text-gray-500">From:</span> <span className="font-medium">{fromName}</span></p>
                <p><span className="text-gray-500">UPI ID:</span> <span className="font-medium">{fromUpiId}</span></p>
                <p><span className="text-gray-500">Total Debited:</span> <span className="font-medium">{formatCurrency(totalDebited)}</span></p>
                <p><span className="text-gray-500">New Balance:</span> <span className="font-medium">{formatCurrency(newBalance)}</span></p>
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
                  <div
                    ref={screenshotRef}
                    style={{
                      width: "420px",
                      fontFamily: "'Segoe UI', Roboto, sans-serif",
                      background: "#ffffff",
                      borderRadius: "12px",
                      overflow: "hidden",
                      boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                    }}
                  >
                    {/* Header - Green gradient section */}
                    <div
                      style={{
                        background: "linear-gradient(135deg, #1a9e6f 0%, #2bb87e 50%, #1a8f65 100%)",
                        padding: "28px 24px 24px",
                        textAlign: "center",
                        color: "#ffffff",
                      }}
                    >
                      {form.serialNumber && (
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.2)",
                            margin: "0 auto 12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "20px",
                            fontWeight: "700",
                          }}
                        >
                          {form.serialNumber}
                        </div>
                      )}
                      <div style={{ fontSize: "13px", opacity: 0.9, marginBottom: "4px" }}>
                        To {form.toAccount}
                      </div>
                      <div style={{ fontSize: "32px", fontWeight: "700", letterSpacing: "-0.5px" }}>
                        ₹{parseFloat(form.amount || "0").toFixed(2)}
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "rgba(255,255,255,0.2)",
                          borderRadius: "20px",
                          padding: "4px 14px",
                          fontSize: "12px",
                          fontWeight: "600",
                          marginTop: "10px",
                        }}
                      >
                        ✓ Completed
                      </div>
                      <div style={{ fontSize: "12px", opacity: 0.85, marginTop: "8px" }}>
                        {formatDateTime(form.dateTime)}
                      </div>
                    </div>

                    {/* Details section */}
                    <div style={{ padding: "20px 24px 24px" }}>
                      {/* To */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                        <span style={{ color: "#888", fontSize: "13px" }}>To</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#222" }}>{form.toAccount}</div>
                          {form.toUpiId && <div style={{ fontSize: "11px", color: "#888" }}>{form.toUpiId}</div>}
                        </div>
                      </div>

                      {/* From */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                        <span style={{ color: "#888", fontSize: "13px" }}>From</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "13px", fontWeight: "600", color: "#222" }}>{fromName}</div>
                          <div style={{ fontSize: "11px", color: "#888" }}>{fromUpiId}</div>
                        </div>
                      </div>

                      {/* UPI Transaction ID */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                        <span style={{ color: "#888", fontSize: "13px" }}>UPI Transaction ID</span>
                        <span style={{ fontSize: "12px", fontWeight: "500", color: "#222" }}>{form.upiTransactionId}</span>
                      </div>

                      {/* Paid Amount */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                        <span style={{ color: "#888", fontSize: "13px" }}>Paid Amount</span>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#222" }}>{formatCurrency(amount)}</span>
                      </div>

                      {/* Payment Provider Fees */}
                      {fees > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                          <span style={{ color: "#888", fontSize: "13px" }}>Payment Provider Fees</span>
                          <span style={{ fontSize: "13px", fontWeight: "500", color: "#222" }}>{formatCurrency(fees)}</span>
                        </div>
                      )}

                      {/* Total Debited */}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                        <span style={{ color: "#888", fontSize: "13px" }}>Total Debited</span>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: "#222" }}>{formatCurrency(totalDebited)}</span>
                      </div>

                      {/* Old Balance */}
                      {form.oldBalance && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                            <span style={{ color: "#888", fontSize: "13px" }}>Old Balance</span>
                            <span style={{ fontSize: "13px", fontWeight: "500", color: "#222" }}>{formatCurrency(oldBalance)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                            <span style={{ color: "#888", fontSize: "13px" }}>New Balance</span>
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "#222" }}>{formatCurrency(newBalance)}</span>
                          </div>
                        </>
                      )}

                      {/* Description */}
                      {form.description && (
                        <div style={{ padding: "10px 0" }}>
                          <div style={{ color: "#888", fontSize: "13px", marginBottom: "4px" }}>Description</div>
                          <div style={{ fontSize: "12px", color: "#444", lineHeight: "1.5" }}>{form.description}</div>
                        </div>
                      )}
                    </div>
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
