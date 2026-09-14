"use client";

import Link from "next/link";
import ErrorText from "@/components/office/ErrorText";
import { alertLabel, dueDoorsText, must } from "@/components/office/helpers";
import Pill from "@/components/ui/Pill";
import { buildingTone, isDue, isDueWithin, type Tone } from "@/lib/due";
import { getSupabase } from "@/lib/supabase/client";
import { useAsync } from "@/lib/useAsync";

type Alert = {
  id: string;
  name: string;
  postcode: string | null;
  dueCount: number;
  tone: Tone;
};

type DashboardData = {
  buildings: number;
  doorsDueThisMonth: number;
  remedialInProgress: number;
  certificates: number;
  alerts: Alert[];
};

/* Four counts and one alert per building, computed in memory from small selects. */
async function loadDashboard(): Promise<DashboardData> {
  const supabase = getSupabase();
  const [buildingsRes, assetsRes, remedialRes, certificatesRes] = await Promise.all([
    supabase.from("buildings").select("id, name, postcode").is("deleted_at", null).eq("active", true).order("name"),
    // removed and replaced doors keep a due date but are never due
    supabase
      .from("assets")
      .select("building_id, work_type, next_due_date")
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase.from("remedial_items").select("building_id, status").is("deleted_at", null),
    supabase.from("certificates").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  const buildings = must(buildingsRes);
  const assets = must(assetsRes);
  const remedial = must(remedialRes);
  if (certificatesRes.error) throw new Error(certificatesRes.error.message);

  const doors = assets.filter((a) => a.work_type === "doors");
  const inProgress = remedial.filter((r) => r.status === "in_progress");

  const alerts: Alert[] = buildings.map((b) => {
    const dueDates = doors.filter((d) => d.building_id === b.id).map((d) => d.next_due_date);
    const remedialInProgress = inProgress.filter((r) => r.building_id === b.id).length;
    return {
      id: b.id,
      name: b.name,
      postcode: b.postcode,
      dueCount: dueDates.filter((d) => isDue(d)).length,
      tone: buildingTone({ dueDates, remedialInProgress }),
    };
  });

  return {
    buildings: buildings.length,
    doorsDueThisMonth: doors.filter((d) => isDueWithin(d.next_due_date, 30)).length,
    remedialInProgress: inProgress.length,
    certificates: certificatesRes.count ?? 0,
    alerts,
  };
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="metric-card">
      <div className="card-title">{title}</div>
      <div className="metric">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, error, loading } = useAsync(loadDashboard, []);

  return (
    <>
      <h1>Dashboard</h1>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <div className="grid-metrics">
            <MetricCard title="Buildings" value={data.buildings} />
            <MetricCard title="Doors due this month" value={data.doorsDueThisMonth} />
            <MetricCard title="Remedial in progress" value={data.remedialInProgress} />
            <MetricCard title="Certificates issued" value={data.certificates} />
          </div>
          <section className="card" style={{ marginTop: 12 }} aria-label="Alerts">
            <div className="card-title">Alerts</div>
            {data.alerts.length === 0 ? <p className="muted">No buildings yet.</p> : null}
            {data.alerts.map((a) => (
              <Link key={a.id} href={`/office/buildings/${a.id}`} className="row-link">
                <div className="row-main">
                  <div className="row-title">
                    {a.name}
                    {a.postcode ? `, ${a.postcode}` : ""}, {dueDoorsText(a.dueCount)}
                  </div>
                </div>
                <Pill tone={a.tone}>{alertLabel(a.tone)}</Pill>
              </Link>
            ))}
          </section>
        </>
      ) : null}
    </>
  );
}
