"use client";

import { useParams } from "next/navigation";
import BuildingEditor from "@/components/office/BuildingEditor";

export default function BuildingPage() {
  const params = useParams<{ id: string }>();
  return <BuildingEditor buildingId={params.id} />;
}
