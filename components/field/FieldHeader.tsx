"use client";

import Link from "next/link";
import SyncPill from "./SyncPill";

type Props = {
  title: string;
  /* href of the back arrow, none on the top level lists */
  back?: string;
  subtitle?: string;
};

/*
  Header of every field screen: back arrow, one line title, sync pill.
  One screen = one task on the phone, so the title says which task.
*/
export default function FieldHeader({ title, back, subtitle }: Props) {
  return (
    <header className="header">
      <div className="header-field">
        {back ? (
          <Link className="back" href={back} aria-label="Back">
            &#8592;
          </Link>
        ) : null}
        <div className="title">
          {title}
          {subtitle ? <div className="row-sub">{subtitle}</div> : null}
        </div>
        <SyncPill />
      </div>
    </header>
  );
}
