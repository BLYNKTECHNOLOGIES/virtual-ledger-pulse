
## Add "Upload & Mark Paid" Button to Payer Order Row

### Overview
Add an **Upload** button alongside the existing "Mark Paid" button in the Payer tab's action column. When clicked, it opens a file picker for a payment screenshot. Once uploaded to the order's Binance chat, it automatically triggers the Mark Paid action -- combining both steps into one click.

### Changes

#### 1. Modify `src/components/terminal/payer/PayerOrderRow.tsx`

- **Add imports**: `useRef`, `ImageIcon` (from lucide), `useGetChatImageUploadUrl`, `callBinanceAds` (already partially imported)
- **Add a hidden file input** (`<input type="file" ref={...} accept="image/*" />`)
- **Add an "Upload" button** next to "Mark Paid" in the actions column (visible only for non-finalized, non-completed orders)
- **Implement `handleUploadAndMarkPaid` function** that:
  1. Validates the selected file (image only, under 5MB)
  2. Gets a pre-signed upload URL from Binance via `useGetChatImageUploadUrl`
  3. Uploads the image to S3 via PUT
  4. Sends the image to the order chat via `callBinanceAds('sendChatMessage', { orderNo, imageUrl })`
  5. Automatically calls the existing `handleMarkPaid` logic (calls `markPaid.mutateAsync` + `logAction.mutateAsync`)
  6. Shows a combined success toast ("Screenshot sent & marked paid")
- **Add loading state** (`isUploading`) to disable both Upload and Mark Paid buttons during the process

#### UI Layout (Actions Column)
```text
[ Remove Auto ] [ Upload ] [ Mark Paid ]
```

The Upload button will use an `ImageIcon` with "Upload" label, styled with an outline variant to differentiate from the primary Mark Paid button.

### Flow
1. Payer clicks **Upload** button on an order row
2. File picker opens (images only)
3. User selects a payment screenshot
4. System uploads to Binance chat automatically
5. System calls Mark Paid API automatically
6. System logs the `marked_paid` action
7. Toast: "Screenshot uploaded & marked as paid"
8. Row refreshes to show completed state

### No New Files
All changes are within the existing `PayerOrderRow.tsx` component, reusing the same hooks (`useGetChatImageUploadUrl`, `useMarkOrderAsPaid`, `callBinanceAds`) already used elsewhere in the codebase.
