"use client";

import { useState } from "react";
import ErrorText from "@/components/office/ErrorText";
import { assertOk, errorMessage, must } from "@/components/office/helpers";
import { newId, useLocalSession } from "@/lib/local/session";
import { getSupabase } from "@/lib/supabase/client";
import type { BuildingAssignment, Profile, UserRole } from "@/lib/supabase/types";
import { useAsync } from "@/lib/useAsync";

type BuildingOption = { id: string; name: string };

type UsersData = {
  profiles: Profile[];
  buildings: BuildingOption[];
  assignments: BuildingAssignment[];
};

const ROLES: { value: UserRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
  { value: "inspector", label: "Inspector" },
  { value: "remedial", label: "Remedial" },
];

async function loadUsers(): Promise<UsersData> {
  const supabase = getSupabase();
  const [profilesRes, buildingsRes, assignmentsRes] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("buildings").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("building_assignments").select("*"),
  ]);
  return { profiles: must(profilesRes), buildings: must(buildingsRes), assignments: must(assignmentsRes) };
}

export default function UsersPage() {
  const session = useLocalSession();
  const myId = session?.user_id ?? null;
  const { data, error, loading, reload } = useAsync(loadUsers, []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(work: () => Promise<void>) {
    setActionError(null);
    setBusy(true);
    try {
      await work();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function setRole(p: Profile, role: UserRole) {
    if (p.id === myId || role === p.role) return;
    void run(async () => {
      assertOk(await getSupabase().from("profiles").update({ role }).eq("id", p.id));
    });
  }

  function setActive(p: Profile, active: boolean) {
    if (p.id === myId) return;
    void run(async () => {
      assertOk(await getSupabase().from("profiles").update({ active }).eq("id", p.id));
    });
  }

  function isAssigned(profileId: string, buildingId: string): boolean {
    return (data?.assignments ?? []).some((a) => a.profile_id === profileId && a.building_id === buildingId);
  }

  function toggleAssignment(p: Profile, buildingId: string, checked: boolean) {
    void run(async () => {
      const supabase = getSupabase();
      if (checked) {
        assertOk(
          await supabase
            .from("building_assignments")
            .insert({ id: newId(), profile_id: p.id, building_id: buildingId }),
        );
      } else {
        assertOk(
          await supabase.from("building_assignments").delete().eq("profile_id", p.id).eq("building_id", buildingId),
        );
      }
    });
  }

  return (
    <>
      <h2>Users</h2>
      <p className="muted">
        A profile appears here after the user is invited in Supabase Auth. Remedial users only see the buildings
        ticked in the last column.
      </p>
      {loading && !data ? <p className="muted">Loading</p> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th>Buildings</th>
                </tr>
              </thead>
              <tbody>
                {data.profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="row-title">
                      {p.full_name}
                      {p.id === myId ? <span className="muted small"> (you)</span> : null}
                    </td>
                    <td>
                      <select
                        className="select"
                        aria-label={`Role of ${p.full_name}`}
                        value={p.role}
                        onChange={(e) => setRole(p, e.target.value as UserRole)}
                        disabled={busy || p.id === myId}
                        style={{ minWidth: 130 }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${p.full_name} active`}
                        checked={p.active}
                        onChange={(e) => setActive(p, e.target.checked)}
                        disabled={busy || p.id === myId}
                        style={{ width: 22, height: 22 }}
                      />
                    </td>
                    <td>
                      {p.role === "remedial" ? (
                        data.buildings.length === 0 ? (
                          <span className="muted">No buildings yet</span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {data.buildings.map((b) => (
                              <label key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={isAssigned(p.id, b.id)}
                                  onChange={(e) => toggleAssignment(p, b.id, e.target.checked)}
                                  disabled={busy}
                                  style={{ width: 22, height: 22 }}
                                />
                                {b.name}
                              </label>
                            ))}
                          </div>
                        )
                      ) : (
                        <span className="muted">All buildings</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorText>{actionError}</ErrorText>
        </div>
      ) : null}
    </>
  );
}
