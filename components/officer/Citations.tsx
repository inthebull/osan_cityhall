"use client";

import { useState } from "react";
import { BookOpen, CircleAlert, CircleCheck } from "lucide-react";

export type Citation = {
  id: string;
  title: string;
  page: number;
  kind?: "manual" | "duty";
  source_url: string;
  text: string;
  quote: string;
  verified: boolean;
};

// 근거 목록. 원문 대조에 성공한 인용은 초록, 실패한 인용은 빨간 "확인 필요"로 보여 준다.
export function Citations({ items, label = "근거" }: { items: Citation[]; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 border-t border-line pt-2">
      <p className="text-xs font-semibold text-navy">{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpen(open === c.id ? null : c.id)}
              className="flex w-full items-start gap-1 text-left text-xs"
              aria-expanded={open === c.id}
            >
              <BookOpen size={14} className="mt-0.5 shrink-0 text-mint" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-mint">
                  {c.title}
                  {c.kind === "duty" ? "" : ` ${c.page}쪽`}
                </span>
                {c.quote && <span className="block text-ink/80">“{c.quote}”</span>}
              </span>
              {c.quote &&
                (c.verified ? (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-mint-2 px-1 font-semibold text-mint">
                    <CircleCheck size={12} />
                    원문 대조
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-red-100 px-1 font-semibold text-red-800">
                    <CircleAlert size={12} />
                    확인 필요
                  </span>
                ))}
            </button>
            {open === c.id && (
              <div className="mt-1 rounded-sm bg-foam p-2 text-xs leading-relaxed">
                <p className="whitespace-pre-line">{c.text}</p>
                <a href={c.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-navy underline">
                  원문 출처
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
