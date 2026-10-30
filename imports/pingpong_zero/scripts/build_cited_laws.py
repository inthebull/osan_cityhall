"""분장사무 항목과 조문 본문에 인용된 법령을 찾아 국가법령정보 API로 확인하고
data/laws/cited_laws.csv 를 만든다. 전문은 내려받지 않는다.

- 「…」 안의 이름은 모두 후보로 삼고, 괄호 없이 '…법'으로 끝나는 낱말도 후보로 삼는다.
- API 검색 결과의 법령명 또는 법령약칭명과 정확히(공백 무시) 일치할 때만 확인됨으로 본다.
- 괄호로 인용됐는데 확인되지 않은 것은 '미확인'으로 남기고, 괄호 없는 낱말이 확인되지 않으면
  법령이 아닌 일반 낱말(예: '불법', '관리방법')로 보고 cited_laws_excluded.txt 에만 적는다.
  다만 네 글자 이상이고 '방법'으로 끝나지 않으면 법령 약칭·옛 이름일 수 있어 '미확인'으로 남긴다.
- 인증키(OC)는 .env 에서 읽고, 저장하는 파일에는 남기지 않는다.
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAWS = ROOT / "data" / "laws"
RAW = LAWS / "raw"
SEARCH_RAW = RAW / "search"
ARTICLE_SOURCES = ["2168779", "2168747", "2108537"]

COLUMNS = ["법령명", "법령구분", "소관부처", "시행일", "법령ID", "MST", "상세 링크",
           "인용한 과 목록", "인용 위치", "원문 표기", "확인상태"]
BRACKETED = re.compile(r"「([^」]+)」")
BARE_LAW = re.compile(r"([가-힣]+(?:법|법률))(?=[\s에의상과및,ㆍ·)]|$)")


def api_key():
    for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("LAW_API_OC="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(".env 에 LAW_API_OC 가 없습니다")


def scrub(text, key):
    return text.replace(key, "***")


def search(target, query, key):
    url = "https://www.law.go.kr/DRF/lawSearch.do?" + urllib.parse.urlencode(
        {"OC": key, "target": target, "type": "JSON", "query": query, "display": 100})
    with urllib.request.urlopen(url, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    SEARCH_RAW.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w가-힣]", "_", query)
    (SEARCH_RAW / f"{target}_{safe}.json").write_text(scrub(body, key), encoding="utf-8")
    data = json.loads(body)
    root = data.get("LawSearch") or data.get("OrdinSearch") or {}
    found = root.get("law", [])
    return [found] if isinstance(found, dict) else found


def norm(s):
    return re.sub(r"\s", "", s or "")


def collect_citations():
    """후보 이름 → {'bracketed': bool, 'units': set, 'places': set}"""
    cites = defaultdict(lambda: {"bracketed": False, "units": set(), "places": set()})

    def add(name, bracketed, unit, place):
        c = cites[name.strip()]
        c["bracketed"] |= bracketed
        if unit:
            c["units"].add(unit)
        c["places"].add(place)

    with open(LAWS / "분장사무.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            unit = r["과(담당관/사업소/동)"]
            place = f"{r['법규명']} {r['조문번호']}"
            item = r["분장사무 항목"]
            for name in BRACKETED.findall(item):
                add(name, True, unit, place)
            for name in BARE_LAW.findall(BRACKETED.sub("", item)):
                add(name, False, unit, place)

    for mst in ARTICLE_SOURCES:
        data = json.loads((RAW / f"{mst}.json").read_text(encoding="utf-8"))["LawService"]
        law_name = data["자치법규기본정보"]["자치법규명"]
        arts = data["조문"]["조"]
        for art in [arts] if isinstance(arts, dict) else arts:
            text = art["조내용"]
            m = re.match(r"(제\d+조(?:의\d+)?)", text)
            place = f"{law_name} {m.group(1) if m else '(장 제목)'}"
            names = BRACKETED.findall(text)
            for name in names:
                add(name, True, "", place)
            # 「지역보건법」 … 같은 법 시행령 처럼 앞의 법을 받는 표현
            for prev, _ in re.findall(r"「([^」]+)」[^「]*?(같은 법 시행령)", text):
                add(f"{prev} 시행령", True, "", place)
    return cites


def lookup(name, key):
    is_ordin = name.startswith("오산시") or name.endswith(("조례", "규칙")) and "시행규칙" not in name
    targets = ["ordin"] if is_ordin else ["law", "ordin"]
    for target in targets:
        for row in search(target, name, key):
            if target == "law":
                names = [row.get("법령명한글"), row.get("법령약칭명")]
                if norm(name) in {norm(n) for n in names if n}:
                    official = row["법령명한글"]
                    return {
                        "법령명": official, "법령구분": row.get("법령구분명", ""),
                        "소관부처": row.get("소관부처명", ""), "시행일": row.get("시행일자", ""),
                        "법령ID": row.get("법령ID", ""), "MST": row.get("법령일련번호", ""),
                        "상세 링크": "https://www.law.go.kr/법령/" + urllib.parse.quote(official.replace(" ", "")),
                    }
            else:
                if norm(row.get("자치법규명")) == norm(name) and (
                        not is_ordin or "오산" in row.get("지자체기관명", "") or not name.startswith("오산")):
                    official = row["자치법규명"]
                    return {
                        "법령명": official, "법령구분": f"자치법규({row.get('자치법규종류', '')})",
                        "소관부처": row.get("지자체기관명", ""), "시행일": row.get("시행일자", ""),
                        "법령ID": row.get("자치법규ID", ""), "MST": row.get("자치법규일련번호", ""),
                        "상세 링크": "https://www.law.go.kr/자치법규/" + urllib.parse.quote(official.replace(" ", "")),
                    }
        time.sleep(0.3)
    return None


def main():
    key = api_key()
    cites = collect_citations()
    merged = {}  # 공식 법령명(또는 미확인 이름) → 행
    excluded = []
    for name in sorted(cites):
        c = cites[name]
        hit = lookup(name, key)
        looks_like_law = len(name) >= 4 and not name.endswith("방법")
        if not hit and not c["bracketed"] and not looks_like_law:
            excluded.append(name)
            continue
        if hit:
            row = merged.setdefault(hit["법령명"], {**hit, "units": set(), "places": set(), "forms": set(), "확인상태": "확인됨"})
        else:
            row = merged.setdefault(name, {col: "" for col in COLUMNS[:7]} | {
                "법령명": name, "units": set(), "places": set(), "forms": set(), "확인상태": "미확인(API 검색 불일치)"})
        row["units"] |= c["units"]
        row["places"] |= c["places"]
        row["forms"].add(name)

    with open(LAWS / "cited_laws.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for name in sorted(merged):
            r = merged[name]
            w.writerow({**{k: r.get(k, "") for k in COLUMNS[:7]},
                        "인용한 과 목록": ";".join(sorted(r["units"])),
                        "인용 위치": ";".join(sorted(r["places"])),
                        "원문 표기": ";".join(sorted(r["forms"])),
                        "확인상태": r["확인상태"]})
    (LAWS / "cited_laws_excluded.txt").write_text(
        "괄호 없이 '…법'으로 끝나 후보가 됐지만 API에서 법령으로 확인되지 않아 뺀 낱말\n" + "\n".join(excluded) + "\n",
        encoding="utf-8")
    ok = sum(1 for r in merged.values() if r["확인상태"] == "확인됨")
    print(f"후보 {len(cites)}개 → 법령 {len(merged)}개(확인 {ok}, 미확인 {len(merged) - ok}), 제외 {len(excluded)}개")


if __name__ == "__main__":
    main()
