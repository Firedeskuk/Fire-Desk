"use client";

import Link from "next/link";
import ErrorText from "@/components/office/ErrorText";
import { must, quoteStatusLabel, quoteTone } from "@/components/office/helpers";
import Pill from "@/components/ui/Pill";
import { formatDate } from "@/lib/due";
import { formatGBP } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import type { Quote } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type BuildingGroup = {
  id: string;
  name: string;
  postcode: string | null;
  quotes: Quote[];
};

async function loadQuotes(): Promise<BuildingGroup[]> {
  const supabase = getSupabase();
  const [buildingsRes, quotesRes] = await Promise.all([
    supabase.from("buildings").select("id, name, postcode").is("deleted_at", null).eq("active", true).order("name"),
    supabase.from("quotes").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const quotes = must(quotesRes);
  return must(buildingsRes).map((b) => ({
    id: b.id,
    name: b.name,
    postcode: b.postcode,
    quotes: quotes.filter((q) => q.building_id === b.id),
  }));
}

export default function QuotesPage() {
  const { data, error, loading } = useAsync(loadQuotes, []);

  return (
    <>
      <h1>Quotes</h1>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data && data.length === 0 ? <p className="muted">No buildings yet. Add a building first.</p> : null}
      {data?.map((b) => (
        <section className="card" key={b.id} aria-label={b.name}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row-title">{b.name}</div>
              <div className="row-sub">{b.postcode ?? ""}</div>
            </div>
            <Link className="btn" href={`/quotes/new?building=${b.id}`}>
              New quote
            </Link>
          </div>
          {b.quotes.length === 0 ? (
            <p className="muted" style={{ marginTop: 8 }}>
              No quotes yet.
            </p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {b.quotes.map((q) => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="row-link">
                  <div className="row-main">
                    <div className="row-title">{q.number}</div>
                    <div className="row-sub">{formatDate(q.created_at)}</div>
                  </div>
                  <span>{formatGBP(Number(q.total))}</span>
                  <Pill tone={quoteTone(q.status)}>{quoteStatusLabel(q.status)}</Pill>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
