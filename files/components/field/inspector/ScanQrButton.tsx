"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QrScanner, { type ScanSource } from "./QrScanner";
import { assetHref } from "./inspection";
import { NOT_FOUND_MESSAGE, ambiguousMessage, findAssetByCode, findAssetByRef } from "@/lib/qr/lookup";

type Props = {
  /* building on screen, null on the building list */
  currentBuildingId: string | null;
  /* door on screen, so scanning its own label does not reload the page */
  currentAssetId?: string | null;
  /* replace: the door screen swaps the current door for the scanned one */
  navigation?: "push" | "replace";
  className?: string;
};

/* Query string flag the door screen reads to say "Door is in {building}". */
export const SCAN_ARRIVAL_QUERY = "scan=other";

/*
  "Scan QR" button and the rules for where a scan lands:
  in this building, open the door; in another downloaded building, open it
  there and say so; not on this phone, say so and stay. A scanned value is
  the exact qr_code, a typed value is the door number printed under the QR.
  Lookup is local only (lib/qr/lookup.ts), nothing here touches the server.
*/
export default function ScanQrButton({
  currentBuildingId,
  currentAssetId = null,
  navigation = "push",
  className = "btn",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleScan(value: string, source: ScanSource): Promise<string | null> {
    const match =
      source === "typed"
        ? await findAssetByRef(value, currentBuildingId)
        : await findAssetByCode(value, currentBuildingId);
    if (match.kind === "not_found") return NOT_FOUND_MESSAGE;
    if (match.kind === "ambiguous") return ambiguousMessage(value.trim(), match.count);
    if (currentAssetId && match.asset.id === currentAssetId) return "This is the door on screen.";
    const href =
      assetHref(match.asset.building_id, match.asset.id) + (match.kind === "elsewhere" ? `?${SCAN_ARRIVAL_QUERY}` : "");
    setOpen(false);
    if (navigation === "replace") router.replace(href);
    else router.push(href);
    return null;
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Scan QR
      </button>
      {open ? <QrScanner onScan={handleScan} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
