"""PDF export via ReportLab (F20)."""

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any, BinaryIO
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


_Lauf_PDF_EM_DASH = "\u2014"


def _laufuebersicht_apply_result_cell_paragraphs(
    data: list[list[Any]],
    *,
    n_header: int,
    ncols: int,
    body_fs: int,
    styles: Any,
    style_tag: int,
) -> None:
    """Str. (km) and Pkt. body cells as Paragraphs with shared leading (centered)."""
    leading = body_fs + 2
    cell_plain = ParagraphStyle(
        name=f"LaufResPl_{style_tag}",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=body_fs,
        leading=leading,
        alignment=TA_CENTER,
    )
    cell_bold = ParagraphStyle(
        name=f"LaufResBd_{style_tag}",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=body_fs,
        leading=leading,
        alignment=TA_CENTER,
    )
    for r in range(n_header, len(data)):
        for j in range(3, ncols):
            cell = data[r][j]
            if not isinstance(cell, str):
                continue
            if cell == "":
                continue
            is_km = (j - 3) % 2 == 0
            if is_km:
                data[r][j] = Paragraph(_para_text(cell), cell_plain)
            elif cell == _Lauf_PDF_EM_DASH:
                data[r][j] = Paragraph(_para_text(cell), cell_plain)
            else:
                data[r][j] = Paragraph(f"<b>{_para_text(cell)}</b>", cell_bold)


def _table_col_widths(columns: tuple[ColumnDef, ...], w_avail: float) -> list[float]:
    """Narrow fixed widths for rank / points / km; remaining width split across other columns."""
    n = len(columns)
    if n == 0:
        return []
    _laufuebersicht_km_pkt_w = 1.25 * cm
    narrow_by_id: dict[str, float] = {
        "platz": 0.95 * cm,
        "punkte_gesamt": 1.15 * cm,
        "distanz_gesamt": 1.35 * cm,
        "gesamt_km": _laufuebersicht_km_pkt_w,
        "gesamt_pkt": _laufuebersicht_km_pkt_w,
    }
    widths = [0.0] * n
    fixed_total = 0.0
    flex_indices: list[int] = []
    for j, c in enumerate(columns):
        nw = narrow_by_id.get(c.id)
        if c.id.startswith("race_km:") or c.id.startswith("race_pkt:"):
            nw = _laufuebersicht_km_pkt_w
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
# Double rules (header/body separator, Gesamt divider): bolder strokes + wider gap between the two lines.
_PDF_DOUBLE_RULE_WEIGHT = 0.85
_PDF_DOUBLE_RULE_GAP = 1.25


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
        return None
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
    """Light blue tint via per-channel multiply on zebra base so odd/even rows stay distinct."""
    if band_gid % 2 == 0:
        br, bg, bb = 255, 255, 255
    else:
        br, bg, bb = 245, 245, 245
    pr, pg, pb = 200, 220, 255
    r = min(255, br * pr // 255)
    g = min(255, bg * pg // 255)
    b = min(255, bb * pb // 255)
    return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")


# Laufübersicht table accents (ReportLab ``TableStyle``).
_Lauf_HEADER_GREEN = colors.HexColor("#E8F5E9")
_Lauf_HEADER_RUN_RED = colors.HexColor("#C62828")
_Lauf_COVER_YEAR_BLUE = colors.HexColor("#1565C0")
# Extended line tuple: op, (sc,sr), (ec,er), weight, color, cap, dash, join, linecount, linespacing
_RL_CAP_BUTT = 0
_RL_JOIN_MITER = 0


def _laufuebersicht_line_cmd(
    op: str,
    sc: int,
    sr: int,
    ec: int,
    er: int,
    weight: float,
    color: colors.Color,
    *,
    dash: tuple[float, ...] | list[float] | None = None,
    linecount: int = 1,
    linespace: float | None = None,
) -> tuple:
    sp = weight if linespace is None else linespace
    return (op, (sc, sr), (ec, er), weight, color, _RL_CAP_BUTT, dash, _RL_JOIN_MITER, linecount, sp)


def _laufuebersicht_append_column_lines(
    cmds: list,
    *,
    ncols: int,
    n_rows_tbl: int,
    n_races: int,
    line_grey: colors.Color,
) -> None:
    """Vertical rules: thick after Verein; dashed after each Str. column; double after last race Pkt."""
    dashed_after_km = {3 + 2 * i for i in range(n_races + 1)}
    double_after_last_race_pkt = 3 + 2 * n_races - 1 if n_races >= 1 else None
    last_j = ncols - 2
    for j in range(last_j + 1):
        if j == 2:
            cmds.append(
                _laufuebersicht_line_cmd(
                    "LINEAFTER", j, 0, j, n_rows_tbl - 1, _PDF_LINE_THICK, line_grey
                )
            )
        elif double_after_last_race_pkt is not None and j == double_after_last_race_pkt:
            cmds.append(
                _laufuebersicht_line_cmd(
                    "LINEAFTER",
                    j,
                    0,
                    j,
                    n_rows_tbl - 1,
                    _PDF_DOUBLE_RULE_WEIGHT,
                    line_grey,
                    linecount=2,
                    linespace=_PDF_DOUBLE_RULE_GAP,
                )
            )
        elif j in dashed_after_km:
            cmds.append(
                _laufuebersicht_line_cmd(
                    "LINEAFTER",
                    j,
                    0,
                    j,
                    n_rows_tbl - 1,
                    _PDF_LINE_NORMAL,
                    line_grey,
                    dash=(2, 2),
                )
            )
        else:
            cmds.append(
                _laufuebersicht_line_cmd(
                    "LINEAFTER", j, 0, j, n_rows_tbl - 1, _PDF_LINE_NORMAL, line_grey
                )
            )


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


class _LaufUbersichtTable(Table):
    """ReportLab omits ``LINEABOVE`` on the first body row for *continuation* split fragments (``_cr_1_1`` skips
    when ``er < n``); re-apply the header/body double rule on every piece after a row split when headers repeat.
    """

    def split(self, availWidth, availHeight):
        parts = super().split(availWidth, availHeight)
        if not parts or len(parts) < 2:
            return parts
        n_h = int(getattr(self, "_lauf_header_row_count", 0) or 0)
        if n_h <= 0:
            return parts
        color = getattr(self, "_lauf_hdr_double_color", colors.grey)
        # Split children are new Table instances; ReportLab does not copy custom attrs—propagate so nested splits
        # (page 3+) still inject the header/body double rule.
        for frag in parts:
            frag._lauf_header_row_count = n_h
            frag._lauf_hdr_double_color = color
        for frag in parts[1:]:
            frag._addCommand(
                list(
                    _laufuebersicht_line_cmd(
                        "LINEABOVE",
                        0,
                        n_h,
                        -1,
                        n_h,
                        _PDF_DOUBLE_RULE_WEIGHT,
                        color,
                        linecount=2,
                        linespace=_PDF_DOUBLE_RULE_GAP,
                    )
                )
            )
        return parts


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
    lauf_table_seq = 0
    if (
        pdf.table_layout == "laufuebersicht"
        and sections
        and pdf.laufuebersicht_show_cover
    ):
        story.append(_SectionFooterHint(sections[0].season_year, ""))
        cover_year_style = ParagraphStyle(
            name="LaufCoverYear",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=30,
            alignment=TA_CENTER,
            textColor=_Lauf_COVER_YEAR_BLUE,
            spaceAfter=14,
        )
        cover_notice_style = ParagraphStyle(
            name="LaufCoverNotice",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            alignment=TA_CENTER,
            spaceAfter=0,
        )
        year_s = str(sections[0].season_year)
        story.append(Paragraph(_para_text(year_s), cover_year_style))
        notice_body = pdf.resolved_laufuebersicht_notice()
        notice_xml = f"<u>{_para_text('Hinweis:')}</u><br/>{_para_text(notice_body)}"
        story.append(Paragraph(notice_xml, cover_notice_style))
        story.append(Spacer(1, 0.35 * cm))

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

        body_fs, hdr_fs = _table_font_sizes(pdf, hdr)
        if sec.body_row_band_group is not None and ncols > 3:
            lauf_table_seq += 1
            _laufuebersicht_apply_result_cell_paragraphs(
                data,
                n_header=n_header,
                ncols=ncols,
                body_fs=body_fs,
                styles=styles,
                style_tag=lauf_table_seq,
            )

        use_lauf_split_table = (
            sec.body_row_band_group is not None
            and n_header == 3
            and ncols > 3
            and repeat_n == n_header
            and len(data) > n_header
        )
        tbl_cls = _LaufUbersichtTable if use_lauf_split_table else Table
        tbl = tbl_cls(data, colWidths=col_widths, repeatRows=repeat_n)
        hdr_last = n_header - 1
        band_grey = colors.HexColor("#f5f5f5")
        header_bg = colors.lightgrey
        if sec.body_row_band_group is not None and n_header == 3 and ncols > 3:
            header_bg = _Lauf_HEADER_GREEN
        tbl_style_cmds: list = [
            ("FONTNAME", (0, 0), (-1, hdr_last), "Helvetica-Bold"),
            ("FONTNAME", (0, n_header), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, hdr_last), hdr_fs),
            ("FONTSIZE", (0, n_header), (-1, -1), body_fs),
            ("BACKGROUND", (0, 0), (-1, hdr_last), header_bg),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
        n_rows_tbl = len(data)
        # Laufübersicht: compact sub-header (Laufstr./Wertung, units); centered in narrow columns.
        if sec.body_row_band_group is not None and ncols > 3 and n_header == 3:
            hdr_sub = max(5, hdr_fs - 2)
            tbl_style_cmds.append(("FONTNAME", (3, 1), (-1, hdr_last), "Helvetica"))
            tbl_style_cmds.append(("FONTSIZE", (3, 1), (-1, hdr_last), hdr_sub))
            tbl_style_cmds.append(("ALIGN", (3, 1), (-1, hdr_last), "CENTER"))
            tbl_style_cmds.append(("ALIGN", (3, 0), (-1, 0), "CENTER"))
            n_races_hdr = max(0, (ncols - 5) // 2)
            for i in range(n_races_hdr + 1):
                c0 = 3 + 2 * i
                tbl_style_cmds.append(("TEXTCOLOR", (c0, 0), (c0, 0), _Lauf_HEADER_RUN_RED))
        if sec.body_row_band_group is not None and ncols > 3:
            tbl_style_cmds.append(("VALIGN", (3, n_header), (ncols - 1, -1), "MIDDLE"))
        if sec.body_row_band_group is not None:
            line_grey = colors.grey
            if use_lauf_split_table:
                tbl._lauf_header_row_count = n_header
                tbl._lauf_hdr_double_color = line_grey
            tbl_style_cmds.append(("BOX", (0, 0), (-1, -1), _PDF_LINE_NORMAL, line_grey))
            n_races_lines = max(0, (ncols - 5) // 2)
            _laufuebersicht_append_column_lines(
                tbl_style_cmds,
                ncols=ncols,
                n_rows_tbl=n_rows_tbl,
                n_races=n_races_lines,
                line_grey=line_grey,
            )
            # Draw the header/body separator on the *first body row* (LINEABOVE), not LINEBELOW on the last
            # header row, so ReportLab repeats it correctly when the table splits with ``repeatRows``;
            # LINEBELOW on the header row only appeared on the first canvas fragment.
            if n_header == 3 and n_rows_tbl > n_header:
                tbl_style_cmds.append(
                    _laufuebersicht_line_cmd(
                        "LINEABOVE",
                        0,
                        n_header,
                        -1,
                        n_header,
                        _PDF_DOUBLE_RULE_WEIGHT,
                        line_grey,
                        linecount=2,
                        linespace=_PDF_DOUBLE_RULE_GAP,
                    )
                )
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
                # Vertical merge (Paarlauf body, Laufübersicht header Platz/Name/Verein): center content.
                if c0 == c1 and r1 > r0:
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
