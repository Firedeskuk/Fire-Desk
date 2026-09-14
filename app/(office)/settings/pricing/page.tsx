"use client";

import { useState, type FormEvent } from "react";
import Actions from "@/components/office/Actions";
import ErrorText from "@/components/office/ErrorText";
import Field from "@/components/office/Field";
import FormGrid from "@/components/office/FormGrid";
import { assertOk, errorMessage, moneyText, must, parseMoney, workTypeLabel } from "@/components/office/helpers";
import { newId } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { PriceListItem, WorkType } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type WorkTypeChoice = WorkType | "any";

type Draft = {
  code: string;
  name: string;
  work_type: WorkTypeChoice;
  unit: string;
  default_price: string;
};

const BLANK: Draft = { code: "", name: "", work_type: "doors", unit: "item", default_price: "" };

async function loadItems(): Promise<PriceListItem[]> {
  return must(await getSupabase().from("price_list_items").select("*").order("code"));
}

type RowProps = {
  item: PriceListItem;
  onSaved: () => void;
  onError: (message: string) => void;
};

/* One price list row. Name and price save on blur when they changed. */
function PriceRow({ item, onSaved, onError }: RowProps) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(moneyText(item.default_price));
  const [busy, setBusy] = useState(false);

  async function write(patch: Partial<Pick<PriceListItem, "name" | "default_price" | "active">>) {
    setBusy(true);
    try {
      assertOk(await getSupabase().from("price_list_items").update(patch).eq("id", item.id));
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function saveName() {
    const v = name.trim();
    if (!v) {
      setName(item.name);
      return;
    }
    if (v === item.name) return;
    void write({ name: v });
  }

  function savePrice() {
    const n = parseMoney(price);
    if (n === null || Number.isNaN(n) || n < 0) {
      onError("Price must be a number, 0 or more.");
      setPrice(moneyText(item.default_price));
      return;
    }
    setPrice(moneyText(n));
    if (n === Number(item.default_price)) return;
    void write({ default_price: n });
  }

  return (
    <tr>
      <td className="row-title">{item.code}</td>
      <td>
        <input
          className="input"
          aria-label={`Name of ${item.code}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          disabled={busy}
          style={{ minWidth: 180 }}
        />
      </td>
      <td>{workTypeLabel(item.work_type)}</td>
      <td>{item.unit}</td>
      <td className="num">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          aria-label={`Default price of ${item.code}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={savePrice}
          disabled={busy}
          style={{ maxWidth: 120, textAlign: "right" }}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`${item.code} active`}
          checked={item.active}
          onChange={(e) => void write({ active: e.target.checked })}
          disabled={busy}
          style={{ width: 22, height: 22 }}
        />
      </td>
    </tr>
  );
}

export default function PricingPage() {
  const { data, error, loading, reload } = useAsync(loadItems, []);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    const code = draft.code.trim().toUpperCase();
    const name = draft.name.trim();
    const unit = draft.unit.trim() || "item";
    const price = parseMoney(draft.default_price);
    if (!code) {
      setActionError("Code is required.");
      return;
    }
    if (!name) {
      setActionError("Name is required.");
      return;
    }
    if (price === null || Number.isNaN(price) || price < 0) {
      setActionError("Default price must be a number, 0 or more.");
      return;
    }
    setBusy(true);
    try {
      assertOk(
        await getSupabase()
          .from("price_list_items")
          .insert({
            id: newId(),
            code,
            name,
            work_type: draft.work_type === "any" ? null : draft.work_type,
            unit,
            default_price: price,
            active: true,
          }),
      );
      setDraft(BLANK);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Price list</h2>
      <p className="muted">Name and price save when you leave the field. Prices are in GBP without VAT.</p>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Work type</th>
                  <th>Unit</th>
                  <th className="num">Default price</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No price list items yet. Add the first one below.
                    </td>
                  </tr>
                ) : null}
                {data.map((item) => (
                  <PriceRow key={item.id} item={item} onSaved={reload} onError={setActionError} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <form className="card" onSubmit={addItem} noValidate style={{ marginTop: 12 }}>
        <div className="card-title">Add item</div>
        <FormGrid>
          <Field label="Code">
            <input
              className="input"
              value={draft.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="D-CLOSER"
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Name">
            <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Work type">
            <select
              className="select"
              value={draft.work_type}
              onChange={(e) => set("work_type", e.target.value as WorkTypeChoice)}
            >
              <option value="doors">Doors</option>
              <option value="fs">Fire stopping</option>
              <option value="any">Any</option>
            </select>
          </Field>
          <Field label="Unit">
            <input className="input" value={draft.unit} onChange={(e) => set("unit", e.target.value)} placeholder="item" />
          </Field>
          <Field label="Default price">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={draft.default_price}
              onChange={(e) => set("default_price", e.target.value)}
            />
          </Field>
        </FormGrid>
        <Actions>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving" : "Add item"}
          </button>
        </Actions>
        <ErrorText>{actionError}</ErrorText>
      </form>
    </>
  );
}
