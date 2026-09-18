"use client";

import { useState } from "react";
import Link from "next/link";
import FieldHeader from "@/components/field/FieldHeader";
import Pill from "@/components/ui/Pill";
import Checklist from "@/components/field/inspector/Checklist";
import ScanQrButton from "@/components/field/inspector/ScanQrButton";
import { useScanArrival } from "@/components/field/inspector/useScanArrival";
import { get, list, patch, put, transaction, type Row } from "@/lib/local";
import { getCurrentUserId, getDeviceId, newId } from "@/lib/local/session";
import { formatDate, formatDateTime, provisionalNextDue } from "@/lib/due";
import { useAsync } from "@/lib/useAsync";
import { useFieldParams } from "@/lib/useFieldParams";
import {
  assetLabel,
  assetNoun,
  buildingHref,
  findingHref,
  floorHref,
  hasAnswer,
  isFailValue,
  isLiveFinding,
  newestFirst,
  pickTemplate,
  plural,
  severityLabel,
  severityTone,
  sortByRef,
  sortItems,
  workTypeLabel,
  type AnswerRow,
  type AssetRow,
  type FindingRow,
  type InspectionRow,
  type TemplateItemRow,
  type TemplateRow,
} from "@/components/field/inspector/inspection";

type Loaded = {
  building: Row<"buildings"> | undefined;
  asset: AssetRow | undefined;
  /* assets on the same floor in ref order, for "Next door" */
  siblings: AssetRow[];
  template: TemplateRow | null;
  items: TemplateItemRow[];
  /* latest completed inspection on this phone, for "Last inspected" */
  lastCompleted: InspectionRow | null;
  /* open inspection (started, not completed) */
  open: InspectionRow | null;
  /* what the screen shows: the open one, else the latest completed one, else nothing */
  current: InspectionRow | null;
  answers: AnswerRow[];
  findings: FindingRow[];
  photoCounts: Record<string, number>;
};

/* The open inspection of an asset: newest started, not completed. */
function pickOpen(inspections: InspectionRow[]): InspectionRow | null {
  return newestFirst(
    inspections.filter((i) => !i.completed_at),
    (i) => i.started_at,
  )[0] ?? null;
}

/*
  /buildings/[id]/assets/[assetId]: the inspector door screen. Header line
  with subtype, last inspection and cycle, Scan QR (opens the scanned door in
  place, in this or another downloaded building), the checklist of the
  active template, findings created from failing answers, Photo and Next
  door. Every write goes through lib/local and works with zero network.
  Ids come from useFieldParams, so the page also works when the service
  worker serves the offline shell for a door never opened online.
*/
export default function AssetPage() {
  const { id, assetId } = useFieldParams<{ id: string; assetId: string }>();
  /* opened by a scan from another building: say which building this door is in */
  const arrivedByScan = useScanArrival();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* true after "New inspection": show an empty checklist instead of the completed one */
  const [startFresh, setStartFresh] = useState(false);

  const data = useAsync<Loaded>(async () => {
    const [building, asset] = await Promise.all([get("buildings", id), get("assets", assetId)]);
    if (!asset) {
      return {
        building,
        asset,
        siblings: [],
        template: null,
        items: [],
        lastCompleted: null,
        open: null,
        current: null,
        answers: [],
        findings: [],
        photoCounts: {},
      };
    }
    const [siblingRows, templates, inspections] = await Promise.all([
      asset.floor_id
        ? list("assets", { floor_id: asset.floor_id })
        : list("assets", { building_id: asset.building_id, floor_id: null }),
      list("survey_templates", { work_type: asset.work_type }),
      list("inspections", { asset_id: asset.id }),
    ]);
    const template = pickTemplate(templates);
    const items = template ? sortItems(await list("survey_template_items", { template_id: template.id })) : [];
    const open = pickOpen(inspections);
    const lastCompleted = newestFirst(
      inspections.filter((i) => i.completed_at),
      (i) => i.completed_at,
    )[0] ?? null;
    const current = open ?? (startFresh ? null : lastCompleted);
    const answers = current ? await list("inspection_answers", { inspection_id: current.id }) : [];
    const findings = current
      ? newestFirst(
          (await list("findings", { inspection_id: current.id })).filter(isLiveFinding),
          (f) => f.created_at,
        )
      : [];
    const photoCounts: Record<string, number> = {};
    for (const f of findings) {
      photoCounts[f.id] = (await list("finding_photos", { finding_id: f.id })).length;
    }
    return {
      building,
      asset,
      siblings: sortByRef(siblingRows),
      template,
      items,
      lastCompleted,
      open,
      current,
      answers,
      findings,
      photoCounts,
    };
  }, [id, assetId, startFresh]);

  const loaded = data.data;
  const asset = loaded?.asset;
  const building = loaded?.building;

  async function saveAnswer(item: TemplateItemRow, value: string | null) {
    if (!loaded || !asset || !loaded.template) return;
    const template = loaded.template;
    const items = loaded.items;
    const now = new Date().toISOString();
    const userId = getCurrentUserId();
    const deviceId = getDeviceId();
    const options = { buildingId: asset.building_id, label: assetLabel(asset) };

    setBusy(true);
    setSaveError(null);
    let created = false;
    try {
      await transaction(async () => {
        /*
          The open inspection is read here, inside the transaction, never from
          React state: state is stale while the previous reload is still
          running, and two quick taps must not create two inspections for one
          door. Once the inspection is complete there is no open one, so a
          late save is refused instead of silently starting a new inspection.
        */
        const inspections = await list("inspections", { asset_id: asset.id });
        let inspectionId = pickOpen(inspections)?.id ?? null;
        if (!inspectionId) {
          if (!startFresh && inspections.some((i) => i.completed_at)) {
            throw new Error("This inspection is complete. Tap New inspection to answer again.");
          }
          inspectionId = newId();
          created = true;
          await put(
            "inspections",
            {
              id: inspectionId,
              asset_id: asset.id,
              project_id: null,
              template_id: template.id,
              inspector_id: userId,
              started_at: now,
              completed_at: null,
              overall_result: null,
              notes: null,
              created_by: userId,
              device_id: deviceId,
              created_at: now,
              updated_at: now,
              deleted_at: null,
              received_at: null,
            },
            options,
          );
        }

        const existingAnswers = await list("inspection_answers", { inspection_id: inspectionId });
        const existing = existingAnswers.find((a) => a.template_item_id === item.id);
        await put(
          "inspection_answers",
          {
            id: existing?.id ?? newId(),
            inspection_id: inspectionId,
            template_item_id: item.id,
            question_text: item.question,
            value,
            note: existing?.note ?? null,
            created_at: existing?.created_at ?? now,
            updated_at: now,
            received_at: null,
          },
          options,
        );

        /*
          One finding per failing question, matched on the question text that
          became its description. A pass cancels it, a later fail reopens the
          same row: every insert creates a remedial item on the server, so a
          No, Yes, No sequence must not leave a second one behind.
        */
        const currentFindings = await list("findings", { inspection_id: inspectionId });
        const sameQuestion = currentFindings.filter((f) => f.description === item.question);
        const live = sameQuestion.find((f) => isLiveFinding(f));
        if (isFailValue(item, value)) {
          if (!live) {
            const cancelled = newestFirst(
              sameQuestion.filter((f) => f.status === "cancelled" && !f.deleted_at),
              (f) => f.updated_at,
            )[0];
            if (cancelled) {
              await patch("findings", cancelled.id, { status: "open" }, options);
            } else {
              await put(
                "findings",
                {
                  id: newId(),
                  inspection_id: inspectionId,
                  asset_id: asset.id,
                  building_id: asset.building_id,
                  floor_id: asset.floor_id,
                  description: item.question,
                  severity: "medium",
                  pin_x: null,
                  pin_y: null,
                  suggested_price_item_id: null,
                  qty: 1,
                  status: "open",
                  created_by: userId,
                  device_id: deviceId,
                  created_at: now,
                  updated_at: now,
                  deleted_at: null,
                  received_at: null,
                },
                options,
              );
            }
          }
        } else if (live) {
          await patch("findings", live.id, { status: "cancelled" }, options);
        }

        const values = new Map<string | null, string | null>(
          existingAnswers.map((a) => [a.template_item_id, a.value]),
        );
        values.set(item.id, value);
        const complete = items.filter((i) => i.required).every((i) => hasAnswer(values.get(i.id)));
        if (complete) {
          const liveCount = (await list("findings", { inspection_id: inspectionId })).filter(isLiveFinding).length;
          await patch(
            "inspections",
            inspectionId,
            { completed_at: now, overall_result: liveCount > 0 ? "fail" : "pass" },
            options,
          );
        }
      });
      if (created) setStartFresh(false);
      data.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "The answer could not be saved");
    } finally {
      setBusy(false);
    }
  }

  const title = building && asset ? `${building.name}, ${assetLabel(asset)}` : "Door";
  const back = asset ? floorHref(id, asset.floor_id) : buildingHref(id);

  if (!loaded) {
    return (
      <>
        <FieldHeader title={title} back={back} />
        <main className="page-narrow stack">
          {data.error ? <p className="error">{data.error}</p> : <p className="muted">Loading</p>}
        </main>
      </>
    );
  }

  if (!asset || !building) {
    return (
      <>
        <FieldHeader title={title} back={back} />
        <main className="page-narrow stack">
          <section className="card stack">
            <p className="muted">This door is not on this phone. Download the building first.</p>
            <Link className="btn btn-block" href={buildingHref(id)}>
              Back to building
            </Link>
          </section>
        </main>
      </>
    );
  }

  const { template, items, current, answers, findings, photoCounts, siblings, lastCompleted } = loaded;
  const readOnly = Boolean(current && current.completed_at);
  /* locked while a save runs and until the reloaded data is on screen */
  const locked = busy || data.loading;
  const values = new Map<string, string | null>();
  for (const a of answers) if (a.template_item_id) values.set(a.template_item_id, a.value);

  const infoLine = [
    asset.subtype,
    asset.location,
    lastCompleted?.completed_at ? `Last inspected ${formatDate(lastCompleted.completed_at)}` : "Never inspected",
    asset.cycle_months ? `every ${asset.cycle_months} months` : "no cycle",
  ]
    .filter(Boolean)
    .join(", ");

  const newestFinding = findings[0] ?? null;
  const index = siblings.findIndex((s) => s.id === asset.id);
  const next = index >= 0 ? (siblings[index + 1] ?? null) : null;
  const nextHref = next ? `/buildings/${id}/assets/${next.id}` : floorHref(id, asset.floor_id);
  const nextLabel = next ? `Next ${assetNoun(asset)}` : "Back to floor";

  const provisional = current?.completed_at ? provisionalNextDue(current.completed_at, asset.cycle_months) : null;

  return (
    <>
      <FieldHeader title={title} back={back} />
      <main className="page-narrow stack">
        <section className="card" aria-label="Asset">
          <div className="row">
            <div className="row-main">
              <div className="row-sub">{infoLine}</div>
            </div>
            <ScanQrButton currentBuildingId={asset.building_id} currentAssetId={asset.id} navigation="replace" />
          </div>
          {arrivedByScan && asset.id === assetId ? <p className="notice">Door is in {building.name}</p> : null}
        </section>

        <section className="card" aria-label="Checklist">
          <div className="card-title">{template ? template.name : "Checklist"}</div>
          {!template ? (
            <p className="muted">
              No active checklist for {workTypeLabel(asset.work_type)}. Refresh the building once a template is set
              up in the office.
            </p>
          ) : null}
          {current && readOnly ? (
            <p className="row-sub">
              Completed {formatDateTime(current.completed_at)}, result {current.overall_result ?? "none"}. Read only.
            </p>
          ) : null}
          {template ? (
            <Checklist items={items} values={values} disabled={locked || readOnly} onAnswer={saveAnswer} />
          ) : null}
          {current && readOnly ? (
            <p className="notice">
              Inspection complete.{" "}
              {provisional ? `Next due (provisional): ${formatDate(provisional)}` : "No cycle set, no next due date."}
            </p>
          ) : null}
          {saveError ? <p className="error">{saveError}</p> : null}
          {readOnly && template ? (
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 12 }}
              onClick={() => setStartFresh(true)}
              disabled={locked}
            >
              New inspection
            </button>
          ) : null}
        </section>

        <section className="card stack" aria-label="Findings">
          <div className="card-title">{plural(findings.length, "finding", "findings")} created</div>
          {findings.length > 0 ? (
            <div>
              {findings.map((f) => (
                <Link key={f.id} className="row-link" href={findingHref(id, f.id)}>
                  <div className="row-main">
                    <div className="row-title">{f.description}</div>
                    <div className="row-sub">{plural(photoCounts[f.id] ?? 0, "photo", "photos")}</div>
                  </div>
                  <Pill tone={severityTone(f.severity)}>{severityLabel(f.severity)}</Pill>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="btn-row">
            {newestFinding ? (
              <Link className="btn" href={findingHref(id, newestFinding.id)}>
                Photo
              </Link>
            ) : (
              <button type="button" className="btn" disabled>
                Photo
              </button>
            )}
            <Link className="btn btn-primary" href={nextHref}>
              {nextLabel}
            </Link>
          </div>
          {!newestFinding ? <p className="muted small">Answer a failing question first</p> : null}
        </section>
      </main>
    </>
  );
}
