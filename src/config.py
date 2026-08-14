import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # ocr_module/

DB_PATH = os.path.join(BASE_DIR, "data", "scm_project.db")
SAMPLE_INVOICE_DIR = os.path.join(BASE_DIR, "data", "sample_invoices")
OUTPUT_INVOICE_DIR = os.path.join(BASE_DIR, "output", "printable_invoices")
MATCH_TOLERANCE_PERCENT = 2