
# Client Identity De-Merge — Corrected Conclusion & Execution Plan

## 0. Status confirmation
**No destructive action has run.** No client record, `client_binance_nicknames` row, or order has been modified. Everything so far is read-only analysis plus two internal staging tables (`cp_order_identity`, `client_nickname_merge_audit_report`) and `order_detail_raw` enrichment (Binance detail cache only).

## 1. Your audit reproduced exactly (I re-ran each check)
- 466 multi-nickname clients. Of the 403 "rename"-classified (single resolved userNo), **400 contain an unresolved nickname** → the rename verdict was unproven for 99%. Only **3** were fully resolved.
- **35** userNos ever used 2+ nicknames; **7** of them have **interleaved** (overlapping) nickname windows — impossible for a true rename.

## 2. Root cause of the interleaving — nickname semantics verified
`order_detail_raw.nickname` is **fetch-time, not at-trade**, and is unreliable:
- **6,153 of 31,877** resolved orders (~19%) return a generated placeholder `P2P-<userNoSuffix>` / `User-<suffix>` instead of a real name. The same person appears as real-name on one fetch and placeholder on another → this *is* the "interleaving".
- **62** orders captured **our own** merchant brand (BlynkEx, ASEC-CORPORATION) as the "counterparty" → a side-assignment error.
- Cross-checked against at-trade `binance_order_chat_messages.sender_nickname`: chat confirms the real counterparty and exposes the placeholders/own-brand entries as artifacts.
- **Reliable signal:** the counterparty `userNo` itself (98.1% agreement with the at-trade masked-nick prefix). Identity keying on `userNo` is sound; keying on nickname is not.

```text
Example userNo sb5a…34de2
  order_detail_raw : BombayOTC | ASEC-CORPORATION | BlynkEx | FiatanoX
  chat (at-trade)  : BombayOTC | FiatanoX          <- ASEC/BlynkEx were OUR side
```

## 3. Corrected classification (persisted to the audit report)
| Label | Clients | Meaning | Action |
|---|---|---|---|
| SPLIT | 58 | Multiple distinct userNos proven | De-merge (Phase 3a) |
| AMBIGUOUS | 12 | One nickname → multiple userNos | Manual review |
| RENAME_PROVEN | 2 | All nicknames = one userNo, clean sequential windows | Safe cleanup |
| INDETERMINATE | 400 | Has ≥1 unproven nickname (or interleaved) | Resolve-first queue — **no changes** |
| SINGLE_CLEAN | 1,970 | One clean nickname | None |

Note: this supersedes my earlier "663 deactivate" recommendation. **Phase 3b as originally framed is withdrawn** — those clients are INDETERMINATE, not proven-spurious, so bulk nickname deactivation is unsafe.

## 4. The 7 interleaved userNos (manual review)
| userNo | nicknames (orders) | verdict |
|---|---|---|
| s17b05a…03ec7 | P2P-103ec7gx(39) / User-ec229(4) | placeholder artifact |
| s2b09…8e3ad | Gaorola(3) / P2P-18e3adqw(1) | placeholder artifact |
| s2f81…002b3e | pspoonam(12) / Majorie Abdon vFTN(3) | mixed — review |
| s884a…732680 | User-a1924(16) / P2P-732680ll(6) | placeholder artifact |
| sb5a4…c34de2 | BombayOTC(29)/ASEC-CORPORATION(7)/BlynkEx(7)/FiatanoX(2) | side-error + possible rebrand |
| sdae0…4536e8a | P2P-536e8agn(6) / AnkurPrajapati(2) | placeholder artifact |
| sde01…1f8c18 | 9tanks(19) / User-69686(8) | placeholder artifact |

## 5. Execution plan (gated, in order)

### Phase 4 — Resolver root-cause fix (non-destructive, do FIRST)
Stops new bad merges. Changes to the order-approval client-resolution path:
1. Make Binance `userNo` (from `order_detail_raw` merchant/taker + buyer/seller side logic) the **primary identity key** for linking an order to a client.
2. **Demote name-matching to a non-binding suggestion** — it may pre-fill the approval dialog but must never auto-attach a nickname to an existing client.
3. **First-timer check:** on approval, if the counterparty `userNo` has ≤1 completed order (query via existing Binance proxy / order history), treat as a **new** client rather than attaching to a name-match.
4. **Sanitize captured nicknames:** never store `P2P-*` / `User-*` placeholders or our own brand names (BlynkEx, ASEC-CORPORATION, FiatanoX, BombayOTC-as-self) as a counterparty nickname; prefer the at-trade chat nickname when the detail is a placeholder.
5. Enforce: at most one active nickname per `userNo` per client, keyed by userNo.

(Exact files being confirmed via a resolver trace; expected in the terminal sales approval hook/edge function, `client_binance_nicknames` insert path, and the `TerminalSalesApprovalDialog` mapping section.)

### Phase 3a — Split the 58 confirmed clients (destructive, needs explicit go-ahead)
For each userNo beyond the anchor: create a new client record, re-point that userNo's orders, set one active nickname (using a **real** chat/at-trade name, never a placeholder/own-brand), inherit KYC name. Guarded, transactional, with a reversible audit log. **Exclude the side-error userNos** flagged above from auto-split.

### Phase 3b — REPLACED by resolve-first queue (no bulk changes)
- The **400 INDETERMINATE** clients get **no nickname changes**. They enter a queue and self-heal via the Phase-4 userNo resolver the next time each counterparty trades.
- **2 RENAME_PROVEN** clients: safe to collapse to one active nickname now.
- **12 AMBIGUOUS + 7 interleaved**: flagged for manual operator review.

### Backfill (raises resolution before any future decision)
- Recoverable gap = **1,373 completed orders** missing `order_detail_raw` (all >7 months old but Binance still returns them). The other ~15,971 raw-less orders are CANCELLED and irrelevant.
- Empirical yield is low: enriching ~300 old orders resolved only **11 of 699** unresolved nicknames (~4%), because most unresolved nicknames have **no completed trade** behind them (attached via the buggy name-match approval). So backfill is worth running via the existing `enrich-order-names` path (batched, limit 25) but will not rescue most INDETERMINATE clients — the Phase-4 resolver will.

## 6. What I need from you
1. Approve **Phase 4** (safe, stops the bleeding) — I'll implement after confirming resolver file locations.
2. Separately approve **Phase 3a** (the 58 splits) before I run anything destructive.
3. Confirm you're OK that **no bulk nickname deactivation** runs (400 → resolve-first queue), which reverses my earlier suggestion.

Deliverables already available: the re-labelled `client_nickname_merge_audit_report`. I can regenerate the two CSVs (full audit + actionable-58) on request.
