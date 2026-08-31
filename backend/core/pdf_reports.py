from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _text(value, fallback="-"):
    value = fallback if value in [None, ""] else value
    return escape(str(value)).replace("\n", "<br/>")


def _number(value):
    number = float(value or 0)
    return str(int(number)) if number.is_integer() else f"{number:.2f}".rstrip("0").rstrip(".")


def _date(value, include_time=False):
    if not value:
        return "-"
    pattern = "%d %b %Y %I:%M %p" if include_time else "%d %b %Y"
    return value.strftime(pattern)


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], alignment=TA_CENTER, fontSize=17, leading=21, spaceAfter=3))
    styles.add(ParagraphStyle(name="ReportSubtitle", parent=styles["Heading2"], alignment=TA_CENTER, fontSize=13, leading=16, spaceAfter=12))
    styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontSize=7.5, leading=9))
    styles.add(ParagraphStyle(name="CellSmall", parent=styles["BodyText"], fontSize=6.8, leading=8))
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading3"], fontSize=10.5, leading=13, spaceBefore=8, spaceAfter=5))
    return styles


def _paragraph(value, style):
    return Paragraph(_text(value), style)


def _base_table(data, col_widths, repeat_rows=0):
    table = Table(data, colWidths=col_widths, repeatRows=repeat_rows, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#aab3c2")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def build_attendance_pdf(rows, report_filters):
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="RedHero Attendance Report",
        author="RedHero",
    )
    styles = _styles()
    story = [Paragraph("REDHERO", styles["ReportTitle"]), Paragraph("Attendance Report", styles["ReportSubtitle"])]
    metadata = [
        [_paragraph("Class", styles["Cell"]), _paragraph(report_filters.get("class_level") or "All authorized classes", styles["Cell"]), _paragraph("Subject", styles["Cell"]), _paragraph(report_filters.get("subject") or "All authorized subjects", styles["Cell"])],
        [_paragraph("Date / Date Range", styles["Cell"]), _paragraph(report_filters.get("date_label") or "All dates", styles["Cell"]), _paragraph("Teacher / Marked By", styles["Cell"]), _paragraph(report_filters.get("teacher") or "Authorized database records", styles["Cell"])],
    ]
    metadata_table = _base_table(metadata, [30 * mm, 57 * mm, 34 * mm, 82 * mm])
    metadata_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#edf1f7")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#edf1f7"))]))
    story.extend([metadata_table, Spacer(1, 8)])

    headers = ["Date", "Class", "Student Name", "Roll / ID", "Subject", "Status", "Early Leave", "Leave Time", "Leave Reason", "Marked By"]
    table_data = [[_paragraph(header, styles["Cell"]) for header in headers]]
    for row in rows:
        table_data.append(
            [
                _paragraph(_date(row.get("date")), styles["Cell"]),
                _paragraph(row.get("class_level"), styles["Cell"]),
                _paragraph(row.get("student_name"), styles["Cell"]),
                _paragraph(row.get("roll_number") or row.get("student_id"), styles["Cell"]),
                _paragraph(row.get("subject") or "Unknown/Legacy", styles["Cell"]),
                _paragraph(str(row.get("status", "-")).title(), styles["Cell"]),
                _paragraph("Yes" if row.get("left_early") else "No", styles["Cell"]),
                _paragraph(_date(row.get("leave_time"), include_time=True) if row.get("leave_time") else "-", styles["Cell"]),
                _paragraph(row.get("leave_reason"), styles["Cell"]),
                _paragraph(row.get("marked_by"), styles["Cell"]),
            ]
        )
    if not rows:
        table_data.append([_paragraph("No attendance records found for the selected filters.", styles["Cell"])] + [""] * (len(headers) - 1))
    attendance_table = _base_table(table_data, [22 * mm, 16 * mm, 34 * mm, 25 * mm, 24 * mm, 18 * mm, 21 * mm, 29 * mm, 43 * mm, 29 * mm], repeat_rows=1)
    attendance_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce4f0")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]))
    story.extend([attendance_table, Spacer(1, 9), Paragraph("Summary", styles["Section"])])

    total = len(rows)
    present = sum(1 for row in rows if row.get("status") == "present")
    absent = sum(1 for row in rows if row.get("status") == "absent")
    early_leave = sum(1 for row in rows if row.get("left_early"))
    percentage = round((present / total) * 100, 2) if total else 0
    summary = [
        ["Total Attendance Records / Classes", "Present", "Absent", "Early Leave", "Attendance Percentage"],
        [_number(total), _number(present), _number(absent), _number(early_leave), f"{_number(percentage)}%"],
    ]
    summary_table = _base_table([[_paragraph(value, styles["Cell"]) for value in row] for row in summary], [55 * mm, 28 * mm, 28 * mm, 30 * mm, 42 * mm], repeat_rows=1)
    summary_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce4f0")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]))
    story.append(summary_table)
    document.build(story)
    return buffer.getvalue()


def build_exam_result_pdf(student, exam, result, questions):
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=12 * mm,
        leftMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="RedHero Exam Result",
        author="RedHero",
    )
    styles = _styles()
    story = [Paragraph("REDHERO", styles["ReportTitle"]), Paragraph("Exam Result", styles["ReportSubtitle"])]
    metadata = [
        [_paragraph("Student", styles["Cell"]), _paragraph(student.get("name"), styles["Cell"]), _paragraph("Class", styles["Cell"]), _paragraph(exam.get("class_level"), styles["Cell"])],
        [_paragraph("Student ID / Roll", styles["Cell"]), _paragraph(student.get("student_id") or student.get("roll_number"), styles["Cell"]), _paragraph("Exam Title", styles["Cell"]), _paragraph(exam.get("name"), styles["Cell"])],
        [_paragraph("Subject", styles["Cell"]), _paragraph(exam.get("subject"), styles["Cell"]), _paragraph("Exam Date", styles["Cell"]), _paragraph(exam.get("exam_date"), styles["Cell"])],
        [_paragraph("Total Marks", styles["Cell"]), _paragraph(_number(exam.get("total_marks")), styles["Cell"]), _paragraph("Passing Marks", styles["Cell"]), _paragraph(_number(exam.get("passing_marks")), styles["Cell"])],
    ]
    metadata_table = _base_table(metadata, [32 * mm, 55 * mm, 32 * mm, 95 * mm])
    metadata_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#edf1f7")), ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#edf1f7"))]))
    story.extend([metadata_table, Spacer(1, 8), Paragraph("Result", styles["Section"])])

    result_rows = [
        ["Marks Obtained", "Positive Marks", "Negative Deduction", "Final Marks", "Percentage", "Pass / Fail", "Correct", "Wrong", "Unanswered"],
        [_number(result.get("marks_obtained")), _number(result.get("positive_marks")), _number(result.get("negative_deduction")), _number(result.get("final_marks")), f"{_number(result.get('percentage'))}%", "Pass" if result.get("passed") else "Fail", _number(result.get("correct_count")), _number(result.get("wrong_count")), _number(result.get("unanswered_count"))],
    ]
    result_table = _base_table([[_paragraph(value, styles["Cell"]) for value in row] for row in result_rows], [32 * mm, 27 * mm, 31 * mm, 28 * mm, 25 * mm, 25 * mm, 20 * mm, 20 * mm, 25 * mm], repeat_rows=1)
    result_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce4f0")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]))
    story.extend([result_table, Spacer(1, 9), Paragraph("Question-wise Review", styles["Section"])])

    headers = ["Question", "Student Answer", "Correct Answer", "Status", "Marks Awarded", "Negative Deduction", "Explanation"]
    review_rows = [[_paragraph(header, styles["Cell"]) for header in headers]]
    for question in questions:
        review_rows.append(
            [
                _paragraph(question.get("question"), styles["CellSmall"]),
                _paragraph(question.get("student_answer"), styles["CellSmall"]),
                _paragraph(question.get("correct_answer"), styles["CellSmall"]),
                _paragraph(question.get("status"), styles["Cell"]),
                _paragraph(_number(question.get("marks_awarded")), styles["Cell"]),
                _paragraph(_number(question.get("negative_deduction")), styles["Cell"]),
                _paragraph(question.get("explanation"), styles["CellSmall"]),
            ]
        )
    if not questions:
        review_rows.append([_paragraph("No questions were recorded for this result.", styles["Cell"])] + [""] * (len(headers) - 1))
    review_table = _base_table(review_rows, [51 * mm, 39 * mm, 39 * mm, 24 * mm, 26 * mm, 30 * mm, 54 * mm], repeat_rows=1)
    review_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dce4f0")), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]))
    story.append(review_table)
    document.build(story)
    return buffer.getvalue()
