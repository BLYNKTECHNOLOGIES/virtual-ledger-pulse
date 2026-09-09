/**
 * A nav entry stays highlighted while the user is on the section's own page
 * or on any page opened underneath it (e.g. /clients -> /clients/:id).
 */
export function isNavActive(pathname: string, url: string): boolean {
  if (!url) return false;
  if (url === "/") return pathname === "/";
  const base = url.replace(/\/+$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}
