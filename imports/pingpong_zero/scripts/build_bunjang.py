"""data/laws/raw 의 원자료로 data/laws/분장사무.csv 를 만든다.

출처
- 오산시 행정기구 및 정원 조례 시행규칙 별표 1~3 (HWP에서 hwp2txt.py로 뽑은 TSV): 관·과별 분장사무
- 오산시 행정기구 및 정원 조례 조문: 부시장·보좌기관·국장·사업소장·동의 분장사무
- 오산시의회 직제 및 사무분장 규칙 조문: 사무과장·전문위원·정책지원관의 분장사무

원문은 고치지 않는다. 별표 셀에서 이름이 여러 행에 나뉘어 적힌 경우(예: '기후환경'+'정책과')만
이어 붙이고, 조례 원문의 〈개정 …〉·[본조신설 …] 같은 연혁 표시는 항목을 나눌 때만 무시한다.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "laws" / "raw"
OUT = ROOT / "data" / "laws" / "분장사무.csv"

COLUMNS = ["법규명", "시행일", "조문번호", "국", "과(담당관/사업소/동)", "항목번호", "분장사무 항목", "원문"]
BYEOLPYO_TABLES = {1: "별표 1", 2: "별표 2", 3: "별표 3"}  # 표번호 → 별표
HEADER_WORDS = {"국", "관․과", "과", "분장사무", "직속기관", "사업소"}
ANNOTATION = re.compile(r"〈[^〉]*〉|\[[^\]]*(?:신설|개정|삭제)[^\]]*\]")


def law_info(mst):
    data = json.loads((RAW / f"{mst}.json").read_text(encoding="utf-8"))["LawService"]
    info = data["자치법규기본정보"]
    return info["자치법규명"], info["시행일자"], [data["조문"]["조"]] if isinstance(data["조문"]["조"], dict) else data["조문"]["조"]


def byeolpyo_rows(tsv_path, law_name, effective):
    cells = {}
    with open(tsv_path, encoding="utf-8") as f:
        for rec in csv.DictReader(f, delimiter="\t"):
            if not rec["표번호"] or int(rec["표번호"]) not in BYEOLPYO_TABLES:
                continue
            cells[(int(rec["표번호"]), int(rec["행"]), int(rec["열"]))] = rec["텍스트"]

    out = []
    for table, label in BYEOLPYO_TABLES.items():
        rows = sorted({r for (t, r, _c) in cells if t == table})
        num_at = {r: cells.get((table, r, 2), "") for r in rows}
        # 기관 이름은 1번 항목 행에서 시작하고, 바로 이어지는 행(2번, 3번 …)에 뒷부분이 나뉘어 적히기도 한다.
        names = {0: {}, 1: {}}
        for col in (0, 1):
            for i, r in enumerate(rows):
                frag = cells.get((table, r, col), "").replace(" ", "")
                if not frag or frag in HEADER_WORDS or num_at[r] != "1":
                    continue
                full, j = frag, i + 1
                while j < len(rows) and num_at[rows[j]] not in ("", "1"):
                    nxt = cells.get((table, rows[j], col), "").replace(" ", "")
                    if not nxt:
                        break
                    full, j = full + nxt, j + 1
                names[col][r] = full
        guk = gwa = ""
        for r in rows:
            num, text = num_at[r], cells.get((table, r, 3), "")
            if r in names[0]:
                guk, gwa = names[0][r], ""
            if r in names[1]:
                gwa = names[1][r]
            if not num or not text or num == "분장사무":
                continue
            out.append({
                "법규명": law_name, "시행일": effective, "조문번호": f"{label}(제3조 관련)",
                "국": guk, "과(담당관/사업소/동)": gwa or guk,
                "항목번호": num, "분장사무 항목": text, "원문": text,
            })
    return out


def split_items(body):
    """'1. 가2. 나3. 다' 형태의 본문을 번호 순서대로 나눈다."""
    items, pos, k = [], 0, 1
    starts = []
    while True:
        m = re.compile(rf"(?<!\d){k}\.\s*").search(body, pos)
        if not m:
            break
        starts.append((k, m.start(), m.end()))
        pos, k = m.end(), k + 1
    for i, (num, _s, e) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(body)
        items.append((str(num), body[e:end].strip()))
    return items


def subject_of(clause):
    m = re.search(r"([^\s.]+?)(?:은|는) 다음(?: 각 호의)? (?:사무|사항)(?:를|을) 분장한다", clause)
    return m.group(1) if m else ""


def article_rows(mst, guk_for):
    law_name, effective, articles = law_info(mst)
    out = []
    for art in articles:
        text = art["조내용"]
        m = re.match(r"(제\d+조(?:의\d+)?)", text)
        if not m or "분장" not in text and "관장한다" not in text:
            continue
        art_no = m.group(1)
        clean = ANNOTATION.sub("", text)
        clauses = re.split(r"(?=[①②③④⑤⑥⑦⑧⑨⑩])", clean)
        for clause in clauses:
            who = subject_of(clause)
            if not who:
                continue
            body = clause.split("분장한다.", 1)[1]
            for num, item in split_items(body):
                guk, gwa = guk_for(art_no, who, item)
                out.append({
                    "법규명": law_name, "시행일": effective, "조문번호": art_no,
                    "국": guk, "과(담당관/사업소/동)": gwa,
                    "항목번호": num, "분장사무 항목": item, "원문": text,
                })
        if art_no == "제19조" and "동은" in clean:  # 동의 직무는 호 없이 한 문장
            out.append({
                "법규명": law_name, "시행일": effective, "조문번호": art_no,
                "국": "동", "과(담당관/사업소/동)": "동(공통)",
                "항목번호": "", "분장사무 항목": clean.split(")", 1)[1].strip(), "원문": text,
            })
    return out


def ordinance_owner(art_no, who, item):
    if who == "보좌기관":
        name = item.split("은", 1)[0]
        return "보좌기관", name
    if who.endswith("국장"):
        return who[:-1], f"{who}(국 총괄)"
    if who.endswith("장") and art_no == "제17조":
        return who[:-1], f"{who}(소 총괄)"
    return who, who


def council_owner(_art_no, who, _item):
    return "오산시의회", who


def main():
    rule_name, rule_eff, _ = law_info("2168747")
    rows = byeolpyo_rows(RAW / "2168747_byeolpyo1-4.tsv", rule_name, rule_eff)
    rows += article_rows("2168779", ordinance_owner)
    rows += article_rows("2108537", council_owner)
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
