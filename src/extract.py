import warnings
warnings.filterwarnings("ignore")
from transformers import logging as hf_logging
hf_logging.set_verbosity_error()

import cv2
import numpy as np
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
import re

DEBUG = True  # set False before the live demo

# Load once at module level — reused across all invoices
processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten", use_fast=False)
model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")


def remove_horizontal_lines(thresh):
    """Detects and erases long horizontal ruled lines without damaging nearby digit strokes."""
    width = thresh.shape[1]
    kernel_len = max(60, width // 3)
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_len, 1))
    detected_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, horizontal_kernel, iterations=1)
    cleaned = cv2.subtract(thresh, detected_lines)
    return cleaned


def preprocess_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY_INV, 25, 15)
    thresh = remove_horizontal_lines(thresh)
    return img, thresh


def segment_lines(thresh):
    row_sums = np.sum(thresh, axis=1)
    threshold = row_sums.max() * 0.05

    raw_lines = []
    in_line = False
    start = 0
    for i, val in enumerate(row_sums):
        if val > threshold and not in_line:
            in_line = True
            start = i
        elif val <= threshold and in_line:
            in_line = False
            if i - start > 10:
                raw_lines.append((max(0, start - 10), min(len(row_sums), i + 10)))
    if in_line:
        raw_lines.append((start, len(row_sums)))

    merged = []
    for seg in raw_lines:
        if merged and seg[0] - merged[-1][1] < 15:
            merged[-1] = (merged[-1][0], seg[1])
        else:
            merged.append(seg)

    return merged


def has_sufficient_ink(thresh, top, bottom, min_ink_ratio=0.03):
    region = thresh[top:bottom, :]
    ink_ratio = np.sum(region > 0) / region.size
    return ink_ratio >= min_ink_ratio


def extract_raw_text(image_path):
    original_img, thresh = preprocess_image(image_path)
    line_boxes = segment_lines(thresh)

    pil_img = Image.open(image_path).convert("RGB")
    width = pil_img.size[0]

    full_text_lines = []
    for (top, bottom) in line_boxes:
        if not has_sufficient_ink(thresh, top, bottom):
            continue
        line_crop = pil_img.crop((0, top, width, bottom))
        pixel_values = processor(images=line_crop, return_tensors="pt").pixel_values
        generated_ids = model.generate(pixel_values, max_new_tokens=64)
        line_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        full_text_lines.append(line_text.strip())

    return " | ".join(full_text_lines)


def clean_number(raw_number_str):
    cleaned = re.sub(r"[,\s]", "", raw_number_str)
    return float(cleaned)


LABEL_PATTERNS = {
    "quantity_ordered": r"order[a-z]*",
    "quantity_received": r"receiv[a-z]*",
    "price_per_unit": r"pr[a-z]*|poli[a-z]*|prin[a-z]*|devic[a-z]*",
    "total_amount": r"amount|total",
}

def parse_invoice_fields(raw_text):
    fields = {
        "item_name": None,
        "quantity_ordered": None,
        "quantity_received": None,
        "price_per_unit": None,
        "total_amount": None,
    }

    lines = raw_text.split("|")

    item_match = re.search(r"item[:\s=\-]+([A-Za-z0-9 ]+?)(?:ordered|received|pric|amount|total|$)",
                            raw_text, re.IGNORECASE)
    if item_match:
        fields["item_name"] = item_match.group(1).strip()

    for field, label_pattern in LABEL_PATTERNS.items():
        for line in lines:
            match = re.search(label_pattern, line, re.IGNORECASE)
            if not match:
                continue
            after_label = line[match.end():match.end() + 25]
            number_tokens = re.findall(r"\d{1,3}(?:,\d{3})+|\d+", after_label)
            if not number_tokens:
                continue
            best = max(number_tokens, key=lambda s: len(s.replace(",", "")))
            if len(best.replace(",", "")) >= 2:  # skip pure single-digit stray noise
                fields[field] = clean_number(best)
                break  # found on this line, don't search further lines for this field

    return fields


def extract_invoice_data(image_path):
    raw_text = extract_raw_text(image_path)
    if DEBUG:
        print(f"[DEBUG] Raw OCR text: {raw_text}")
    return parse_invoice_fields(raw_text)