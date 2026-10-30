// 인수인계 슬라이드 묶음. 구조와 근거는 코드가 자리별 업무 데이터로 만들고,
// AI는 업무별 쉬운 설명·유의점·첫 주 할 일 문장만 채운다(없으면 기본 문장).
// 맞춤 자료(packs)가 있는 업무는 지침 원문 쪽을 근거로 단 장을 덧붙인다.
import { basisStrength, basisText, seatsOf, type DutyTask, type Seat } from "@/lib/kb/duties";
import type { Pack, PackItem, PackSource } from "./packs";

export type SlideKind = "cover" | "overview" | "task" | "pack" | "partners" | "firstweek" | "ask";

// 화면·PPT에 보여 줄 근거: 문서 제목, 쪽, 원문 인용, 출처 주소
export type SlideSource = { title: string; page: number; quote: string; url: string };
export type ResolveSource = (s: PackSource) => SlideSource;

export type Slide = {
  id: string;
  kind: SlideKind;
  title: string;
  subtitle?: string;
  bullets: string[];
  tag?: string;
  basis?: { text: string; strength: "direct" | "review" | "none" };
  question?: string; // "이 장에 대해 묻기"에 미리 채울 질문
  sources?: SlideSource[];
};

export type AiText = {
  welcome?: string;
  first_week?: string[];
  tasks?: Record<string, { easy?: string; tip?: string }>;
};

export const MAX_TASK_SLIDES = 12;

const LABEL_TAG: Record<string, string> = {
  직접근거: "근거 확인",
  후보: "근거 검토 필요",
  근거없음: "근거 못 찾음",
  동위임사무: "시에서 동으로 위임된 사무",
  "공통사무(총괄부서 근거)": "모든 부서 공통 사무",
  해당없음: "총괄·서무",
};

function defaultEasy(t: DutyTask): string {
  const s = basisStrength(t);
  if (t.kind === "총괄") return `'${t.title}' 업무는 팀이나 부서 전체를 챙기는 일입니다. 팀원들의 업무 흐름과 일정을 함께 봅니다.`;
  if (t.kind === "서무·공통") return `'${t.title}' 업무는 어느 부서에나 있는 공통 업무입니다. 부서 서무 기준과 기존 철을 먼저 확인하세요.`;
  if (t.label === "동위임사무") return `'${t.title}' 업무는 시청 담당 과의 사무를 동에서 접수·처리하도록 맡긴 일입니다. 시청 담당 과의 지침을 따릅니다.`;
  if (s === "direct" && t.basis) return `'${t.title}' 업무는 조례 시행규칙에 정해진 '${t.basis.item}' 사무입니다.`;
  if (s === "review" && t.basis) return `'${t.title}' 업무는 '${t.basis.item}' 사무와 가장 가깝습니다. 정확한 근거는 팀장과 확인하세요.`;
  return `'${t.title}' 업무는 분장사무에서 딱 맞는 항목을 찾지 못한 업무입니다. 전임자 메모와 기존 문서철로 확인이 필요합니다.`;
}

function defaultTip(t: DutyTask): string {
  if (t.other_dept) return `다른 부서 사무와 겹칠 수 있습니다: ${t.other_dept}`;
  if (basisStrength(t) === "none") return "근거가 불분명한 업무는 처음 맡을 때 담당 범위를 문서로 남겨 두면 다음 사람이 편합니다.";
  return "최근 1년 처리 문서를 훑어보고, 반복되는 일정과 서식을 먼저 익히세요.";
}

const SECTION_ICON: Record<string, string> = {
  law: "근거 법령",
  process: "처리 절차",
  documents: "필요 서류·서식",
  fees: "수수료·기한",
  pitfalls: "자주 틀리는 점",
  partners: "함께 일하는 곳",
  faq: "자주 묻는 질문",
};

function sourcesOf(items: PackItem[], resolve: ResolveSource): SlideSource[] {
  const seen = new Set<string>();
  const out: SlideSource[] = [];
  for (const src of items.flatMap((i) => i.sources)) {
    const key = `${src.doc_id}:${src.page}:${src.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolve(src));
  }
  return out;
}

// 맞춤 자료 한 묶음을 장으로 바꾼다: 섹션 하나 = 한 장
export function packSlides(pack: Pack, resolve: ResolveSource): Slide[] {
  return pack.sections.map((sec, i) => ({
    id: `pack-${pack.pack_id}-${i}`,
    kind: "pack" as const,
    title: `${pack.title} · ${sec.title}`,
    tag: SECTION_ICON[sec.kind] ?? sec.title,
    bullets: sec.items.map((it) => it.text),
    sources: sourcesOf(sec.items, resolve),
    question: `${pack.title}의 ${sec.title}에 대해 더 알려 주세요.`,
  }));
}

// 업무 하나만 다루는 인수인계 묶음(시범 업무용)
export function buildPackDeck(pack: Pack, deptName: string, resolve: ResolveSource): Slide[] {
  return [
    {
      id: "cover",
      kind: "cover",
      title: pack.title,
      subtitle: `${deptName} ${pack.team} · 업무 인수인계 안내 · AI 초안`,
      bullets: ["이 자료의 모든 문장에는 지침·법령 원문의 쪽 번호와 인용이 붙어 있습니다. 원문과 다르면 원문이 우선합니다."],
    },
    {
      id: "summary",
      kind: "task",
      title: "이 업무는 무엇인가요",
      tag: "한눈에 보기",
      bullets: [pack.summary.text, `이어서 ${pack.sections.map((s) => s.title).join(", ")} 순서로 안내합니다.`],
      sources: sourcesOf([pack.summary], resolve),
      question: `${pack.title} 업무를 처음 맡으면 무엇부터 보면 되나요?`,
    },
    ...packSlides(pack, resolve),
    {
      id: "ask",
      kind: "ask",
      title: "모르는 건 AI 주무관에게",
      subtitle: "내려받은 지침·법령 안에서만 답하고, 근거 쪽을 함께 보여 드립니다",
      bullets: pack.sections
        .filter((s) => s.kind === "faq")
        .flatMap((s) => s.items.map((i) => i.text.split(/[?？]/)[0] + "?"))
        .slice(0, 3),
    },
  ];
}

export function buildDeck(
  seat: Seat,
  deptName: string,
  ai: AiText = {},
  packOf: (t: DutyTask) => Pack | undefined = () => undefined,
  resolve?: ResolveSource,
): Slide[] {
  const tasks = seat.tasks;
  const shown = tasks.slice(0, MAX_TASK_SLIDES);
  const count = (s: "direct" | "review" | "none") => tasks.filter((t) => basisStrength(t) === s).length;

  const slides: Slide[] = [
    {
      id: "cover",
      kind: "cover",
      title: `${deptName} ${seat.label}`,
      subtitle: "업무 인수인계 안내 · AI 초안",
      bullets: [ai.welcome ?? `새로 오신 것을 환영합니다. 이 자리에서 맡게 될 업무 ${tasks.length}건을 차례로 안내해 드립니다.`],
    },
    {
      id: "overview",
      kind: "overview",
      title: `맡게 될 업무 ${tasks.length}건`,
      subtitle: `근거 확인 ${count("direct")}건 · 검토 필요 ${count("review")}건 · 근거 못 찾음 ${count("none")}건`,
      bullets: tasks.map((t) => `${t.title} (${t.kind})`),
    },
  ];

  const used = new Set<string>();
  for (const t of shown) {
    const text = ai.tasks?.[t.task_id];
    const b = basisText(t);
    const pack = resolve ? packOf(t) : undefined;
    if (pack && resolve && !used.has(pack.pack_id)) {
      // 맞춤 자료가 있는 업무: 지침 근거 요약 + 섹션별 장
      used.add(pack.pack_id);
      slides.push({
        id: `task-${t.task_id}`,
        kind: "task",
        title: t.title,
        tag: "맞춤 자료 · 지침 근거",
        bullets: [pack.summary.text],
        basis: b ? { text: b, strength: basisStrength(t) } : undefined,
        sources: sourcesOf([pack.summary], resolve),
        question: `'${t.title}' 업무를 처음 맡으면 무엇부터 보면 되나요?`,
      });
      slides.push(...packSlides(pack, resolve));
      continue;
    }
    slides.push({
      id: `task-${t.task_id}`,
      kind: "task",
      title: t.title,
      tag: LABEL_TAG[t.label] ?? t.label,
      bullets: [text?.easy ?? defaultEasy(t), text?.tip ?? defaultTip(t)],
      basis: b ? { text: b, strength: basisStrength(t) } : undefined,
      question: `'${t.title}' 업무는 어떤 근거로 하고, 처음 맡으면 무엇부터 보면 되나요?`,
    });
  }
  if (tasks.length > shown.length) {
    slides.push({
      id: "task-more",
      kind: "task",
      title: `그 밖의 업무 ${tasks.length - shown.length}건`,
      bullets: tasks.slice(shown.length).map((t) => t.title),
    });
  }

  const teammates = seatsOf(seat.dept_id).filter((s) => s.seat_id !== seat.seat_id && s.team === seat.team);
  const others = [...new Set(tasks.map((t) => t.other_dept).filter((x): x is string => Boolean(x)))];
  slides.push({
    id: "partners",
    kind: "partners",
    title: "함께 일하는 곳",
    subtitle: seat.team ? `${seat.team} 동료 자리와 관련 부서` : "부서 안 자리와 관련 부서",
    bullets: [
      ...teammates.slice(0, 6).map((s) => `${s.label}: ${s.tasks[0].title}${s.tasks.length > 1 ? ` 외 ${s.tasks.length - 1}건` : ""}`),
      ...others.map((o) => `관련 부서 근거: ${o}`),
    ],
  });

  slides.push({
    id: "firstweek",
    kind: "firstweek",
    title: "첫 주에 할 일",
    bullets: ai.first_week?.length
      ? ai.first_week
      : [
          "전임자 인수인계서와 최근 1년 문서철 확인",
          `담당 업무 ${tasks.length}건의 처리 시스템 권한 신청`,
          "근거가 '검토 필요'·'못 찾음'인 업무는 팀장과 담당 범위 확인",
          "이번 달 마감 일정과 진행 중인 민원 목록 정리",
          "모르는 점은 AI 주무관에게 묻고, 답이 없으면 '열린 질문'으로 남기기",
        ],
  });

  slides.push({
    id: "ask",
    kind: "ask",
    title: "모르는 건 AI 주무관에게",
    subtitle: "업무 목록·분장사무·내려받은 지침 안에서만 답하고, 근거를 함께 보여 드립니다",
    bullets: shown.filter((t) => t.kind !== "총괄").slice(0, 3).map((t) => `"${t.title}" 업무는 누가, 어떤 근거로 하나요?`),
  });

  return slides;
}

// AI가 낸 문장 검사: 모르는 업무 ID는 버리고, 입력에 없는 조문 번호를 쓴 문장은 버린다.
export function sanitizeAi(raw: unknown, seat: Seat): AiText {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as { welcome?: unknown; first_week?: unknown; tasks?: unknown };
  const known = new Set(seat.tasks.map((t) => t.task_id));
  const allowed = seat.tasks.map((t) => basisText(t) ?? "").join(" ");
  const ok = (s: unknown, max: number): s is string => {
    if (typeof s !== "string" || !s.trim() || s.length > max) return false;
    const cites = s.match(/제\s?\d+\s?조(의\s?\d+)?|별표\s?\d+/g) ?? [];
    return cites.every((c) => allowed.includes(c.replace(/\s/g, "")) || allowed.includes(c));
  };
  const out: AiText = {};
  if (ok(r.welcome, 300)) out.welcome = r.welcome.trim();
  if (Array.isArray(r.first_week)) {
    const items = r.first_week.filter((x) => ok(x, 120)).slice(0, 6) as string[];
    if (items.length >= 3) out.first_week = items;
  }
  if (Array.isArray(r.tasks)) {
    out.tasks = {};
    for (const t of r.tasks as { task_id?: unknown; easy?: unknown; tip?: unknown }[]) {
      if (typeof t?.task_id !== "string" || !known.has(t.task_id)) continue;
      out.tasks[t.task_id] = {
        easy: ok(t.easy, 240) ? t.easy.trim() : undefined,
        tip: ok(t.tip, 200) ? t.tip.trim() : undefined,
      };
    }
  }
  return out;
}
