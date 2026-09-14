"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ErrorText from "@/components/office/ErrorText";
import PageHead from "@/components/office/PageHead";
import { moneyText, must, quoteStatusLabel, quoteTone } from "@/components/office/helpers";
import Pill from "@/components/ui/Pill";
import { formatDate } from "@/lib/due";
import { formatGBP } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabase/client";
import type { Quote, QuoteLine } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type QuoteData = {
  quote: Quote;
  buildingName: string;
  clientName: string;
  lines: QuoteLine[];
};

async function loadQuote(id: string): Promise<QuoteData> {
  const supabase = getSupabase();
  const quote = must(await supabase.from("quotes").select("*").eq("id", id).single());
  const [buildingRes, clientRes, linesRes] = await Promise.all([
    supabase.from("buildings").select("name").eq("id", quote.building_id).single(),
    supabase.from("clients").select("name").eq("id", quote.client_id).single(),
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("sort_order"),
  ]);
  return {
    quote,
    buildingName: must(buildingRes).name,
    clientName: must(clientRes).name,
    lines: must(linesRes),
  };
}

export default function QuotePage() {
  const params = useParams<{ id: string }>();
  const { data, error, loading } = useAsync(() => loadQuote(params.id), [params.id]);

  return (
    <>
      <PageHead title={data ? `Quote ${data.quote.number}` : "Quote"}>
        <Link className="btn" href="/quotes">
          All quotes
        </Link>
      </PageHead>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <div className="card">
            <div className="row" style={{ flexWrap: "wrap" }}>
              <div className="row-main">
                <div className="row-title">{data.buildingName}</div>
                <div className="row-sub">
                  {data.clientName}, created {formatDate(data.quote.created_at)}, version {data.quote.version}
                </div>
              </div>
              <Pill tone={quoteTone(data.quote.status)}>{quoteStatusLabel(data.quote.status)}</Pill>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Default</th>
                    <th className="num">Client %</th>
                    <th className="num">Building %</th>
                    <th className="num">Calculated</th>
                    <th className="num">Override</th>
                    <th className="num">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        This quote has no lines.
                      </td>
                    </tr>
                  ) : null}
                  {data.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.description}</td>
                      <td className="num">{Number(l.qty)}</td>
                      <td className="num">{moneyText(l.default_price)}</td>
                      <td className="num">{Number(l.client_pct)}</td>
                      <td className="num">{Number(l.building_pct)}</td>
                      <td className="num">{moneyText(l.calculated_price)}</td>
                      <td className="num">{l.override_price === null ? "" : moneyText(l.override_price)}</td>
                      <td className="num row-title">{moneyText(l.final_price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="num row-title">
                      Total
                    </td>
                    <td className="num row-title">{formatGBP(Number(data.quote.total))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>
              PDF export comes in a later step.
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}
