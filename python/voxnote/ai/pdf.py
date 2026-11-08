"""Renderizado del resumen a PDF con reportlab.

El texto que produce Gemini es contenido no confiable: todo se escapa antes de
entrar en un Paragraph para que no se interprete como marcado.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

VIOLET = colors.HexColor("#7C5CFF")
VIOLET_DARK = colors.HexColor("#5B3FD6")
CYAN = colors.HexColor("#06B6D4")
INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
SOFT = colors.HexColor("#F4F1FF")
BORDER = colors.HexColor("#E4DFF7")
WHITE = colors.HexColor("#FFFFFF")

PAGE_MARGIN_X = 18 * mm
PAGE_MARGIN_TOP = 16 * mm
PAGE_MARGIN_BOTTOM = 22 * mm


def render_summary_pdf(
    summary: dict[str, Any],
    destination: str | Path,
    *,
    source_name: str = "",
    model: str = "",
    generated_at: datetime | None = None,
) -> Path:
    destination = Path(destination).expanduser()
    destination.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(destination),
        pagesize=A4,
        leftMargin=PAGE_MARGIN_X,
        rightMargin=PAGE_MARGIN_X,
        topMargin=PAGE_MARGIN_TOP,
        bottomMargin=PAGE_MARGIN_BOTTOM,
        title=summary.get("title") or "Resumen",
        author="VoxNote",
    )

    styles = _styles()
    story: list[Any] = []

    # Cabecera
    title = escape(summary.get("title") or "Resumen de la transcripción")
    subtitle = escape(summary.get("subtitle") or "")

    header_rows: list[list[Any]] = [
        [Paragraph("RESUMEN · VOXNOTE", styles["kicker"])],
        [Paragraph(title, styles["title"])],
    ]
    if subtitle:
        header_rows.append([Paragraph(subtitle, styles["subtitle"])])

    header = Table(header_rows, colWidths=[doc.width])
    header.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), INK),
                ("LINEABOVE", (0, 0), (-1, 0), 4, VIOLET),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (0, 0), 14),
                ("BOTTOMPADDING", (0, 0), (0, 0), 2),
                ("TOPPADDING", (0, 1), (-1, -1), 2),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 16),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 10))

    meta_bits = [escape(Path(source_name).name)] if source_name else []
    if model:
        meta_bits.append(f"Modelo: {escape(model)}")
    timestamp = (generated_at or datetime.now()).strftime("%d/%m/%Y %H:%M")
    meta_bits.append(timestamp)
    story.append(Paragraph("  ·  ".join(meta_bits), styles["meta"]))
    story.append(Spacer(1, 16))

    overview = summary.get("overview") or ""
    if overview:
        story.append(_section_heading("Resumen general", doc.width, styles))
        story.append(Paragraph(escape(overview), styles["lead"]))
        story.append(Spacer(1, 8))

    sections = summary.get("sections") or []
    for section in sections:
        heading = escape(section.get("heading") or "Sección")
        story.append(_section_heading(heading, doc.width, styles))

        body = section.get("summary") or ""
        if body:
            story.append(Paragraph(escape(body), styles["body"]))

        bullets = section.get("bullets") or []
        if bullets:
            for bullet in bullets:
                story.append(
                    Paragraph(
                        f'<font color="#7C5CFF">•</font>  {escape(bullet)}',
                        styles["bullet"],
                    )
                )
        story.append(Spacer(1, 10))

    key_ideas = summary.get("key_ideas") or []
    if key_ideas:
        content = ['<font color="#5B3FD6"><b>Ideas principales</b></font>', ""]
        content.extend(
            f'<font color="#7C5CFF">•</font>  {escape(item)}' for item in key_ideas
        )
        story.append(Paragraph("<br/>".join(content), styles["box"]))
        story.append(Spacer(1, 14))

    concepts = summary.get("concepts") or []
    if concepts:
        story.append(_section_heading("Conceptos clave", doc.width, styles))
        rows: list[list[Any]] = [
            [
                Paragraph("Concepto", styles["th"]),
                Paragraph("Definición", styles["th"]),
            ]
        ]
        for concept in concepts:
            rows.append(
                [
                    Paragraph(escape(concept.get("term") or ""), styles["term"]),
                    Paragraph(escape(concept.get("definition") or ""), styles["cell"]),
                ]
            )

        table = Table(
            rows,
            colWidths=[doc.width * 0.30, doc.width * 0.70],
            repeatRows=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), VIOLET),
                    ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, SOFT]),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 14))

    conclusions = summary.get("conclusions") or []
    if conclusions:
        story.append(_section_heading("Conclusiones", doc.width, styles))
        for index, item in enumerate(conclusions, start=1):
            story.append(
                Paragraph(
                    f'<font color="#7C5CFF"><b>{index}.</b></font>  {escape(item)}',
                    styles["bullet"],
                )
            )
        story.append(Spacer(1, 10))

    keywords = summary.get("keywords") or []
    if keywords:
        story.append(
            Paragraph(
                "<b>Palabras clave:</b>  "
                + "  ·  ".join(escape(word) for word in keywords),
                styles["meta"],
            )
        )

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return destination


def _section_heading(text: str, width: float, styles: dict[str, ParagraphStyle]) -> Table:
    bar = Table(
        [["", Paragraph(text, styles["h1"])]],
        colWidths=[4, width - 4],
    )
    bar.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), VIOLET),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return bar


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "kicker": ParagraphStyle(
            "Kicker",
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=10,
            textColor=CYAN,
            spaceAfter=6,
        ),
        "title": ParagraphStyle(
            "Title",
            fontName="Helvetica-Bold",
            fontSize=23,
            leading=27,
            textColor=WHITE,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#D9D2FF"),
        ),
        "meta": ParagraphStyle(
            "Meta",
            fontName="Helvetica",
            fontSize=8.5,
            leading=13,
            textColor=MUTED,
        ),
        "h1": ParagraphStyle(
            "H1",
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=VIOLET_DARK,
        ),
        "lead": ParagraphStyle(
            "Lead",
            fontName="Helvetica",
            fontSize=11,
            leading=16.5,
            textColor=INK,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=INK,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            fontName="Helvetica",
            fontSize=10,
            leading=14.5,
            textColor=INK,
            leftIndent=14,
            firstLineIndent=-14,
            spaceAfter=4,
        ),
        "box": ParagraphStyle(
            "Box",
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=INK,
            backColor=SOFT,
            borderColor=BORDER,
            borderWidth=0.8,
            borderPadding=12,
            borderRadius=4,
        ),
        "th": ParagraphStyle(
            "TH",
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=12,
            textColor=WHITE,
        ),
        "term": ParagraphStyle(
            "Term",
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=13,
            textColor=VIOLET_DARK,
        ),
        "cell": ParagraphStyle(
            "Cell",
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=INK,
        ),
    }


def _footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(
        PAGE_MARGIN_X,
        PAGE_MARGIN_BOTTOM - 8 * mm,
        A4[0] - PAGE_MARGIN_X,
        PAGE_MARGIN_BOTTOM - 8 * mm,
    )
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(
        PAGE_MARGIN_X,
        PAGE_MARGIN_BOTTOM - 13 * mm,
        "VoxNote · Resumen generado con Gemini",
    )
    canvas.drawRightString(
        A4[0] - PAGE_MARGIN_X,
        PAGE_MARGIN_BOTTOM - 13 * mm,
        f"Página {doc.page}",
    )
    canvas.restoreState()
