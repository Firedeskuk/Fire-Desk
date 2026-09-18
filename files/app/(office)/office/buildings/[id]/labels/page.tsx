"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ErrorText from "@/components/office/ErrorText";
import PageHead from "@/components/office/PageHead";
import { must } from "@/components/office/helpers";
import { LABEL_QR_SIZE, qrDataUrl } from "@/lib/qr/labels";
import { getSupabase } from "@/lib/supabase/client";
import { useAsync } from "@/lib/useAsync";

type Label = {
  id: string;
  ref: string;
  code: string;
  /* PNG data URL generated with qrcode */
  image: string;
};

type Loaded = {
  buildingName: string;
  labels: Label[];
  /* assets of the building that have no code yet, they get no label */
  withoutCode: number;
};

/* Natural order, so 2F-05 comes before 2F-10. */
function byRef(a: { ref: string }, b: { ref: string }): number {
  return a.ref.localeCompare(b.ref, "en", { numeric: true, sensitivity: "base" });
}

async function loadLabels(buildingId: string): Promise<Loaded> {
  const supabase = getSupabase();
  const [buildingRes, assetsRes] = await Promise.all([
    supabase.from("buildings").select("name").eq("id", buildingId).is("deleted_at", null).maybeSingle(),
    supabase.from("assets").select("id, ref, qr_code").eq("building_id", buildingId).is("deleted_at", null),
  ]);
  if (buildingRes.error) throw new Error(buildingRes.error.message);
  if (!buildingRes.data) throw new Error("Building not found");
  const assets = must(assetsRes);
  const coded = assets
    .filter((a): a is { id: string; ref: string; qr_code: string } => Boolean(a.qr_code && a.qr_code.trim()))
    .sort(byRef);
  const labels = await Promise.all(
    coded.map(async (a) => ({ id: a.id, ref: a.ref, code: a.qr_code, image: await qrDataUrl(a.qr_code) })),
  );
  return { buildingName: buildingRes.data.name, labels, withoutCode: assets.length - coded.length };
}

/*
  /office/buildings/[id]/labels: one label per asset with a code, 4 per
  row, QR image, reference in 16 px bold, building name in 12 px. Print
  hides the header and the buttons and lays the labels out 50 mm square
  (theme.css, media print).
*/
export default function LabelsPage() {
  const params = useParams<{ id: string }>();
  const buildingId = params.id;
  const { data, error, loading } = useAsync(() => loadLabels(buildingId), [buildingId]);

  return (
    <>
      <div className="no-print">
        <PageHead title={data ? `Labels, ${data.buildingName}` : "Labels"}>
          <Link className="btn" href={`/office/buildings/${buildingId}`}>
            Back to building
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!data}>
            Print
          </button>
        </PageHead>
        {loading && !data ? <p className="muted">Loading</p> : null}
        <ErrorText>{error}</ErrorText>
        {data ? (
          <p className="muted">
            {data.labels.length === 1 ? "1 label" : `${data.labels.length} labels`}, 50 mm square when printed.
            {data.withoutCode > 0
              ? ` ${data.withoutCode} ${data.withoutCode === 1 ? "asset has" : "assets have"} no code yet and no label: use Assign QR codes on the building page.`
              : ""}
          </p>
        ) : null}
      </div>
      {data ? (
        <section className="labels" aria-label="Labels">
          {data.labels.map((l) => (
            <div className="label" key={l.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.image} alt={`QR code ${l.code}`} width={LABEL_QR_SIZE} height={LABEL_QR_SIZE} />
              <div className="label-ref">{l.ref}</div>
              <div className="label-building">{data.buildingName}</div>
            </div>
          ))}
          {data.labels.length === 0 ? <p className="muted">No labels yet. Assign QR codes first.</p> : null}
        </section>
      ) : null}
    </>
  );
}
