"""HWP 5.0 문서(별표 첨부파일)에서 텍스트를 추출한다.

사용법: py scripts/hwp2txt.py <입력.hwp> <출력.tsv>
출력 열: 표번호, 행, 열, 행병합, 열병합, 텍스트
표 밖의 문단은 표번호/행/열을 비워 둔다. 한 셀에 문단이 여럿이면 줄바꿈 대신 ' / '가 아니라
공백으로 이어 붙인다(원문 줄바꿈은 셀 안 서식일 뿐이므로).
"""
import struct
import sys
import zlib

import olefile

HWPTAG_PARA_HEADER = 66
HWPTAG_PARA_TEXT = 67
HWPTAG_LIST_HEADER = 72
HWPTAG_TABLE = 77
# 8 wchar(16바이트)를 차지하는 확장/인라인 제어문자
WIDE_CTRL = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}


def records(data):
    pos = 0
    while pos + 4 <= len(data):
        (hdr,) = struct.unpack_from("<I", data, pos)
        pos += 4
        tag, level, size = hdr & 0x3FF, (hdr >> 10) & 0x3FF, hdr >> 20
        if size == 0xFFF:
            (size,) = struct.unpack_from("<I", data, pos)
            pos += 4
        yield tag, level, data[pos:pos + size]
        pos += size


def para_text(payload):
    out, i = [], 0
    while i + 2 <= len(payload):
        (ch,) = struct.unpack_from("<H", payload, i)
        if ch < 32:
            if ch in WIDE_CTRL:
                i += 16
                continue
            i += 2
            continue
        out.append(chr(ch))
        i += 2
    return "".join(out).strip()


def extract(path):
    ole = olefile.OleFileIO(path)
    header = ole.openstream("FileHeader").read()
    compressed = bool(struct.unpack_from("<I", header, 36)[0] & 1)
    rows = []  # [표번호, 행, 열, 행병합, 열병합, 텍스트]
    table_no = 0
    in_table = False
    cell = None  # 현재 셀 [표, 행, 열, 행병합, 열병합, [문단...], 남은문단수, 레벨]
    n = 0
    while ole.exists(f"BodyText/Section{n}"):
        raw = ole.openstream(f"BodyText/Section{n}").read()
        data = zlib.decompress(raw, -15) if compressed else raw
        for tag, level, payload in records(data):
            if tag == HWPTAG_TABLE:
                table_no += 1
                in_table = True
            elif tag == HWPTAG_LIST_HEADER and in_table and len(payload) >= 16:
                col, row, colspan, rowspan = struct.unpack_from("<HHHH", payload, 8)
                (npara,) = struct.unpack_from("<H", payload, 0)
                if cell:
                    rows.append(cell[:5] + [" ".join(cell[5])])
                cell = [table_no, row, col, rowspan, colspan, [], npara, level]
            elif tag == HWPTAG_PARA_HEADER:
                # 셀 문단은 LIST_HEADER와 같은 레벨에 온다. 더 얕은 문단이 나오면 표가 끝난 것이다.
                if cell and level < cell[7]:
                    rows.append(cell[:5] + [" ".join(cell[5])])
                    cell = None
                    in_table = False
            elif tag == HWPTAG_PARA_TEXT:
                text = para_text(payload)
                if cell:
                    if text:
                        cell[5].append(text)
                elif text:
                    rows.append(["", "", "", "", "", text])
        n += 1
    if cell:
        rows.append(cell[:5] + [" ".join(cell[5])])
    return rows


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    rows = extract(src)
    with open(dst, "w", encoding="utf-8") as f:
        f.write("표번호\t행\t열\t행병합\t열병합\t텍스트\n")
        for r in rows:
            f.write("\t".join(str(x) for x in r) + "\n")
    print(f"{len(rows)} rows -> {dst}")
