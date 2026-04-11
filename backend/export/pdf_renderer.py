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
from reportlab.platypus import Image, PageBreak, PageTemplate, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.doctemplate import BaseDocTemplate, _doNothing
from reportlab.platypus.flowables import Flowable
from reportlab.platypus.frames import Frame

from backend.export.projection import ColumnDef, ExportSection
from backend.export.spec import ExportSpec, PdfStyleSpec


def _para_text(s: str) -> str:
    return xml_escape(s, entities={'"': "&quot;", "'": "&apos;"})


def _table_col_widths(columns: tuple[ColumnDef, ...], w_avail: float) -> list[float]:
    """Narrow fixed widths for rank / points / km; remaining width split across other columns."""
    n = len(columns)
    if n == 0:
        return []
    narrow_by_id: dict[str, float] = {
        "platz": 0.95 * cm,
        "punkte_gesamt": 1.15 * cm,
        "distanz_gesamt": 1.35 * cm,
        "gesamt_compact": 2.7 * cm,
    }
    widths = [0.0] * n
    fixed_total = 0.0
    flex_indices: list[int] = []
    for j, c in enumerate(columns):
        nw = narrow_by_id.get(c.id)
        if c.id.startswith("race_compact:"):
            nw = 2.4 * cm
        if nw is not None:
            widths[j] = nw
            fixed_total += nw
        else:
            flex_indices.append(j)
    if not flex_indices or fixed_total >= w_avail:
        return [w_avail / n] * n
    each_flex = (w_avail - fixed_total) / len(flex_indices)
    for j in flex_indices:
        widths[j] = each_flex
    return widths


# Horizontal rules in Laufübersicht (variable-width LINEBELOW; verticals stay at _PDF_LINE_NORMAL).
_PDF_LINE_THIN = 0.12
_PDF_LINE_NORMAL = 0.25
_PDF_LINE_THICK = 0.75


def _laufuebersicht_line_below_row(
    r: int,
    *,
    n_header: int,
    n_rows: int,
    body_row_band_group: tuple[int, ...],
    body_row_podium: tuple[bool, ...] | None,
) -> float | None:
    """Width of the horizontal line directly below table row ``r``; ``None`` = skip (outer frame)."""
    if r >= n_rows - 1:
        return None
    if r < n_header - 1:
        return _PDF_LINE_NORMAL
    if r == n_header - 1:
        return _PDF_LINE_NORMAL
    br = r - n_header
    n_body = len(body_row_band_group)
    if br + 1 < n_body and body_row_band_group[br] == body_row_band_group[br + 1]:
        return _PDF_LINE_THIN
    podium = body_row_podium
    last_p: int | None = None
    if podium is not None:
        for i, on in enumerate(podium):
            if on:
                last_p = i
    if last_p is not None and br == last_p:
        return _PDF_LINE_THICK
    return _PDF_LINE_NORMAL


def _laufuebersicht_podium_fill(band_gid: int) -> colors.Color:
    """Yellow tint via per-channel multiply on zebra base so odd/even rows stay distinct."""
    if band_gid % 2 == 0:
        br, bg, bb = 255, 255, 255
    else:
        br, bg, bb = 245, 245, 245
    yr, yg, yb = 255, 236, 150
    r = min(255, br * yr // 255)
    g = min(255, bg * yg // 255)
    b = min(255, bb * yb // 255)
    return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")


def _table_font_sizes(pdf: PdfStyleSpec, header_rows: tuple[tuple[str, ...], ...] | None) -> tuple[int, int]:
    if header_rows is not None:
        body = pdf.table_font_size if pdf.table_font_size is not None else 7
        hdr = pdf.table_header_font_size if pdf.table_header_font_size is not None else 8
        return body, hdr
    body = pdf.table_font_size if pdf.table_font_size is not None else 9
    hdr = pdf.table_header_font_size if pdf.table_header_font_size is not None else body
    return body, hdr


def _page_size_tuple(pdf: PdfStyleSpec) -> tuple[float, float]:
    base = A4 if pdf.page_size == "A4" else A3
    if pdf.orientation == "landscape":
        return landscape(base)
    return portrait(base)


class _SectionFooterHint(Flowable):
    """Zero-height marker; :meth:`_ExportPdfDocTemplate.afterFlowable` sets per-section footer fields."""

    def __init__(self, season_year: int, footer_category_line: str) -> None:
        Flowable.__init__(self)
        self._season_year = season_year
        self._footer_category_line = footer_category_line

    def wrap(self, availWidth, availHeight):
        return (0, 0)

    def draw(self) -> None:
        pass


class _ExportPdfDocTemplate(SimpleDocTemplate):
    def __init__(
        self,
        filename,
        *,
        pdf_style: PdfStyleSpec,
        export_ts: str,
        page_size_tuple: tuple[float, float],
        **kw,
    ) -> None:
        self._pdf_style = pdf_style
        self._export_ts = export_ts
        self._page_size_tuple = page_size_tuple
        self._footer_season_year = 0
        self._footer_category_line = ""
        super().__init__(filename, **kw)

    def afterFlowable(self, flowable):
        SimpleDocTemplate.afterFlowable(self, flowable)
        if isinstance(flowable, _SectionFooterHint):
            self._footer_season_year = flowable._season_year
            self._footer_category_line = flowable._footer_category_line

    def build(self, flowables, canvasmaker=canvas.Canvas):
        """Like SimpleDocTemplate.build, but footer runs in onPageEnd (after flowables), not beforeDrawPage."""
        self._calc()
        frame_t = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        foot = self._on_page
        self.pageTemplates = []
        self.addPageTemplates(
            [
                PageTemplate(
                    id="First",
                    frames=frame_t,
                    onPage=_doNothing,
                    onPageEnd=foot,
                    pagesize=self.pagesize,
                ),
                PageTemplate(
                    id="Later",
                    frames=frame_t,
                    onPage=_doNothing,
                    onPageEnd=foot,
                    pagesize=self.pagesize,
                ),
            ]
        )
        BaseDocTemplate.build(self, flowables, canvasmaker=canvasmaker)

    def _on_page(self, canv: canvas.Canvas, doc: object) -> None:
        canv.saveState()
        canv.setFont("Helvetica", 8)
        parts: list[str] = []
        if self._pdf_style.show_organizer_footer:
            org = self._pdf_style.organizer_footer.strip()
            if org:
                parts.append(org)
        if self._pdf_style.show_season_footer and self._footer_season_year > 0:
            parts.append(f"Saison {self._footer_season_year}")
        if self._pdf_style.show_category_footer and self._footer_category_line:
            parts.append(self._footer_category_line)
        if self._pdf_style.show_export_timestamp_footer:
            parts.append(f"Export: {self._export_ts}")
        text = " - ".join(parts)
        if text:
            w, _h = self._page_size_tuple
            canv.drawCentredString(w / 2, 1.0 * cm, text)
        canv.restoreState()


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

    export_ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    buf_owner: BytesIO | None = None
    if isinstance(dest, Path):
        buf_owner = BytesIO()
        buf = buf_owner
    else:
        buf = dest

    doc = _ExportPdfDocTemplate(
        buf,
        pdf_style=pdf,
        export_ts=export_ts,
        page_size_tuple=page_size,
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

    first_section = True
    for sec in sections:
        if not first_section and pdf.page_break_before_each_category:
            story.append(PageBreak())
        first_section = False
        story.append(_SectionFooterHint(sec.season_year, sec.footer_category_label))
        story.append(Paragraph(_para_text(sec.title), title_style))
        if sec.subtitle:
            story.append(Paragraph(_para_text(sec.subtitle), subtitle_style))

        hdr = sec.header_rows
        if hdr is not None:
            data = [list(r) for r in hdr]
            data.extend([list(r) for r in sec.rows])
            n_header = len(hdr)
        else:
            data = [[c.header for c in sec.columns]]
            data.extend([list(r) for r in sec.rows])
            n_header = 1

        col_widths = None
        ncols = len(data[0]) if data else 0
        if ncols > 0:
            w_avail = page_size[0] - 3 * cm
            col_widths = _table_col_widths(sec.columns, w_avail)

        repeat_n = n_header if pdf.repeat_header else 0
        tbl = Table(data, colWidths=col_widths, repeatRows=repeat_n)

        body_fs, hdr_fs = _table_font_sizes(pdf, hdr)
        hdr_last = n_header - 1
        band_grey = colors.HexColor("#f5f5f5")
        tbl_style_cmds: list = [
            ("FONTNAME", (0, 0), (-1, hdr_last), "Helvetica-Bold"),
            ("FONTNAME", (0, n_header), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, hdr_last), hdr_fs),
            ("FONTSIZE", (0, n_header), (-1, -1), body_fs),
            ("BACKGROUND", (0, 0), (-1, hdr_last), colors.lightgrey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        n_rows_tbl = len(data)
        if sec.body_row_band_group is not None:
            line_grey = colors.grey
            tbl_style_cmds.append(("BOX", (0, 0), (-1, -1), _PDF_LINE_NORMAL, line_grey))
            for j in range(max(0, ncols - 1)):
                tbl_style_cmds.append(("LINEAFTER", (j, 0), (j, n_rows_tbl - 1), _PDF_LINE_NORMAL, line_grey))
            for r in range(n_rows_tbl - 1):
                w = _laufuebersicht_line_below_row(
                    r,
                    n_header=n_header,
                    n_rows=n_rows_tbl,
                    body_row_band_group=sec.body_row_band_group,
                    body_row_podium=sec.body_row_podium,
                )
                if w is not None:
                    tbl_style_cmds.append(("LINEBELOW", (0, r), (-1, r), w, line_grey))
        else:
            tbl_style_cmds.append(("GRID", (0, 0), (-1, -1), _PDF_LINE_NORMAL, colors.grey))
        # Laufübersicht: larger type for Distanz (Pkt.) cells; Gesamt column body also bold.
        if hdr is not None and ncols > 3:
            extra = max(0, int(pdf.laufuebersicht_result_font_extra_pt))
            res_fs = body_fs + extra
            tbl_style_cmds.append(("FONTSIZE", (3, n_header), (ncols - 1, -1), res_fs))
            last_c = ncols - 1
            tbl_style_cmds.append(("FONTNAME", (last_c, n_header), (last_c, -1), "Helvetica-Bold"))
        if sec.body_row_band_group is not None:
            if len(sec.body_row_band_group) != len(sec.rows):
                raise ValueError("body_row_band_group length must match body row count")
            podium = sec.body_row_podium
            if podium is not None:
                if len(podium) != len(sec.body_row_band_group):
                    raise ValueError("body_row_podium length must match body_row_band_group")
            for br, gid in enumerate(sec.body_row_band_group):
                tr = n_header + br
                on_podium = podium[br] if podium is not None else False
                if on_podium:
                    fill = _laufuebersicht_podium_fill(gid)
                else:
                    fill = colors.white if gid % 2 == 0 else band_grey
                tbl_style_cmds.append(("BACKGROUND", (0, tr), (-1, tr), fill))
        else:
            tbl_style_cmds.append(
                ("ROWBACKGROUNDS", (0, n_header), (-1, -1), [colors.white, band_grey])
            )
        if sec.table_spans:
            for (c0, r0), (c1, r1) in sec.table_spans:
                tbl_style_cmds.append(("SPAN", (c0, r0), (c1, r1)))
                # Paarlauf: vertically merge Platz + results — center content in the 2-row block.
                if c0 == c1 and r1 == r0 + 1:
                    tbl_style_cmds.append(("VALIGN", (c0, r0), (c0, r0), "MIDDLE"))
        for j, c in enumerate(sec.columns):
            if c.align == "right":
                tbl_style_cmds.append(("ALIGN", (j, n_header), (j, -1), "RIGHT"))
            elif c.align == "center":
                tbl_style_cmds.append(("ALIGN", (j, n_header), (j, -1), "CENTER"))
        tbl.setStyle(TableStyle(tbl_style_cmds))
        story.append(tbl)
        story.append(Spacer(1, 0.6 * cm))

    doc.build(story)

    if buf_owner is not None and isinstance(dest, Path):
        dest.write_bytes(buf_owner.getvalue())
