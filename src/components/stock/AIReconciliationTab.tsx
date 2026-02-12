import { useState } from "react";
import { useReconciliationFindings } from "@/hooks/useReconciliationFindings";
import { useReconciliationScan } from "@/hooks/useReconciliationScan";
import { ScanControls } from "./reconciliation/ScanControls";
import { SummaryCards } from "./reconciliation/SummaryCards";
import { FindingsGrid } from "./reconciliation/FindingsGrid";
import { ReconciliationHealthBanner } from "./reconciliation/ReconciliationHealthBanner";
import { FindingDetailDrawer } from "./reconciliation/FindingDetailDrawer";

export function AIReconciliationTab() {
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const [activeSeverity, setActiveSeverity] = useState<string | undefined>();
  const [activeStatus, setActiveStatus] = useState<string>('open');
  const [selectedFinding, setSelectedFinding] = useState<any>(null);

  const { findings, isLoading, counts, countsLoading, updateStatus, refetch } = useReconciliationFindings({
    category: activeCategory,
    severity: activeSeverity,
    status: activeStatus === 'all' ? undefined : activeStatus,
  });

  const { runScan, isScanning, lastScan, lastScanLoading } = useReconciliationScan();

  const handleScan = async (scope: string[]) => {
    await runScan(scope);
    refetch();
  };

  const handleFeedback = (id: string, status: string, note?: string) => {
    updateStatus({ id, status, feedback_note: note });
  };

  return (
    <div className="space-y-6">
      {/* Health Banner */}
      <ReconciliationHealthBanner
        lastScan={lastScan}
        isLoading={lastScanLoading}
        counts={counts}
      />

      {/* Scan Controls */}
      <ScanControls
        onScan={handleScan}
        isScanning={isScanning}
        lastScan={lastScan}
      />

      {/* Summary Cards */}
      <SummaryCards
        counts={counts}
        isLoading={countsLoading}
        activeCategory={activeCategory}
        onCategoryClick={(cat) => setActiveCategory(activeCategory === cat ? undefined : cat)}
      />

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Severity:</label>
          {['all', 'critical', 'warning', 'review', 'info'].map(sev => (
            <button
              key={sev}
              onClick={() => setActiveSeverity(sev === 'all' ? undefined : sev)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                (sev === 'all' && !activeSeverity) || activeSeverity === sev
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Status:</label>
          {['open', 'accepted', 'rejected', 'false_positive', 'all'].map(st => (
            <button
              key={st}
              onClick={() => setActiveStatus(st)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                activeStatus === st
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {st === 'false_positive' ? 'False +' : st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Findings Grid */}
      <FindingsGrid
        findings={findings}
        isLoading={isLoading}
        onFeedback={handleFeedback}
        onSelect={setSelectedFinding}
      />

      {/* Detail Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        open={!!selectedFinding}
        onClose={() => setSelectedFinding(null)}
        onFeedback={handleFeedback}
      />
    </div>
  );
}
