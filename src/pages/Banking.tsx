
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Banknote, Plus } from "lucide-react";

const transactions = [
  {
    id: "227676169152143114424",
    bank: "CANARA SS",
    platform: "BINANCE SS",
    totalPrice: "14,000.00",
    price: "91.75",
    quantity: "152.58855586",
    name: "GAGANDEEP SINGH BHOGAL"
  },
  {
    id: "227676174815613000992",
    bank: "CANARA SS",
    platform: "BINANCE SS",
    totalPrice: "20,000.00",
    price: "91.75",
    quantity: "217.98365123",
    name: "shadab"
  },
  {
    id: "227676028397043834888",
    bank: "HDFC CAA SS",
    platform: "BINANCE SS",
    totalPrice: "20,000.00",
    price: "92.05",
    quantity: "217.27322108",
    name: "PHIAMPHU"
  }
];

export default function Banking() {
  const [showNewSaleForm, setShowNewSaleForm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Management</h1>
          <p className="text-gray-600 mt-1">Manage your P2P trading transactions and sales entries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Export CSV</Button>
          <Button onClick={() => setShowNewSaleForm(!showNewSaleForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Sale Entry
          </Button>
        </div>
      </div>

      {/* New Sale Form */}
      {showNewSaleForm && (
        <Card>
          <CardHeader>
            <CardTitle>New Sale Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="orderNumber">Order Number *</Label>
                <Input id="orderNumber" placeholder="Enter Order Number" />
              </div>
              <div>
                <Label htmlFor="bank">Bank *</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Bank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="canara">CANARA SS</SelectItem>
                    <SelectItem value="hdfc">HDFC CAA SS</SelectItem>
                    <SelectItem value="sbi">SBI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="platform">Platform *</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="binance">BINANCE SS</SelectItem>
                    <SelectItem value="bybit">BYBIT</SelectItem>
                    <SelectItem value="okx">OKX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="assetType">Asset Type *</Label>
                <Input id="assetType" placeholder="Enter Asset Type" />
              </div>
              <div>
                <Label htmlFor="totalPrice">Total Price *</Label>
                <Input id="totalPrice" placeholder="Enter Total Price" type="number" />
              </div>
              <div>
                <Label htmlFor="price">Price *</Label>
                <Input id="price" placeholder="Enter Price" type="number" />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity *</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-calculated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-calculated</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input id="name" placeholder="Enter Name" />
              </div>
              <div>
                <Label htmlFor="contact">Contact No.</Label>
                <Input id="contact" placeholder="Contact Number (Optional)" />
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <Button>Submit</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales List */}
      <Card>
        <CardHeader>
          <CardTitle>Sales List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Order #</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Bank</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Platform</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Total Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Quantity</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm">{transaction.id}</td>
                    <td className="py-3 px-4">{transaction.bank}</td>
                    <td className="py-3 px-4">{transaction.platform}</td>
                    <td className="py-3 px-4 font-medium">{transaction.totalPrice}</td>
                    <td className="py-3 px-4">{transaction.price}</td>
                    <td className="py-3 px-4 font-mono text-sm">{transaction.quantity}</td>
                    <td className="py-3 px-4">{transaction.name}</td>
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
