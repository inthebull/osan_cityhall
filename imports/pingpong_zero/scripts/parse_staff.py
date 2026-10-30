"""오산시 홈페이지 직원 업무 목록(data/staff/pages/p*.html)을 data/staff/staff_raw.csv 로 정리한다.

페이지 받기: osan.go.kr/portal/staff/list.do?mId=0503030000&page=N (TLS 1.2, 브라우저 User-Agent)
과 → 국 대응은 「오산시 행정기구 및 정원 조례」 조문(data/laws/raw/2168779.json)에서 읽는다.
"""
import csv
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / "data" / "staff" / "pages"
OUT = ROOT / "data" / "staff" / "staff_raw.csv"
ORDINANCE = ROOT / "data" / "laws" / "raw" / "2168779.json"

COLUMNS = ["페이지", "순번", "국", "과", "부서 표기", "직위", "성명", "전화번호", "담당업무"]
ROW = re.compile(r'<tr class="clFix">(.*?)</tr>', re.S)
CELL = re.compile(r'<td class="list_(\w+)">(.*?)</td>', re.S)


def gwa_to_guk():
    """조례의 '○○국에는 가과, 나과를 둔다' 류 문장에서 과 → 국 대응표를 만든다."""
    data = json.loads(ORDINANCE.read_text(encoding="utf-8"))["LawService"]
    mapping = {}
    for art in data["조문"]["조"]:
        text = art["조내용"]
        for owner, units in re.findall(r"([가-힣]*(?:국|보건소|환경사업소))(?:에는|에) ([가-힣, ]+?)(?:를|을) 둔다", text):
            for unit in re.split(r"[, ]+", units):
                if unit:
                    mapping[unit] = owner
        m = re.search(r"부시장 직속으로 ([가-힣, ]+?)(?:를|을) 둔다", text)
        if m:
            for unit in re.split(r"[, ]+", m.group(1)):
                mapping[unit] = "보좌기관"
    for unit in ("중앙도서관", "차량등록사업소"):
        mapping[unit] = unit
    return mapping


def clean(fragment):
    text = re.sub(r"<br\s*/?>", "\n", fragment)
    text = html.unescape(html.unescape(re.sub(r"<[^>]+>", "", text)))  # 원문이 &amp;#65381; 처럼 두 번 이스케이프된 곳이 있다
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def main():
    mapping = gwa_to_guk()
    rows = []
    pages = sorted(PAGES.glob("p*.html"), key=lambda p: int(p.stem[1:]))
    for page in pages:
        body = page.read_text(encoding="utf-8")
        for i, tr in enumerate(ROW.findall(body), 1):
            cells = {k: v for k, v in CELL.findall(tr)}
            dept = cells.get("dept", "")
            m = re.search(r'<span class="txt_point">(.*?)</span>', dept)
            label = clean(dept)
            # 대부분은 강조(span)된 과 이름이 있고, 없는 행은 부서 표기 첫 줄이 과 이름이다.
            gwa = (clean(m.group(1)) if m else "") or label.split("\n")[0]
            if gwa.endswith("동") and gwa not in mapping:
                guk = "동"
            elif gwa.startswith("의회"):
                guk = "오산시의회"
            else:
                guk = mapping.get(gwa, "")
            rows.append({
                "페이지": page.stem[1:], "순번": i, "국": guk, "과": gwa,
                "부서 표기": label.replace("\n", " / "),
                "직위": clean(cells.get("team", "")), "성명": clean(cells.get("name", "")),
                "전화번호": clean(cells.get("tel", "")), "담당업무": clean(cells.get("work", "")),
            })
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)
    unmapped = sorted({r["과"] for r in rows if not r["국"]})
    print(f"{len(pages)} pages, {len(rows)} rows -> {OUT}")
    print("국 미대응 과:", unmapped)


if __name__ == "__main__":
    main()
