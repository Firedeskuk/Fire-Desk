/*
  QR images for the printable labels. The qrcode package is loaded on demand
  inside the browser, so nothing of it ends up in the field bundle or in the
  server build. 256 px PNG, error correction M, a quiet zone of 1 module
  (the label itself adds white space around the image).
*/

export const LABEL_QR_SIZE = 256;

export async function qrDataUrl(text: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(text, {
    width: LABEL_QR_SIZE,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
