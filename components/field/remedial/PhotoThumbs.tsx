"use client";

import { useEffect, useState } from "react";
import type { RemedialPhoto } from "@/lib/supabase/types";
import { blobUrl } from "@/lib/local/blobs";

const PLACEHOLDER_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

type ThumbProps = {
  photo: RemedialPhoto;
};

/*
  One thumbnail. The object URL is created in an effect from the local blob
  and revoked on unmount. A photo row without a local blob came from the
  server (or was already uploaded and released), it shows a grey box that
  says "Uploaded".
*/
function Thumb({ photo }: ThumbProps) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    blobUrl(photo.storage_path)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        created = u;
        setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photo.storage_path]);

  if (url === undefined) {
    return <div className="thumb pill-grey" style={PLACEHOLDER_STYLE} aria-label="Loading photo" />;
  }
  if (url === null) {
    return (
      <div className="thumb pill-grey small" style={PLACEHOLDER_STYLE}>
        Uploaded
      </div>
    );
  }
  // Object URLs from IndexedDB cannot go through next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="thumb" src={url} alt={`Photo ${photo.kind}`} />;
}

type Props = {
  photos: RemedialPhoto[];
};

/* Row of thumbnails for a remedial item, oldest first. */
export default function PhotoThumbs({ photos }: Props) {
  if (photos.length === 0) return null;
  const ordered = [...photos].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  return (
    <div className="thumbs">
      {ordered.map((p) => (
        <Thumb key={p.id} photo={p} />
      ))}
    </div>
  );
}
