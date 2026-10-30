import { HandoverStudio, type PackSummary, type SeatSummary } from "@/components/handover/HandoverStudio";
import { packFor, PACKS } from "@/lib/handover/packs";
import { DUTIES } from "@/lib/kb/duties";
import { listDepts } from "@/lib/map/data";

export const metadata = { title: "AI 인수인계 · 오산시 AI 청사" };

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const { dept } = await searchParams;
  const depts = listDepts().map((d) => ({ dept_id: d.dept_id, name: d.name }));
  const seats: SeatSummary[] = DUTIES.seats.map((s) => ({
    seat_id: s.seat_id,
    dept_id: s.dept_id,
    team: s.team,
    label: s.label,
    count: s.tasks.length,
    packs: new Set(s.tasks.map((t) => packFor(t.title, s.dept_id)?.pack_id).filter(Boolean)).size,
  }));
  const packs: PackSummary[] = PACKS.map((p) => ({ pack_id: p.pack_id, dept_id: p.dept_id, title: p.title, team: p.team }));
  const initial = depts.some((d) => d.dept_id === dept) ? (dept as string) : depts[0].dept_id;
  return <HandoverStudio depts={depts} seats={seats} packs={packs} initialDept={initial} />;
}
