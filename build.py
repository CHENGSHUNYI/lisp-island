"""從 LSP功能說明清單.xlsx 產生網站資料 (data.js) 並複製可下載的 .fas 檔。

用法：在 lisp-island 資料夾執行
    python build.py
預設讀取上一層的 LSP功能說明清單.xlsx 與 .fas 檔。

影片連結：在 Excel「功能說明清單」工作表新增一欄，標題為「影片網址」，
填入 YouTube 網址後重新執行本程式即可。
"""
import json
import os
import shutil
import sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
XLSX = os.path.join(SRC, "LSP功能說明清單.xlsx")
FAS_OUT = os.path.join(HERE, "fas")

# 這些分類只顯示說明，不提供 .fas 下載
NO_DOWNLOAD_CATEGORIES = {"系統/授權"}
# 不放上公開網頁的欄位
HIDDEN_COLUMNS = {"備註"}
VIDEO_COLUMN = "影片網址"

FIELD_KEYS = {
    "序號": "no",
    "檔名": "file",
    "指令名稱": "cmd",
    "分類": "cat",
    "功能說明": "desc",
    "操作方式": "usage",
    "程式難易度": "level",
    "是否支援2024 LT以上": "lt",
    "版本/日期": "ver",
    "作者/來源": "author",
    VIDEO_COLUMN: "video",
}


def find_fas(src_dir):
    found = {}
    for root, dirs, files in os.walk(src_dir):
        if os.path.abspath(root).startswith(HERE):
            continue
        for f in files:
            if f.lower().endswith(".fas"):
                found[os.path.splitext(f)[0].lower()] = os.path.join(root, f)
    return found


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb["功能說明清單"]
    header = [str(c.value).strip() if c.value is not None else "" for c in ws[1]]

    fas = find_fas(SRC)
    if os.path.isdir(FAS_OUT):
        shutil.rmtree(FAS_OUT)
    os.makedirs(FAS_OUT)

    items, copied, missing = [], 0, []
    for row in ws.iter_rows(min_row=2, values_only=True):
        rec = dict(zip(header, row))
        if not rec.get("檔名"):
            continue
        item = {}
        for col, key in FIELD_KEYS.items():
            if col in HIDDEN_COLUMNS:
                continue
            v = rec.get(col)
            item[key] = "" if v is None else (v if isinstance(v, int) else str(v).strip())
        stem = os.path.splitext(item["file"])[0]
        src = fas.get(stem.lower())
        item["fas"] = ""
        if src and item["cat"] not in NO_DOWNLOAD_CATEGORIES:
            name = os.path.basename(src)
            shutil.copy2(src, os.path.join(FAS_OUT, name))
            item["fas"] = "fas/" + name
            copied += 1
        elif not src:
            missing.append(item["file"])
        items.append(item)

    criteria = []
    if "判定標準" in wb.sheetnames:
        for r in wb["判定標準"].iter_rows(min_row=2, values_only=True):
            if r[0]:
                criteria.append({"item": r[0], "level": "" if r[1] is None else str(r[1]), "text": r[2] or ""})

    data = {"items": items, "criteria": criteria}
    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as f:
        f.write("window.LISP_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"指令 {len(items)} 筆，複製 .fas {copied} 個，找不到 .fas {len(missing)} 筆")
    print("有影片網址：", sum(1 for i in items if i.get("video")))


if __name__ == "__main__":
    main()
