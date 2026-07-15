import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFileDropzone } from '@/hooks/useFileDropzone';
import { prefetchKycUpload, resolveKycUpload } from '@/lib/kyc-background-upload';
import { openStorageDocumentUrl, isMultipartManifestUrl, resolveMultipartManifestUrl } from '@/lib/storage-multipart';
import { fetchAllPaginated } from '@/lib/fetchAllRows';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { INDIAN_STATES_AND_UTS } from '@/data/indianStatesAndUTs';
import { BankNameCombobox } from './BankNameCombobox';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/skeleton';
import { FilterChip } from '@/components/ui/filter-chip';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SalesOrderDetailsDialog } from '@/components/sales/SalesOrderDetailsDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { sanitizeNickname, sanitizeVerifiedName } from '@/lib/clientIdentityResolver';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  FileText, 
  Video, 
  AlertCircle,
  ExternalLink,
  Download,
  UserCheck,
  UserPlus,
  Pencil,
  AlertTriangle,
  Plus,
  X,
  Undo2,
  CalendarIcon,
  Upload,
  CreditCard
} from 'lucide-react';
import { logActionWithCurrentUser, ActionTypes, EntityTypes, Modules } from "@/lib/system-action-logger";
import { useAuth } from "@/hooks/useAuth";

interface BankEntry {
  bankName: string;
  lastFourDigits: string;
  statementFile: File | null;
  statementPeriodFrom: Date | undefined;
  statementPeriodTo: Date | undefined;
}

interface ClientOnboardingApproval {
  id: string;
  sales_order_id?: string | null;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_state?: string;
  order_amount: number;
  order_date: string;
  aadhar_front_url?: string;
  aadhar_back_url?: string;
  additional_documents_url?: string[];
  binance_id_screenshot_url?: string;
  vkyc_recording_url?: string;
  vkyc_notes?: string;
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  aadhar_number?: string;
  address?: string;
  purpose_of_buying?: string;
  proposed_monthly_limit?: number;
  risk_assessment?: string;
  compliance_notes?: string;
  created_at: string;
  updated_at: string;
  binance_nickname?: string | null;
  verified_name?: string | null;
  resolved_client_id?: string | null;
  cp_userno?: string | null;
}

const cleanApprovalPersonName = (name?: string | null) => (name || '').split(' • ')[0].trim();

const normalizeTextKey = (value?: string | null) => (value || '').trim().toLowerCase();

const orderDateMatchesApprovalDate = (createTime: unknown, approvalDate?: string | null) => {
  if (!createTime || !approvalDate) return false;
  const orderMs = Number(createTime);
  const approvalMs = new Date(`${approvalDate}T00:00:00`).getTime();
  if (!Number.isFinite(orderMs) || !Number.isFinite(approvalMs)) return false;
  return Math.abs(orderMs - approvalMs) <= 36 * 60 * 60 * 1000;
};

const orderAmountMatchesApprovalAmount = (totalPrice: unknown, approvalAmount?: number | null) => {
  const orderAmount = Number(totalPrice || 0);
  const expectedAmount = Number(approvalAmount || 0);
  if (!Number.isFinite(orderAmount) || !Number.isFinite(expectedAmount) || expectedAmount <= 0) return false;
  return Math.abs(orderAmount - expectedAmount) <= 1;
};

interface ExistingClientMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  client_id: string;
  kyc_status: string;
  monthly_limit: number | null;
  is_buyer: boolean | null;
  is_seller: boolean | null;
  date_of_onboarding: string;
  pan_card_number: string | null;
  buying_purpose: string | null;
  current_month_used: number | null;
  risk_appetite: string | null;
  first_order_value: number | null;
  client_type: string | null;
  default_risk_level: string | null;
  assigned_operator: string | null;
}

const createEmptyApprovalFormData = () => ({
  aadhar_number: '',
  address: '',
  purpose_of_buying: '',
  proposed_monthly_limit: '',
  risk_assessment: 'HIGH_RISK',
  compliance_notes: '',
  client_state: '',
  client_phone: ''
});

const createEmptyBankEntry = (): BankEntry => ({
  bankName: '',
  lastFourDigits: '',
  statementFile: null,
  statementPeriodFrom: undefined,
  statementPeriodTo: undefined
});

interface BuyerApprovalDraft {
  formData: ReturnType<typeof createEmptyApprovalFormData>;
  bankEntries: BankEntry[];
  approvalMode: 'normal' | 'merge' | 'create_new';
  phoneEditEnabled: boolean;
  stateEditEnabled: boolean;
  primarySourceOfIncome: string;
  occupationBusinessType: string;
  monthlyIncomeRange: string;
  sourceOfFundFile: File | null;
  aadhaarFiles: File[];
  usdtProofFile: File | null;
  tradeHistoryFile: File | null;
  vkycVideoFile: File | null;
  additionalDocs: File[];
}

const buyerApprovalDrafts = new Map<string, BuyerApprovalDraft>();
const BUYER_APPROVAL_ACTIVE_DRAFT_KEY = 'clientOnboardingApprovals.activeDraftId';
const BUYER_APPROVAL_DRAFT_DB = 'blynkex-client-approval-drafts';
const BUYER_APPROVAL_DRAFT_STORE = 'buyerApprovals';

const readActiveApprovalDraftId = () => {
  try {
    return sessionStorage.getItem(BUYER_APPROVAL_ACTIVE_DRAFT_KEY);
  } catch {
    return null;
  }
};

const writeActiveApprovalDraftId = (id: string | null) => {
  try {
    if (id) {
      sessionStorage.setItem(BUYER_APPROVAL_ACTIVE_DRAFT_KEY, id);
    } else {
      sessionStorage.removeItem(BUYER_APPROVAL_ACTIVE_DRAFT_KEY);
    }
  } catch {
    // Session storage may be unavailable in restricted browser modes.
  }
};

const openBuyerDraftDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(BUYER_APPROVAL_DRAFT_DB, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(BUYER_APPROVAL_DRAFT_STORE)) {
      db.createObjectStore(BUYER_APPROVAL_DRAFT_STORE, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const loadBuyerApprovalDraft = async (id: string): Promise<BuyerApprovalDraft | null> => {
  const memoryDraft = buyerApprovalDrafts.get(id);
  if (memoryDraft) return memoryDraft;
  try {
    const db = await openBuyerDraftDb();
    return await new Promise<BuyerApprovalDraft | null>((resolve) => {
      const request = db.transaction(BUYER_APPROVAL_DRAFT_STORE, 'readonly')
        .objectStore(BUYER_APPROVAL_DRAFT_STORE)
        .get(id);
      request.onsuccess = () => {
        const draft = request.result?.draft as BuyerApprovalDraft | undefined;
        if (draft) buyerApprovalDrafts.set(id, draft);
        resolve(draft || null);
        db.close();
      };
      request.onerror = () => {
        resolve(null);
        db.close();
      };
    });
  } catch {
    return null;
  }
};

const saveBuyerApprovalDraft = async (id: string, draft: BuyerApprovalDraft) => {
  buyerApprovalDrafts.set(id, draft);
  try {
    const db = await openBuyerDraftDb();
    const request = db.transaction(BUYER_APPROVAL_DRAFT_STORE, 'readwrite')
      .objectStore(BUYER_APPROVAL_DRAFT_STORE)
      .put({ id, draft, updatedAt: Date.now() });
    request.onsuccess = request.onerror = () => db.close();
  } catch {
    // IndexedDB can be unavailable in private/restricted contexts; memory draft still works.
  }
};

const deleteBuyerApprovalDraft = async (id: string) => {
  buyerApprovalDrafts.delete(id);
  try {
    const db = await openBuyerDraftDb();
    const request = db.transaction(BUYER_APPROVAL_DRAFT_STORE, 'readwrite')
      .objectStore(BUYER_APPROVAL_DRAFT_STORE)
      .delete(id);
    request.onsuccess = request.onerror = () => db.close();
  } catch {
    // Best-effort cleanup only.
  }
};


interface BankStatementDropAreaProps {
  entry: BankEntry;
  index: number;
  onFileChange: (index: number, file: File | null) => void;
}
function BankStatementDropArea({ entry, index, onFileChange }: BankStatementDropAreaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { isDragActive, dropzoneProps } = useFileDropzone({
    onFiles: (files) => {
      const file = files[0] || null;
      if (file) void prefetchKycUpload(file);
      onFileChange(index, file);
    },
    multiple: false,
  });
  return (
    <div
      {...dropzoneProps}
      className={cn(
        "flex items-center gap-2 mt-1 rounded-md p-1 transition-colors",
        isDragActive && "border border-dashed border-primary bg-primary/10"
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-3 w-3 mr-1" />
        {entry.statementFile ? entry.statementFile.name : 'Upload Statement'}
      </Button>
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          if (file) void prefetchKycUpload(file);
          onFileChange(index, file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      {entry.statementFile && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onFileChange(index, null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export function ClientOnboardingApprovals() {
  const navigate = useNavigate();
  const [selectedApproval, setSelectedApproval] = useState<ClientOnboardingApproval | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOrderData, setViewOrderData] = useState<any>(null);
  const [viewOrderOpen, setViewOrderOpen] = useState(false);
  // P2P Terminal orders resolved by Binance nickname (for approvals with no linked sales_order_id)
  const [nicknameOrders, setNicknameOrders] = useState<any[]>([]);
  const [nicknameOrdersOpen, setNicknameOrdersOpen] = useState(false);
  const [nicknameOrdersLoading, setNicknameOrdersLoading] = useState(false);
  const [nicknameOrdersTitle, setNicknameOrdersTitle] = useState('');
  // P2P order IDs shown inline in the Review dialog (nickname-resolved, no linked sales order)
  const [reviewNicknameOrders, setReviewNicknameOrders] = useState<any[]>([]);
  const [reviewOrdersLoading, setReviewOrdersLoading] = useState(false);
  const [existingClientMatch, setExistingClientMatch] = useState<ExistingClientMatch | null>(null);
  const [existingClientTransactions, setExistingClientTransactions] = useState<any[]>([]);
  // Binance identity (userNo + nickname) for the matched existing client and the incoming request
  const [identityDetail, setIdentityDetail] = useState<{
    existingUserNo: string | null;
    existingNickname: string | null;
    requestUserNo: string | null;
    requestNickname: string | null;
  }>({ existingUserNo: null, existingNickname: null, requestUserNo: null, requestNickname: null });
  const [approvalMode, setApprovalMode] = useState<'normal' | 'merge' | 'create_new'>('normal');
  const [formData, setFormData] = useState(createEmptyApprovalFormData);
  const [phoneEditEnabled, setPhoneEditEnabled] = useState(false);
  const [stateEditEnabled, setStateEditEnabled] = useState(false);
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([createEmptyBankEntry()]);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Source of Income state (all optional)
  const [primarySourceOfIncome, setPrimarySourceOfIncome] = useState('');
  const [occupationBusinessType, setOccupationBusinessType] = useState('');
  const [monthlyIncomeRange, setMonthlyIncomeRange] = useState('');
  const [sourceOfFundFile, setSourceOfFundFile] = useState<File | null>(null);
  const sourceOfFundInputRef = useRef<HTMLInputElement | null>(null);

  // KYC Documents state
  const [aadhaarFiles, setAadhaarFiles] = useState<File[]>([]);
  const [usdtProofFile, setUsdtProofFile] = useState<File | null>(null);
  const [tradeHistoryFile, setTradeHistoryFile] = useState<File | null>(null);
  const [vkycVideoFile, setVkycVideoFile] = useState<File | null>(null);
  const [additionalDocs, setAdditionalDocs] = useState<File[]>([]);
  const aadhaarInputRef = useRef<HTMLInputElement | null>(null);
  const usdtProofInputRef = useRef<HTMLInputElement | null>(null);
  const tradeHistoryInputRef = useRef<HTMLInputElement | null>(null);
  const vkycVideoInputRef = useRef<HTMLInputElement | null>(null);
  const additionalDocsInputRef = useRef<HTMLInputElement | null>(null);

  const { isDragActive: isDragSourceOfFund, dropzoneProps: dropSourceOfFund } = useFileDropzone({
    onFiles: (files) => { const f = files[0] || null; if (f) void prefetchKycUpload(f); setSourceOfFundFile(f); },
    multiple: false,
  });
  const { isDragActive: isDragAadhaar, dropzoneProps: dropAadhaar } = useFileDropzone({
    onFiles: (files) => { if (files.length > 0) { files.forEach(f => { void prefetchKycUpload(f); }); setAadhaarFiles(prev => [...prev, ...files]); } },
    multiple: true,
  });
  const { isDragActive: isDragUsdtProof, dropzoneProps: dropUsdtProof } = useFileDropzone({
    onFiles: (files) => { const f = files[0] || null; if (f) void prefetchKycUpload(f); setUsdtProofFile(f); },
    multiple: false,
  });
  const { isDragActive: isDragTradeHistory, dropzoneProps: dropTradeHistory } = useFileDropzone({
    onFiles: (files) => { const f = files[0] || null; if (f) void prefetchKycUpload(f); setTradeHistoryFile(f); },
    multiple: false,
  });
  const { isDragActive: isDragVkyc, dropzoneProps: dropVkyc } = useFileDropzone({
    onFiles: (files) => { const f = files[0] || null; if (!f) return; void prefetchKycUpload(f); setVkycVideoFile(f); },
    multiple: false,
  });
  const { isDragActive: isDragAdditionalDocs, dropzoneProps: dropAdditionalDocs } = useFileDropzone({
    onFiles: (files) => { if (files.length > 0) { files.forEach(f => { void prefetchKycUpload(f); }); setAdditionalDocs(prev => [...prev, ...files]); } },
    multiple: true,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const reviewerId = user?.id ?? null;

  const closeApprovalDialog = () => {
    setDialogOpen(false);
    writeActiveApprovalDraftId(null);
  };

  useEffect(() => {
    if (!selectedApproval || !dialogOpen) return;
    const draft = {
      formData,
      bankEntries,
      approvalMode,
      phoneEditEnabled,
      stateEditEnabled,
      primarySourceOfIncome,
      occupationBusinessType,
      monthlyIncomeRange,
      sourceOfFundFile,
      aadhaarFiles,
      usdtProofFile,
      tradeHistoryFile,
      vkycVideoFile,
      additionalDocs,
    };
    void saveBuyerApprovalDraft(selectedApproval.id, draft);
    writeActiveApprovalDraftId(selectedApproval.id);
  }, [
    selectedApproval,
    dialogOpen,
    formData,
    bankEntries,
    approvalMode,
    phoneEditEnabled,
    stateEditEnabled,
    primarySourceOfIncome,
    occupationBusinessType,
    monthlyIncomeRange,
    sourceOfFundFile,
    aadhaarFiles,
    usdtProofFile,
    tradeHistoryFile,
    vkycVideoFile,
    additionalDocs,
  ]);

  // Fetch approvals - all pending, and all reviewed (history)
  const { data: approvals, isLoading } = useQuery({
    queryKey: ['client_onboarding_approvals'],
    queryFn: async () => {
      // IMPORTANT: PostgREST caps every request at 1000 rows. The pending
      // approval ledger has well over 1000 rows, so a single .select() was
      // silently truncating the list and under-counting distinct clients
      // (showing e.g. 398 instead of the true total). Paginate to get ALL rows.
      const allPending = await fetchAllPaginated<ClientOnboardingApproval>(() =>
        supabase
          .from('client_onboarding_approvals')
          .select('*')
          .eq('approval_status', 'PENDING')
          .order('created_at', { ascending: false })
      );

      const history = await fetchAllPaginated<ClientOnboardingApproval>(() =>
        supabase
          .from('client_onboarding_approvals')
          .select('*')
          .neq('approval_status', 'PENDING')
          .order('created_at', { ascending: false })
      );

      const combined = [...allPending, ...history] as ClientOnboardingApproval[];

      // Exclude approvals that belong to the SELLER onboarding flow. This tab
      // only surfaces BUYER approvals; a row whose resolved client is a
      // seller-only account (is_seller=true AND is_buyer=false) must never
      // appear here — those are handled in the Seller Approvals tab and
      // otherwise bleed in as ghost buyer approvals (e.g. purchase-side
      // counterparties backfilled from historical orders).
      const resolvedIds = Array.from(
        new Set(combined.map(a => a.resolved_client_id).filter((v): v is string => !!v))
      );
      if (resolvedIds.length === 0) return combined;

      const sellerOnlyIds = new Set<string>();
      // Chunked IN() to stay well under URL/statement limits.
      for (let i = 0; i < resolvedIds.length; i += 500) {
        const slice = resolvedIds.slice(i, i + 500);
        const { data } = await supabase
          .from('clients')
          .select('id, is_buyer, is_seller')
          .in('id', slice);
        for (const c of data || []) {
          if ((c as any).is_seller === true && (c as any).is_buyer === false) {
            sellerOnlyIds.add((c as any).id);
          }
        }
      }

      return combined.filter(a =>
        !(a.resolved_client_id && sellerOnlyIds.has(a.resolved_client_id))
      );
    }

  });

  // 4-state identity resolution per pending approval — uses persisted
  // binance_nickname / verified_name first, falls back to legacy 3-hop join.
  type ClientLite = {
    id: string;
    name: string;
    client_id: string | null;
    risk_appetite: string | null;
    buyer_approval_status: string | null;
    seller_approval_status: string | null;
  };
  type IdentityState = 'linked_known' | 'verified_name_match' | 'name_collision' | 'new_client';
  interface IdentityInfo {
    nickname: string | null;
    verifiedName: string | null;
    state: IdentityState;
    matchedClient?: ClientLite;
  }

  const pendingApprovalsRaw = approvals?.filter(a => a.approval_status === 'PENDING') || [];
  const pendingSalesOrderIds = pendingApprovalsRaw
    .filter(a => a.sales_order_id)
    .map(a => a.sales_order_id);

  useEffect(() => {
    if (dialogOpen || selectedApproval || !approvals?.length) return;
    const activeDraftId = readActiveApprovalDraftId();
    if (!activeDraftId) return;
    let cancelled = false;
    void loadBuyerApprovalDraft(activeDraftId).then((draft) => {
      if (cancelled || !draft) return;
    const approval = approvals.find(a => a.id === activeDraftId && a.approval_status === 'PENDING');
    if (approval) {
      handleApprovalClick(approval);
    } else {
      void deleteBuyerApprovalDraft(activeDraftId);
      writeActiveApprovalDraftId(null);
    }
    });
    return () => {
      cancelled = true;
    };
  }, [approvals, dialogOpen, selectedApproval]);

  // Resolve reviewer UUIDs → display names for the Approval History "Reviewed By" column.
  const { data: reviewerNameMap } = useQuery({
    queryKey: ['buyer-approval-reviewer-names'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const ids = Array.from(
        new Set((approvals || []).map(a => a.reviewed_by).filter((v): v is string => !!v))
      );
      if (ids.length === 0) return map;
      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, username')
        .in('id', ids);
      for (const u of data || []) {
        map[u.id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
      }
      return map;
    },
    enabled: (approvals || []).some(a => !!a.reviewed_by),
  });

  const { data: identityMap } = useQuery({
    queryKey: ['buyer-approval-identity', pendingApprovalsRaw.map(a => a.id).sort().join(',')],
    enabled: pendingApprovalsRaw.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result: Record<string, IdentityInfo> = {};
      if (pendingApprovalsRaw.length === 0) return result;

      // Step 1 — Determine nickname + verified name per approval (persisted first, fallback to join)
      const needsLegacyLookup: string[] = [];
      const identitySeed: Record<string, { nickname: string | null; verifiedName: string | null }> = {};
      for (const a of pendingApprovalsRaw) {
        const persistedNick = sanitizeNickname(a.binance_nickname);
        const persistedVName = sanitizeVerifiedName(a.verified_name);
        identitySeed[a.id] = { nickname: persistedNick, verifiedName: persistedVName };
        if ((!persistedNick || !persistedVName) && a.sales_order_id) {
          needsLegacyLookup.push(a.sales_order_id);
        }
      }

      // Legacy enrichment for un-backfilled rows
      if (needsLegacyLookup.length > 0) {
        const { data: syncRows } = await supabase
          .from('terminal_sales_sync')
          .select('sales_order_id, binance_order_number, order_data')
          .in('sales_order_id', needsLegacyLookup);

        const orderNumberToSalesId: Record<string, string> = {};
        const salesIdToVName: Record<string, string> = {};
        for (const row of syncRows || []) {
          if (row.binance_order_number && row.sales_order_id) {
            orderNumberToSalesId[row.binance_order_number] = row.sales_order_id;
          }
          const vn = sanitizeVerifiedName((row.order_data as any)?.verified_name);
          if (vn && row.sales_order_id) salesIdToVName[row.sales_order_id] = vn;
        }
        const orderNumbers = Object.keys(orderNumberToSalesId);
        if (orderNumbers.length > 0) {
          const { data: p2pRows } = await supabase
            .from('p2p_order_records')
            .select('binance_order_number, counterparty_nickname')
            .in('binance_order_number', orderNumbers)
            .not('counterparty_nickname', 'is', null);
          for (const row of p2pRows || []) {
            const nick = sanitizeNickname(row.counterparty_nickname);
            if (!nick) continue;
            const salesId = orderNumberToSalesId[row.binance_order_number];
            if (!salesId) continue;
            for (const a of pendingApprovalsRaw) {
              if (a.sales_order_id === salesId) {
                identitySeed[a.id].nickname ||= nick;
                identitySeed[a.id].verifiedName ||= salesIdToVName[salesId] || null;
              }
            }
          }
        }
      }

      // Step 2 — Build lookup maps from clients table
      const allNicks = new Set<string>();
      const allVNames = new Set<string>();
      const allDisplayNames = new Set<string>();
      for (const a of pendingApprovalsRaw) {
        const seed = identitySeed[a.id];
        if (seed.nickname) allNicks.add(seed.nickname);
        if (seed.verifiedName) allVNames.add(seed.verifiedName);
        const dn = a.client_name?.trim().toLowerCase();
        if (dn) allDisplayNames.add(dn);
      }

      const nicknameToClient = new Map<string, ClientLite>();
      const verifiedNameToClient = new Map<string, ClientLite>();
      const displayNameToClient = new Map<string, ClientLite>();

      // Self-match guard: a pending approval's own resolved_client_id must NEVER
      // be returned as evidence of being a "Known Client".
      const selfClientIds = new Set(
        (pendingApprovalsRaw || [])
          .map((a: any) => a.resolved_client_id)
          .filter((id: any): id is string => typeof id === 'string' && !!id)
      );

      // Nickname → client_id
      const nickArr = Array.from(allNicks);
      const linkedClientIds = new Set<string>();
      const nickRows: Array<{ nickname: string; client_id: string }> = [];
      if (nickArr.length > 0) {
        const { data } = await supabase
          .from('client_binance_nicknames')
          .select('nickname, client_id')
          .in('nickname', nickArr)
          .eq('is_active', true);
        for (const r of data || []) {
          if (selfClientIds.has(r.client_id)) continue;
          nickRows.push(r);
          linkedClientIds.add(r.client_id);
        }
      }

      // Verified name → client_id
      const vnameArr = Array.from(allVNames);
      const vnRows: Array<{ verified_name: string; client_id: string }> = [];
      if (vnameArr.length > 0) {
        const { data } = await supabase
          .from('client_verified_names')
          .select('verified_name, client_id')
          .in('verified_name', vnameArr);
        for (const r of data || []) {
          if (selfClientIds.has(r.client_id)) continue;
          vnRows.push(r);
          linkedClientIds.add(r.client_id);
        }
      }

      // Fetch client master rows we need (linked + display-name candidates)
      const dnameArr = Array.from(allDisplayNames);
      const { data: clientsByLinked } = linkedClientIds.size > 0
        ? await supabase
            .from('clients')
            .select('id, name, client_id, risk_appetite, buyer_approval_status, seller_approval_status, is_deleted')
            .in('id', Array.from(linkedClientIds))
        : { data: [] };
      const { data: clientsByName } = dnameArr.length > 0
        ? await supabase
            .from('clients')
            .select('id, name, client_id, risk_appetite, buyer_approval_status, seller_approval_status, is_deleted')
            .in('name', pendingApprovalsRaw.map(a => a.client_name).filter(Boolean))
        : { data: [] };

      const clientById = new Map<string, ClientLite>();
      for (const c of [...(clientsByLinked || []), ...(clientsByName || [])]) {
        if ((c as any).is_deleted) continue;
        clientById.set(c.id, {
          id: c.id, name: c.name, client_id: c.client_id,
          risk_appetite: c.risk_appetite,
          buyer_approval_status: c.buyer_approval_status,
          seller_approval_status: c.seller_approval_status,
        });
      }
      // Helper: a client is a "PENDING-only stub" if it has never been
      // approved on either buyer or seller side. Such clients are backlog
      // echoes (often the very same person awaiting approval) and must not
      // produce "Known Client" / "Same KYC name" badges.
      const isPendingOnlyStub = (cl: ClientLite) => {
        const buyerPending = !cl.buyer_approval_status || cl.buyer_approval_status === 'PENDING' || cl.buyer_approval_status === 'NOT_APPLICABLE';
        const sellerPending = !cl.seller_approval_status || cl.seller_approval_status === 'PENDING' || cl.seller_approval_status === 'NOT_APPLICABLE';
        return buyerPending && sellerPending;
      };
      for (const r of nickRows) {
        const cl = clientById.get(r.client_id);
        if (!cl) continue;
        if (isPendingOnlyStub(cl)) continue;
        nicknameToClient.set(r.nickname, cl);
      }
      for (const r of vnRows) {
        const cl = clientById.get(r.client_id);
        if (!cl) continue;
        if (isPendingOnlyStub(cl)) continue;
        verifiedNameToClient.set(r.verified_name, cl);
      }
      for (const c of clientsByName || []) {
        if ((c as any).is_deleted) continue;
        // Self-match guard: never let a pending approval collide with its own
        // resolved client stub (those are echoes of this very queue).
        if (selfClientIds.has(c.id)) continue;
        // PENDING-only stubs (never approved on either side) are not real
        // "different person" evidence — they're almost always backlog rows
        // from the same person awaiting approval. Skip them.
        const buyerPending = !c.buyer_approval_status || c.buyer_approval_status === 'PENDING' || c.buyer_approval_status === 'NOT_APPLICABLE';
        const sellerPending = !c.seller_approval_status || c.seller_approval_status === 'PENDING' || c.seller_approval_status === 'NOT_APPLICABLE';
        if (buyerPending && sellerPending) continue;
        displayNameToClient.set(c.name.trim().toLowerCase(), clientById.get(c.id)!);
      }

      // Step 3 — Classify each approval
      for (const a of pendingApprovalsRaw) {
        const seed = identitySeed[a.id];
        const nick = seed.nickname;
        const vname = seed.verifiedName;

        let state: IdentityState = 'new_client';
        let matched: ClientLite | undefined;

        if (nick && nicknameToClient.has(nick)) {
          state = 'linked_known';
          matched = nicknameToClient.get(nick);
        } else if (vname && verifiedNameToClient.has(vname)) {
          state = 'verified_name_match';
          matched = verifiedNameToClient.get(vname);
        } else {
          const dn = a.client_name?.trim().toLowerCase();
          if (dn && displayNameToClient.has(dn)) {
            state = 'name_collision';
            matched = displayNameToClient.get(dn);
          }
        }
        result[a.id] = { nickname: nick, verifiedName: vname, state, matchedClient: matched };
      }
      return result;
    },
  });

  // Link a nickname to an existing client (used in name_collision flow)
  const linkNicknameMutation = useMutation({
    mutationFn: async ({ clientId, nickname }: { clientId: string; nickname: string }) => {
      const { error } = await supabase.from('client_binance_nicknames').upsert(
        {
          client_id: clientId,
          nickname,
          source: 'manual_collision_link',
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'nickname' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Nickname linked', description: 'Future orders will auto-match this client.' });
      queryClient.invalidateQueries({ queryKey: ['buyer-approval-identity'] });
    },
    onError: (e: any) => toast({ title: 'Link failed', description: e.message, variant: 'destructive' }),
  });

  const generateClientId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Fetch ALL orders (buy + sell) associated with a client.
  // Robust resolution: orders are matched not only by client_id / display name
  // (which can be a synthetic "NAME • User-xxxx" label that never equals the raw
  // Binance supplier/verified name), but ALSO by the client's Binance identity
  // signals — userNo (authoritative), nickname and verified names — mapped to
  // concrete order numbers via cp_order_identity and binance_order_history.
  const fetchAllClientOrders = async (clientId: string | null, clientName?: string | null) => {
    const rawName = (clientName || '').trim();
    // Strip the synthetic "• User-xxxx" suffix to recover the underlying name.
    const baseName = rawName.split('•')[0].trim();

    // 1. Gather identity signals for this client.
    const nameSet = new Set<string>();
    if (rawName) nameSet.add(rawName.toLowerCase());
    if (baseName) nameSet.add(baseName.toLowerCase());

    let userNos: string[] = [];
    let nicknames: string[] = [];
    if (clientId) {
      const [unoRes, nickRes, vnameRes] = await Promise.all([
        supabase.from('client_binance_usernos').select('cp_userno').eq('client_id', clientId),
        supabase.from('client_binance_nicknames').select('nickname').eq('client_id', clientId),
        supabase.from('client_verified_names').select('verified_name').eq('client_id', clientId),
      ]);
      userNos = (unoRes.data || []).map((r: any) => r.cp_userno).filter(Boolean);
      nicknames = (nickRes.data || []).map((r: any) => r.nickname).filter(Boolean);
      (vnameRes.data || []).forEach((r: any) => { if (r.verified_name) nameSet.add(String(r.verified_name).toLowerCase()); });
    }

    // 2. Resolve concrete order numbers from Binance identity signals.
    const orderNumbers = new Set<string>();
    if (userNos.length) {
      const { data } = await supabase
        .from('cp_order_identity')
        .select('order_number')
        .in('cp_userno', userNos);
      (data || []).forEach((r: any) => { if (r.order_number) orderNumbers.add(String(r.order_number)); });
    }
    if (nicknames.length) {
      const { data } = await supabase
        .from('binance_order_history')
        .select('order_number')
        .in('counter_part_nick_name', nicknames);
      (data || []).forEach((r: any) => { if (r.order_number) orderNumbers.add(String(r.order_number)); });
    }
    const orderNumList = Array.from(orderNumbers);
    const names = Array.from(nameSet).filter(Boolean);

    // 3. Fetch BUY orders (sales_orders) by client_id, name, and resolved order #.
    const buyRows: any[] = [];
    const pushBuy = (rows: any[] | null) => { if (rows) buyRows.push(...rows); };
    if (clientId) {
      const { data } = await supabase
        .from('sales_orders')
        .select('order_number, order_date, total_amount, status, payment_status, quantity, price_per_unit, sale_type, client_phone, client_state')
        .eq('client_id', clientId)
        .order('order_date', { ascending: false });
      pushBuy(data);
    }
    for (const nm of names) {
      const { data } = await supabase
        .from('sales_orders')
        .select('order_number, order_date, total_amount, status, payment_status, quantity, price_per_unit, sale_type, client_phone, client_state')
        .ilike('client_name', nm);
      pushBuy(data);
    }
    if (orderNumList.length) {
      const { data } = await supabase
        .from('sales_orders')
        .select('order_number, order_date, total_amount, status, payment_status, quantity, price_per_unit, sale_type, client_phone, client_state')
        .in('order_number', orderNumList);
      pushBuy(data);
    }

    // 4. Fetch SELL orders (purchase_orders) by supplier name and resolved order #.
    const sellRaw: any[] = [];
    for (const nm of names) {
      const { data } = await supabase
        .from('purchase_orders')
        .select('order_number, order_date, total_amount, status, quantity, price_per_unit, supplier_name')
        .ilike('supplier_name', nm);
      if (data) sellRaw.push(...data);
    }
    if (orderNumList.length) {
      const { data } = await supabase
        .from('purchase_orders')
        .select('order_number, order_date, total_amount, status, quantity, price_per_unit, supplier_name')
        .in('order_number', orderNumList);
      if (data) sellRaw.push(...data);
    }
    const sellRows = sellRaw.map((o: any) => ({ ...o, sale_type: 'SELL', client_phone: null, client_state: null }));

    // 5. De-dup by order_number and sort by date desc.
    const seen = new Set<string>();
    const combined = [...buyRows, ...sellRows].filter((o: any) => {
      if (!o.order_number || seen.has(o.order_number)) return false;
      seen.add(o.order_number);
      return true;
    });
    combined.sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime());
    return combined;
  };

  // Check for existing client with same name
  const checkExistingClient = async (clientName: string): Promise<ExistingClientMatch | null> => {
    // NOTE: multiple client records can share the same name (post de-merge),
    // so we must NOT use .maybeSingle() here — it throws on >1 row and would
    // silently hide the comparison card for those clients. Fetch a bounded
    // list and pick the most recently onboarded match instead.
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, state, client_id, kyc_status, monthly_limit, is_buyer, is_seller, date_of_onboarding, pan_card_number, buying_purpose, current_month_used, risk_appetite, first_order_value, client_type, default_risk_level, assigned_operator')
      .eq('is_deleted', false)
      .ilike('name', clientName.trim())
      .order('date_of_onboarding', { ascending: false, nullsFirst: false })
      .limit(1);

    const match = (data && data.length > 0) ? data[0] : null;

    // Fetch ALL transactions for the matched client
    if (match?.id) {
      const allOrders = await fetchAllClientOrders(match.id, match.name);
      setExistingClientTransactions(allOrders);
    } else {
      setExistingClientTransactions([]);
    }

    return match as ExistingClientMatch | null;
  };


  // Approve client mutation
  const approveClientMutation = useMutation({
    mutationFn: async (approvalData: {
      id: string;
      clientData: typeof formData;
      mode: 'normal' | 'merge' | 'create_new';
      existingClientId?: string;
      bankEntries?: BankEntry[];
      incomeDetails?: {
        primarySourceOfIncome: string;
        occupationBusinessType: string;
        monthlyIncomeRange: string;
        sourceOfFundFile: File | null;
      };
      kycDocuments?: {
        aadhaarFiles: File[];
        usdtProofFile: File | null;
        tradeHistoryFile: File | null;
        vkycVideoFile: File | null;
        additionalDocs?: File[];
      };
    }) => {
      const { id, clientData, mode, existingClientId, bankEntries: entries, incomeDetails, kycDocuments } = approvalData;
      
      const approval = approvals?.find(a => a.id === id);
      if (!approval) throw new Error('Approval record not found');

      if (mode === 'merge' && existingClientId) {
        // Merge: update existing client with buyer role
        const { error: updateClientError } = await supabase
          .from('clients')
          .update({
            is_buyer: true,
            buyer_approval_status: 'APPROVED',
            buyer_approved_at: new Date().toISOString(),
            kyc_status: 'VERIFIED',
            monthly_limit: parseFloat(clientData.proposed_monthly_limit),
            buying_purpose: clientData.purpose_of_buying,
            risk_appetite: clientData.risk_assessment,
            operator_notes: clientData.compliance_notes || undefined,
            state: clientData.client_state || approval.client_state || undefined,
            phone: clientData.client_phone || approval.client_phone || undefined,
          })
          .eq('id', existingClientId);

        if (updateClientError) throw updateClientError;
      } else {
        // Check by phone/email first for non-name matches
        let existingByContact = null;
        if (mode === 'normal') {
          const { data } = await supabase
            .from('clients')
            .select('id, name')
            .eq('is_deleted', false)
            .or(`phone.eq.${approval.client_phone || ''}`)
            .maybeSingle();
          existingByContact = data;
        }

        if (existingByContact) {
          // Update existing client found by phone/email
          const { error: updateClientError } = await supabase
            .from('clients')
            .update({
              is_buyer: true,
              buyer_approval_status: 'APPROVED',
              buyer_approved_at: new Date().toISOString(),
              kyc_status: 'VERIFIED',
              monthly_limit: parseFloat(clientData.proposed_monthly_limit),
              buying_purpose: clientData.purpose_of_buying,
              risk_appetite: clientData.risk_assessment,
              operator_notes: clientData.compliance_notes || undefined,
              state: clientData.client_state || approval.client_state || undefined,
              phone: clientData.client_phone || approval.client_phone || undefined
            })
            .eq('id', existingByContact.id);

          if (updateClientError) throw updateClientError;
        } else {
          // Create new client
          const clientName = mode === 'create_new' 
            ? approval.client_name // Name will be unique because it's a different person
            : approval.client_name;
          
          const { error: clientError } = await supabase
            .from('clients')
            .insert({
              name: clientName,
              phone: clientData.client_phone || approval.client_phone,
              client_type: 'INDIVIDUAL',
              kyc_status: 'VERIFIED',
              monthly_limit: parseFloat(clientData.proposed_monthly_limit),
              current_month_used: 0,
              first_order_value: approval.order_amount,
              buying_purpose: clientData.purpose_of_buying,
              risk_appetite: clientData.risk_assessment,
              operator_notes: clientData.compliance_notes || null,
              assigned_operator: 'Compliance Team',
              date_of_onboarding: new Date().toISOString().split('T')[0],
              client_id: generateClientId(),
              is_buyer: true,
              is_seller: false,
              buyer_approval_status: 'APPROVED',
              seller_approval_status: 'NOT_APPLICABLE',
              buyer_approved_at: new Date().toISOString(),
              aadhar_front_url: approval.aadhar_front_url,
              aadhar_back_url: approval.aadhar_back_url,
              state: clientData.client_state || approval.client_state || null
            });

          if (clientError) {
            // If still hits unique constraint, provide clear message
            if (clientError.message?.includes('idx_clients_unique_name_active')) {
              throw new Error(`A client named "${approval.client_name}" already exists. Please use "Link to Existing" or contact admin to resolve.`);
            }
            throw clientError;
          }
        }
      }

      // Update this approval record
      const { error: updateError } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'APPROVED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId,
          aadhar_number: clientData.aadhar_number || null,
          address: clientData.address || null,
          purpose_of_buying: clientData.purpose_of_buying || null,
          proposed_monthly_limit: clientData.proposed_monthly_limit ? parseFloat(clientData.proposed_monthly_limit) : null,
          risk_assessment: clientData.risk_assessment || null,
          compliance_notes: clientData.compliance_notes || null,
          client_phone: clientData.client_phone || approval.client_phone || null,
          client_state: clientData.client_state || approval.client_state || null
        })
        .eq('id', id);

      if (updateError) {
        console.error('Failed to update approval record:', updateError);
        throw updateError;
      }

      // Also approve all other pending records for the same client name
      const { error: batchError } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'APPROVED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId,
          compliance_notes: 'Auto-approved with primary record'
        })
        .eq('approval_status', 'PENDING')
        .ilike('client_name', approval.client_name.trim())
        .neq('id', id);

      if (batchError) {
        console.error('Failed to batch-approve sibling records:', batchError);
      }

      // Save bank details
      if (entries && entries.length > 0) {
        // Determine the client ID to link bank details to
        let targetClientId = existingClientId;
        if (!targetClientId) {
          // Look up the client we just created/updated
          const { data: clientRecord } = await supabase
            .from('clients')
            .select('id')
            .eq('is_deleted', false)
            .ilike('name', approval.client_name.trim())
            .maybeSingle();
          targetClientId = clientRecord?.id;
        }

        if (targetClientId) {
          // Statement files were already uploaded in the background as soon as the
          // reviewer attached them — just resolve those results (or upload inline
          // as a fallback) and insert the bank detail records.
          await Promise.all(
            entries.map(async (entry) => {
              let statementUrl: string | null = null;

              if (entry.statementFile) {
                try {
                  const res = await resolveKycUpload(entry.statementFile);
                  statementUrl = res.url || null;
                } catch (uploadError) {
                  console.error('Failed to upload bank statement:', uploadError);
                }
              }

              const { error: bankInsertError } = await supabase
                .from('client_bank_details')
                .insert({
                  client_id: targetClientId,
                  bank_name: entry.bankName.trim(),
                  last_four_digits: entry.lastFourDigits.trim(),
                  statement_url: statementUrl,
                  statement_period_from: entry.statementPeriodFrom ? entry.statementPeriodFrom.toISOString().split('T')[0] : null,
                  statement_period_to: entry.statementPeriodTo ? entry.statementPeriodTo.toISOString().split('T')[0] : null,
                });

              if (bankInsertError) {
                console.error('Failed to insert bank detail:', bankInsertError);
              }
            })
          );

          // Update linked_bank_accounts JSON on clients table for backward compatibility
          const bankAccountsJson = entries.map(e => ({
            bankName: e.bankName.trim(),
            lastFourDigits: e.lastFourDigits.trim()
          }));

          const { data: currentClient } = await supabase
            .from('clients')
            .select('linked_bank_accounts')
            .eq('id', targetClientId)
            .single();

          let existingAccounts: any[] = [];
          if (currentClient?.linked_bank_accounts) {
            try {
              existingAccounts = Array.isArray(currentClient.linked_bank_accounts)
                ? currentClient.linked_bank_accounts
                : JSON.parse(currentClient.linked_bank_accounts as string);
            } catch { existingAccounts = []; }
          }

          const mergedAccounts = [...existingAccounts, ...bankAccountsJson];

          await supabase
            .from('clients')
            .update({ linked_bank_accounts: mergedAccounts as any })
            .eq('id', targetClientId);
        }
      }

      // Save income details if any field is filled
      if (incomeDetails) {
        const { primarySourceOfIncome: src, occupationBusinessType: occ, monthlyIncomeRange: incRange, sourceOfFundFile: fundFile } = incomeDetails;
        const hasIncomeData = src.trim() || occ.trim() || incRange.trim() || fundFile;
        
        if (hasIncomeData) {
          // Determine client ID
          let incomeClientId = existingClientId;
          if (!incomeClientId) {
            const { data: clientRec } = await supabase
              .from('clients')
              .select('id')
              .eq('is_deleted', false)
              .ilike('name', approval.client_name.trim())
              .maybeSingle();
            incomeClientId = clientRec?.id;
          }

          if (incomeClientId) {
            let fundUrl: string | null = null;
            if (fundFile) {
              try {
                const res = await resolveKycUpload(fundFile);
                fundUrl = res.url || null;
              } catch (uploadErr) {
                console.error('Failed to upload source-of-fund file:', uploadErr);
              }
            }

            await supabase
              .from('client_income_details')
              .upsert({
                client_id: incomeClientId,
                primary_source_of_income: src.trim() || null,
                occupation_business_type: occ.trim() || null,
                monthly_income_range: incRange ? parseFloat(incRange) : null,
                source_of_fund_url: fundUrl,
              }, { onConflict: 'client_id' });
          }
        }
      }

      // Save KYC documents
      if (kycDocuments) {
        const { aadhaarFiles: aFiles, usdtProofFile: uFile, tradeHistoryFile: tFile, vkycVideoFile: vFile, additionalDocs: addDocs } = kycDocuments;

        // All of these files were already uploaded in the background the moment
        // the reviewer attached them. Large vKYC videos are uploaded directly via
        // resumable storage — no slow client-side re-encode on the approval click.
        // Here we just resolve those in-flight/finished
        // uploads — no slow re-encode or sequential upload on the approval click.
        const docTasks: { file: File; type: string; compress?: boolean }[] = [];
        for (const f of aFiles) docTasks.push({ file: f, type: 'aadhaar' });
        if (uFile) docTasks.push({ file: uFile, type: 'usdt_usage_proof' });
        if (tFile) docTasks.push({ file: tFile, type: 'trade_history_screenshot' });
        if (vFile) docTasks.push({ file: vFile, type: 'vkyc_video' });
        if (addDocs && addDocs.length > 0) {
          for (const f of addDocs) docTasks.push({ file: f, type: 'other' });
        }

        if (docTasks.length > 0) {
          let docClientId = existingClientId;
          if (!docClientId) {
            const { data: cr } = await supabase
              .from('clients')
              .select('id')
              .eq('is_deleted', false)
              .ilike('name', approval.client_name.trim())
              .maybeSingle();
            docClientId = cr?.id;
          }

          if (docClientId) {
            // Resolve all background uploads in parallel, then batch-insert metadata.
            const uploadResults = await Promise.all(
              docTasks.map(async (doc) => {
                try {
                  const res = await resolveKycUpload(doc.file, { compress: doc.compress });
                  return {
                    client_id: docClientId,
                    document_type: doc.type,
                    file_url: res.url || '',
                    file_name: res.fileName,
                    file_size: res.fileSize,
                    mime_type: res.mimeType,
                  };
                } catch (upErr) {
                  console.error(`Failed to upload ${doc.type} document:`, upErr);
                  return null;
                }
              })
            );

            const docRows = uploadResults.filter((r): r is NonNullable<typeof r> => r !== null);
            if (docRows.length > 0) {
              await supabase.from('client_kyc_documents').insert(docRows);
            }

            // Update aadhar_front_url on clients for backward compat
            if (aFiles.length > 0) {
              const { data: firstDoc } = await supabase
                .from('client_kyc_documents')
                .select('file_url')
                .eq('client_id', docClientId)
                .eq('document_type', 'aadhaar')
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
              if (firstDoc?.file_url) {
                await supabase.from('clients').update({ aadhar_front_url: firstDoc.file_url }).eq('id', docClientId);
              }
            }
          }
        }
      }
    },
    onSuccess: async (_, variables) => {
      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_BUYER_APPROVED,
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: variables.id,
        module: Modules.CLIENTS,
        metadata: { 
          proposed_monthly_limit: variables.clientData.proposed_monthly_limit,
          mode: variables.mode,
          merged_with: variables.existingClientId || null
        }
      });

      // Client identity is anchored strictly by Binance userNo elsewhere;
      // nickname / verified-name auto-capture has been removed.

      
      toast({
        title: "Client Approved",
        description: variables.mode === 'merge' 
          ? "Client has been linked to existing record and approved"
          : "Client has been successfully onboarded and added to the directory"
      });
      void deleteBuyerApprovalDraft(variables.id);
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-approval-identity'] });
      closeApprovalDialog();
      resetForm();
    },
    onError: (error: any) => {
      console.error('Approval error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve client",
        variant: "destructive"
      });
    }
  });

  // Reject client mutation
  const rejectClientMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'REJECTED',
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerId,
          rejection_reason: reason
        })
        .eq('id', id);

      if (error) {
        console.error('Failed to reject client:', error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      logActionWithCurrentUser({
        actionType: ActionTypes.CLIENT_BUYER_REJECTED,
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: variables.id,
        module: Modules.CLIENTS,
        metadata: { rejection_reason: variables.reason }
      });
      
      toast({
        title: "Client Rejected",
        description: "Client application has been rejected"
      });
      void deleteBuyerApprovalDraft(variables.id);
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject client",
        variant: "destructive"
      });
    }
  });

  const undoRejectClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('client_onboarding_approvals')
        .update({
          approval_status: 'PENDING',
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('approval_status', 'REJECTED');

      if (error) throw error;
    },
    onSuccess: (_, id) => {
      logActionWithCurrentUser({
        actionType: 'client.buyer_rejection_undone',
        entityType: EntityTypes.CLIENT_ONBOARDING,
        entityId: id,
        module: Modules.CLIENTS,
      });

      toast({
        title: "Rejection Undone",
        description: "Client application has been moved back to pending review."
      });
      queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-approval-identity'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Undo Failed",
        description: error.message || "Failed to move client back to pending review",
        variant: "destructive"
      });
    }
  });

  const handleApprovalClick = async (approval: ClientOnboardingApproval, approvalsForReview: ClientOnboardingApproval[] = [approval]) => {
    setSelectedApproval(approval);
    // Resolve P2P Terminal order ID(s) for display in every review path. Direct
    // sales links resolve via terminal_sales_sync; de-merge siblings fall back to
    // Binance history by nickname / verified-name + amount/date.
    setReviewNicknameOrders([]);
    setReviewOrdersLoading(true);
    fetchApprovalsP2POrders(approvalsForReview)
      .then(setReviewNicknameOrders)
      .finally(() => setReviewOrdersLoading(false));
    const phone = approval.client_phone || '';
    const state = approval.client_state || '';
    const draft = await loadBuyerApprovalDraft(approval.id);
    if (draft) {
      setFormData(draft.formData);
      setBankEntries(draft.bankEntries);
      setApprovalMode(draft.approvalMode);
      setPhoneEditEnabled(draft.phoneEditEnabled);
      setStateEditEnabled(draft.stateEditEnabled);
      setPrimarySourceOfIncome(draft.primarySourceOfIncome);
      setOccupationBusinessType(draft.occupationBusinessType);
      setMonthlyIncomeRange(draft.monthlyIncomeRange);
      setSourceOfFundFile(draft.sourceOfFundFile);
      setAadhaarFiles(draft.aadhaarFiles);
      setUsdtProofFile(draft.usdtProofFile);
      setTradeHistoryFile(draft.tradeHistoryFile);
      setVkycVideoFile(draft.vkycVideoFile);
      setAdditionalDocs(draft.additionalDocs || []);
    } else {
      setFormData({
        aadhar_number: approval.aadhar_number || '',
        address: approval.address || '',
        purpose_of_buying: approval.purpose_of_buying || '',
        proposed_monthly_limit: approval.proposed_monthly_limit?.toString() || '',
        risk_assessment: approval.risk_assessment || 'HIGH_RISK',
        compliance_notes: approval.compliance_notes || '',
        client_state: state,
        client_phone: phone
      });
      setBankEntries([createEmptyBankEntry()]);
      setPrimarySourceOfIncome('');
      setOccupationBusinessType('');
      setMonthlyIncomeRange('');
      setSourceOfFundFile(null);
      setAadhaarFiles([]);
      setUsdtProofFile(null);
      setTradeHistoryFile(null);
      setVkycVideoFile(null);
      // Lock fields if already pre-populated
      setPhoneEditEnabled(!phone);
      setStateEditEnabled(!state);
    }
    
    // Hard-lock to resolved_client_id when the DB trigger has already
    // identified the counterparty as an existing client (nickname / verified-
    // name / case-insensitive name / phone). This eliminates duplicate
    // "Known Client" approvals.
    let existing: ExistingClientMatch | null = null;
    if (approval.resolved_client_id) {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone, email, state, client_id, kyc_status, monthly_limit, is_buyer, is_seller, date_of_onboarding, pan_card_number, buying_purpose, current_month_used, risk_appetite, first_order_value, client_type, default_risk_level, assigned_operator')
        .eq('id', approval.resolved_client_id)
        .eq('is_deleted', false)
        .maybeSingle();
      if (data) {
        existing = data as ExistingClientMatch;
        const allOrders = await fetchAllClientOrders(data.id, data.name);
        setExistingClientTransactions(allOrders);
      }
    }
    if (!existing) {
      existing = await checkExistingClient(approval.client_name);
    }
    setExistingClientMatch(existing);
    if (existing) {
      if (!draft) setApprovalMode('merge');
      // Auto-fill monthly limit from existing client if not already provided in the approval
      if (!draft && existing.monthly_limit && !approval.proposed_monthly_limit) {
        setFormData(prev => ({ ...prev, proposed_monthly_limit: existing!.monthly_limit!.toString() }));
      }
    } else {
      if (!draft) setApprovalMode('normal');
    }
    setDialogOpen(true);

    // Resolve Binance identity (userNo + nickname) for both the matched existing
    // client and the incoming onboarding request — display only.
    setIdentityDetail({
      existingUserNo: null,
      existingNickname: null,
      requestUserNo: approval.cp_userno ? String(approval.cp_userno) : null,
      requestNickname: sanitizeNickname(approval.binance_nickname),
    });
    void (async () => {
      const next = {
        existingUserNo: null as string | null,
        existingNickname: null as string | null,
        // Authoritative applicant userNo lives on the approval row itself.
        requestUserNo: approval.cp_userno ? String(approval.cp_userno) : null,
        requestNickname: sanitizeNickname(approval.binance_nickname),
      };
      // Existing client identity
      if (existing?.id) {
        const [{ data: unoRow }, { data: nickRow }] = await Promise.all([
          supabase.from('client_binance_usernos').select('cp_userno').eq('client_id', existing.id).limit(1).maybeSingle(),
          supabase.from('client_binance_nicknames').select('nickname').eq('client_id', existing.id).limit(1).maybeSingle(),
        ]);
        next.existingUserNo = unoRow?.cp_userno ? String(unoRow.cp_userno) : null;
        next.existingNickname = sanitizeNickname(nickRow?.nickname);
      }
      // Fallback: resolve incoming request identity via its P2P order only when
      // the approval row has no authoritative userNo. Await the P2P orders fetch
      // instead of reading stale React state.
      if (!next.requestUserNo) {
        const p2pOrders = await fetchApprovalsP2POrders(approvalsForReview);
        const orderNo = p2pOrders?.[0]?.order_number || null;
        if (orderNo) {
          const { data: idRow } = await supabase
            .from('cp_order_identity')
            .select('cp_userno, nickname')
            .eq('order_number', String(orderNo))
            .maybeSingle();
          if (idRow?.cp_userno) next.requestUserNo = String(idRow.cp_userno);
          next.requestNickname = next.requestNickname || sanitizeNickname(idRow?.nickname);
        }
      }
      setIdentityDetail(next);
    })();
  };

  const handleApprove = () => {
    if (!selectedApproval) return;
    
    // Buyer mandatory validation: phone and state required
    if (!formData.client_phone?.trim()) {
      toast({
        title: "Missing Information",
        description: "Phone number is mandatory for buyer approval",
        variant: "destructive"
      });
      return;
    }
    
    if (!formData.client_state?.trim()) {
      toast({
        title: "Missing Information",
        description: "State is mandatory for buyer approval",
        variant: "destructive"
      });
      return;
    }
    
    // For merge mode, monthly limit is optional (uses existing client's limit)
    const needsLimit = approvalMode !== 'merge' || !existingClientMatch?.monthly_limit;
    
    if (needsLimit && !formData.proposed_monthly_limit) {
      toast({
        title: "Missing Information",
        description: "Please enter the monthly transaction limit",
        variant: "destructive"
      });
      return;
    }

    // Bank details validation: at least one entry with bank name + last 4 digits
    const hasValidBank = bankEntries.some(e => e.bankName.trim() && e.lastFourDigits.trim().length === 4);
    if (!hasValidBank) {
      toast({
        title: "Missing Information",
        description: "At least one bank account with bank name and last 4 digits is required",
        variant: "destructive"
      });
      return;
    }

    // Aadhaar validation: at least 1 file required
    if (aadhaarFiles.length === 0) {
      toast({
        title: "Missing Information",
        description: "At least one Aadhaar document is required",
        variant: "destructive"
      });
      return;
    }

    // Validate all filled entries have complete data
    for (const entry of bankEntries) {
      if (entry.bankName.trim() || entry.lastFourDigits.trim()) {
        if (!entry.bankName.trim() || entry.lastFourDigits.trim().length !== 4) {
          toast({
            title: "Incomplete Bank Details",
            description: "Each bank entry must have a bank name and exactly 4 digits",
            variant: "destructive"
          });
          return;
        }
      }
    }

    // If there's a name match and operator hasn't chosen, block
    if (existingClientMatch && approvalMode !== 'merge' && approvalMode !== 'create_new') {
      toast({
        title: "Action Required",
        description: "Please choose to link to existing client or create a new one",
        variant: "destructive"
      });
      return;
    }
    
    approveClientMutation.mutate({
      id: selectedApproval.id,
      clientData: {
        ...formData,
        proposed_monthly_limit: formData.proposed_monthly_limit || existingClientMatch?.monthly_limit?.toString() || '',
      },
      mode: approvalMode,
      existingClientId: approvalMode === 'merge' ? existingClientMatch?.id : undefined,
      bankEntries: bankEntries.filter(e => e.bankName.trim() && e.lastFourDigits.trim().length === 4),
      incomeDetails: {
        primarySourceOfIncome,
        occupationBusinessType,
        monthlyIncomeRange,
        sourceOfFundFile
      },
      kycDocuments: {
        aadhaarFiles,
        usdtProofFile,
        tradeHistoryFile,
        vkycVideoFile,
        additionalDocs
      }
    });
  };

  const handleReject = (id: string, reason: string) => {
    rejectClientMutation.mutate({ id, reason });
  };

  // Reject all duplicate approval records for the same client
  const handleRejectAll = (ids: string[], reason: string) => {
    for (const id of ids) {
      rejectClientMutation.mutate({ id, reason });
    }
  };

  const handleViewOrder = async (salesOrderId: string | undefined) => {
    if (!salesOrderId) {
      toast({ title: "No linked order", description: "This approval has no associated sales order", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', salesOrderId)
      .single();
    if (error || !data) {
      toast({ title: "Order not found", description: "Could not fetch the linked sales order", variant: "destructive" });
      return;
    }
    setViewOrderData(data);
    setViewOrderOpen(true);
  };

  const dedupeP2POrders = (rows: any[]) => {
    const map = new Map<string, any>();
    for (const row of rows) {
      if (!row?.order_number) continue;
      const key = String(row.order_number);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...row });
        continue;
      }
      // Merge without letting lower-priority (fallback) data clobber the
      // authoritative binance_order_history values. Authoritative rows always
      // win; otherwise a field is only filled when the target value is missing.
      const rowAuthoritative = !!row._authoritative;
      const existingAuthoritative = !!existing._authoritative;
      const merged = { ...existing };
      for (const [field, value] of Object.entries(row)) {
        if (value === undefined || value === null || value === '') continue;
        const existingValue = merged[field];
        const existingMissing =
          existingValue === undefined || existingValue === null || existingValue === '';
        if (existingMissing || (rowAuthoritative && !existingAuthoritative)) {
          merged[field] = value;
        }
      }
      merged._authoritative = existingAuthoritative || rowAuthoritative;
      map.set(key, merged);
    }
    return Array.from(map.values()).sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0));
  };


  // Resolve P2P Terminal orders for any approval row. Some de-merged rows do
  // not carry sales_order_id and some Binance history nicknames are masked, so
  // use progressively safer fallbacks without relying on client-name alone.
  const fetchApprovalP2POrders = async (approval: ClientOnboardingApproval): Promise<any[]> => {
    const rows: any[] = [];
    const nick = sanitizeNickname(approval.binance_nickname);
    const cleanName = cleanApprovalPersonName(approval.client_name);
    const verifiedName = sanitizeVerifiedName(approval.verified_name) || cleanName;

    if (approval.sales_order_id) {
      const { data: syncRows } = await supabase
        .from('terminal_sales_sync')
        .select('binance_order_number, order_data, sales_order_id')
        .eq('sales_order_id', approval.sales_order_id);

      const orderNumbers = (syncRows || [])
        .map((r: any) => r.binance_order_number)
        .filter(Boolean);

      if (orderNumbers.length > 0) {
        const { data: historyRows } = await supabase
          .from('binance_order_history')
          .select('order_number, trade_type, total_price, create_time, verified_name, counter_part_nick_name')
          .in('order_number', orderNumbers);
        rows.push(...(historyRows || []).map((r: any) => ({ ...r, _authoritative: true })));
      }

      for (const r of syncRows || []) {
        const od = (r.order_data as any) || {};
        if (!r.binance_order_number) continue;
        rows.push({
          order_number: r.binance_order_number,
          trade_type: od.trade_type || od.tradeType || 'BUY',
          total_price: od.total_price || approval.order_amount,
          create_time: od.create_time || (approval.order_date ? new Date(`${approval.order_date}T00:00:00`).getTime() : null),
          verified_name: od.verified_name || verifiedName,
          counter_part_nick_name: od.counterparty_nickname_unmasked || od.counterparty_nickname || nick,
        });
      }
    }

    if (nick) {
      const { data } = await supabase
        .from('binance_order_history')
        .select('order_number, trade_type, total_price, create_time, verified_name, counter_part_nick_name')
        .eq('counter_part_nick_name', nick)
        .order('create_time', { ascending: false })
        .limit(200);
      rows.push(...(data || []).map((r: any) => ({ ...r, _authoritative: true })));
    }

    if (verifiedName) {
      const { data } = await supabase
        .from('binance_order_history')
        .select('order_number, trade_type, total_price, create_time, verified_name, counter_part_nick_name')
        .ilike('verified_name', verifiedName)
        .order('create_time', { ascending: false })
        .limit(200);
      rows.push(
        ...((data || []).filter((row: any) => {
          const sameVerifiedName = normalizeTextKey(row.verified_name) === normalizeTextKey(verifiedName);
          return sameVerifiedName &&
            orderAmountMatchesApprovalAmount(row.total_price, approval.order_amount) &&
            orderDateMatchesApprovalDate(row.create_time, approval.order_date);
        }).map((r: any) => ({ ...r, _authoritative: true })))
      );
    }

    return dedupeP2POrders(rows);
  };

  const fetchApprovalsP2POrders = async (approvalRows: ClientOnboardingApproval[]): Promise<any[]> => {
    const batches = await Promise.all(approvalRows.map((approval) => fetchApprovalP2POrders(approval)));
    return dedupeP2POrders(batches.flat());
  };

  const handleViewApprovalOrders = async (approvalRows: ClientOnboardingApproval[], title: string) => {
    // Prefer showing the full-length Sales Order Details dialog reflecting the
    // client's LATEST order. Fall back to the P2P Terminal Orders list only when
    // no linked sales order can be resolved.
    setNicknameOrdersTitle(title);
    setNicknameOrdersLoading(true);

    // 1) If any approval row already carries a sales_order_id, resolve the latest.
    const directIds = approvalRows
      .map((a) => a.sales_order_id)
      .filter(Boolean) as string[];

    // 2) Gather P2P order numbers (already sorted latest-first) and map them to
    //    linked sales orders via terminal_sales_sync.
    const p2pOrders = await fetchApprovalsP2POrders(approvalRows);
    const orderNumbers = p2pOrders.map((o: any) => String(o.order_number)).filter(Boolean);

    let syncSalesIds: string[] = [];
    if (orderNumbers.length > 0) {
      const { data: syncRows } = await supabase
        .from('terminal_sales_sync')
        .select('binance_order_number, sales_order_id')
        .in('binance_order_number', orderNumbers);
      // Preserve latest-first ordering from p2pOrders.
      const idByOrder = new Map<string, string>();
      for (const r of syncRows || []) {
        if (r.binance_order_number && r.sales_order_id) {
          idByOrder.set(String(r.binance_order_number), r.sales_order_id as string);
        }
      }
      syncSalesIds = orderNumbers
        .map((n) => idByOrder.get(n))
        .filter(Boolean) as string[];
    }

    const candidateIds = Array.from(new Set([...directIds, ...syncSalesIds]));

    if (candidateIds.length > 0) {
      const { data: salesRows } = await supabase
        .from('sales_orders')
        .select('*')
        .in('id', candidateIds)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (salesRows && salesRows.length > 0) {
        setNicknameOrdersLoading(false);
        setViewOrderData(salesRows[0]);
        setViewOrderOpen(true);
        return;
      }
    }

    // Fallback: no linked sales order — show the P2P Terminal Orders list.
    setNicknameOrdersOpen(true);
    setNicknameOrders(p2pOrders);
    setNicknameOrdersLoading(false);
  };

  // Resolve a single P2P order number to its full Sales Order and open the
  // full-length Sales Order Details dialog. Falls back to a toast if the order
  // has no linked sales order (e.g. it was never approved/synced).
  const openSalesOrderForP2P = async (orderNumber: string | number | undefined) => {
    if (!orderNumber) return;
    const num = String(orderNumber);
    const { data: syncRows } = await supabase
      .from('terminal_sales_sync')
      .select('sales_order_id')
      .eq('binance_order_number', num);
    const salesId = (syncRows || []).map((r: any) => r.sales_order_id).filter(Boolean)[0];
    if (!salesId) {
      toast({
        title: 'No linked sales order',
        description: `Order ${num} has no synced sales order yet.`,
        variant: 'destructive',
      });
      return;
    }
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', salesId)
      .single();
    if (error || !data) {
      toast({ title: 'Order not found', description: 'Could not fetch the linked sales order', variant: 'destructive' });
      return;
    }
    setNicknameOrdersOpen(false);
    setViewOrderData(data);
    setViewOrderOpen(true);
  };



  const handleViewNicknameOrders = async (approval: ClientOnboardingApproval) => {
    await handleViewApprovalOrders([approval], approval.client_name);
  };



  const resetForm = () => {
    setFormData(createEmptyApprovalFormData());
    setSelectedApproval(null);
    setExistingClientMatch(null);
    setApprovalMode('normal');
    setPhoneEditEnabled(false);
    setStateEditEnabled(false);
    setBankEntries([createEmptyBankEntry()]);
    setPrimarySourceOfIncome('');
    setOccupationBusinessType('');
    setMonthlyIncomeRange('');
    setSourceOfFundFile(null);
    setAadhaarFiles([]);
    setUsdtProofFile(null);
    setTradeHistoryFile(null);
    setVkycVideoFile(null);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'PENDING': 'bg-warning/10 text-warning border-warning/20',
      'UNDER_REVIEW': 'bg-info/10 text-info border-info/20',
      'APPROVED': 'bg-success/10 text-success border-success/20',
      'REJECTED': 'bg-destructive/10 text-destructive border-destructive/20'
    };
    return <Badge className={variants[status as keyof typeof variants]}>{status}</Badge>;
  };

  const [reuploadTarget, setReuploadTarget] = useState<
    { approvalId: string; field: 'aadhar_front_url' | 'binance_id_screenshot_url' | 'vkyc_recording_url'; label: string } | null
  >(null);

  // Returns true if the stored (non-multipart) document is reachable, false if it 404s / is missing.
  const documentIsReachable = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleUnavailable = (meta?: { approvalId: string; field: 'aadhar_front_url' | 'binance_id_screenshot_url' | 'vkyc_recording_url'; label: string }) => {
    if (meta) {
      setReuploadTarget(meta);
    } else {
      toast({ title: 'Document unavailable', description: 'This file is missing (404) and needs to be re-uploaded.', variant: 'destructive' });
    }
  };

  const openDocument = async (
    url: string,
    meta?: { approvalId: string; field: 'aadhar_front_url' | 'binance_id_screenshot_url' | 'vkyc_recording_url'; label: string },
  ) => {
    // Large vKYC videos are stored as multipart chunks + a manifest JSON.
    // Opening the raw manifest URL shows JSON instead of the video, so resolve
    // and reconstruct the original file before opening. Resolve exactly ONCE —
    // the resolve step both validates reachability (it throws if chunks are
    // missing) and produces the blob URL used by the popup.
    if (isMultipartManifestUrl(url)) {
      const popup = window.open('', '_blank');
      if (popup) {
        popup.document.write("<p style='font-family: sans-serif; padding: 16px;'>Preparing large video...</p>");
      }
      try {
        const resolvedUrl = await resolveMultipartManifestUrl(url, 'kyc-documents');
        if (popup) popup.location.href = resolvedUrl;
        else window.open(resolvedUrl, '_blank');
      } catch (err: any) {
        if (popup) popup.close();
        // A resolve failure here means the manifest or a chunk is missing (404).
        handleUnavailable(meta);
      }
      return;
    }

    // Plain single-file documents: cheap HEAD check, then open directly.
    const reachable = await documentIsReachable(url);
    if (!reachable) {
      handleUnavailable(meta);
      return;
    }
    try {
      await openStorageDocumentUrl(url, 'kyc-documents');
    } catch (err: any) {
      toast({ title: 'Could not open document', description: err?.message || 'Failed to load the file.', variant: 'destructive' });
    }
  };


  // Deduplicate pending approvals by client_name — show each client once with aggregated order info.
  // A single client can accumulate phantom sibling records (order_amount = 0, no linked sales
  // order, no phone) created during onboarding submission. Those are NOT real orders and must
  // never inflate the "N orders" badge — otherwise the row count disagrees with what Review shows.
  const isRealOrderApproval = (a: ClientOnboardingApproval) =>
    !!a.sales_order_id || (Number(a.order_amount) || 0) > 0;
  const allPending = approvals?.filter(a => a.approval_status === 'PENDING') || [];
  const pendingByClient = new Map<string, { primary: ClientOnboardingApproval; all: ClientOnboardingApproval[]; allIds: string[]; totalAmount: number; orderCount: number }>();
  for (const a of allPending) {
    const key = a.client_name.trim().toLowerCase();
    const real = isRealOrderApproval(a);
    const existing = pendingByClient.get(key);
    if (existing) {
      existing.allIds.push(a.id);
      existing.all.push(a);
      existing.totalAmount += a.order_amount;
      // Count only records that represent an actual order.
      if (real) existing.orderCount += 1;
      // Keep the latest REAL record as primary; only fall back to a phantom when
      // no real record exists yet.
      const existingReal = isRealOrderApproval(existing.primary);
      const preferNew =
        (real && !existingReal) ||
        (real === existingReal && new Date(a.created_at) > new Date(existing.primary.created_at));
      if (preferNew) existing.primary = a;
    } else {
      pendingByClient.set(key, { primary: a, all: [a], allIds: [a.id], totalAmount: a.order_amount, orderCount: real ? 1 : 0 });
    }
  }
  const allPendingApprovals = Array.from(pendingByClient.values());

  const search = searchTerm.trim().toLowerCase();
  const pendingApprovals = search
    ? allPendingApprovals.filter((entry) => {
        const a = entry.primary;
        return (
          a.client_name?.toLowerCase().includes(search) ||
          a.client_phone?.toLowerCase().includes(search) ||
          (identityMap?.[a.id]?.nickname || '').toLowerCase().includes(search)
        );
      })
    : allPendingApprovals;
  // A single client can have several onboarding submissions (multiple KYC uploads /
  // re-submissions). When one is approved, its siblings are auto-approved too — some of
  // those siblings carry order_amount = 0, which is NOT a real "client without orders",
  // just a duplicate record. Collapse the history to one row per client (name + phone),
  // keeping the record that actually holds the order value & proposed limit.
  const reviewedApprovals = (() => {
    const all = approvals?.filter(a => a.approval_status !== 'PENDING') || [];
    const groups = new Map<string, typeof all[number]>();
    for (const a of all) {
      const key = `${(a.client_name || '').trim().toLowerCase()}|${(a.client_phone || '').trim()}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, a);
        continue;
      }
      // Prefer the richer record: higher order amount, then a real proposed limit.
      const better =
        (a.order_amount || 0) > (existing.order_amount || 0) ||
        ((a.order_amount || 0) === (existing.order_amount || 0) &&
          (a.proposed_monthly_limit || 0) > (existing.proposed_monthly_limit || 0));
      if (better) {
        // Carry over reviewer/limit info if the richer record is missing them.
        groups.set(key, {
          ...a,
          reviewed_by: a.reviewed_by || existing.reviewed_by,
          reviewed_at: a.reviewed_at || existing.reviewed_at,
          proposed_monthly_limit: a.proposed_monthly_limit ?? existing.proposed_monthly_limit,
        });
      } else if (!existing.reviewed_by && a.reviewed_by) {
        groups.set(key, { ...existing, reviewed_by: a.reviewed_by, reviewed_at: existing.reviewed_at || a.reviewed_at });
      }
    }
    return Array.from(groups.values()).sort(
      (x, y) => new Date(y.reviewed_at || 0).getTime() - new Date(x.reviewed_at || 0).getTime()
    );
  })();

  // Build nickname-based "Same User" detection — sanitized so 'Unknown' / masked
  // values can NEVER be grouping keys (these were creating false N-way merges).
  const nicknameGroups = new Map<string, string[]>();
  for (const [nameKey, entry] of pendingByClient) {
    const idInfo = identityMap?.[entry.primary.id];
    const safeNick = sanitizeNickname(idInfo?.nickname);
    if (!safeNick) continue;
    const existing = nicknameGroups.get(safeNick) || [];
    if (!existing.includes(nameKey)) existing.push(nameKey);
    nicknameGroups.set(safeNick, existing);
  }
  const sameUserNicknames = new Map<string, string>();
  for (const [nick, nameKeys] of nicknameGroups) {
    if (nameKeys.length > 1) {
      for (const nk of nameKeys) sameUserNicknames.set(nk, nick);
    }
  }

  // Secondary grouping by verified KYC name — only for rows with no real nickname.
  // Two pending approvals sharing the same verified KYC name → legitimate "same user".
  const vnameGroups = new Map<string, string[]>();
  for (const [nameKey, entry] of pendingByClient) {
    const idInfo = identityMap?.[entry.primary.id];
    if (sanitizeNickname(idInfo?.nickname)) continue; // already handled by nickname grouping
    const vname = sanitizeVerifiedName(idInfo?.verifiedName);
    if (!vname) continue;
    const existing = vnameGroups.get(vname) || [];
    if (!existing.includes(nameKey)) existing.push(nameKey);
    vnameGroups.set(vname, existing);
  }
  const sameUserVNames = new Map<string, string>();
  for (const [vn, nameKeys] of vnameGroups) {
    if (nameKeys.length > 1) {
      for (const nk of nameKeys) sameUserVNames.set(nk, vn);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-6 w-6 text-warning" />
        <h2 className="text-2xl font-bold">Client Onboarding Approvals</h2>
        <Badge variant="destructive">{pendingApprovals.length} Pending</Badge>
      </div>

      {/* Pending Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            Pending Client Approvals ({pendingApprovals.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone or Binance ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <SegmentedControl
              size="sm"
              aria-label="Row density"
              value={density}
              onValueChange={(v) => setDensity(v as 'comfortable' | 'compact')}
              options={[
                { label: 'Comfortable', value: 'comfortable' },
                { label: 'Compact', value: 'compact' },
              ]}
            />
          </div>

          {searchTerm.trim() && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <FilterChip label="Search:" value={searchTerm} onRemove={() => setSearchTerm('')} />
            </div>
          )}

          {isLoading ? (
            <TableSkeleton rows={8} columns={8} />
          ) : (
            <Table stickyHeader density={density} maxHeight="65vh">
              <TableHeader>
                 <TableRow>
                   <TableHead>Client Name</TableHead>
                   <TableHead>Binance ID</TableHead>
                   <TableHead numeric>Order Details</TableHead>
                   <TableHead>Contact</TableHead>
                   <TableHead>Documents</TableHead>
                   <TableHead>VKYC</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Actions</TableHead>
                 </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApprovals.map((entry) => {
                  const approval = entry.primary;
                  const nameKey = approval.client_name.trim().toLowerCase();
                  const idInfo = identityMap?.[approval.id];
                  const sameUserNick = sameUserNicknames.get(nameKey);
                  const sameUserVName = !sameUserNick ? sameUserVNames.get(nameKey) : undefined;
                  const state = idInfo?.state || 'new_client';
                  const matched = idInfo?.matchedClient;
                  const safeNick = sanitizeNickname(idInfo?.nickname);
                  const safeVName = sanitizeVerifiedName(idInfo?.verifiedName);
                  // True "no identity signal" — new client with neither real nickname nor KYC name.
                  const noIdentitySignal =
                    !sameUserNick && !sameUserVName && state === 'new_client' && !safeNick && !safeVName;
                  return (
                  <TableRow key={approval.id}>
                    <TableCell className="font-medium">
                      <div>
                        {approval.client_name}
                        {entry.orderCount > 1 && (
                          <Badge variant="outline" className="ml-2 text-xs">{entry.orderCount} orders</Badge>
                        )}
                      </div>
                      {sameUserNick && (
                        <Badge className="mt-1 bg-primary/10 text-primary border-primary/20 text-xs">
                          ⚠ Same User — different name
                        </Badge>
                      )}
                      {sameUserVName && (
                        <Badge
                          className="mt-1 bg-primary/10 text-primary border-primary/20 text-xs"
                          title="Multiple pending approvals share this verified KYC name."
                        >
                          ⚠ Same User — same KYC name
                        </Badge>
                      )}
                      {!sameUserNick && !sameUserVName && state === 'linked_known' && matched && (
                        <Badge
                          className="mt-1 bg-info/10 text-info border-info/20 text-xs"
                          title={`Client ID: ${matched.client_id || matched.id} • Risk: ${matched.risk_appetite || '—'} • Buyer: ${matched.buyer_approval_status || '—'} • Seller: ${matched.seller_approval_status || '—'}`}
                        >
                          🔗 Known Client: {matched.name}{idInfo?.nickname ? ` · @${idInfo.nickname}` : ''}
                        </Badge>
                      )}
                      {!sameUserNick && !sameUserVName && state === 'verified_name_match' && matched && (
                        <Badge
                          className="mt-1 bg-teal-100 text-teal-800 text-xs"
                          title={`KYC name matches existing client ${matched.name} (${matched.client_id || matched.id}). Approving will link this nickname.`}
                        >
                          🪪 Same KYC name — {matched.name}
                        </Badge>
                      )}
                      {!sameUserNick && !sameUserVName && state === 'name_collision' && matched && (
                        <div className="mt-1 flex flex-col gap-1">
                          <Badge
                            className="bg-warning/10 text-warning text-xs"
                            title={`A client named "${matched.name}" already exists, but neither the Binance nickname nor verified name match — likely a different person.`}
                          >
                            ⚠ Different person — same name as {matched.name}
                          </Badge>
                          {idInfo?.nickname && hasPermission('clients_destructive') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2"
                              disabled={linkNicknameMutation.isPending}
                              onClick={() => linkNicknameMutation.mutate({ clientId: matched.id, nickname: idInfo.nickname! })}
                            >
                              This is actually {matched.name} — link nickname
                            </Button>
                          )}
                        </div>
                      )}
                      {!sameUserNick && !sameUserVName && state === 'new_client' && !noIdentitySignal && (
                        <Badge variant="outline" className="mt-1 text-xs">New Client</Badge>
                      )}
                      {noIdentitySignal && (
                        <Badge
                          className="mt-1 bg-warning/10 text-warning text-xs border border-warning/30"
                          title="No real Binance nickname and no verified KYC name — verify identity manually before approving."
                        >
                          ⚠ No identity signal — review manually
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-mono">{idInfo?.nickname || '—'}</div>
                        {idInfo?.verifiedName && (
                          <div className="text-xs text-muted-foreground">{idInfo.verifiedName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell numeric>
                      <div className="text-sm">
                        {entry.totalAmount > 0 ? (
                          <>
                            <div>₹{entry.totalAmount.toLocaleString('en-IN')}</div>
                            {approval.order_date && (
                              <div className="text-muted-foreground">{new Date(approval.order_date).toLocaleDateString()}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No linked order</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        <div>{approval.client_phone}</div>
                        {approval.client_state && (
                          <div className="text-muted-foreground">{approval.client_state}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {approval.aadhar_front_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocument(approval.aadhar_front_url!, { approvalId: approval.id, field: 'aadhar_front_url', label: 'Aadhaar' })}
                          >
                            <FileText className="h-3 w-3" />
                          </Button>
                        )}
                        {approval.binance_id_screenshot_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocument(approval.binance_id_screenshot_url!, { approvalId: approval.id, field: 'binance_id_screenshot_url', label: 'Binance ID screenshot' })}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {approval.vkyc_recording_url ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDocument(approval.vkyc_recording_url!, { approvalId: approval.id, field: 'vkyc_recording_url', label: 'vKYC recording' })}
                        >
                          <Video className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">No VKYC</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(approval.approval_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {approval.sales_order_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewOrder(approval.sales_order_id)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View Order
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewApprovalOrders(entry.all, approval.client_name)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View Orders
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleApprovalClick(approval, entry.all)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Review
                        </Button>
                        {hasPermission('clients_destructive') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectAll(entry.allIds, 'Insufficient documentation')}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
                {pendingApprovals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No pending approvals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reviewed Approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Approval History ({reviewedApprovals.length})
            {reviewedApprovals.filter(a => a.approval_status === 'REJECTED').length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {reviewedApprovals.filter(a => a.approval_status === 'REJECTED').length} Rejected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Order Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reviewed By</TableHead>
                <TableHead>Review Date</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewedApprovals.map((approval) => (
                <TableRow key={approval.id} className={approval.approval_status === 'REJECTED' ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-medium">{approval.client_name}</TableCell>
                  <TableCell>{approval.order_amount > 0 ? `₹${approval.order_amount.toLocaleString('en-IN')}` : <span className="text-xs text-muted-foreground italic">No linked order</span>}</TableCell>
                  <TableCell>{getStatusBadge(approval.approval_status)}</TableCell>
                  <TableCell>{(approval.reviewed_by && (reviewerNameMap?.[approval.reviewed_by] || approval.reviewed_by)) || '-'}</TableCell>
                  <TableCell>
                    {approval.reviewed_at ? new Date(approval.reviewed_at).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {approval.approval_status === 'APPROVED' ? (
                      <span className="text-sm text-muted-foreground">
                        Limit: ₹{approval.proposed_monthly_limit?.toLocaleString('en-IN') || '-'}
                      </span>
                    ) : approval.approval_status === 'REJECTED' ? (
                      <span className="text-sm text-destructive">
                        Reason: {approval.rejection_reason || 'Not specified'}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {approval.approval_status === 'REJECTED' && hasPermission('clients_destructive') ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => undoRejectClientMutation.mutate(approval.id)}
                        disabled={undoRejectClientMutation.isPending}
                      >
                        <Undo2 className="h-3 w-3 mr-1" />
                        Undo
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {reviewedApprovals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No reviewed applications yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeApprovalDialog()}>
        <DialogContent className="md:max-w-[95vw] lg:max-w-[1400px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Client Onboarding Form</DialogTitle>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-6">
              {/* Existing Client Match Warning */}
              {existingClientMatch && (
                <div className="border border-warning/30 bg-warning/5 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-warning font-semibold">
                    <AlertTriangle className="h-5 w-5" />
                    Existing Client Found with Same Name
                  </div>
                  <p className="text-sm text-warning">
                    A client named <strong>"{existingClientMatch.name}"</strong> already exists. Please verify if this is the same person before proceeding.
                  </p>
                  
                  {/* Existing client details */}
                   <div className="bg-card rounded-md p-3 border border-warning/20">
                    <h4 className="font-semibold text-sm mb-2 text-foreground">Existing Client Record</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                     <div><span className="text-muted-foreground">Client ID:</span> {existingClientMatch.client_id}</div>
                      <div><span className="text-muted-foreground">User No:</span> <span className="font-mono">{identityDetail.existingUserNo || 'N/A'}</span></div>
                      <div><span className="text-muted-foreground">Nickname:</span> {identityDetail.existingNickname ? `@${identityDetail.existingNickname}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {existingClientMatch.phone || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {existingClientMatch.state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {existingClientMatch.state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">PAN:</span> {existingClientMatch.pan_card_number || 'N/A'}</div>
                      <div><span className="text-muted-foreground">KYC:</span> {existingClientMatch.kyc_status}</div>
                      <div><span className="text-muted-foreground">Monthly Limit:</span> {existingClientMatch.monthly_limit ? `₹${existingClientMatch.monthly_limit.toLocaleString('en-IN')}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Used This Month:</span> ₹{existingClientMatch.current_month_used?.toLocaleString('en-IN') || '0'}</div>
                      <div><span className="text-muted-foreground">First Order:</span> {existingClientMatch.first_order_value ? `₹${existingClientMatch.first_order_value.toLocaleString('en-IN')}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Buyer:</span> {existingClientMatch.is_buyer ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground">Seller:</span> {existingClientMatch.is_seller ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground">Client Type:</span> {existingClientMatch.client_type || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Risk Appetite:</span> {existingClientMatch.risk_appetite || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Risk Level:</span> {existingClientMatch.default_risk_level || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Operator:</span> {existingClientMatch.assigned_operator || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Onboarded:</span> {existingClientMatch.date_of_onboarding}</div>
                      <div><span className="text-muted-foreground">Purpose:</span> {existingClientMatch.buying_purpose || 'N/A'}</div>
                    </div>
                  </div>

                  {/* All Orders */}
                  {existingClientTransactions.length > 0 && (
                    <div className="bg-card rounded-md p-3 border border-warning/20">
                      <h4 className="font-semibold text-sm mb-2 text-foreground">All Orders ({existingClientTransactions.length})</h4>
                      <div className="w-full max-h-72 overflow-y-auto">
                        <table className="w-full text-xs table-fixed">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-1 pr-2">Order #</th>
                              <th className="text-left py-1 pr-2">Date</th>
                              <th className="text-left py-1 pr-2">Type</th>
                              <th className="text-right py-1 pr-2">Amount</th>
                              <th className="text-right py-1 pr-2">Qty</th>
                              <th className="text-right py-1 pr-2">Rate</th>
                              <th className="text-left py-1 pr-2">Phone</th>
                              <th className="text-left py-1 pr-2">State</th>
                              <th className="text-left py-1">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {existingClientTransactions.map((tx, idx) => (
                              <tr key={idx} className="border-b border-dashed last:border-0">
                                <td className="py-1 pr-2 font-mono">
                                  <button
                                    type="button"
                                    className="text-primary underline decoration-muted-foreground/30 underline-offset-2 hover:text-primary/80"
                                    onClick={() => navigate(`/terminal/orders?order=${encodeURIComponent(tx.order_number)}`)}
                                  >
                                    {tx.order_number}
                                  </button>
                                </td>
                                <td className="py-1 pr-2">{new Date(tx.order_date).toLocaleDateString('en-IN')}</td>
                                <td className="py-1 pr-2 capitalize">{tx.sale_type || 'N/A'}</td>
                                <td className="py-1 pr-2 text-right">₹{tx.total_amount?.toLocaleString('en-IN')}</td>
                                <td className="py-1 pr-2 text-right">{tx.quantity}</td>
                                <td className="py-1 pr-2 text-right">₹{tx.price_per_unit?.toLocaleString('en-IN')}</td>
                                <td className="py-1 pr-2">{tx.client_phone || '-'}</td>
                                <td className="py-1 pr-2">{tx.client_state || '-'}</td>
                                <td className="py-1">
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${tx.status === 'APPROVED' ? 'bg-success/10 text-success' : tx.status === 'PENDING' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                                    {tx.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="bg-card rounded-md p-3 border border-warning/20">
                    <h4 className="font-semibold text-sm mb-2 text-foreground">New Onboarding Request</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> {selectedApproval.client_name}</div>
                      <div><span className="text-muted-foreground">User No:</span> <span className="font-mono">{identityDetail.requestUserNo || 'N/A'}</span></div>
                      <div><span className="text-muted-foreground">Nickname:</span> {identityDetail.requestNickname ? `@${identityDetail.requestNickname}` : 'N/A'}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {selectedApproval.client_phone || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Email:</span> {selectedApproval.client_email || 'N/A'}</div>
                      <div><span className="text-muted-foreground">State:</span> {selectedApproval.client_state || 'N/A'}</div>
                      <div><span className="text-muted-foreground">Order Amount:</span> ₹{selectedApproval.order_amount.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground">Order Date:</span> {new Date(selectedApproval.order_date).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                   <div className="flex flex-wrap gap-3">
                    <Button
                      variant={approvalMode === 'merge' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setApprovalMode('merge');
                        // Auto-fill monthly limit from existing client if available and not already set
                        if (existingClientMatch?.monthly_limit && !formData.proposed_monthly_limit) {
                          setFormData(prev => ({ ...prev, proposed_monthly_limit: existingClientMatch.monthly_limit!.toString() }));
                        }
                      }}
                      className={approvalMode === 'merge' ? 'bg-success hover:bg-success/90' : ''}
                    >
                      <UserCheck className="h-4 w-4 mr-1" />
                      Same Person — Link to Existing
                    </Button>
                    <Button
                      variant={approvalMode === 'create_new' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setApprovalMode('create_new')}
                      className={approvalMode === 'create_new' ? 'bg-info hover:bg-info/90' : ''}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Different Person — Create New
                    </Button>
                  </div>
                  
                  {approvalMode === 'create_new' && (
                    <p className="text-xs text-warning">
                      ⚠️ Creating a new client with the same name requires the existing client's name to be disambiguated first. 
                      Please ensure their names differ (e.g., add a middle name or location) to avoid the unique name constraint.
                    </p>
                  )}
                </div>
              )}

              {/* Client Details */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Order Information</h3>
                <div className="space-y-4 text-sm">
                  {/* Row 1: Client Name + Order Amount */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium">Client Name:</span> {selectedApproval.client_name}
                    </div>
                    <div>
                      <span className="font-medium">Order Amount:</span> ₹{selectedApproval.order_amount.toLocaleString('en-IN')}
                    </div>
                  </div>
                  {/* P2P Terminal Order ID(s) */}
                  <div>
                    <span className="font-medium">P2P Terminal Order ID:</span>{' '}
                    {reviewOrdersLoading ? (
                      <span className="text-xs text-muted-foreground italic">Resolving linked P2P order…</span>
                    ) : reviewNicknameOrders.length > 0 ? (
                      <span className="inline-flex flex-wrap gap-1 align-middle">
                        {reviewNicknameOrders.slice(0, 6).map((o: any) => (
                          <code
                            key={o.order_number}
                            className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono cursor-pointer hover:bg-muted-foreground/20"
                            title={`${o.trade_type} • ₹${Number(o.total_price || 0).toLocaleString('en-IN')} • click to copy`}
                            onClick={() => { navigator.clipboard?.writeText(String(o.order_number)); toast({ title: 'Copied', description: `Order ID ${o.order_number}` }); }}
                          >
                            {o.order_number}
                          </code>
                        ))}
                        {reviewNicknameOrders.length > 6 && (
                          <span className="text-xs text-muted-foreground">+{reviewNicknameOrders.length - 6} more</span>
                        )}
                        {selectedApproval.sales_order_id && (
                          <button
                            type="button"
                            className="text-primary underline underline-offset-2 hover:opacity-80"
                            onClick={() => handleViewOrder(selectedApproval.sales_order_id)}
                          >
                            View linked order
                          </button>
                        )}
                      </span>
                    ) : selectedApproval.sales_order_id ? (
                      <button
                        type="button"
                        className="text-primary underline underline-offset-2 hover:opacity-80"
                        onClick={() => handleViewOrder(selectedApproval.sales_order_id)}
                      >
                        View linked order
                      </button>
                    ) : (
                      <span className="text-xs text-destructive italic">No linked P2P order found</span>
                    )}
                  </div>

                  {/* Row 2: Phone + State */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="client_phone" className="font-medium">Phone *</Label>
                      {phoneEditEnabled ? (
                        <Input
                          id="client_phone"
                          value={formData.client_phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, client_phone: e.target.value }))}
                          placeholder="Enter phone number"
                          className="mt-1"
                        />
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm">{formData.client_phone || 'N/A'}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPhoneEditEnabled(true)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="client_state_order" className="font-medium">State *</Label>
                      {stateEditEnabled ? (
                        <Select
                          value={formData.client_state}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, client_state: value }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {INDIAN_STATES_AND_UTS.map((state) => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm">{formData.client_state || 'N/A'}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setStateEditEnabled(true)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details Section */}
              <div className="bg-info/5 p-4 rounded-lg border border-info/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Bank Details *
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBankEntries(prev => [...prev, { bankName: '', lastFourDigits: '', statementFile: null, statementPeriodFrom: undefined, statementPeriodTo: undefined }])}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Bank Account
                  </Button>
                </div>
                <div className="space-y-4">
                  {bankEntries.map((entry, index) => (
                    <div key={index} className="bg-card p-3 rounded-md border border-info/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Bank Account #{index + 1}</span>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setBankEntries(prev => prev.filter((_, i) => i !== index))}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Bank Name *</Label>
                          <BankNameCombobox
                            value={entry.bankName}
                            onChange={(val) => {
                              const updated = [...bankEntries];
                              updated[index] = { ...updated[index], bankName: val };
                              setBankEntries(updated);
                            }}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Last 4 Digits of Account *</Label>
                          <Input
                            value={entry.lastFourDigits}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                              const updated = [...bankEntries];
                              updated[index] = { ...updated[index], lastFourDigits: val };
                              setBankEntries(updated);
                            }}
                            placeholder="e.g. 1234"
                            maxLength={4}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Bank Statement (Optional)</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRefs.current[index]?.click()}
                          >
                            <Upload className="h-3 w-3 mr-1" />
                            {entry.statementFile ? entry.statementFile.name : 'Upload Statement'}
                          </Button>
                          <input
                            type="file"
                            ref={(el) => { fileInputRefs.current[index] = el; }}
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              if (file) void prefetchKycUpload(file);
                              const updated = [...bankEntries];
                              updated[index] = { 
                                ...updated[index], 
                                statementFile: file,
                                statementPeriodFrom: file ? updated[index].statementPeriodFrom : undefined,
                                statementPeriodTo: file ? updated[index].statementPeriodTo : undefined
                              };
                              setBankEntries(updated);
                            }}
                          />
                          {entry.statementFile && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = [...bankEntries];
                                updated[index] = { ...updated[index], statementFile: null, statementPeriodFrom: undefined, statementPeriodTo: undefined };
                                setBankEntries(updated);
                                if (fileInputRefs.current[index]) fileInputRefs.current[index]!.value = '';
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {entry.statementFile && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Statement Period From</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn("w-full justify-start text-left font-normal mt-1", !entry.statementPeriodFrom && "text-muted-foreground")}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {entry.statementPeriodFrom ? format(entry.statementPeriodFrom, "PPP") : "Select date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={entry.statementPeriodFrom}
                                  onSelect={(date) => {
                                    const updated = [...bankEntries];
                                    updated[index] = { ...updated[index], statementPeriodFrom: date };
                                    setBankEntries(updated);
                                  }}
                                  initialFocus
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div>
                            <Label className="text-xs">Statement Period To</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn("w-full justify-start text-left font-normal mt-1", !entry.statementPeriodTo && "text-muted-foreground")}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {entry.statementPeriodTo ? format(entry.statementPeriodTo, "PPP") : "Select date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={entry.statementPeriodTo}
                                  onSelect={(date) => {
                                    const updated = [...bankEntries];
                                    updated[index] = { ...updated[index], statementPeriodTo: date };
                                    setBankEntries(updated);
                                  }}
                                  initialFocus
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Source of Income (Optional) */}
              <div className="bg-warning/5 p-4 rounded-lg border border-warning/30">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Source of Income (Optional)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Source of Income</Label>
                    <Input
                      value={primarySourceOfIncome}
                      onChange={(e) => setPrimarySourceOfIncome(e.target.value)}
                      placeholder="e.g. Salary, Business, Freelance"
                    />
                  </div>
                  <div>
                    <Label>Occupation / Business Type</Label>
                    <Input
                      value={occupationBusinessType}
                      onChange={(e) => setOccupationBusinessType(e.target.value)}
                      placeholder="e.g. Software Engineer, Retail Shop"
                    />
                  </div>
                  <div>
                    <Label>Monthly Income Range (₹)</Label>
                    <Input
                      type="number"
                      value={monthlyIncomeRange}
                      onChange={(e) => setMonthlyIncomeRange(e.target.value)}
                      placeholder="e.g. 50000"
                    />
                  </div>
                  <div>
                    <Label>Source of Fund Document</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="file"
                        ref={sourceOfFundInputRef}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          if (file) void prefetchKycUpload(file);
                          setSourceOfFundFile(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => sourceOfFundInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {sourceOfFundFile ? 'Change File' : 'Upload'}
                      </Button>
                      {sourceOfFundFile && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {sourceOfFundFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* KYC Documents Section */}
              <div className="bg-success/5 p-4 rounded-lg border border-success/20">
                <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  KYC Documents
                </h4>
                <div className="space-y-4">
                  {/* Aadhaar Card - mandatory, multi-file */}
                  <div className="bg-card p-3 rounded-md border space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Aadhaar Card * <span className="text-xs text-muted-foreground">(PDF, Image, or any file — multiple allowed)</span></Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => aadhaarInputRef.current?.click()}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {aadhaarFiles.length > 0 ? 'Add More' : 'Upload'}
                      </Button>
                      <input
                        type="file"
                        ref={aadhaarInputRef}
                        className="hidden"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            files.forEach((f) => { void prefetchKycUpload(f); });
                            setAadhaarFiles(prev => [...prev, ...files]);
                          }
                          if (aadhaarInputRef.current) aadhaarInputRef.current.value = '';
                        }}
                      />
                    </div>
                    {aadhaarFiles.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {aadhaarFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                            <FileText className="h-3 w-3" />
                            <span className="max-w-[150px] truncate">{f.name}</span>
                            <button type="button" onClick={() => setAadhaarFiles(prev => prev.filter((_, idx) => idx !== i))}>
                              <X className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-destructive">At least one Aadhaar document is required</p>
                    )}
                  </div>

                  {/* USDT Usage Proof - optional */}
                  <div className="bg-card p-3 rounded-md border space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">USDT Usage Proof <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => usdtProofInputRef.current?.click()}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          {usdtProofFile ? 'Change' : 'Upload'}
                        </Button>
                        <input
                          type="file"
                          ref={usdtProofInputRef}
                          className="hidden"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file) void prefetchKycUpload(file);
                            setUsdtProofFile(file);
                            if (usdtProofInputRef.current) usdtProofInputRef.current.value = '';
                          }}
                        />
                        {usdtProofFile && (
                          <>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{usdtProofFile.name}</span>
                            <button type="button" onClick={() => setUsdtProofFile(null)}><X className="h-3 w-3 text-destructive" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Trade History Screenshot - optional */}
                  <div className="bg-card p-3 rounded-md border space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Trade History Screenshot <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => tradeHistoryInputRef.current?.click()}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          {tradeHistoryFile ? 'Change' : 'Upload'}
                        </Button>
                        <input
                          type="file"
                          ref={tradeHistoryInputRef}
                          className="hidden"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file) void prefetchKycUpload(file);
                            setTradeHistoryFile(file);
                            if (tradeHistoryInputRef.current) tradeHistoryInputRef.current.value = '';
                          }}
                        />
                        {tradeHistoryFile && (
                          <>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{tradeHistoryFile.name}</span>
                            <button type="button" onClick={() => setTradeHistoryFile(null)}><X className="h-3 w-3 text-destructive" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* vKYC Video - optional */}
                  <div className="bg-card p-3 rounded-md border space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">vKYC Video <span className="text-xs text-muted-foreground">(Optional — resumable upload for large files)</span></Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => vkycVideoInputRef.current?.click()}
                        >
                          <Video className="h-3 w-3 mr-1" />
                          {vkycVideoFile ? 'Change' : 'Upload'}
                        </Button>
                        <input
                          type="file"
                          ref={vkycVideoInputRef}
                          className="hidden"
                          accept="video/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (!file) return;
                            // Upload the vKYC video in the background using resumable
                            // storage so approval doesn't wait on a long upload.
                            void prefetchKycUpload(file);
                            setVkycVideoFile(file);
                            if (vkycVideoInputRef.current) vkycVideoInputRef.current.value = '';
                          }}
                        />
                        {vkycVideoFile && (
                          <>
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{vkycVideoFile.name}</span>
                            <span className="text-xs text-muted-foreground">({(vkycVideoFile.size / (1024 * 1024)).toFixed(1)}MB)</span>
                            <button type="button" onClick={() => setVkycVideoFile(null)}><X className="h-3 w-3 text-destructive" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Documents Section */}
              <div className="bg-primary/5 border border-primary/20 rounded-md p-4 space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Additional Documents <span className="text-xs font-normal text-muted-foreground">(Optional — payment receipts, invoices, supporting docs)</span>
                </Label>
                <div className="bg-card p-3 rounded-md border space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Upload Files <span className="text-xs text-muted-foreground">(PDF, images, multiple allowed)</span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => additionalDocsInputRef.current?.click()}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {additionalDocs.length > 0 ? 'Add More' : 'Upload'}
                    </Button>
                    <input
                      type="file"
                      ref={additionalDocsInputRef}
                      className="hidden"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files || []);
                        if (newFiles.length > 0) {
                          newFiles.forEach((f) => { void prefetchKycUpload(f); });
                          setAdditionalDocs(prev => [...prev, ...newFiles]);
                        }
                        if (additionalDocsInputRef.current) additionalDocsInputRef.current.value = '';
                      }}
                    />
                  </div>
                  {additionalDocs.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {additionalDocs.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                          <span className="truncate flex-1">{f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(0)}KB)</span></span>
                          <button
                            type="button"
                            onClick={() => setAdditionalDocs(prev => prev.filter((_, idx) => idx !== i))}
                            className="ml-2"
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="proposed_monthly_limit">
                    Monthly Transaction Limit (₹) {approvalMode !== 'merge' && '*'}
                    {approvalMode === 'merge' && existingClientMatch?.monthly_limit && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (Auto-filled from existing record — editable)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="proposed_monthly_limit"
                    type="number"
                    value={formData.proposed_monthly_limit}
                    onChange={(e) => setFormData(prev => ({ ...prev, proposed_monthly_limit: e.target.value }))}
                    placeholder={approvalMode === 'merge' ? 'Using existing limit' : 'Enter monthly limit'}
                    required={approvalMode !== 'merge'}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { label: '₹50,000', value: '50000' },
                      { label: '₹1 Lakh', value: '100000' },
                      { label: '₹2 Lakh', value: '200000' },
                      { label: '₹10 Lakh', value: '1000000' },
                      { label: '₹1 Cr', value: '10000000' },
                    ].map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={formData.proposed_monthly_limit === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFormData(prev => ({ ...prev, proposed_monthly_limit: opt.value }))}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label htmlFor="purpose_of_buying">Purpose of Buying</Label>
                  <Textarea
                    id="purpose_of_buying"
                    value={formData.purpose_of_buying}
                    onChange={(e) => setFormData(prev => ({ ...prev, purpose_of_buying: e.target.value }))}
                    placeholder="Purpose as described during VKYC call"
                  />
                </div>

                <div>
                  <Label htmlFor="risk_assessment">Risk Assessment</Label>
                  <Select
                    value={formData.risk_assessment}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, risk_assessment: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREMIUM">Premium</SelectItem>
                      <SelectItem value="ESTABLISHED">Established</SelectItem>
                      <SelectItem value="STANDARD">Standard</SelectItem>
                      <SelectItem value="CAUTIOUS">Cautious</SelectItem>
                      <SelectItem value="HIGH_RISK">High Risk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                <div className="md:col-span-2">
                  <Label htmlFor="compliance_notes">Compliance Notes</Label>
                  <Textarea
                    id="compliance_notes"
                    value={formData.compliance_notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, compliance_notes: e.target.value }))}
                    placeholder="Additional compliance observations"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={closeApprovalDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={approveClientMutation.isPending || (existingClientMatch && approvalMode !== 'merge' && approvalMode !== 'create_new')}
                  className="bg-success hover:bg-success/90"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {approveClientMutation.isPending 
                    ? 'Approving...' 
                    : approvalMode === 'merge' 
                      ? 'Link & Approve'
                      : 'Approve & Onboard Client'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <SalesOrderDetailsDialog
        open={viewOrderOpen}
        onOpenChange={(open) => { if (!open) { setViewOrderOpen(false); setViewOrderData(null); } }}
        order={viewOrderData}
      />

      {/* Nickname-resolved P2P Terminal Orders Dialog */}
      <Dialog open={nicknameOrdersOpen} onOpenChange={setNicknameOrdersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>P2P Terminal Orders — {nicknameOrdersTitle}</DialogTitle>
          </DialogHeader>
          {nicknameOrdersLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading orders…</div>
          ) : nicknameOrders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No linked P2P orders found.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {nicknameOrders.map((o: any) => (
                <div key={o.order_number} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <div className="min-w-0">
                    <code className="font-mono text-xs">{o.order_number}</code>
                    <div className="text-xs text-muted-foreground">
                      {o.trade_type} • {o.create_time ? new Date(o.create_time).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-medium">₹{Number(o.total_price || 0).toLocaleString('en-IN')}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openSalesOrderForP2P(o.order_number)}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { navigator.clipboard?.writeText(String(o.order_number)); toast({ title: 'Copied', description: `Order ID ${o.order_number}` }); }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              ))}

            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReuploadDocumentDialog
        target={reuploadTarget}
        onClose={() => setReuploadTarget(null)}
        onUploaded={() => {
          queryClient.invalidateQueries({ queryKey: ['client_onboarding_approvals'] });
          setReuploadTarget(null);
        }}
      />
    </div>
  );
}

function ReuploadDocumentDialog({
  target,
  onClose,
  onUploaded,
}: {
  target: { approvalId: string; field: 'aadhar_front_url' | 'binance_id_screenshot_url' | 'vkyc_recording_url'; label: string } | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!target) setFile(null);
  }, [target]);

  const { isDragActive, dropzoneProps } = useFileDropzone({
    onFiles: (files) => { if (files[0]) setFile(files[0]); },
    disabled: uploading,
    multiple: false,
  });

  const handleUpload = async () => {
    if (!file || !target) return;
    setUploading(true);
    try {
      const result = await resolveKycUpload(file);
      if (!result.url) throw new Error('Upload did not return a URL.');
      const { error } = await supabase
        .from('client_onboarding_approvals')
        .update({ [target.field]: result.url })
        .eq('id', target.approvalId);
      if (error) throw error;
      toast({ title: 'Document re-uploaded', description: `${target.label} was replaced successfully.` });
      onUploaded();
    } catch (err: any) {
      toast({ title: 'Re-upload failed', description: err?.message || 'Could not upload the file.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open && !uploading) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-upload {target?.label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This document is missing (returned a 404). Upload the file again to restore it.
          </p>
          <div
            {...dropzoneProps}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm transition-colors',
              isDragActive ? 'border-primary bg-primary/5' : 'border-muted',
            )}
          >
            <Download className="h-5 w-5 text-muted-foreground" />
            <span className="text-muted-foreground">Drag & drop the file here, or choose below</span>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={uploading} />
            {file && <span className="text-xs text-foreground">Selected: {file.name}</span>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? 'Uploading…' : 'Re-upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

