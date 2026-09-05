"""从 E1—E8 原始 Excel 生成网页使用的学校层级汇总数据。"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
RAW_DIR = PROJECT_DIR.parent / "发放材料"
OUTPUT_PATH = PROJECT_DIR / "data" / "dashboard_data.json"

EXAMS = [
    ("E1", "高一上期末"),
    ("E2", "高一下期末"),
    ("E3", "高二上期末"),
    ("E4", "高二下期末"),
    ("E5", "高三上期中"),
    ("E6", "高三上期末"),
    ("E7", "高三一模"),
    ("E8", "高三二模"),
]

DISPLAY_SUBJECTS = ["总分", "语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"]
ELECTIVE_SUBJECTS = ["物理", "化学", "生物", "历史", "地理", "政治"]
HISTOGRAM_BINS = 12


def numeric_score(series: pd.Series) -> pd.Series:
    """只保留实际的正数成绩用于汇总。"""
    return pd.to_numeric(series, errors="coerce").where(lambda values: values > 0)


def source_column(subject: str) -> str:
    return "总分_原始分" if subject == "总分" else f"{subject}_成绩"


def describe(values: pd.Series) -> list[float | int]:
    """返回 n、均值、中位数、标准差、Q1、Q3、最小值和最大值。"""
    clean = values.dropna().astype(float)
    return [
        int(clean.size),
        round(float(clean.mean()), 4),
        round(float(clean.median()), 4),
        round(float(clean.std(ddof=1) if clean.size > 1 else 0), 4),
        round(float(clean.quantile(0.25)), 4),
        round(float(clean.quantile(0.75)), 4),
        round(float(clean.min()), 4),
        round(float(clean.max()), 4),
    ]


def histogram(values: pd.Series) -> list:
    clean = values.dropna().astype(float)
    minimum = float(clean.min())
    maximum = float(clean.max())
    if maximum == minimum:
        return [round(minimum, 4), round(maximum, 4), [int(clean.size)]]
    width = (maximum - minimum) / HISTOGRAM_BINS
    counts = [0] * HISTOGRAM_BINS
    for value in clean:
        index = min(HISTOGRAM_BINS - 1, int((value - minimum) / width))
        counts[index] += 1
    return [round(minimum, 4), round(maximum, 4), counts]


def selection_combo(frame: pd.DataFrame) -> pd.Series:
    masks = {
        subject: numeric_score(frame[source_column(subject)]).notna()
        for subject in ELECTIVE_SUBJECTS
    }
    mask_frame = pd.DataFrame(masks, index=frame.index)
    return mask_frame.apply(
        lambda row: "+".join(subject for subject in ELECTIVE_SUBJECTS if bool(row[subject])),
        axis=1,
    )


def main() -> None:
    raw_frames: list[tuple[str, str, pd.DataFrame]] = []
    all_school_rows: list[tuple[str, str]] = []

    for exam_id, exam_name in EXAMS:
        path = RAW_DIR / f"{exam_id}.xlsx"
        frame = pd.read_excel(path, sheet_name="总成绩").reset_index(drop=True)
        required = {"学校代码", "学校"}
        if not required.issubset(frame.columns):
            raise KeyError(f"{path.name} 缺少学校代码或学校列。")
        raw_frames.append((exam_id, exam_name, frame))
        all_school_rows.extend(
            zip(frame["学校代码"].astype(str), frame["学校"].astype(str), strict=False)
        )

    schools = sorted(set(all_school_rows), key=lambda item: item[0])
    school_to_index = {school: index for index, school in enumerate(schools)}

    # summaryRecords: [考试, 学校(-1为地区), 科目, n, mean, median, std, q1, q3, min, max]
    # histogramRecords: [考试, 学校(-1为地区), 科目, min, max, 各分数组人数]
    summary_records: list[list] = []
    histogram_records: list[list] = []
    exam_record_counts: list[dict] = []
    selection_counts: defaultdict[int, Counter[str]] = defaultdict(Counter)

    for exam_index, (exam_id, exam_name, frame) in enumerate(raw_frames):
        school_keys = list(zip(frame["学校代码"].astype(str), frame["学校"].astype(str), strict=False))
        frame = frame.copy()
        frame["_school_index"] = [school_to_index[key] for key in school_keys]
        exam_record_counts.append({"exam": exam_id, "name": exam_name, "students": int(len(frame))})

        for subject_index, subject in enumerate(DISPLAY_SUBJECTS):
            column = source_column(subject)
            if column not in frame.columns:
                continue
            frame["_score"] = numeric_score(frame[column])
            scopes = [(-1, frame["_score"])]
            scopes.extend(
                (int(school_index), group["_score"])
                for school_index, group in frame.groupby("_school_index", sort=True)
            )
            for school_index, values in scopes:
                clean = values.dropna()
                if clean.empty:
                    continue
                summary_records.append([exam_index, school_index, subject_index, *describe(clean)])
                histogram_records.append([exam_index, school_index, subject_index, *histogram(clean)])

        if exam_id == "E8":
            combos = selection_combo(frame)
            for school_index, combo in zip(frame["_school_index"], combos, strict=False):
                if combo.count("+") == 2:
                    selection_counts[-1][combo] += 1
                    selection_counts[int(school_index)][combo] += 1

    selection_count_records = [
        [school_index, combo, count]
        for school_index in sorted(selection_counts)
        for combo, count in sorted(selection_counts[school_index].items())
    ]

    payload = {
        "metadata": {
            "title": "地区高中学业情况看板",
            "selectionBasis": "E8 高三二模实际选考科目组合",
            "latestExamIndex": 7,
            "totalTrendStartIndex": 2,
            "privacy": "仅提供地区和学校层级汇总数据，不含单个学生记录。",
        },
        "exams": [{"id": exam_id, "name": name} for exam_id, name in EXAMS],
        "schools": [{"code": code, "name": name} for code, name in schools],
        "subjects": DISPLAY_SUBJECTS,
        "electiveSubjects": ELECTIVE_SUBJECTS,
        "examRecordCounts": exam_record_counts,
        "summaryRecords": summary_records,
        "histogramRecords": histogram_records,
        "selectionCounts": selection_count_records,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, separators=(",", ":"))

    print(f"网页汇总数据已生成：{OUTPUT_PATH}")
    print(f"学校数：{len(schools)}")
    print(f"成绩汇总记录数：{len(summary_records)}")
    print(f"成绩分布记录数：{len(histogram_records)}")
    print(f"选科汇总记录数：{len(selection_count_records)}")


if __name__ == "__main__":
    main()
