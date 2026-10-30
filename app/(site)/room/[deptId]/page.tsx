import { notFound } from "next/navigation";
import Link from "next/link";
import { getDept, listDepts } from "@/lib/map/data";
import { officerForDept } from "@/lib/officers/officer";

export function generateStaticParams() {
  return listDepts().map((d) => ({ deptId: d.dept_id }));
}

const sections = [
  { key: "handover", title: "AI 인수인계", body: "업무 카드, 연간 달력, 단계 체크리스트, 후임자 질의응답이 들어갈 자리입니다." },
  { key: "tools", title: "업무도구 선반", body: "이 업무에서 만든 도구가 쌓이는 선반입니다. 담당자가 바뀌어도 도구는 업무에 남습니다." },
  { key: "learned", title: "이 방이 배운 것", body: "답을 못 한 질문에 담당자가 답을 달면 다음 후임자부터 바로 답합니다." },
];

export default async function RoomPage({ params }: { params: Promise<{ deptId: string }> }) {
  const { deptId } = await params;
  const dept = getDept(deptId);
  if (!dept) notFound();
  const officer = officerForDept(dept.dept_id);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{dept.name}</h1>
        <p className="text-sm opacity-70">{[dept.bureau, dept.phone].filter(Boolean).join(" · ") || "대표번호 확인 필요"}</p>
      </div>
      {officer ? (
        <Link href={`/officer/${officer.officer_id}`} className="block rounded-md border-2 border-navy bg-mint-2 px-3 py-2 text-sm text-navy">
          <b>{officer.name}</b>이(가) 근무 중입니다. 업무 묻기 · 안내문 만들기 · 응대 연습 →
        </Link>
      ) : (
      <div className="rounded-md border border-amber-500/40 bg-amber-100/40 dark:bg-amber-900/20 px-3 py-2 text-sm">
        부서 자료 수집 중입니다. 자료가 들어오면 이 방의 AI 주무관이 일을 시작합니다.
      </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {sections.map((s) => (
          <section key={s.key} className="rounded-lg border border-black/10 dark:border-white/10 p-4">
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-sm opacity-70 mt-1">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
