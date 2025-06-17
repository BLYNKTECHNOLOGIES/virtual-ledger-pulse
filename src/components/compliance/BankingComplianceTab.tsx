import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, FileText, Phone, Clock, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", 
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", 
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

export function BankingComplianceTab() {
  const [liens, setLiens] = useState([
    { 
      id: "LIEN001", 
      location: "SBI Connaught Place", 
      amount: 500000, 
      type: "Fraud-related", 
      status: "Active", 
      dateImposed: "2025-05-15",
      lastUpdate: "Investigation ongoing",
      bankName: "State Bank of India",
      acknowledgmentNumber: "ACK123456",
      lawyer: "Advocate Sharma",
      city: "New Delhi",
      state: "Delhi"
    },
    { 
      id: "LIEN002", 
      location: "HDFC Sector 18", 
      amount: 250000, 
      type: "Legal-related", 
      status: "Released", 
      dateImposed: "2025-04-10",
      lastUpdate: "Court case resolved",
      bankName: "HDFC Bank",
      acknowledgmentNumber: "ACK789012",
      lawyer: "Advocate Singh",
      city: "Mumbai",
      state: "Maharashtra"
    },
  ]);

  const [newLien, setNewLien] = useState({
    bankName: "",
    dateImposed: "",
    acknowledgmentNumber: "",
    lawyer: "",
    amount: "",
    city: "",
    state: ""
  });

  const [communications, setCommunications] = useState([
    {
      id: 1,
      bankName: "State Bank of India",
      contactPerson: "Mr. Rajesh Kumar",
      mode: "Call",
      date: "2025-06-14",
      notes: "Discussed lien status and provided additional documentation"
    }
  ]);

  const [newCommunication, setNewCommunication] = useState({
    bankName: "",
    contactPerson: "",
    mode: "",
    notes: ""
  });

  // Fetch bank accounts
  const { data: bankAccounts } = useQuery({
    queryKey: ['bank_accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bank_accounts')
        .select('*');
      return data || [];
    },
  });

  const generateLienNumber = () => {
    const nextNumber = liens.length + 1;
    return `LIEN-${nextNumber.toString().padStart(4, '0')}`;
  };

  const handleReportNewLien = () => {
    const newLienData = {
      id: generateLienNumber(),
      location: `${newLien.bankName} ${newLien.city}`,
      amount: parseInt(newLien.amount),
      type: "Investigation",
      status: "Active",
      dateImposed: newLien.dateImposed,
      lastUpdate: "Lien reported",
      bankName: newLien.bankName,
      acknowledgmentNumber: newLien.acknowledgmentNumber,
      lawyer: newLien.lawyer,
      city: newLien.city,
      state: newLien.state
    };
    
    setLiens([...liens, newLienData]);
    setNewLien({
      bankName: "",
      dateImposed: "",
      acknowledgmentNumber: "",
      lawyer: "",
      amount: "",
      city: "",
      state: ""
    });
  };

  const handleLogCommunication = () => {
    const newCommData = {
      id: communications.length + 1,
      ...newCommunication,
      date: new Date().toISOString().split('T')[0]
    };
    
    setCommunications([...communications, newCommData]);
    setNewCommunication({
      bankName: "",
      contactPerson: "",
      mode: "",
      notes: ""
    });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="liens" className="space-y-4">
        <TabsList>
          <TabsTrigger value="liens">Lien Tracking</TabsTrigger>
          <TabsTrigger value="history">Case History</TabsTrigger>
          <TabsTrigger value="accounts">Account Status</TabsTrigger>
          <TabsTrigger value="communications">Bank Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="liens">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Lien Cases Tracking
                </CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Report New Lien
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Report New Lien</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Lien Number</Label>
                        <Input value={generateLienNumber()} disabled />
                      </div>
                      <div>
                        <Label>Bank Name</Label>
                        <Select value={newLien.bankName} onValueChange={(value) => setNewLien({...newLien, bankName: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Bank" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts?.map((bank) => (
                              <SelectItem key={bank.id} value={bank.bank_name}>
                                {bank.bank_name} - {bank.account_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Date of Lien</Label>
                        <Input 
                          type="date" 
                          value={newLien.dateImposed}
                          onChange={(e) => setNewLien({...newLien, dateImposed: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label>Lien Acknowledgment Number</Label>
                        <Input 
                          value={newLien.acknowledgmentNumber}
                          onChange={(e) => setNewLien({...newLien, acknowledgmentNumber: e.target.value})}
                          placeholder="Enter acknowledgment number"
                        />
                      </div>
                      <div>
                        <Label>Lawyer</Label>
                        <Input 
                          value={newLien.lawyer}
                          onChange={(e) => setNewLien({...newLien, lawyer: e.target.value})}
                          placeholder="Enter lawyer name"
                        />
                      </div>
                      <div>
                        <Label>Lien Amount</Label>
                        <Input 
                          type="number"
                          value={newLien.amount}
                          onChange={(e) => setNewLien({...newLien, amount: e.target.value})}
                          placeholder="Enter amount"
                        />
                      </div>
                      <div>
                        <Label>Lien Location (City)</Label>
                        <Input 
                          value={newLien.city}
                          onChange={(e) => setNewLien({...newLien, city: e.target.value})}
                          placeholder="Enter city"
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Select value={newLien.state} onValueChange={(value) => setNewLien({...newLien, state: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select State" />
                          </SelectTrigger>
                          <SelectContent>
                            {indianStates.map((state) => (
                              <SelectItem key={state} value={state}>
                                {state}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleReportNewLien} className="w-full mt-4">
                      Report Lien
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {liens.map((lien) => (
                  <div key={lien.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{lien.id}</h3>
                        <p className="text-sm text-gray-600">{lien.location}</p>
                      </div>
                      <Badge variant={lien.status === "Active" ? "destructive" : "default"}>
                        {lien.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Amount: </span>
                        <span className="font-medium">₹{lien.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Type: </span>
                        <span className="font-medium">{lien.type}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Date Imposed: </span>
                        <span className="font-medium">{lien.dateImposed}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Lawyer: </span>
                        <span className="font-medium">{lien.lawyer}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm">View Timeline</Button>
                      <Button variant="outline" size="sm">Add Update</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Bank Account Status Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bankAccounts?.map((account) => (
                  <div key={account.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${account.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="font-semibold">{account.bank_name} - {account.status}</span>
                    </div>
                    <p className="text-sm text-gray-600">Account: {account.account_name}</p>
                    <p className="text-sm text-gray-500">Balance: ₹{Number(account.balance).toLocaleString()}</p>
                    {account.status !== 'ACTIVE' && (
                      <Button size="sm" variant="outline" className="mt-2">
                        Start Investigation
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Bank Communications
                </CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>
                      <Phone className="h-4 w-4 mr-2" />
                      Log New Communication
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Log Bank Communication</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Bank Name</Label>
                        <Select value={newCommunication.bankName} onValueChange={(value) => setNewCommunication({...newCommunication, bankName: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Bank" />
                          </SelectTrigger>
                          <SelectContent>
                            {bankAccounts?.map((bank) => (
                              <SelectItem key={bank.id} value={bank.bank_name}>
                                {bank.bank_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Concerned Person</Label>
                        <Input 
                          value={newCommunication.contactPerson}
                          onChange={(e) => setNewCommunication({...newCommunication, contactPerson: e.target.value})}
                          placeholder="Enter contact person name"
                        />
                      </div>
                      <div>
                        <Label>Mode of Communication</Label>
                        <Select value={newCommunication.mode} onValueChange={(value) => setNewCommunication({...newCommunication, mode: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Email">Email</SelectItem>
                            <SelectItem value="Call">Call</SelectItem>
                            <SelectItem value="Letter">Letter</SelectItem>
                            <SelectItem value="In-Person">In-Person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Textarea 
                          value={newCommunication.notes}
                          onChange={(e) => setNewCommunication({...newCommunication, notes: e.target.value})}
                          placeholder="Enter communication details"
                        />
                      </div>
                    </div>
                    <Button onClick={handleLogCommunication} className="w-full mt-4">
                      Log Communication
                    </Button>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {communications.map((comm) => (
                  <div key={comm.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold">{comm.bankName} - {comm.contactPerson}</h3>
                      <span className="text-sm text-gray-500">{comm.date}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">Mode: {comm.mode}</p>
                    <p className="text-sm text-gray-600">{comm.notes}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Case History & Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">LIEN001 - Timeline</h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Lien imposed by SBI</p>
                        <p className="text-xs text-gray-500">May 15, 2025</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Bank contacted for clarification</p>
                        <p className="text-xs text-gray-500">May 18, 2025</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mt-1"></div>
                      <div>
                        <p className="text-sm font-medium">Investigation ongoing</p>
                        <p className="text-xs text-gray-500">June 16, 2025</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
