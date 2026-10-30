"""업무(data/tasks/tasks.csv)마다 같은 부서의 분장사무 항목(data/laws/분장사무.csv)을 찾아 붙인다.

유사도: 글자 2-gram TF-IDF 코사인 + 공통 명사 가산점(NOUN_BONUS × 공통 낱말 수, 최대 NOUN_CAP).
라벨(문턱값은 표본을 보고 정했고 README와 summary.md에 적는다)
- 직접근거: 1위 점수 ≥ DIRECT_MIN 이고 2위보다 DIRECT_GAP 이상 앞섬
- 후보:     1위 점수 ≥ CANDIDATE_MIN
- 근거없음: 그 밖
- 해당없음: 총괄·서무·공통·근무상태 업무
- 동위임사무: 행정복지센터(동) 업무. 조례 제19조(동의 직무)를 근거로 단다.
전 부서 비교에서 다른 부서 항목의 점수가 자기 부서 최고점보다 CROSS_GAP 이상 높고 CROSS_MIN 이상이면
'타부서근거'로 표시한다(경계 업무 후보).
"""
import csv
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TASKS = ROOT / "data" / "tasks" / "tasks.csv"
CLAUSES = ROOT / "data" / "laws" / "분장사무.csv"
OUT = ROOT / "data" / "tasks" / "tasks_basis.csv"
SUMMARY = ROOT / "data" / "tasks" / "summary.md"

DIRECT_MIN = 0.45
DIRECT_GAP = 0.08
CANDIDATE_MIN = 0.15
CROSS_MIN = 0.45
CROSS_GAP = 0.15
NOUN_BONUS = 0.05
NOUN_CAP = 0.15

COLUMNS = ["업무ID", "국", "과", "팀", "직위", "전화번호", "업무", "유형", "라벨",
           "근거1", "점수1", "근거2", "점수2", "근거3", "점수3", "타부서근거"]
# 분장사무 문구에 흔해서 근거를 가려 주지 못하는 낱말
STOP = {"사항", "관한", "관리", "운영", "업무", "추진", "지원", "계획", "수립", "및", "등", "기타", "관련",
        "업무의", "사무", "시행", "처리", "총괄", "담당", "기획", "추진에", "관리에", "운영에", "대한", "위한"}
PARTICLE = re.compile(r"(?:에관한|에대한|에따른|으로|에서|의|에|을|를|은|는|이|가|과|와|및)$")


def bigrams(text):
    s = re.sub(r"[^0-9A-Za-z가-힣]", "", text)
    return [s[i:i + 2] for i in range(len(s) - 1)] or ([s] if s else [])


def nouns(text):
    out = set()
    for w in re.findall(r"[0-9A-Za-z가-힣]+", text):
        w = PARTICLE.sub("", w)
        if len(w) >= 2 and w not in STOP:
            out.add(w)
    return out


class Index:
    def __init__(self, docs):
        self.docs = docs
        df = Counter()
        grams = [Counter(bigrams(d["분장사무 항목"])) for d in docs]
        for g in grams:
            df.update(g.keys())
        n = len(docs)
        self.idf = {t: math.log((n + 1) / (c + 1)) + 1 for t, c in df.items()}
        self.vecs = [self._weigh(g) for g in grams]
        self.nouns = [nouns(d["분장사무 항목"]) for d in docs]

    def _weigh(self, counts):
        v = {t: c * self.idf.get(t, math.log(len(self.docs) + 1) + 1) for t, c in counts.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items()}

    def score_all(self, text, subset=None):
        q = self._weigh(Counter(bigrams(text)))
        qn = nouns(text)
        out = []
        for i in (subset if subset is not None else range(len(self.docs))):
            v = self.vecs[i]
            cos = sum(w * v.get(t, 0.0) for t, w in q.items())
            bonus = min(NOUN_CAP, NOUN_BONUS * len(qn & self.nouns[i]))
            out.append((round(cos + bonus, 4), i))
        out.sort(reverse=True)
        return out


# 모든 부서가 스스로 수행하지만 조항은 총괄부서에만 있는 공통사무.
# 표본의 타부서근거에서 반복해 나온 업무와, 그 낱말이 들어간 분장사무 항목의 소속을 보고 정했다.
# (이름, 업무에 들어 있어야 하는 낱말들, 총괄부서)
COMMON_DUTIES = [
    ("공유재산", ("공유재산",), "회계과"),
    ("세입세출외현금", ("세입세출외현금",), "회계과"),
    ("세외수입", ("세외수입",), "징수과"),
    ("국민신문고·민원접수", ("국민신문고", "고충민원", "민원접수"), "민원여권과"),
    ("예산편성·집행", ("예산편성", "예산 편성", "집행심사", "예산배정"), "기획예산과"),
    ("회계·결산", ("결산", "회계"), "회계과"),
    ("계약", ("계약",), "회계과"),
    ("물품·재물조사", ("물품", "재물조사"), "회계과"),
    ("차량관리", ("차량관리", "관용차량", "관용차"), "회계과"),
    ("사회복무요원", ("사회복무요원",), "안전정책과"),
    ("기록물", ("기록물", "기록관"), "자치행정과"),
    ("보안업무·충무계획", ("보안업무", "보안 및", "충무"), "자치행정과"),
    ("정보보안", ("정보보안", "사이버보안", "정보통신보안"), "데이터정책과"),
    ("개인정보보호", ("개인정보",), "데이터정책과"),
    ("정보공개", ("정보공개", "사전정보"), "자치행정과"),
    ("민간위탁", ("민간위탁",), "기획예산과"),
    ("자체평가", ("자체평가",), "기획예산과"),
    ("청렴·행동강령", ("행동강령", "청렴"), "감사담당관"),
    ("공무직·기간제 관리", ("공무직", "기간제"), "자치행정과"),
    ("적극행정·규제개혁", ("적극행정", "규제개혁"), "기획예산과"),
    ("SNS 홍보", ("SNS",), "홍보담당관"),
    ("당직근무", ("당직",), "자치행정과"),
    ("조례·자치법규 제개정", ("조례 제", "조례제", "자치법규", "규칙 제"), "기획예산과"),
    ("공약사항", ("공약",), "기획예산과"),
]
# 부서마다 자기 법령에 따라 하는 일이라 다른 부서 조항과 겹쳐도 경계 업무로 보지 않는 낱말
NO_CROSS_WORDS = ("과태료",)
# 짧거나 일반명사 하나뿐인 업무명은 직접근거·타부서근거를 주지 않는다(최대 '후보').
GENERIC_HEADS = {"통계", "조사", "청사", "차량", "물품", "민원", "예산", "회계", "서무", "홍보", "교육", "행사",
                 "시설", "자료", "문서", "계약", "점검", "인사", "복무", "보안", "감사", "평가", "기획", "총무", "도서"}
GENERIC_TAILS = ("업무", "관리", "담당", "처리", "지원", "운영")
GENERIC_PHRASES = {"시설물유지관리", "시설유지관리", "시설물관리", "홈페이지관리"}


def common_duty(task, own_dept):
    """업무가 공통사무이면 (이름, 총괄부서, 낱말들). 총괄부서 자신의 업무면 공통사무가 아니다."""
    for name, words, lead in COMMON_DUTIES:
        if lead != own_dept and any(w in task for w in words):
            return name, lead, words
    return None


def is_generic(task):
    core = re.sub(r"[^0-9A-Za-z가-힣]", "", task)
    if len(core) < 5 or core in GENERIC_PHRASES:
        return True
    for tail in GENERIC_TAILS:
        if core.endswith(tail) and core[:-len(tail)] in GENERIC_HEADS:
            return True
    return False


def cite(d):
    num = f" {d['항목번호']}." if d["항목번호"] else ""
    return f"{d['법규명']} {d['조문번호']}{num} {d['분장사무 항목']}"


def dept_key(task_gwa, task_guk):
    if task_gwa.startswith("의회") or task_guk == "오산시의회":
        return "오산시의회"
    return task_gwa


def main():
    with open(CLAUSES, encoding="utf-8-sig") as f:
        docs = list(csv.DictReader(f))
    index = Index(docs)
    by_dept = defaultdict(list)
    for i, d in enumerate(docs):
        key = "오산시의회" if d["국"] == "오산시의회" else d["과(담당관/사업소/동)"]
        by_dept[key].append(i)
    dong = [i for i, d in enumerate(docs) if d["국"] == "동"]

    with open(TASKS, encoding="utf-8-sig") as f:
        tasks = list(csv.DictReader(f))

    rows, cross_cases, common_cases = [], [], []
    for t in tasks:
        text = t["업무"]
        own = by_dept.get(dept_key(t["과"], t["국"]), [])
        is_dong = t["구분"] == "행정복지센터(동)"
        row = {k: t.get(k, "") for k in COLUMNS[:8]}
        best_all = index.score_all(text)[0] if text else (0.0, -1)

        if t["유형"] != "고유업무":
            row["라벨"] = "해당없음"
        elif is_dong:
            row["라벨"] = "동위임사무"
            for k, i in enumerate(dong[:3], 1):
                row[f"근거{k}"], row[f"점수{k}"] = cite(docs[i]), ""
        else:
            ranked = index.score_all(text, own) if own else []
            for k, (s, i) in enumerate(ranked[:3], 1):
                row[f"근거{k}"], row[f"점수{k}"] = cite(docs[i]), s
            s1 = ranked[0][0] if ranked else 0.0
            s2 = ranked[1][0] if len(ranked) > 1 else 0.0
            if not own:
                row["라벨"] = "근거없음(부서 분장사무 없음)"
            elif s1 >= DIRECT_MIN and s1 - s2 >= DIRECT_GAP:
                row["라벨"] = "직접근거"
            elif s1 >= CANDIDATE_MIN:
                row["라벨"] = "후보"
            else:
                row["라벨"] = "근거없음"

        generic = is_generic(text)
        if generic and row["라벨"] == "직접근거":
            row["라벨"] = "후보"

        if t["유형"] == "고유업무" and best_all[1] >= 0:
            own_best = 0.0 if is_dong or not own else index.score_all(text, own)[0][0]
            s, i = best_all
            d = docs[i]
            other = ("오산시의회" if d["국"] == "오산시의회" else d["과(담당관/사업소/동)"])
            if other != dept_key(t["과"], t["국"]) and s >= CROSS_MIN and s - own_best >= CROSS_GAP:
                common = common_duty(text, dept_key(t["과"], t["국"]))
                if common:
                    # 각 부서가 스스로 하는 공통사무: 근거1에 총괄부서 조항을 달고 자기 부서 상위 2개를 뒤로 민다.
                    name, lead, words = common
                    pool = [i for i in by_dept.get(lead, []) if any(w in docs[i]["분장사무 항목"] for w in words)]
                    ls, li = index.score_all(text, pool or by_dept.get(lead, []))[0]
                    row["라벨"] = "공통사무(총괄부서 근거)"
                    row["근거3"], row["점수3"] = row.get("근거2", ""), row.get("점수2", "")
                    row["근거2"], row["점수2"] = row.get("근거1", ""), row.get("점수1", "")
                    row["근거1"], row["점수1"] = f"[총괄부서 {lead}·{name}] {cite(docs[li])}", ls
                    common_cases.append((t, docs[li], name))
                elif not generic and not any(w in text for w in NO_CROSS_WORDS):
                    row["타부서근거"] = f"{d['국']} {other} | {cite(d)} | {s}"
                    cross_cases.append((round(s - own_best, 4), s, own_best, t, d))
        rows.append(row)

    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    write_summary(rows, cross_cases, common_cases)
    print(f"{len(rows)} rows -> {OUT}")
    print(Counter(r["라벨"] for r in rows), "타부서근거", len(cross_cases))


def write_summary(rows, cross_cases, common_cases):
    labels = Counter(r["라벨"] for r in rows)
    per_dept = defaultdict(Counter)
    for r in rows:
        per_dept[(r["국"], r["과"])][r["라벨"]] += 1
        if r.get("타부서근거"):
            per_dept[(r["국"], r["과"])]["타부서근거"] += 1
    cols = ["직접근거", "후보", "근거없음", "공통사무(총괄부서 근거)", "동위임사무", "해당없음", "타부서근거"]
    duty_counts = Counter(duty for _t, _d, duty in common_cases)
    lines = ["# 업무별 근거 조항 연결 요약", "",
             f"업무 {len(rows)}건. 유사도 = 글자 2-gram TF-IDF 코사인 + 공통 명사 가산점"
             f"({NOUN_BONUS}/개, 최대 {NOUN_CAP}).", "",
             "## 문턱값과 규칙", "",
             f"- 직접근거: 1위 ≥ {DIRECT_MIN} 이고 2위보다 {DIRECT_GAP} 이상 앞섬",
             f"- 후보: 1위 ≥ {CANDIDATE_MIN}",
             f"- 근거없음: 1위 < {CANDIDATE_MIN}",
             f"- 타부서근거: 다른 부서 항목 점수 ≥ {CROSS_MIN} 이고 자기 부서 최고점보다 {CROSS_GAP} 이상 높음",
             "- 공통사무(총괄부서 근거): 타부서근거 조건을 만족하는데, 그 조항이 아래 공통사무 낱말을 업무와 함께 담고 있음."
             " 근거1에 총괄부서 조항을 달고 자기 부서 상위 2개는 근거2·3으로 옮김. 타부서근거에서는 뺌",
             "- 일반 업무명: 다섯 글자 미만이거나 '통계업무'·'청사관리'처럼 일반명사+업무/관리 꼴이면 직접근거·타부서근거를 주지 않음(최대 후보)",
             "", "점수는 문구가 얼마나 닮았는지일 뿐 관할 판단의 정답 확률이 아닙니다.", "",
             "## 공통사무 목록 (건수)", ""]
    lines += [f"- {name} (총괄 {lead}): {', '.join(words)} — {duty_counts.get(name, 0)}건" for name, words, lead in COMMON_DUTIES]
    lines += ["", "과태료처럼 부서마다 자기 법령에 따라 하는 일(" + ", ".join(NO_CROSS_WORDS) + ")은 타부서근거로 표시하지 않습니다."]
    lines += ["", "## 라벨별 건수", "", "| 라벨 | 건수 |", "|---|---|"]
    lines += [f"| {k} | {v} |" for k, v in labels.most_common()]
    lines += [f"| (타부서근거 표시) | {len(cross_cases)} |", "", "## 부서별 건수", "",
              "| 국 | 과 | " + " | ".join(cols) + " |", "|---|---|" + "---|" * len(cols)]
    for (guk, gwa), c in sorted(per_dept.items()):
        lines.append(f"| {guk} | {gwa} | " + " | ".join(str(c.get(k, 0)) for k in cols) + " |")
    # 동 업무는 자기 부서 분장사무 항목이 없어(자기 부서 최고 0) 점수 차가 늘 커 보이므로 따로 센다.
    bon = [c for c in cross_cases if c[3]["구분"] != "행정복지센터(동)"]
    dong = [c for c in cross_cases if c[3]["구분"] == "행정복지센터(동)"]
    lines += ["", f"## 경계 업무 후보: 본청·소속기관 타부서근거 상위 20건 ({len(bon)}건 중, 점수 차 순)", "",
              "동 업무의 타부서근거 " + str(len(dong)) + "건은 대부분 본청 사업을 동에서 집행하는 업무이므로 "
              "이 목록에서 뺐습니다(tasks_basis.csv 에는 있음).", "",
              "| 업무ID | 소속 | 업무 | 다른 부서 조항 | 점수 | 자기 부서 최고 |", "|---|---|---|---|---|---|"]
    for gap, s, own, t, d in sorted(bon, key=lambda x: (-x[0], -x[1]))[:20]:
        other = "오산시의회" if d["국"] == "오산시의회" else d["과(담당관/사업소/동)"]
        lines.append(f"| {t['업무ID']} | {t['과']} {t['팀']} | {t['업무']} | {other}: {d['분장사무 항목']} | {s} | {own} |")
    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
