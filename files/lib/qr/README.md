# lib/qr

QR helpers.

- decode.ts: wrapper around jsqr, camera helpers and the frame loop (at most 10 frames a second, long edge 800 px). No React.
- lookup.ts: where a scanned or typed code leads, matched against the local assets mirror only.

The QR payload is the value of assets.qr_code exactly, nothing encoded around it.
