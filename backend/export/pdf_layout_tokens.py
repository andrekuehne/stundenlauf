"""Resolved PDF layout tokens (margins, fonts, lines, colors) derived from :class:`PdfStyleSpec`.

Centralizes visual constants so presets can swap styling without touching projection data or
table structure. :func:`pdf_layout_tokens` is the single entry point used by ``pdf_renderer``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from reportlab.lib import colors

if TYPE_CHECKING:
    from backend.export.spec import PdfStyleSpec


def _hex_color(s: str) -> colors.Color:
    s = s.strip()
    if not s.startswith("#"):
        s = "#" + s
    return colors.HexColor(s)


@dataclass(frozen=True)
class PdfLayoutTokens:
    """ReportLab-oriented measurements and colors for one export run."""

    margin_left_cm: float
    margin_right_cm: float
    margin_top_cm: float
    margin_bottom_cm: float
    footer_font_size_pt: float
    footer_y_cm: float
    section_title_font_size_pt: float
    section_title_space_after_pt: float
    section_subtitle_font_size_pt: float
    section_subtitle_space_after_pt: float
    cover_year_font_size_pt: float
    cover_year_leading_pt: float
    cover_year_space_after_pt: float
    cover_notice_font_size_pt: float
    cover_notice_leading_pt: float
    cover_spacer_after_cm: float
    table_spacer_after_cm: float
    logo_draw_height_cm: float
    logo_spacer_after_cm: float
    line_thin_pt: float
    line_normal_pt: float
    line_thick_pt: float
    double_rule_weight_pt: float
    double_rule_gap_pt: float
    lauf_sub_header_delta_pt: int
    lauf_sub_header_min_pt: int
    lauf_result_leading_extra_pt: int
    color_line_grey_hex: str
    color_header_green_hex: str
    color_header_run_red_hex: str
    color_cover_year_blue_hex: str
    color_band_grey_hex: str
    color_zebra_even_rgb: tuple[int, int, int]
    color_zebra_odd_rgb: tuple[int, int, int]
    color_podium_tint_rgb: tuple[int, int, int]
    narrow_platz_cm: float
    narrow_punkte_gesamt_cm: float
    narrow_distanz_gesamt_cm: float
    narrow_laufuebersicht_km_pkt_cm: float
    table_width_extra_margin_cm: float
    table_cell_horizontal_padding_pt: float
    table_cell_vertical_padding_pt: float
    table_plain_leading_extra_pt: int

    @property
    def line_grey(self) -> colors.Color:
        return _hex_color(self.color_line_grey_hex)

    @property
    def header_green(self) -> colors.Color:
        return _hex_color(self.color_header_green_hex)

    @property
    def header_run_red(self) -> colors.Color:
        return _hex_color(self.color_header_run_red_hex)

    @property
    def cover_year_blue(self) -> colors.Color:
        return _hex_color(self.color_cover_year_blue_hex)

    @property
    def band_grey(self) -> colors.Color:
        return _hex_color(self.color_band_grey_hex)

    @property
    def zebra_even(self) -> colors.Color:
        r, g, b = self.color_zebra_even_rgb
        return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")

    @property
    def zebra_odd(self) -> colors.Color:
        r, g, b = self.color_zebra_odd_rgb
        return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")


def pdf_layout_tokens(pdf: PdfStyleSpec) -> PdfLayoutTokens:
    """Build resolved layout tokens from ``pdf`` (includes optional style overrides)."""
    return PdfLayoutTokens(
        margin_left_cm=pdf.margin_left_cm,
        margin_right_cm=pdf.margin_right_cm,
        margin_top_cm=pdf.margin_top_cm,
        margin_bottom_cm=pdf.margin_bottom_cm,
        footer_font_size_pt=pdf.footer_font_size_pt,
        footer_y_cm=pdf.footer_y_cm,
        section_title_font_size_pt=pdf.section_title_font_size_pt,
        section_title_space_after_pt=pdf.section_title_space_after_pt,
        section_subtitle_font_size_pt=pdf.section_subtitle_font_size_pt,
        section_subtitle_space_after_pt=pdf.section_subtitle_space_after_pt,
        cover_year_font_size_pt=pdf.cover_year_font_size_pt,
        cover_year_leading_pt=pdf.cover_year_leading_pt,
        cover_year_space_after_pt=pdf.cover_year_space_after_pt,
        cover_notice_font_size_pt=pdf.cover_notice_font_size_pt,
        cover_notice_leading_pt=pdf.cover_notice_leading_pt,
        cover_spacer_after_cm=pdf.cover_spacer_after_cm,
        table_spacer_after_cm=pdf.table_spacer_after_cm,
        logo_draw_height_cm=pdf.logo_draw_height_cm,
        logo_spacer_after_cm=pdf.logo_spacer_after_cm,
        line_thin_pt=pdf.line_thin_pt,
        line_normal_pt=pdf.line_normal_pt,
        line_thick_pt=pdf.line_thick_pt,
        double_rule_weight_pt=pdf.double_rule_weight_pt,
        double_rule_gap_pt=pdf.double_rule_gap_pt,
        lauf_sub_header_delta_pt=pdf.lauf_sub_header_delta_pt,
        lauf_sub_header_min_pt=pdf.lauf_sub_header_min_pt,
        lauf_result_leading_extra_pt=pdf.lauf_result_leading_extra_pt,
        color_line_grey_hex=pdf.color_line_grey_hex,
        color_header_green_hex=pdf.color_header_green_hex,
        color_header_run_red_hex=pdf.color_header_run_red_hex,
        color_cover_year_blue_hex=pdf.color_cover_year_blue_hex,
        color_band_grey_hex=pdf.color_band_grey_hex,
        color_zebra_even_rgb=pdf.color_zebra_even_rgb,
        color_zebra_odd_rgb=pdf.color_zebra_odd_rgb,
        color_podium_tint_rgb=pdf.color_podium_tint_rgb,
        narrow_platz_cm=pdf.narrow_platz_cm,
        narrow_punkte_gesamt_cm=pdf.narrow_punkte_gesamt_cm,
        narrow_distanz_gesamt_cm=pdf.narrow_distanz_gesamt_cm,
        narrow_laufuebersicht_km_pkt_cm=pdf.narrow_laufuebersicht_km_pkt_cm,
        table_width_extra_margin_cm=pdf.table_width_extra_margin_cm,
        table_cell_horizontal_padding_pt=pdf.table_cell_horizontal_padding_pt,
        table_cell_vertical_padding_pt=pdf.table_cell_vertical_padding_pt,
        table_plain_leading_extra_pt=pdf.table_plain_leading_extra_pt,
    )


def laufuebersicht_podium_fill(
    band_gid: int,
    *,
    zebra_even: tuple[int, int, int],
    zebra_odd: tuple[int, int, int],
    podium_tint: tuple[int, int, int],
) -> colors.Color:
    """Light tint via per-channel multiply on zebra base (odd/even rows stay distinct)."""
    if band_gid % 2 == 0:
        br, bg, bb = zebra_even
    else:
        br, bg, bb = zebra_odd
    pr, pg, pb = podium_tint
    r = min(255, br * pr // 255)
    g = min(255, bg * pg // 255)
    b = min(255, bb * pb // 255)
    return colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")
