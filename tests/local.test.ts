import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDbForTests } from "@/lib/local/db";
import { get, list, patch, put, putPhoto, replaceServerRows, transaction } from "@/lib/local";
import { markDone, markFailed, pending, ready, backoffMs, countPending } from "@/lib/local/outbox";
import { getBlob } from "@/lib/local/blobs";
import type { Finding, FindingPhoto } from "@/lib/supabase/types";

const B = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";

function finding(id: string, extra: Partial<Finding> = {}): Finding {
  return {
    id,
    inspection_id: null,
    asset_id: A,
    building_id: B,
    floor_id: null,
    description: "Gap over 4 mm",
    severity: "medium",
    pin_x: null,
    pin_y: null,
    suggested_price_item_id: null,
    qty: 1,
    status: "open",
    created_by: null,
    device_id: "dev-1",
    created_at: "2026-09-13T10:00:00.000Z",
    updated_at: "2026-09-13T10:00:00.000Z",
    deleted_at: null,
    received_at: null,
    ...extra,
  };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe("lib/local put", () => {
  it("writes the mirror row and the outbox row in one transaction", async () => {
    const outboxId = await put("findings", finding("f1"));

    const row = await get("findings", "f1");
    expect(row?.origin).toBe("local");
    expect(row?.description).toBe("Gap over 4 mm");

    const queue = await pending();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(outboxId);
    expect(queue[0].op).toBe("upsert");
    expect(queue[0].entity).toBe("findings");
    expect(queue[0].record_id).toBe("f1");
    expect(queue[0].building_id).toBe(B);
    expect((queue[0].payload as Record<string, unknown>).origin).toBeUndefined();
  });

  it("a failed transaction creates neither row", async () => {
    await expect(
      transaction(async () => {
        await put("findings", finding("f2"));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await get("findings", "f2")).toBeUndefined();
    expect(await pending()).toHaveLength(0);
    expect(await db().outbox.count()).toBe(0);
  });

  it("patch stores only the changed fields plus updated_at", async () => {
    await put("findings", finding("f3"));
    await patch("findings", "f3", { status: "cancelled" });

    const row = await get("findings", "f3");
    expect(row?.status).toBe("cancelled");
    expect(row?.description).toBe("Gap over 4 mm");

    const queue = await pending();
    expect(queue).toHaveLength(2);
    const p = queue[1];
    expect(p.op).toBe("patch");
    const payload = p.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["status", "updated_at"]);
    expect(payload.status).toBe("cancelled");
  });
});

describe("outbox order and dependencies", () => {
  it("pending order follows seq", async () => {
    await put("findings", finding("a"));
    await put("findings", finding("b"));
    await put("findings", finding("c"));
    const queue = await pending();
    expect(queue.map((r) => r.record_id)).toEqual(["a", "b", "c"]);
    expect(queue[0].seq! < queue[1].seq! && queue[1].seq! < queue[2].seq!).toBe(true);
  });

  it("a photo row waits for its upload, then becomes ready", async () => {
    const findingOutboxId = await put("findings", finding("f4"));
    const photo: FindingPhoto = {
      id: "p1",
      finding_id: "f4",
      kind: "before",
      storage_path: `photos/${B}/f4/p1.jpg`,
      width: 1600,
      height: 1200,
      bytes: null,
      taken_at: "2026-09-13T10:01:00.000Z",
      uploaded_at: null,
      created_by: null,
      device_id: "dev-1",
      created_at: "2026-09-13T10:01:00.000Z",
      updated_at: "2026-09-13T10:01:00.000Z",
      deleted_at: null,
      received_at: null,
    };
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
    const { uploadId, rowId } = await putPhoto("finding_photos", photo, blob, B, {
      dependsOn: [findingOutboxId],
    });

    const queue = await pending();
    expect(queue.map((r) => r.op)).toEqual(["upsert", "upload_photo", "upsert"]);
    expect(queue[2].depends_on).toEqual([findingOutboxId, uploadId]);
    expect(await getBlob(photo.storage_path)).toBeDefined();

    let readyRows = await ready();
    expect(readyRows.map((r) => r.id)).toEqual([findingOutboxId, uploadId]);

    await markDone(findingOutboxId);
    readyRows = await ready();
    expect(readyRows.map((r) => r.id)).toEqual([uploadId]);

    await markDone(uploadId);
    readyRows = await ready();
    expect(readyRows.map((r) => r.id)).toEqual([rowId]);
  });

  it("a failed row backs off and is marked failed after 10 attempts", async () => {
    const id = await put("findings", finding("f5"));
    const now = new Date("2026-09-13T12:00:00.000Z");

    await markFailed(id, "server said no", now);
    let row = (await pending())[0];
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.next_attempt_at).toBe(new Date(now.getTime() + 5_000).toISOString());
    expect(await ready(now)).toHaveLength(0);
    expect(await ready(new Date(now.getTime() + 6_000))).toHaveLength(1);

    for (let i = 0; i < 9; i++) await markFailed(id, "still no", now);
    row = (await db().outbox.where("id").equals(id).first())!;
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(10);
    expect(await countPending()).toBe(0);
  });

  it("backoff schedule is 5 s, 30 s, 2 min, 10 min, then hourly", () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([
      5_000, 30_000, 120_000, 600_000, 3_600_000, 3_600_000,
    ]);
  });
});

describe("replaceServerRows", () => {
  it("replaces server rows and never touches local rows", async () => {
    await put("findings", finding("local-1"));
    await replaceServerRows("findings", [finding("srv-1"), finding("srv-2")], { buildingId: B });

    let rows = await list("findings", { building_id: B });
    expect(rows.map((r) => r.id).sort()).toEqual(["local-1", "srv-1", "srv-2"]);

    // refresh: srv-2 is gone on the server, local-1 comes back from the server too but stays local
    await replaceServerRows("findings", [finding("srv-1"), finding("local-1", { description: "server copy" })], {
      buildingId: B,
    });
    rows = await list("findings", { building_id: B });
    expect(rows.map((r) => r.id).sort()).toEqual(["local-1", "srv-1"]);
    expect(rows.find((r) => r.id === "local-1")?.description).toBe("Gap over 4 mm");
    expect(rows.find((r) => r.id === "local-1")?.origin).toBe("local");
    expect(rows.find((r) => r.id === "srv-1")?.origin).toBe("server");
  });

  it("list leaves out soft deleted rows unless asked", async () => {
    await replaceServerRows("findings", [finding("x"), finding("y", { deleted_at: "2026-09-13T11:00:00.000Z" })], {
      buildingId: B,
    });
    expect((await list("findings", { building_id: B })).map((r) => r.id)).toEqual(["x"]);
    expect((await list("findings", { building_id: B }, { includeDeleted: true })).length).toBe(2);
  });
});
