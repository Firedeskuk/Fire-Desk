"use client";

import Link from "next/link";
import ErrorText from "@/components/office/ErrorText";
import PageHead from "@/components/office/PageHead";
import { must } from "@/components/office/helpers";
import { getSupabase } from "@/lib/supabase/client";
import { useAsync } from "@/lib/useAsync";

type Row = {
  id: string;
  name: string;
  postcode: string | null;
  clientName: string;
  doors: number;
  adjustment_pct: number;
};

async function loadBuildings(): Promise<Row[]> {
  const supabase = getSupabase();
  const [buildingsRes, clientsRes, assetsRes] = await Promise.all([
    supabase
      .from("buildings")
      .select("id, name, postcode, client_id, adjustment_pct")
      .is("deleted_at", null)
      .order("name"),
    supabase.from("clients").select("id, name"),
    supabase.from("assets").select("building_id, work_type").is("deleted_at", null).eq("status", "active"),
  ]);
  const clientNames = new Map(must(clientsRes).map((c) => [c.id, c.name]));
  const doors: Record<string, number> = {};
  for (const a of must(assetsRes)) {
    if (a.work_type === "doors") doors[a.building_id] = (doors[a.building_id] ?? 0) + 1;
  }
  return must(buildingsRes).map((b) => ({
    id: b.id,
    name: b.name,
    postcode: b.postcode,
    clientName: clientNames.get(b.client_id) ?? "",
    doors: doors[b.id] ?? 0,
    adjustment_pct: Number(b.adjustment_pct),
  }));
}

export default function BuildingsRegisterPage() {
  const { data, error, loading } = useAsync(loadBuildings, []);

  return (
    <>
      <PageHead title="Buildings">
        <Link className="btn btn-primary" href="/office/buildings/new">
          Add building
        </Link>
      </PageHead>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Name</th>
                  <th>Postcode</th>
                  <th className="num">Doors</th>
                  <th className="num">Adjustment %</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No buildings yet. Add the first one.
                    </td>
                  </tr>
                ) : null}
                {data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.clientName}</td>
                    <td>
                      <Link href={`/office/buildings/${b.id}`} className="row-title">
                        {b.name}
                      </Link>
                    </td>
                    <td>{b.postcode ?? ""}</td>
                    <td className="num">{b.doors}</td>
                    <td className="num">{b.adjustment_pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
