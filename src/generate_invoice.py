from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from config import OUTPUT_INVOICE_DIR
import os

def generate_printable_invoice(invoice_id, data):
    os.makedirs(OUTPUT_INVOICE_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_INVOICE_DIR, f"{invoice_id}.pdf")

    doc = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = [Paragraph(f"Invoice — {invoice_id}", styles['Title']), Spacer(1, 16)]

    table_data = [
        ["Item", "Qty Ordered", "Qty Received", "Price/Unit", "Total Amount"],
        [data["item_name"], data["quantity_ordered"], data["quantity_received"],
         f"Rs. {data['price_per_unit']}", f"Rs. {data['total_amount']}"]
    ]
    t = Table(table_data, colWidths=[150, 80, 90, 80, 90])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a5276')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)

    doc.build(story)
    return output_path