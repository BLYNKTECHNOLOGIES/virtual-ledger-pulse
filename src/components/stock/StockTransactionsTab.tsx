
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";

export function StockTransactionsTab() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="in" className="space-y-4">
        <TabsList>
          <TabsTrigger value="in">Stock In (Purchases)</TabsTrigger>
          <TabsTrigger value="out">Stock Out (Sales)</TabsTrigger>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  Stock In (Purchases)
                </CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stock In
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No stock in transactions recorded</p>
                <Button className="mt-4">Record Stock Purchase</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  Stock Out (Sales)
                </CardTitle>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Stock Out
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingDown className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No stock out transactions recorded</p>
                <Button className="mt-4">Record Stock Sale</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-gray-500">No transactions found</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
