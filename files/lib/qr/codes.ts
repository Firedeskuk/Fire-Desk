/*
  The value printed in a door label and stored in assets.qr_code:
  FD-{building short code}-{asset ref}. The building short code is the first
  6 characters of the building id without dashes, upper case. The asset ref
  is the existing reference (GF-01 and so on) with spaces removed. Pure
  functions, used by the office when it assigns codes and by the tests.
*/

export const QR_PREFIX = "FD";

export function buildingShortCode(buildingId: string): string {
  return buildingId.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export function qrCodeFor(buildingId: string, ref: string): string {
  return `${QR_PREFIX}-${buildingShortCode(buildingId)}-${ref.replace(/\s+/g, "")}`;
}

/* True when the asset still needs a code: null or blank. */
export function needsCode(asset: { qr_code: string | null }): boolean {
  return !asset.qr_code || asset.qr_code.trim() === "";
}
