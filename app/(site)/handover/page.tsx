import { HandoverStudio, type SeatSummary } from "@/components/handover/HandoverStudio";
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
  }));
  const initial = depts.some((d) => d.dept_id === dept) ? (dept as string) : depts[0].dept_id;
  return <HandoverStudio depts={depts} seats={seats} initialDept={initial} />;
}
