 import { useState, useEffect, useMemo } from "react";
import { useFileDropzone } from "@/hooks/useFileDropzone";
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
 import { CalendarIcon, Paperclip, X, ExternalLink } from "lucide-react";
 import { format } from "date-fns";
 import { cn } from "@/lib/utils";
 import { useToast } from "@/hooks/use-toast";
 import { useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
  import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getSubCategories, getFullCategoryLabel } from "@/data/expenseCategories";
 import { SubLedgerSelect } from "@/components/bams/subledger/SubLedgerSelect";
 
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
    subLedgerId: null as string | null,
  });

  const selectedAccount = bankAccounts?.find((a) => a.id === formData.bankAccountId);
  const isCreditAccount = selectedAccount?.account_type === 'CREDIT';
  const [existingBillUrl, setExistingBillUrl] = useState<string | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [uploadingBill, setUploadingBill] = useState(false);

  const { isDragActive: billDragActive, dropzoneProps: billDropzone } = useFileDropzone({
    onFiles: (files) => { if (files[0]) { setBillFile(files[0]); setRemoveBill(false); } },
    disabled: uploadingBill,
    multiple: false,
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
        subLedgerId: transaction.sub_ledger_id || null,
      });
      setExistingBillUrl(transaction.bill_url || null);
      setBillFile(null);
      setRemoveBill(false);
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

      // Upload new bill if user picked one; otherwise keep existing (unless cleared)
      let billUrl: string | null = removeBill ? null : existingBillUrl;
      if (billFile) {
        setUploadingBill(true);
        try {
          const fileExt = billFile.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
          const filePath = `bills/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from('transaction-bills')
            .upload(filePath, billFile);
          if (uploadError) throw new Error('Failed to upload bill: ' + uploadError.message);
          const { data: publicUrlData } = supabase.storage
            .from('transaction-bills')
            .getPublicUrl(filePath);
          billUrl = publicUrlData.publicUrl;
        } finally {
          setUploadingBill(false);
        }
      }

      // Bank ledger is append-only: reverse the original then insert the new version.
      const { error: revErr } = await supabase.rpc('reverse_bank_transaction', {
        p_original_id: transaction.id,
        p_reason: 'Edited via expense dialog',
      });
      if (revErr) throw revErr;

      const { error: insErr } = await supabase
        .from('bank_transactions')
        .insert({
          bank_account_id: formData.bankAccountId,
          transaction_type: formData.transactionType,
          amount: amount,
          category: categoryLabel,
          description: formData.description || null,
          transaction_date: formData.date ? format(formData.date, 'yyyy-MM-dd') : null,
          reference_number: formData.referenceNumber || null,
          related_account_name: transaction.related_account_name ?? null,
          bill_url: billUrl,
          sub_ledger_id: formData.subLedgerId || null,
        });

      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Transaction updated (original reversed, new entry posted).",
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
 
    // Receipt mandatory for expenses
    if (formData.transactionType === 'EXPENSE') {
      const willHaveBill = billFile || (!removeBill && existingBillUrl);
      if (!willHaveBill) {
        toast({
          title: "Receipt required",
          description: "Please attach a bill/receipt — it is mandatory for every expense entry.",
          variant: "destructive",
        });
        return;
      }
    }

    if (isCreditAccount && !formData.subLedgerId) {
      toast({
        title: "Sub-ledger required",
        description: "Please select or create a sub-ledger (person) for this credit account transaction.",
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
          <p className="text-xs text-muted-foreground">
            Bank ledger is immutable — saving posts a reversal of the original and a new entry.
          </p>
        </DialogHeader>
         
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
           <div>
             <Label htmlFor="bankAccount">Bank Account *</Label>
             <Select value={formData.bankAccountId} onValueChange={(value) => setFormData({...formData, bankAccountId: value, subLedgerId: null})}>
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
             <SubLedgerSelect
               className="mt-2"
               value={formData.subLedgerId}
               onChange={(id) => setFormData({ ...formData, subLedgerId: id })}
               isCreditAccount={isCreditAccount}
             />
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

          <div className="md:col-span-2">
            <Label htmlFor="editBillAttachment">
              Bill / Receipt Attachment
              {formData.transactionType === 'EXPENSE' && (
                <span className="text-destructive ml-1">* (required for expenses)</span>
              )}
            </Label>

            {existingBillUrl && !removeBill && !billFile && (
              <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <a
                  href={existingBillUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex-1 truncate flex items-center gap-1"
                >
                  View current receipt <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveBill(true)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {billFile ? (
              <div className="mt-1 flex items-center gap-2 p-2 border rounded-md">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate flex-1">{billFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setBillFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label
                htmlFor="editBillAttachment"
                {...billDropzone}
                className={cn("mt-1 flex items-center justify-center gap-2 p-3 border border-dashed rounded-md cursor-pointer hover:bg-muted/30", billDragActive && "border-primary bg-primary/10")}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {existingBillUrl && !removeBill
                    ? "Click to replace receipt (PDF, JPG, PNG)"
                    : "Click to upload receipt (PDF, JPG, PNG)"}
                </span>
              </label>
            )}
            <input
              id="editBillAttachment"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setBillFile(file);
                  setRemoveBill(false);
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateTransactionMutation.isPending || uploadingBill}
          >
            {updateTransactionMutation.isPending || uploadingBill ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 }