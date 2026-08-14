import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "generated_pos")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def generate_po_pdf(req: dict) -> str:
    """req is a dict from db.get_requisition(). Returns the output file path."""
    path = os.path.join(OUTPUT_DIR, f"PO_{req['id']}.pdf")

    doc = SimpleDocTemplate(
        path, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "POTitle", parent=styles["Title"], fontSize=20, spaceAfter=4
    )
    label_style = ParagraphStyle(
        "Label", parent=styles["Normal"], textColor=colors.HexColor("#666666"), fontSize=9
    )
    note_style = ParagraphStyle(
        "Note", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#8a5a00")
    )

    story = []

    story.append(Paragraph("MedCare Pharma", label_style))
    story.append(Paragraph("Purchase Requisition", title_style))
    story.append(Paragraph(f"Requisition #{req['id']}", styles["Normal"]))
    story.append(Spacer(1, 16))

    urgency_color = {
        "CRITICAL": colors.HexColor("#c0392b"),
        "HIGH": colors.HexColor("#d35400"),
        "MEDIUM": colors.HexColor("#2980b9"),
        "LOW": colors.HexColor("#27ae60"),
    }.get(req["urgency"], colors.black)

    assumed = set((req.get("assumed_fields") or "").split(",")) - {""}

    def field(name):
        return f"{name} (assumed — not stated by user)" if name in assumed else name

    data = [
        ["Field", "Value"],
        ["SKU ID", req["sku_id"] or "UNRESOLVED"],
        ["Product", req.get("sku_name") or "—"],
        ["Quantity", str(req["quantity"])],
        [field("Destination DC"), req["destination_dc"]],
        ["Urgency", req["urgency"]],
        ["Source", req["source"]],
        ["Status", req["status"]],
        ["Created (UTC)", req["created_at"]],
    ]

    table = Table(data, colWidths=[2 * inch, 4 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f7f7")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TEXTCOLOR", (1, 5), (1, 5), urgency_color),
        ("FONTNAME", (1, 5), (1, 5), "Helvetica-Bold"),
    ]))
    story.append(table)
    story.append(Spacer(1, 18))

    if req.get("raw_input"):
        story.append(Paragraph("Original request text:", label_style))
        story.append(Paragraph(f"\u201c{req['raw_input']}\u201d", styles["Italic"]))
        story.append(Spacer(1, 10))

    if assumed:
        story.append(Paragraph(
            "\u26a0 Some fields above were not explicitly stated and were filled "
            "with a default. Please confirm before dispatch.", note_style
        ))

    doc.build(story)
    return path
