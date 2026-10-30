"""data/staff/staff_raw.csv 의 담당업무를 업무 1건 = 1행으로 나눠 data/tasks/tasks.csv 를 만든다.

나누는 규칙
- 줄 안 어디든 원문자 번호(①~⑳)가 나오면 거기서 새 업무가 시작된다.
- ①~⑳, ○, ㅇ, 'o ', '1.', '·', '.' 로 시작하는 줄은 새 업무(표지는 뗀다).
- '-' 로 시작하는 줄은 바로 앞 주업무의 하위업무(상위업무ID로 연결).
- 표지 없는 줄은 앞 업무에 이어 붙인다(앞 업무가 없으면 새 업무).
유형
- 근무상태: 휴직·파견·공로연수·장기교육 등 근무 상태 표시. '교육'이 들어갔다고 모두 근무상태로 보면
  '평생교육 운영' 같은 고유업무가 섞이므로, 짧은 상태 표기(예: '육아휴직', '교육파견', '(공로연수)')만 해당한다.
- 총괄: '총괄'이 들어간 업무
- 서무·공통: 서무, 기록물, 보안업무, 청사방호, 문서사송, 부속실
- 그 밖에는 고유업무
"""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "staff" / "staff_raw.csv"
OUT = ROOT / "data" / "tasks" / "tasks.csv"

COLUMNS = ["업무ID", "상위업무ID", "구분", "국", "과", "팀", "직위", "전화번호", "업무", "유형", "원본행"]
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
MAIN_MARK = re.compile(rf"^\s*(?:[{CIRCLED}]|○|ㅇ|o\s|\d+\.|·|\.)\s*")
SUB_MARK = re.compile(r"^\s*-\s*")
STATUS = re.compile(r"^\(?\s*(?:육아\s*)?(?:휴직|파견|공로연수|장기\s*교육|교육\s*파견|교육\s*중|병가)[^가-힣]*\)?$|휴직\s*중|파견\s*근무|공로연수")
COMMON = ("서무", "기록물", "보안업무", "청사방호", "문서사송", "부속실")


def team_of(label, gwa):
    parts = [p.strip() for p in label.split(" / ")]
    if len(parts) < 2:
        return ""
    t = parts[1]
    if t.endswith("팀장"):
        t = t[:-1]
    return "" if t == gwa or t.endswith(("국장", "과장", "소장", "관장", "동장", "담당관")) else t


def split_tasks(text):
    """[(종류, 내용)], 종류는 main / sub"""
    tasks = []
    for line in text.splitlines():
        pieces = re.split(rf"(?=[{CIRCLED}])", line)
        for k, piece in enumerate(pieces):
            if not piece.strip():
                continue
            if k > 0 or MAIN_MARK.match(piece):
                tasks.append(["main", MAIN_MARK.sub("", piece, count=1).strip()])
            elif SUB_MARK.match(piece):
                tasks.append(["sub", SUB_MARK.sub("", piece, count=1).strip()])
            elif tasks:
                tasks[-1][1] = (tasks[-1][1] + " " + piece.strip()).strip()
            else:
                tasks.append(["main", piece.strip()])
    return [t for t in tasks if t[1]]


def kind_of(task):
    if STATUS.search(task):
        return "근무상태"
    if "총괄" in task:
        return "총괄"
    if any(w in task for w in COMMON):
        return "서무·공통"
    return "고유업무"


def main():
    out, n = [], 0
    with open(SRC, encoding="utf-8-sig") as f:
        for row_no, r in enumerate(csv.DictReader(f), 1):
            parent = ""
            for kind, task in split_tasks(r["담당업무"]):
                n += 1
                tid = f"T{n:05d}"
                if kind == "main":
                    parent = tid
                out.append({
                    "업무ID": tid, "상위업무ID": parent if kind == "sub" else "",
                    "구분": "행정복지센터(동)" if r["과"].endswith("동") else "본청·소속기관",
                    "국": r["국"], "과": r["과"], "팀": team_of(r["부서 표기"], r["과"]),
                    "직위": r["직위"], "전화번호": r["전화번호"], "업무": task,
                    "유형": kind_of(task), "원본행": row_no,
                })
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(out)
    subs = sum(1 for t in out if t["상위업무ID"])
    print(f"{len(out)} tasks (주업무 {len(out) - subs}, 하위업무 {subs}) -> {OUT}")


if __name__ == "__main__":
    main()
