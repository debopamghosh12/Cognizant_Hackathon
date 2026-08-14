import os
import re
import json
from datetime import datetime
from db import find_sku, list_dcs

EXTRACTION_MODE = os.environ.get("EXTRACTION_MODE", "regex")

URGENCY_CRITICAL = ["asap", "urgent", "urgently", "critical", "immediately", "right now", "emergency"]
URGENCY_HIGH = ["by tomorrow", "by today", "soon", "quickly", "priority"]
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

QUANTITY_RE = re.compile(r"(\d[\d,]*)\s*(units?|boxes?|packs?|pcs|pieces?|cartons?)?", re.IGNORECASE)


def _infer_urgency(text: str) -> str:
    t = text.lower()
    if any(k in t for k in URGENCY_CRITICAL):
        return "CRITICAL"
    if any(k in t for k in URGENCY_HIGH):
        return "HIGH"
    if any(f"by {d}" in t for d in WEEKDAYS):
        return "HIGH"
    if any(d in t for d in WEEKDAYS):
        return "MEDIUM"
    return "MEDIUM"


def _extract_quantity(text: str):
    m = QUANTITY_RE.search(text)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def _extract_dc(text: str):
    t = text.lower()
    for dc in list_dcs():
        # match "Siliguri DC" or just "Siliguri"
        city = dc.replace(" DC", "").lower()
        if dc.lower() in t or city in t:
            return dc
    return None


def _extract_product_phrase(text: str, quantity_match_end: int):
    """
    Grab the words right after the quantity/unit as the likely product phrase,
    e.g. "500 units of paracetamol at the Siliguri DC" -> "paracetamol"
    Falls back to scanning the whole sentence against the SKU table if that fails.
    """
    tail = text[quantity_match_end:]
    tail = re.sub(r"^\s*(of|for)?\s*", "", tail, flags=re.IGNORECASE)
    # stop at a preposition that usually introduces location/time
    stop_words = [" at ", " to ", " by ", " for the", " for our", " asap", " urgently"]
    cut = len(tail)
    for sw in stop_words:
        idx = tail.lower().find(sw)
        if idx != -1:
            cut = min(cut, idx)
    phrase = tail[:cut].strip(" .,")
    return phrase


def extract_regex(text: str) -> dict:
    assumed = []

    qty_match = QUANTITY_RE.search(text)
    quantity = _extract_quantity(text)

    product_phrase = _extract_product_phrase(text, qty_match.end() if qty_match else 0)
    sku = find_sku(product_phrase) if product_phrase else None
    if not sku:
        # last resort: try every word/bigram in the sentence against the SKU table
        words = re.findall(r"[a-zA-Z]+", text)
        for i in range(len(words)):
            for span in (2, 1):
                candidate = " ".join(words[i:i + span])
                sku = find_sku(candidate)
                if sku:
                    break
            if sku:
                break

    dc = _extract_dc(text)
    if not dc:
        assumed.append("destination_dc")

    urgency = _infer_urgency(text)

    return {
        "sku_id": sku["sku_id"] if sku else None,
        "sku_name": sku["name"] if sku else None,
        "matched_product_phrase": product_phrase,
        "quantity": quantity,
        "destination_dc": dc or "UNASSIGNED_DEFAULT_DC",
        "urgency": urgency,
        "assumed_fields": assumed,
        "raw_input": text,
    }


def extract_llm(text: str) -> dict:
    """
    Optional path: structured extraction via Anthropic API.
    Requires `pip install anthropic` and ANTHROPIC_API_KEY in env.
    Falls back to regex extraction if the call fails for any reason —
    a hackathon demo should never hard-crash on a flaky network call.
    """
    try:
        import anthropic
        client = anthropic.Anthropic()
        dc_list = ", ".join(list_dcs())
        prompt = f"""Extract a purchase requisition from this text. Respond with ONLY raw JSON, no markdown fences, no preamble.

Text: "{text}"

Known distribution centers: {dc_list}

Return JSON with exactly these keys:
  "product_name": best-guess product name as mentioned in the text (string)
  "quantity": integer, or null if not stated
  "destination_dc": one of the known DC names above if mentioned/implied, else null
  "urgency": one of "LOW", "MEDIUM", "HIGH", "CRITICAL" based on tone/deadline words
"""
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        raw = raw.strip().strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
        parsed = json.loads(raw)

        assumed = []
        sku = find_sku(parsed.get("product_name") or "")
        dc = parsed.get("destination_dc")
        if not dc:
            assumed.append("destination_dc")

        return {
            "sku_id": sku["sku_id"] if sku else None,
            "sku_name": sku["name"] if sku else None,
            "matched_product_phrase": parsed.get("product_name"),
            "quantity": parsed.get("quantity"),
            "destination_dc": dc or "UNASSIGNED_DEFAULT_DC",
            "urgency": parsed.get("urgency") or "MEDIUM",
            "assumed_fields": assumed,
            "raw_input": text,
        }
    except Exception:
        # graceful fallback — never let the demo die on this
        result = extract_regex(text)
        result["assumed_fields"] = list(set(result["assumed_fields"] + ["llm_fallback_used"]))
        return result


def extract(text: str) -> dict:
    if EXTRACTION_MODE == "llm":
        return extract_llm(text)
    return extract_regex(text)
