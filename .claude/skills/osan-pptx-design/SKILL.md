---
name: osan-pptx-design
description: 오산시 AI 청사의 PPT(인수인계 슬라이드 등)를 만들거나 디자인·배치를 고칠 때 쓴다. lib/handover/pptx.ts, layout.ts, HandoverStudio SlideView를 바꾸거나 새 장 종류를 추가할 때, PPT 모양을 점검할 때. DESIGN.md 기준과 렌더링 점검 순서를 따른다.
license: MIT
---

# 오산시 AI 청사 PPT 디자인

PPT는 pptxgenjs로 브라우저에서 만든다(`lib/handover/pptx.ts`). 화면 미리보기(`components/handover/HandoverStudio.tsx`의 SlideView)는 PPT와 **같은 배치 규칙**(`lib/handover/layout.ts`)을 쓴다.
색·서체·격자·상징 사용 규칙은 저장소 루트의 `DESIGN.md`가 기준이다. 이 스킬은 그 기준으로 실제 장을 만들고 점검하는 순서다.

## 고정값

| 항목 | 값 |
| --- | --- |
| 크기 | `LAYOUT_WIDE` 13.33 × 7.5in |
| 글꼴 | `맑은 고딕` 하나 |
| 색 | `#` 없는 6자리 HEX. DESIGN.md 2절 문서 팔레트와 의미 색만 |
| 본문 영역 | x 0.6, w 12.13, y 2.2–6.2in |
| 필수 요소 | 머리띠, `AI 초안 · 최종 판단은 담당자` 배지, 쪽 번호, 근거(각주 또는 근거 상자) |
| 상징 | 표지에만 시정슬로건 가로형 원본 이미지(`public/brand/osan-slogan-h.png`), 비율 고정 |

## 작업 순서

### 1. 장을 분류한다
모든 장을 `layout.ts`의 배치 하나로 정한다: `cover`, `explain`, `cards`, `steps`, `table`, `questions`.
새 내용이 어디에도 맞지 않을 때만 새 배치를 만든다. 그때는 `Layout` 타입, `layoutOf`, `layout.test.ts`를 먼저 고친다.

### 2. 밀도를 정한다
- 설명형(발표자가 말로 푸는 장): 글머리표 1–3개.
- 읽기형(받아서 읽는 장): 글머리표 4–8개 또는 카드 4–6개.
- 이 범위를 넘으면 **글자를 줄이지 말고 장을 나눈다.** 본문은 11pt 밑으로 내리지 않는다.
- 같은 배치가 3장 넘게 이어지면 사이에 개요(카드 격자)를 넣어 리듬을 바꾼다.

### 3. 두 곳에 같은 배치를 그린다
- `pptx.ts`: 배치마다 함수 하나(`explain`, `steps`, `table` …). 좌표는 DESIGN.md 5절 격자에 맞춘다.
- `HandoverStudio.tsx` SlideView: 같은 배치를 Tailwind로. 색은 `osan-*`, `doc-*` 토큰.
- 한쪽만 바꾸지 않는다.

### 4. 지켜야 할 규칙
- 글자 위계: 장 제목 28pt와 본문 14–16pt처럼 단계가 분명하게. 서로 붙은 글자 크기를 비슷하게 두지 않는다.
- 본문은 왼쪽 정렬. 본문·각주는 굵게 쓰지 않고, 라벨만 굵게.
- 간격은 0.15in(카드 사이)와 0.2in(묶음 사이) 두 가지만. 슬라이드 가장자리 여백 0.5in 이상.
- 그라데이션·애니메이션·전환 효과·그림자·장식 그림을 쓰지 않는다.
- 청록 `00A0AD`는 선·띠·도형에만. 작은 글자와 흰 글자의 바탕은 `006B73`.
- 근거 상태는 의미 색 + 글자 라벨(`근거 확인`/`근거 검토 필요`/`확인 필요`). 대조 실패를 초록·청록으로 칠하지 않는다.
- 긴 제목에는 `fit: "shrink"`를 주되, 넘침 점검(5단계)으로 확인한다.
- pptxgenjs 옵션 객체는 장마다 새로 만든다(같은 객체를 여러 번 넘기면 값이 바뀔 수 있다). 글머리표는 `bullet` 옵션을 쓰고 글자로 `•`를 넣지 않는다.
- 실명·연락처·실제 민원 문장을 넣지 않는다. 가상 인물은 `가상민원인A`.

### 5. 렌더링으로 점검한다 (필수)
문제가 있다고 가정하고 본다. 한 번 이상 고치고 다시 확인하기 전에는 끝났다고 하지 않는다.

```
npm run render:handover            # 세 부서 대표 자리 + 맞춤 자료 묶음
npm run render:handover -- S-CIVIL-04   # 특정 자리만
```
결과는 `.render/handover/`에 `.pptx`, `.pdf`, 장마다 `.png`로 남는다(LibreOffice·poppler가 있을 때).

장마다 확인할 것
1. 글자 넘침·잘림(카드, 표, 말풍선, 제목)
2. 요소 겹침(근거 각주와 본문, 바닥글과 본문, 배지와 제목)
3. 격자 어긋남과 들쭉날쭉한 간격
4. 배지·쪽 번호·근거 누락
5. 대비(작은 청록 글자, 의미 색 상자 글자)

LibreOffice는 맑은 고딕이 없으면 다른 글꼴로 바꿔 그리므로 줄바꿈 위치가 실제 PowerPoint와 조금 다를 수 있다. 여유를 두고 배치한다.
화면 미리보기는 `npm run dev` 후 Playwright로 `/handover`의 같은 장을 찍어 PPT와 비교한다.

### 6. 마무리
`npm run lint && npm run typecheck && npm test && npm run validate-data`. 배치나 장 순서가 바뀌면 `layout.test.ts`와 `tests/e2e/demo.spec.ts`도 고친다.

## 참고
- pptxgenjs API 요약: [references/pptxgenjs.md](references/pptxgenjs.md)
- 디자인 기준: 루트 `DESIGN.md`
