/*
  Photo compression on the device (CLAUDE.md section 8, rule 3).
  Long edge about 1600 px, target about 300 KB, jpeg output. The original is
  never kept. Returns the blob plus its pixel size for the photo row.
*/

import imageCompression from "browser-image-compression";

export const MAX_LONG_EDGE = 1600;
export const TARGET_MB = 0.3;

export type CompressedPhoto = {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
};

async function readSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      const size = { width: bmp.width, height: bmp.height };
      if (typeof bmp.close === "function") bmp.close();
      return size;
    } catch {
      // fall through to the <img> route
    }
  }
  if (typeof Image === "undefined" || typeof URL === "undefined") return { width: 0, height: 0 };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

export async function compressPhoto(file: File | Blob): Promise<CompressedPhoto> {
  const input = file instanceof File ? file : new File([file], "photo.jpg", { type: file.type || "image/jpeg" });

  const out = await imageCompression(input, {
    maxWidthOrHeight: MAX_LONG_EDGE,
    maxSizeMB: TARGET_MB,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.85,
    alwaysKeepResolution: false,
    preserveExif: false,
  });

  const blob: Blob = out.type === "image/jpeg" ? out : new Blob([out], { type: "image/jpeg" });
  const { width, height } = await readSize(blob);
  return { blob, width, height, bytes: blob.size };
}
