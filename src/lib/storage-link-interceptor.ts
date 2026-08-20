import { PRIVATE_DOCUMENT_BUCKETS, parseStorageRef, resolveStorageUrl } from "@/lib/storage-url";

/**
 * Sensitive document buckets are private, so the legacy
 * `/storage/v1/object/public/<bucket>/<path>` links stored on historic rows no
 * longer resolve on their own. This global capture-phase click handler swaps any
 * such anchor for a freshly signed, short-lived URL at click time, so every
 * "View"/"Download" link across the app keeps working without leaking files to
 * unauthenticated visitors.
 */
export function installStorageLinkInterceptor() {
  if (typeof document === "undefined") return;

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") || "";
      const ref = parseStorageRef(href);
      if (!ref || !PRIVATE_DOCUMENT_BUCKETS.has(ref.bucket)) return;

      e.preventDefault();
      const download = anchor.hasAttribute("download");
      const fileName = anchor.getAttribute("download") || ref.path.split("/").pop() || "download";

      void resolveStorageUrl(href).then((signed) => {
        if (!signed) return;
        if (download) {
          const a = document.createElement("a");
          a.href = signed;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          window.open(signed, "_blank", "noopener");
        }
      });
    },
    true,
  );
}
