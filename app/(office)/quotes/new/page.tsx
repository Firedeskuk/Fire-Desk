"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Actions from "@/components/office/Actions";
import ErrorText from "@/components/office/ErrorText";
import PageHead from "@/components/office/PageHead";
import { assertOk, errorMessage, moneyText, must, parseMoney } from "@/components/office/helpers";
import { newId, useLocalSession } from "@/lib/local/session";
import { calculatedPrice, finalPrice, formatGBP, quoteNumber, roundMoney } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import type { Building, Client, Finding, PriceListItem } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type FindingRow = Finding & { assetRef: string };

type NewQuoteData = {
  building: Building;
  client: Client;
  findings: FindingRow[];
  items: PriceListItem[];
};

/* What the user can edit on a picked finding. Numbers stay text until save. */
type LineDraft = {
  description: string;
  qty: string;
  priceItemId: string;
  override: string;
};

type Line = {
  findingId: string;
  assetRef: string;
  draft: LineDraft;
  /* false until a price item is picked, the money cells stay empty until then */
  priced: boolean;
  defaultPrice: number;
  qty: number;
  calculated: number;
  override: number | null;
  overrideInvalid: boolean;
  final: number;
};

async function loadNewQuote(buildingId: string): Promise<NewQuoteData> {
  const supabase = getSupabase();
  const building = must(await supabase.from("buildings").select("*").eq("id", buildingId).single());
  const [clientRes, findingsRes, assetsRes, itemsRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", building.client_id).single(),
    supabase
      .from("findings")
      .select("*")
      .eq("building_id", buildingId)
      .eq("status", "open")
      .is("deleted_at", null)
      .order("created_at"),
    supabase.from("assets").select("id, ref").eq("building_id", buildingId),
    supabase.from("price_list_items").select("*").eq("active", true).order("code"),
  ]);
  const refs = new Map(must(assetsRes).map((a) => [a.id, a.ref]));
  return {
    building,
    client: must(clientRes),
    findings: must(findingsRes).map((f) => ({ ...f, assetRef: refs.get(f.asset_id) ?? "" })),
    items: must(itemsRes),
  };
}

/* A finding without a valid suggestion starts with no price item. The user picks one, nothing is guessed. */
function defaultDraft(f: Finding, items: PriceListItem[]): LineDraft {
  const suggested = f.suggested_price_item_id && items.some((i) => i.id === f.suggested_price_item_id);
  return {
    description: f.description,
    qty: String(Number(f.qty) || 1),
    priceItemId: suggested ? (f.suggested_price_item_id as string) : "",
    override: "",
  };
}

function NewQuoteForm({ buildingId }: { buildingId: string }) {
  const router = useRouter();
  const session = useLocalSession();
  const { data, error, loading } = useAsync(() => loadNewQuote(buildingId), [buildingId]);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const clientPct = data ? Number(data.client.adjustment_pct) : 100;
  const buildingPct = data ? Number(data.building.adjustment_pct) : 100;
  const items = data?.items ?? [];

  function toggle(f: FindingRow) {
    setDrafts((d) => {
      const next = { ...d };
      if (next[f.id]) delete next[f.id];
      else next[f.id] = defaultDraft(f, items);
      return next;
    });
  }

  function setDraft(findingId: string, patch: Partial<LineDraft>) {
    setDrafts((d) => ({ ...d, [findingId]: { ...d[findingId], ...patch } }));
  }

  const lines: Line[] = (data?.findings ?? [])
    .filter((f) => drafts[f.id])
    .map((f) => {
      const draft = drafts[f.id];
      const item = items.find((i) => i.id === draft.priceItemId) ?? null;
      const priced = item !== null;
      const defaultPrice = item ? Number(item.default_price) : 0;
      const qty = Number(draft.qty);
      const parsed = parseMoney(draft.override);
      const overrideInvalid = parsed !== null && Number.isNaN(parsed);
      const override = parsed === null || Number.isNaN(parsed) ? null : parsed;
      const safeQty = Number.isFinite(qty) ? qty : 0;
      return {
        findingId: f.id,
        assetRef: f.assetRef,
        draft,
        priced,
        defaultPrice,
        qty: safeQty,
        calculated: priced ? calculatedPrice(defaultPrice, safeQty, clientPct, buildingPct) : 0,
        override,
        overrideInvalid,
        final: priced ? finalPrice(defaultPrice, safeQty, clientPct, buildingPct, override) : 0,
      };
    });

  /* Screen preview only. The saved total is the sum of the lines the database stored. */
  const total = roundMoney(lines.reduce((sum, l) => sum + l.final, 0));

  async function save() {
    if (!data) return;
    setSaveError(null);
    if (lines.length === 0) {
      setSaveError("Pick at least one finding.");
      return;
    }
    for (const l of lines) {
      if (!l.draft.description.trim()) {
        setSaveError(`Line ${l.assetRef || l.findingId} needs a description.`);
        return;
      }
      if (!(l.qty > 0)) {
        setSaveError(`Line ${l.assetRef || l.findingId} needs a quantity above 0.`);
        return;
      }
      if (!l.draft.priceItemId) {
        setSaveError("Pick a price item on every line. Add items under Settings, Pricing.");
        return;
      }
      if (l.overrideInvalid) {
        setSaveError(`Line ${l.assetRef || l.findingId} has an override that is not a number.`);
        return;
      }
    }
    setBusy(true);
    // set once the quotes row exists, so a failed follow up write can retire it
    let insertedQuoteId: string | null = null;
    try {
      const supabase = getSupabase();
      const year = new Date().getFullYear();
      const countRes = await supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .like("number", `Q-${year}-%`);
      if (countRes.error) throw new Error(countRes.error.message);
      const number = quoteNumber(year, countRes.count ?? 0);
      const quoteId = newId();

      assertOk(
        await supabase.from("quotes").insert({
          id: quoteId,
          number,
          building_id: data.building.id,
          client_id: data.client.id,
          project_id: null,
          version: 1,
          is_current: true,
          status: "draft",
          total,
          created_by: session?.user_id ?? null,
        }),
      );
      insertedQuoteId = quoteId;
      assertOk(
        await supabase.from("quote_lines").insert(
          lines.map((l, index) => ({
            id: newId(),
            quote_id: quoteId,
            finding_id: l.findingId,
            price_item_id: l.draft.priceItemId,
            description: l.draft.description.trim(),
            qty: l.qty,
            default_price: l.defaultPrice,
            client_pct: clientPct,
            building_pct: buildingPct,
            override_price: l.override,
            sort_order: index,
          })),
        ),
      );
      // The database is the source of truth for money. It computes final_price
      // in exact numeric, the screen total is a float preview, so the stored
      // total is the sum of the stored lines, added in whole pence.
      const storedLines = must(await supabase.from("quote_lines").select("final_price").eq("quote_id", quoteId));
      const pence = storedLines.reduce((sum, l) => sum + Math.round(Number(l.final_price ?? 0) * 100), 0);
      assertOk(await supabase.from("quotes").update({ total: pence / 100 }).eq("id", quoteId));
      assertOk(
        await supabase
          .from("findings")
          .update({ status: "quoted" })
          .in(
            "id",
            lines.map((l) => l.findingId),
          ),
      );
      router.push(`/quotes/${quoteId}`);
    } catch (err) {
      if (insertedQuoteId) {
        // Retire the half saved quote so a retry starts clean. Nothing is
        // hard deleted. The first error is the one the user needs to see.
        try {
          await getSupabase()
            .from("quotes")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", insertedQuoteId);
        } catch {
          // the original error is reported below
        }
      }
      setSaveError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title={data ? `New quote, ${data.building.name}` : "New quote"}>
        <Link className="btn" href="/quotes">
          All quotes
        </Link>
      </PageHead>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <p className="muted">
            Client {data.client.name}, client adjustment {clientPct} %, building adjustment {buildingPct} %.
          </p>
          {items.length === 0 ? (
            <p className="error">The price list is empty. Add items under Settings, Pricing, before quoting.</p>
          ) : null}
          <div className="card">
            <div className="card-title">Open findings</div>
            {data.findings.length === 0 ? <p className="muted">No open findings in this building.</p> : null}
            {data.findings.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pick</th>
                      <th>Asset</th>
                      <th>Description</th>
                      <th className="num">Qty</th>
                      <th>Price item</th>
                      <th className="num">Default</th>
                      <th className="num">Calculated</th>
                      <th className="num">Override</th>
                      <th className="num">Final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.findings.map((f) => {
                      const line = lines.find((l) => l.findingId === f.id) ?? null;
                      return (
                        <tr key={f.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Pick finding ${f.assetRef}`}
                              checked={line !== null}
                              onChange={() => toggle(f)}
                              disabled={busy}
                              style={{ width: 22, height: 22 }}
                            />
                          </td>
                          <td className="row-title">{f.assetRef}</td>
                          {line ? (
                            <>
                              <td>
                                <input
                                  className="input"
                                  aria-label="Description"
                                  value={line.draft.description}
                                  onChange={(e) => setDraft(f.id, { description: e.target.value })}
                                  disabled={busy}
                                  style={{ minWidth: 220 }}
                                />
                              </td>
                              <td className="num">
                                <input
                                  className="input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  aria-label="Quantity"
                                  value={line.draft.qty}
                                  onChange={(e) => setDraft(f.id, { qty: e.target.value })}
                                  disabled={busy}
                                  style={{ maxWidth: 90, textAlign: "right" }}
                                />
                              </td>
                              <td>
                                <select
                                  className="select"
                                  aria-label="Price item"
                                  value={line.draft.priceItemId}
                                  onChange={(e) => setDraft(f.id, { priceItemId: e.target.value })}
                                  disabled={busy}
                                  style={{ minWidth: 160 }}
                                >
                                  <option value="">Pick a price item</option>
                                  {items.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.code}, {i.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="num">{line.priced ? moneyText(line.defaultPrice) : ""}</td>
                              <td className="num">{line.priced ? moneyText(line.calculated) : ""}</td>
                              <td className="num">
                                <input
                                  className="input"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  aria-label="Override price"
                                  value={line.draft.override}
                                  onChange={(e) => setDraft(f.id, { override: e.target.value })}
                                  disabled={busy}
                                  placeholder="none"
                                  style={{ maxWidth: 110, textAlign: "right" }}
                                />
                              </td>
                              <td className="num row-title">{line.priced ? moneyText(line.final) : ""}</td>
                            </>
                          ) : (
                            <>
                              <td>{f.description}</td>
                              <td className="num">{Number(f.qty)}</td>
                              <td className="muted" colSpan={5}>
                                Tick to add this finding to the quote
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={8} className="num row-title">
                        Total
                      </td>
                      <td className="num row-title">{formatGBP(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </div>
          <Actions>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={busy || lines.length === 0 || items.length === 0}
            >
              {busy ? "Saving" : `Save quote, ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
            </button>
            <Link className="btn" href="/quotes">
              Cancel
            </Link>
          </Actions>
          <ErrorText>{saveError}</ErrorText>
        </>
      ) : null}
    </>
  );
}

function NewQuoteFromQuery() {
  const params = useSearchParams();
  const buildingId = params.get("building");
  if (!buildingId) {
    return (
      <>
        <h1>New quote</h1>
        <p className="muted">No building selected. Open a building on the quotes list and press New quote.</p>
        <Link className="btn" href="/quotes">
          All quotes
        </Link>
      </>
    );
  }
  return <NewQuoteForm buildingId={buildingId} />;
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<p className="muted">Loading</p>}>
      <NewQuoteFromQuery />
    </Suspense>
  );
}
