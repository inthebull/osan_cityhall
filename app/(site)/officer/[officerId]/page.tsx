import { notFound } from "next/navigation";
import { OfficerDesk, type DeskProfile } from "@/components/officer/OfficerDesk";
import { getSeat } from "@/lib/kb/duties";
import { loadManuals } from "@/lib/kb/manuals";
import { getDept } from "@/lib/map/data";
import { getOfficer, OFFICERS } from "@/lib/officers/officer";

export function generateStaticParams() {
  return OFFICERS.map((o) => ({ officerId: o.officer_id }));
}

export default async function OfficerPage({ params }: { params: Promise<{ officerId: string }> }) {
  const officer = getOfficer((await params).officerId);
  if (!officer) notFound();
  const { docs } = loadManuals();
  const profile: DeskProfile = {
    ...officer,
    dept_name: getDept(officer.dept_id)?.name ?? "",
    seats: officer.seat_ids.flatMap((id) => {
      const s = getSeat(id);
      return s ? [{ seat_id: s.seat_id, label: s.label, tasks: s.tasks.map((t) => t.title) }] : [];
    }),
    docs: officer.doc_ids.flatMap((id) => {
      const d = docs.find((x) => x.doc_id === id);
      return d ? [{ doc_id: d.doc_id, title: d.title, pages: d.pages, source_url: d.source_url }] : [];
    }),
  };
  return <OfficerDesk profile={profile} />;
}
