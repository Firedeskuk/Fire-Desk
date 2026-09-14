import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDbForTests } from "@/lib/local/db";
import { get, put, putPhoto } from "@/lib/local";
import { pending } from "@/lib/local/outbox";
import { getBlob } from "@/lib/local/blobs";
import { runSync, type SyncClient } from "@/lib/sync/push";
import { downloadBuilding } from "@/lib/sync/download";
import { getSyncStatus, resetSyncStatusForTests } from "@/lib/sync/status";
import type { Finding, FindingPhoto, SyncPushChange, SyncPushResult } from "@/lib/supabase/types";

const B = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";

function finding(id: string, extra: Partial<Finding> = {}): Finding {
  return {
    id,
    inspection_id: null,
    asset_id: A,
    building_id: B,
    floor_id: null,
    description: "Closer does not shut from 75 mm",
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

type RpcHandler = (changes: SyncPushChange[]) => Promise<{ data: unknown; error: { message: string } | null }>;

function fakeClient(rpcHandler: RpcHandler, uploadHandler?: SyncClient["storage"]["from"]) {
  const rpc = vi.fn(async (_fn: "sync_push", args: { p_changes: unknown }) =>
    rpcHandler(args.p_changes as SyncPushChange[]),
  );
  const upload = vi.fn(async () => ({ error: null }));
  const client: SyncClient = {
    auth: { refreshSession: async () => ({ error: null }) },
    rpc: rpc as unknown as SyncClient["rpc"],
    storage: {
      from: uploadHandler ?? (() => ({ upload })),
    },
  };
  return { client, rpc, upload };
}

const allOk: RpcHandler = async (changes) => ({
  data: changes.map((c): SyncPushResult => ({ id: c.id, status: "ok" })),
  error: null,
});

beforeEach(async () => {
  await resetDbForTests();
  resetSyncStatusForTests();
});

describe("push", () => {
  it("sends rows in seq order and marks them done", async () => {
    await put("findings", finding("a"));
    await put("findings", finding("b"));
    await put("findings", finding("c"));
    const { client, rpc } = fakeClient(allOk);

    const result = await runSync({ client });

    expect(result.ran).toBe(true);
    expect(result.sent).toBe(3);
    expect(rpc).toHaveBeenCalledTimes(1);
    const sent = rpc.mock.calls[0][1].p_changes as SyncPushChange[];
    expect(sent.map((c) => c.record_id)).toEqual(["a", "b", "c"]);
    expect(sent[0].op).toBe("upsert");
    expect(sent[0].entity).toBe("findings");
    expect((sent[0].payload as Record<string, unknown>).origin).toBeUndefined();

    expect(await pending()).toHaveLength(0);
    expect((await get("findings", "a"))?.origin).toBe("server");
    expect(getSyncStatus().pendingCount).toBe(0);
    expect(getSyncStatus().syncing).toBe(false);
  });

  it("an error row does not block independent rows", async () => {
    await put("findings", finding("a"));
    await put("findings", finding("b"));
    await put("findings", finding("c"));
    const { client } = fakeClient(async (changes) => ({
      data: changes.map(
        (c): SyncPushResult =>
          c.record_id === "b" ? { id: c.id, status: "error", message: "row rejected" } : { id: c.id, status: "ok" },
      ),
      error: null,
    }));

    const result = await runSync({ client });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    const left = await pending();
    expect(left).toHaveLength(1);
    expect(left[0].record_id).toBe("b");
    expect(left[0].status).toBe("pending");
    expect(left[0].attempts).toBe(1);
    expect(left[0].last_error).toBe("row rejected");
    expect(left[0].next_attempt_at).not.toBeNull();
    expect((await get("findings", "a"))?.origin).toBe("server");
    expect((await get("findings", "b"))?.origin).toBe("local");
  });

  it("a dropped connection leaves rows pending without counting an attempt", async () => {
    await put("findings", finding("a"));
    await put("findings", finding("b"));
    const { client, rpc } = fakeClient(async () => ({
      data: null,
      error: { message: "TypeError: Failed to fetch" },
    }));

    const result = await runSync({ client });

    expect(result.reason).toBe("connection");
    expect(rpc).toHaveBeenCalledTimes(1);
    const left = await pending();
    expect(left).toHaveLength(2);
    expect(left.every((r) => r.status === "pending" && r.attempts === 0)).toBe(true);
    expect(getSyncStatus().lastError).toContain("Connection lost");
    expect(getSyncStatus().pendingCount).toBe(2);
  });

  it("batches at most 50 row changes per call", async () => {
    for (let i = 0; i < 60; i++) await put("findings", finding(`f${i}`));
    const { client, rpc } = fakeClient(allOk);

    const result = await runSync({ client });

    expect(result.sent).toBe(60);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect((rpc.mock.calls[0][1].p_changes as unknown[]).length).toBe(50);
    expect((rpc.mock.calls[1][1].p_changes as unknown[]).length).toBe(10);
  });

  it("uploads a photo, then sends its row, then releases the blob", async () => {
    const findingId = await put("findings", finding("f"));
    const photo: FindingPhoto = {
      id: "p1",
      finding_id: "f",
      kind: "before",
      storage_path: `photos/${B}/f/p1.jpg`,
      width: 1600,
      height: 1200,
      bytes: null,
      taken_at: null,
      uploaded_at: null,
      created_by: null,
      device_id: "dev-1",
      created_at: "2026-09-13T10:01:00.000Z",
      updated_at: "2026-09-13T10:01:00.000Z",
      deleted_at: null,
      received_at: null,
    };
    await putPhoto("finding_photos", photo, new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), B, {
      dependsOn: [findingId],
    });

    const order: string[] = [];
    const upload = vi.fn(async (path: string, _body: Blob, options?: { contentType?: string; upsert?: boolean }) => {
      order.push(`upload:${path}`);
      void options;
      return { error: null };
    });
    const { client, rpc } = fakeClient(
      async (changes) => {
        changes.forEach((c) => order.push(`${c.entity}:${c.record_id}`));
        return allOk(changes);
      },
      () => ({ upload }),
    );

    const result = await runSync({ client });

    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
    expect(order).toEqual(["findings:f", `upload:photos/${B}/f/p1.jpg`, "finding_photos:p1"]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toEqual({ contentType: "image/jpeg", upsert: true });

    const photoCall = rpc.mock.calls.find((c) =>
      (c[1].p_changes as SyncPushChange[]).some((ch) => ch.entity === "finding_photos"),
    )!;
    const photoChange = (photoCall[1].p_changes as SyncPushChange[]).find((ch) => ch.entity === "finding_photos")!;
    expect(photoChange.payload.uploaded_at).toBeTruthy();

    expect(await pending()).toHaveLength(0);
    expect(await getBlob(photo.storage_path)).toBeUndefined();
    expect(await db().outbox.where("status").equals("done").count()).toBe(3);
  });

  it("does nothing while offline", async () => {
    await put("findings", finding("a"));
    const { client, rpc } = fakeClient(allOk);
    const spy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    const result = await runSync({ client });

    spy.mockRestore();
    expect(result.ran).toBe(false);
    expect(result.reason).toBe("offline");
    expect(rpc).not.toHaveBeenCalled();
    expect(await pending()).toHaveLength(1);
    expect(getSyncStatus().online).toBe(false);
  });

  it("stops and flags an auth problem when the session cannot be refreshed", async () => {
    await put("findings", finding("a"));
    const { client, rpc } = fakeClient(allOk);
    client.auth.refreshSession = async () => ({ error: { message: "Invalid Refresh Token" } });

    const result = await runSync({ client });

    expect(result.reason).toBe("auth");
    expect(rpc).not.toHaveBeenCalled();
    expect(getSyncStatus().authProblem).toBe(true);
    expect(await pending()).toHaveLength(1);
  });
});

describe("download", () => {
  it("writes the tree with origin server and keeps local rows", async () => {
    await put("findings", finding("local-1"));
    const tree = {
      downloaded_at: "2026-09-13T12:00:00.000Z",
      role: "inspector",
      building: {
        id: B,
        client_id: "c1",
        name: "Test House",
        address: null,
        postcode: "AB1 2CD",
        adjustment_pct: 100,
        notes: null,
        active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        deleted_at: null,
      },
      floors: [
        {
          id: "fl1",
          building_id: B,
          name: "Ground",
          sort_order: 0,
          floor_plan_path: `floorplans/${B}/ground.jpg`,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      assets: [],
      remedial_items: [],
      remedial_photos: [],
      projects: [],
      findings: [finding("srv-1")],
      finding_photos: [],
      survey_templates: [],
      survey_template_items: [],
      price_list_items: [],
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
    }));
    const client = {
      rpc: async () => ({ data: tree, error: null }),
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/signed" }, error: null }),
        }),
      },
    };

    const result = await downloadBuilding(B, { client, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.state.building_id).toBe(B);
    expect(result.state.role_scope).toBe("inspector");
    expect(result.counts.findings).toBe(1);
    expect(result.warnings).toEqual([]);
    expect((await get("buildings", B))?.origin).toBe("server");
    expect((await get("findings", "srv-1"))?.origin).toBe("server");
    expect((await get("findings", "local-1"))?.origin).toBe("local");
    expect(await getBlob(`floorplans/${B}/ground.jpg`)).toBeDefined();
    expect(await db().sync_state.get(B)).toMatchObject({ building_name: "Test House" });
  });
});
