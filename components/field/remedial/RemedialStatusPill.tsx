"use client";

import Pill from "@/components/ui/Pill";
import type { RemedialStatus } from "@/lib/supabase/types";
import { statusLabel, statusTone } from "./remedialStatus";

type Props = {
  status: RemedialStatus;
};

/* Status pill of a remedial item: grey To do, orange In progress, green Done, grey Cancelled. */
export default function RemedialStatusPill({ status }: Props) {
  return <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>;
}
