 import { useState, useEffect, useMemo } from "react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { Textarea } from "@/components/ui/textarea";
 import { Calendar } from "@/components/ui/calendar";
 import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
 import { CalendarIcon } from "lucide-react";
 import { format } from "date-fns";
 import { cn } from "@/lib/utils";
 import { useToast } from "@/hooks/use-toast";
 import { useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getSubCategories, getFullCategoryLabel } from "@/data/expenseCategories";
 
 interface EditExpenseDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   transaction: any;
   bankAccounts: any[];
 }
 
 export function EditExpenseDialog({ open, onOpenChange, transaction, bankAccounts }: EditExpenseDialogProps) {
   const { toast } = useToast();
   const queryClient = useQueryClient();
   
   const [formData, setFormData] = useState({
     bankAccountId: "",
     transactionType: "",
     amount: "",
     category: "",
     subCategory: "",
     description: "",
     date: undefined as Date | undefined,
     referenceNumber: "",
   });
 
   // Parse existing category to extract main category and sub-category
   useEffect(() => {
     if (transaction && open) {
       // Try to parse category format "Category > SubCategory"
       let mainCategory = "";
       let subCategory = "";
       
       if (transaction.category) {
         const parts = transaction.category.split(" > ");
         if (parts.length === 2) {
           // Find matching category by label
           const allCategories = transaction.transaction_type === 'INCOME' 
             ? INCOME_CATEGORIES 
             : EXPENSE_CATEGORIES;
           
           const foundCategory = allCategories.find(c => c.label === parts[0]);
           if (foundCategory) {
             mainCategory = foundCategory.value;
             const foundSub = foundCategory.subCategories.find(s => s.label === parts[1]);
             if (foundSub) {
               subCategory = foundSub.value;
             }
           }
         }
       }
       
       setFormData({
         bankAccountId: transaction.bank_account_id || "",
         transactionType: transaction.transaction_type || "",
         amount: transaction.amount?.toString() || "",
         category: mainCategory,
         subCategory: subCategory,
         description: transaction.description || "",
         date: transaction.transaction_date ? new Date(transaction.transaction_date) : undefined,
         referenceNumber: transaction.reference_number || "",
       });
     }
   }, [transaction, open]);
 
   // Get main categories based on transaction type
   const mainCategories = formData.transactionType === 'INCOME' 
     ? INCOME_CATEGORIES 
     : EXPENSE_CATEGORIES;
 
   // Get sub-categories based on selected category
   const subCategories = useMemo(() => {
     if (!formData.category) return [];
     return getSubCategories(formData.category);
   }, [formData.category]);
 
   const updateTransactionMutation = useMutation({
     mutationFn: async () => {
       const amount = parseFloat(formData.amount);
       
       // Get full category label for storage
       const categoryLabel = formData.category && formData.subCategory
         ? getFullCategoryLabel(formData.category, formData.subCategory)
         : null;
 
       const { error } = await supabase
         .from('bank_transactions')
         .update({
           bank_account_id: formData.bankAccountId,
           transaction_type: formData.transactionType,
           amount: amount,
           category: categoryLabel,
           description: formData.description || null,
           transaction_date: formData.date ? format(formData.date, 'yyyy-MM-dd') : null,
           reference_number: formData.referenceNumber || null,
         })
         .eq('id', transaction.id);
 
       if (error) throw error;
     },
     onSuccess: () => {
       toast({
         title: "Success",
         description: "Transaction updated successfully.",
       });
       queryClient.invalidateQueries({ queryKey: ['bank_transactions_only'] });
       queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
       queryClient.invalidateQueries({ queryKey: ['bank_accounts_with_balance'] });
       onOpenChange(false);
     },
     onError: (error: any) => {
       toast({
         title: "Error",
         description: error.message || "Failed to update transaction",
         variant: "destructive",
       });
     },
   });
 
   const handleSubmit = () => {
     if (!formData.bankAccountId || !formData.transactionType || !formData.amount || !formData.date) {
       toast({
         title: "Error",
         description: "Please fill in all required fields",
         variant: "destructive",
       });
       return;
     }
 
     if (formData.transactionType && (!formData.category || !formData.subCategory)) {
       toast({
         title: "Error",
         description: "Please select both category and sub-category",
         variant: "destructive",
       });
       return;
     }
 
     const amount = parseFloat(formData.amount);
     if (amount <= 0) {
       toast({
         title: "Error",
         description: "Amount must be greater than 0",
         variant: "destructive",
       });
       return;
     }
 
     updateTransactionMutation.mutate();
   };
 
   const handleCategoryChange = (value: string) => {
     setFormData({
       ...formData,
       category: value,
       subCategory: ""
     });
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-2xl">
         <DialogHeader>
           <DialogTitle>Edit Transaction</DialogTitle>
         </DialogHeader>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
           <div>
             <Label htmlFor="bankAccount">Bank Account *</Label>
             <Select value={formData.bankAccountId} onValueChange={(value) => setFormData({...formData, bankAccountId: value})}>
               <SelectTrigger>
                 <SelectValue placeholder="Select bank account" />
               </SelectTrigger>
               <SelectContent>
                 {bankAccounts?.filter(account => !account.dormant_at).map((account) => (
                   <SelectItem key={account.id} value={account.id}>
                     {account.account_name} - {account.bank_name}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <Label htmlFor="transactionType">Transaction Type *</Label>
             <Select value={formData.transactionType} onValueChange={(value) => setFormData({...formData, transactionType: value, category: "", subCategory: ""})}>
               <SelectTrigger>
                 <SelectValue placeholder="Select type" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="INCOME">Income</SelectItem>
                 <SelectItem value="EXPENSE">Expense</SelectItem>
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <Label htmlFor="category">Category *</Label>
             <Select 
               value={formData.category} 
               onValueChange={handleCategoryChange}
               disabled={!formData.transactionType}
             >
               <SelectTrigger>
                 <SelectValue placeholder={formData.transactionType ? "Select category" : "Select type first"} />
               </SelectTrigger>
               <SelectContent className="max-h-[300px]">
                 {mainCategories.map((category) => (
                   <SelectItem key={category.value} value={category.value}>
                     {category.label}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <Label htmlFor="subCategory">Sub-Category *</Label>
             <Select 
               value={formData.subCategory} 
               onValueChange={(value) => setFormData({...formData, subCategory: value})}
               disabled={!formData.category}
             >
               <SelectTrigger>
                 <SelectValue placeholder={formData.category ? "Select sub-category" : "Select category first"} />
               </SelectTrigger>
               <SelectContent className="max-h-[300px]">
                 {subCategories.map((subCategory) => (
                   <SelectItem key={subCategory.value} value={subCategory.value}>
                     {subCategory.label}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>
 
           <div>
             <Label htmlFor="amount">Amount (₹) *</Label>
             <Input
               id="amount"
               type="number"
               placeholder="0.00"
               value={formData.amount}
               onChange={(e) => setFormData({...formData, amount: e.target.value})}
             />
           </div>
 
           <div>
             <Label>Transaction Date *</Label>
             <Popover>
               <PopoverTrigger asChild>
                 <Button
                   variant="outline"
                   className={cn(
                     "w-full justify-start text-left font-normal",
                     !formData.date && "text-muted-foreground"
                   )}
                 >
                   <CalendarIcon className="mr-2 h-4 w-4" />
                   {formData.date ? format(formData.date, "PPP") : "Pick a date"}
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-auto p-0" align="start">
                 <Calendar
                   mode="single"
                   selected={formData.date}
                   onSelect={(date) => setFormData({...formData, date})}
                   initialFocus
                 />
               </PopoverContent>
             </Popover>
           </div>
 
           <div>
             <Label htmlFor="referenceNumber">Reference Number</Label>
             <Input
               id="referenceNumber"
               placeholder="e.g., CHQ001, TXN123"
               value={formData.referenceNumber}
               onChange={(e) => setFormData({...formData, referenceNumber: e.target.value})}
             />
           </div>
 
           <div className="md:col-span-2">
             <Label htmlFor="description">Description (optional)</Label>
             <Textarea
               id="description"
               placeholder="Describe the transaction..."
               value={formData.description}
               onChange={(e) => setFormData({...formData, description: e.target.value})}
             />
           </div>
         </div>
 
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           <Button 
             onClick={handleSubmit}
             disabled={updateTransactionMutation.isPending}
           >
             {updateTransactionMutation.isPending ? "Saving..." : "Save Changes"}
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }