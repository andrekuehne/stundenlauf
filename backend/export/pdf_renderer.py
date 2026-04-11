"""PDF export via ReportLab (F20)."""

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import BinaryIO
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A3, A4, landscape, portrait
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.export.projection import ExportSection
from backend.export.spec import ExportSpec, PdfStyleSpec


def _para_text(s: str) -> str:
    return xml_escape(s, entities={'"': "&quot;", "'": "&apos;"})


def _page_size_tuple(pdf: PdfStyleSpec) -> tuple[float, float]:
    base = A4 if pdf.page_size == "A4" else A3
    if pdf.orientation == "landscape":
        return landscape(base)
    return portrait(base)


def _footer_canvas(
    pdf: PdfStyleSpec,
    ruleset_versions: tuple[str, ...],
    export_ts: str,
):
    def _draw(canv: canvas.Canvas, doc: object) -> None:
        canv.saveState()
        canv.setFont("Helvetica", 8)
        lines: list[str] = []
        if pdf.show_ruleset_footer:
            uniq = ", ".join(sorted({v for v in ruleset_versions if v}))
            if uniq:
                lines.append(f"Regelwerk: {uniq}")
        if pdf.show_export_timestamp_footer:
            lines.append(f"Export: {export_ts}")
        text = "  |  ".join(lines)
        if text:
            w, _h = _page_size_tuple(pdf)
            canv.drawCentredString(w / 2, 1.0 * cm, text)
        canv.restoreState()

    return _draw


def render_pdf(
    sections: tuple[ExportSection, ...],
    spec: ExportSpec,
    dest: Path | BinaryIO,
) -> None:
    """Render export sections to a PDF file or binary stream."""
    pdf = spec.pdf
    page_size = _page_size_tuple(pdf)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="ExportTitle",
        parent=styles["Heading1"],
        fontSize=14,
        spaceAfter=6,
        alignment=TA_CENTER,
    )
    subtitle_style = ParagraphStyle(
        name="ExportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=12,
        alignment=TA_CENTER,
    )
    section_heading = ParagraphStyle(
        name="SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=8,
    )

    export_ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    ruleset_versions = tuple(s.ruleset_version for s in sections)
    footer_fn = _footer_canvas(pdf, ruleset_versions, export_ts)

    buf_owner: BytesIO | None = None
    if isinstance(dest, Path):
        buf_owner = BytesIO()
        buf = buf_owner
    else:
        buf = dest

    doc = SimpleDocTemplate(
        buf,
        pagesize=page_size,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm,
    )
    story: list = []

    if spec.pdf.logo_path:
        logo_p = Path(spec.pdf.logo_path)
        if logo_p.is_file():
            try:
                img = Image(str(logo_p.resolve()))
                img.drawHeight = 2 * cm
                img.drawWidth = 2 * cm * (img.imageWidth / max(img.imageHeight, 1))
                story.append(img)
                story.append(Spacer(1, 0.2 * cm))
            except OSError:
                pass

    for sec in sections:
        story.append(Paragraph(_para_text(sec.title), title_style))
        if sec.subtitle:
            story.append(Paragraph(_para_text(sec.subtitle), subtitle_style))
        story.append(Paragraph(_para_text(sec.category_label), section_heading))

        headers = [c.header for c in sec.columns]
        data: list[list[str]] = [headers]
        data.extend([list(r) for r in sec.rows])

        col_widths = None
        ncols = len(headers)
        if ncols > 0:
            w_avail = page_size[0] - 3 * cm
            col_widths = [w_avail / ncols] * ncols

        tbl = Table(data, colWidths=col_widths, repeatRows=1 if pdf.repeat_header else 0)
        tbl_style_cmds: list = [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        for j, c in enumerate(sec.columns):
            if c.align == "right":
                tbl_style_cmds.append(("ALIGN", (j, 1), (j, -1), "RIGHT"))
            elif c.align == "center":
                tbl_style_cmds.append(("ALIGN", (j, 1), (j, -1), "CENTER"))
        tbl.setStyle(TableStyle(tbl_style_cmds))
        story.append(tbl)
        story.append(Spacer(1, 0.6 * cm))

    doc.build(story, onFirstPage=footer_fn, onLaterPages=footer_fn)

    if buf_owner is not None and isinstance(dest, Path):
        dest.write_bytes(buf_owner.getvalue())
