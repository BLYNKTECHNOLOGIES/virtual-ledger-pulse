
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Plus, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  Banknote as BanknoteIcon
} from "lucide-react";

// Mock data for existing clients
const existingClients = [
  { id: "CLI001", name: "GAGANDEEP SINGH BHOGAL", platform: "BINANCE", riskLevel: "Low", monthlyLimit: 50000, usedLimit: 14000 },
  { id: "CLI002", name: "Shadab Ahmed", platform: "BYBIT", riskLevel: "Medium", monthlyLimit: 30000, usedLimit: 20000 },
  { id: "CLI003", name: "PHIAMPHU", platform: "BINANCE", riskLevel: "High", monthlyLimit: 25000, usedLimit: 20000 },
];

// Mock data for sales orders
const salesOrders = [
  {
    id: "SO001",
    orderNumber: "227676169152143114424",
    customerName: "GAGANDEEP SINGH BHOGAL",
    platform: "BINANCE SS",
    totalAmount: "14,000.00",
    pricePerItem: "91.75",
    quantity: "152.58855586",
    paymentMethod: "UPI",
    status: "completed",
    date: "2024-01-15",
    entryBy: "Admin User"
  },
  {
    id: "SO002",
    orderNumber: "227676174815613000992",
    customerName: "Shadab Ahmed",
    platform: "BYBIT",
    totalAmount: "20,000.00",
    pricePerItem: "91.75",
    quantity: "217.98365123",
    paymentMethod: "Bank Transfer",
    status: "alternative",
    date: "2024-01-15",
    entryBy: "Admin User"
  },
  {
    id: "SO003",
    orderNumber: "227676028397043834888",
    customerName: "PHIAMPHU",
    platform: "BINANCE SS",
    totalAmount: "20,000.00",
    pricePerItem: "92.05",
    quantity: "217.27322108",
    paymentMethod: "UPI",
    status: "cancelled",
    date: "2024-01-14",
    entryBy: "Admin User"
  }
];

type OrderStep = "type" | "amount" | "payment" | "actions" | "entry";
type OrderType = "repeat" | "new";
type PaymentMethod = "upi" | "bank";

export default function Sales() {
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  const [currentStep, setCurrentStep] = useState<OrderStep>("type");
  const [orderType, setOrderType] = useState<OrderType>("repeat");
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [orderAmount, setOrderAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [cosmosAlert, setCosmosAlert] = useState<string>("");
  const [assignedPaymentDetails, setAssignedPaymentDetails] = useState<string>("");

  // New Order Form States
  const [newOrderForm, setNewOrderForm] = useState({
    customerName: "",
    platform: "",
    orderNumber: "",
    quantity: "",
    pricePerItem: "",
    totalAmount: "",
    paymentBank: "",
    creditsApplied: ""
  });

  const handleOrderTypeSelection = (type: OrderType) => {
    setOrderType(type);
    setCurrentStep("amount");
  };

  const handleAmountValidation = () => {
    const amount = parseFloat(orderAmount);
    
    if (orderType === "repeat" && selectedClient) {
      const client = existingClients.find(c => c.id === selectedClient);
      if (client) {
        const availableLimit = client.monthlyLimit - client.usedLimit;
        if (amount > availableLimit) {
          setCosmosAlert(`Order amount ₹${amount} exceeds available COSMOS limit of ₹${availableLimit}`);
          return;
        }
      }
    }
    
    setCosmosAlert("");
    setCurrentStep("payment");
  };

  const handlePaymentMethodSelection = (method: PaymentMethod) => {
    setPaymentMethod(method);
    
    // Mock payment assignment logic
    const riskLevel = orderType === "new" ? "High" : existingClients.find(c => c.id === selectedClient)?.riskLevel || "High";
    
    if (method === "upi") {
      setAssignedPaymentDetails(`UPI ID: ${riskLevel.toLowerCase()}risk@paytm (Risk: ${riskLevel})`);
    } else {
      setAssignedPaymentDetails(`Bank: HDFC Bank, A/C: 50100***4321 (Risk: ${riskLevel})`);
    }
    
    setCurrentStep("actions");
  };

  const handleOrderAction = (action: "cancelled" | "alternative" | "received") => {
    if (action === "cancelled") {
      // Move to leads tab (mock action)
      setShowNewOrderDialog(false);
      resetForm();
    } else if (action === "alternative") {
      setCurrentStep("payment");
      setAssignedPaymentDetails("");
    } else if (action === "received") {
      setCurrentStep("entry");
      // Pre-fill form data
      if (orderType === "repeat" && selectedClient) {
        const client = existingClients.find(c => c.id === selectedClient);
        if (client) {
          setNewOrderForm(prev => ({
            ...prev,
            customerName: client.name,
            platform: client.platform,
            totalAmount: orderAmount
          }));
        }
      } else {
        setNewOrderForm(prev => ({
          ...prev,
          totalAmount: orderAmount
        }));
      }
    }
  };

  const handleSalesEntry = () => {
    // Mock sales entry submission
    console.log("Sales entry submitted:", newOrderForm);
    setShowNewOrderDialog(false);
    resetForm();
  };

  const resetForm = () => {
    setCurrentStep("type");
    setOrderType("repeat");
    setSelectedClient("");
    setOrderAmount("");
    setPaymentMethod("upi");
    setCosmosAlert("");
    setAssignedPaymentDetails("");
    setNewOrderForm({
      customerName: "",
      platform: "",
      orderNumber: "",
      quantity: "",
      pricePerItem: "",
      totalAmount: "",
      paymentBank: "",
      creditsApplied: ""
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800">Payment Received</Badge>;
      case "alternative":
        return <Badge className="bg-yellow-100 text-yellow-800">Alternative Method</Badge>;
      case "cancelled":
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Order Management</h1>
          <p className="text-gray-600 mt-1">Core sales processing module for all platform orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Sales Order</DialogTitle>
              </DialogHeader>
              
              {/* Step 1: Choose Order Type */}
              {currentStep === "type" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Step 1: Choose Order Type</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="cursor-pointer hover:shadow-md" onClick={() => handleOrderTypeSelection("repeat")}>
                      <CardContent className="p-6 text-center">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
                        <h4 className="font-semibold">Repeat Order</h4>
                        <p className="text-sm text-gray-600">Existing client order</p>
                      </CardContent>
                    </Card>
                    <Card className="cursor-pointer hover:shadow-md" onClick={() => handleOrderTypeSelection("new")}>
                      <CardContent className="p-6 text-center">
                        <Plus className="h-12 w-12 mx-auto mb-4 text-blue-600" />
                        <h4 className="font-semibold">New Client</h4>
                        <p className="text-sm text-gray-600">First time client order</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {orderType === "repeat" && (
                    <div className="mt-4">
                      <Label>Select Existing Client</Label>
                      <Select value={selectedClient} onValueChange={setSelectedClient}>
                        <SelectTrigger>
                          <SelectValue placeholder="Search and select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingClients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name} - {client.platform} (Risk: {client.riskLevel})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Enter Order Amount */}
              {currentStep === "amount" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Step 2: Enter Order Amount</h3>
                  <div>
                    <Label>Order Amount (₹)</Label>
                    <Input
                      type="number"
                      value={orderAmount}
                      onChange={(e) => setOrderAmount(e.target.value)}
                      placeholder="Enter order amount"
                    />
                  </div>
                  
                  {orderType === "repeat" && selectedClient && (
                    <div className="p-4 bg-blue-50 rounded-lg">
                      {(() => {
                        const client = existingClients.find(c => c.id === selectedClient);
                        if (client) {
                          const availableLimit = client.monthlyLimit - client.usedLimit;
                          return (
                            <div>
                              <h4 className="font-semibold">COSMOS Limit Check</h4>
                              <p>Monthly Limit: ₹{client.monthlyLimit}</p>
                              <p>Used: ₹{client.usedLimit}</p>
                              <p>Available: ₹{availableLimit}</p>
                              <p>Risk Level: {client.riskLevel}</p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}
                  
                  {cosmosAlert && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                        <span className="text-red-800 font-semibold">COSMOS Alert</span>
                      </div>
                      <p className="text-red-700 mt-1">{cosmosAlert}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep("type")}>Back</Button>
                    <Button onClick={handleAmountValidation} disabled={!orderAmount || cosmosAlert !== ""}>
                      Continue
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Choose Payment Method */}
              {currentStep === "payment" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Step 3: Choose Payment Method</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="cursor-pointer hover:shadow-md" onClick={() => handlePaymentMethodSelection("upi")}>
                      <CardContent className="p-6 text-center">
                        <CreditCard className="h-12 w-12 mx-auto mb-4 text-purple-600" />
                        <h4 className="font-semibold">UPI Payment</h4>
                        <p className="text-sm text-gray-600">Quick UPI transfer</p>
                      </CardContent>
                    </Card>
                    <Card className="cursor-pointer hover:shadow-md" onClick={() => handlePaymentMethodSelection("bank")}>
                      <CardContent className="p-6 text-center">
                        <BanknoteIcon className="h-12 w-12 mx-auto mb-4 text-green-600" />
                        <h4 className="font-semibold">Bank Transfer</h4>
                        <p className="text-sm text-gray-600">IMPS/NEFT transfer</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Button variant="outline" onClick={() => setCurrentStep("amount")}>Back</Button>
                </div>
              )}

              {/* Step 4: Action Buttons */}
              {currentStep === "actions" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Payment Method Assigned</h3>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-800">{assignedPaymentDetails}</p>
                    <p className="text-sm text-green-600 mt-1">Share this payment method with the client</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep("payment")}>Back</Button>
                    <Button variant="destructive" onClick={() => handleOrderAction("cancelled")}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Order Cancelled
                    </Button>
                    <Button variant="secondary" onClick={() => handleOrderAction("alternative")}>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Alternative Method
                    </Button>
                    <Button onClick={() => handleOrderAction("received")}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Payment Received
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 5: Final Sales Entry */}
              {currentStep === "entry" && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Final Sales Entry Form</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Customer Name *</Label>
                      <Input
                        value={newOrderForm.customerName}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, customerName: e.target.value }))}
                        placeholder="Enter customer name"
                      />
                    </div>
                    <div>
                      <Label>Platform Name *</Label>
                      <Input
                        value={newOrderForm.platform}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, platform: e.target.value }))}
                        placeholder="Enter platform name"
                      />
                    </div>
                    <div>
                      <Label>Order Number *</Label>
                      <Input
                        value={newOrderForm.orderNumber}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                        placeholder="Enter order number"
                      />
                    </div>
                    <div>
                      <Label>Quantity *</Label>
                      <Input
                        value={newOrderForm.quantity}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, quantity: e.target.value }))}
                        placeholder="Enter quantity"
                      />
                    </div>
                    <div>
                      <Label>Price per Item *</Label>
                      <Input
                        value={newOrderForm.pricePerItem}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, pricePerItem: e.target.value }))}
                        placeholder="Enter price per item"
                      />
                    </div>
                    <div>
                      <Label>Total Amount *</Label>
                      <Input
                        value={newOrderForm.totalAmount}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, totalAmount: e.target.value }))}
                        placeholder="Total amount"
                      />
                    </div>
                    <div>
                      <Label>Payment Received In (Bank) *</Label>
                      <Select value={newOrderForm.paymentBank} onValueChange={(value) => setNewOrderForm(prev => ({ ...prev, paymentBank: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select bank account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hdfc">HDFC Bank - 50100***4321</SelectItem>
                          <SelectItem value="icici">ICICI Bank - 40200***5432</SelectItem>
                          <SelectItem value="sbi">SBI - 30100***6543</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Credits Applied</Label>
                      <Input
                        value={newOrderForm.creditsApplied}
                        onChange={(e) => setNewOrderForm(prev => ({ ...prev, creditsApplied: e.target.value }))}
                        placeholder="Enter credits applied (optional)"
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep("actions")}>Back</Button>
                    <Button onClick={handleSalesEntry}>Submit Sales Entry</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input placeholder="Search by order number, customer name, platform..." />
            </div>
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales Orders List */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Orders Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Customer</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Platform</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Amount</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Payment Method</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Entry By</th>
                </tr>
              </thead>
              <tbody>
                {salesOrders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm">{order.orderNumber}</td>
                    <td className="py-3 px-4">{order.customerName}</td>
                    <td className="py-3 px-4">{order.platform}</td>
                    <td className="py-3 px-4 font-medium">₹{order.totalAmount}</td>
                    <td className="py-3 px-4">{order.paymentMethod}</td>
                    <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                    <td className="py-3 px-4">{order.date}</td>
                    <td className="py-3 px-4">{order.entryBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
