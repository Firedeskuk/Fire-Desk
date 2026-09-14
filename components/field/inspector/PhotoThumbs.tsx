"use client";

import { useEffect } from "react";
import { blobUrl } from "@/lib/local/blobs";
import { useAsync } from "@/lib/useAsync";
import type { FindingPhotoRow } from "./inspection";

type Props = {
  photos: FindingPhotoRow[];
};

/*
  Thumbnails of the photos on a finding. A photo whose blob is still on this
  phone shows the picture. A photo that came from the server (blob released
  after upload, or taken on another device) shows a grey "Uploaded" box.
  Object URLs are revoked when they change and when the list unmounts.
*/
export default function PhotoThumbs({ photos }: Props) {
  const key = photos.map((p) => p.storage_path).join("|");
  const urls = useAsync<Record<string, string | null>>(async () => {
    const out: Record<string, string | null> = {};
    for (const p of photos) {
      out[p.storage_path] = await blobUrl(p.storage_path);
    }
    return out;
  }, [key]);
  const data = urls.data;

  useEffect(() => {
    return () => {
      if (!data) return;
      for (const url of Object.values(data)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [data]);

  if (photos.length === 0) {
    return <p className="muted">No photos yet.</p>;
  }

  return (
    <div className="thumbs">
      {photos.map((p) => {
        const url = data ? data[p.storage_path] : null;
        if (url) {
          // blob URLs from IndexedDB, next/image cannot optimise them
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={p.id} className="thumb" src={url} alt="Finding photo" />;
        }
        return (
          <div
            key={p.id}
            className="thumb pill-grey small"
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label={data ? "Photo uploaded" : "Loading photo"}
          >
            {data ? "Uploaded" : ""}
          </div>
        );
      })}
    </div>
  );
}
