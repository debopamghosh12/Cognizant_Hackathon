from flask import Flask, request, jsonify, send_file, send_from_directory
import os

import db
from extractor import extract
from pdf_gen import generate_po_pdf

app = Flask(__name__, static_folder="static", static_url_path="/static")
db.init_db(seed=True)


# ---------- core validation, shared by both write paths ----------

def _validate_and_build_row(sku_id, sku_name, quantity, destination_dc, urgency,
                             source, raw_input=None, assumed_fields=None):
    assumed_fields = assumed_fields or []
    errors = []

    resolved_sku = None
    if sku_id:
        conn = db.get_conn()
        resolved_sku = conn.execute("SELECT * FROM sku WHERE sku_id = ?", (sku_id,)).fetchone()
        conn.close()
    if not resolved_sku:
        errors.append(f"sku_id '{sku_id}' not found in SKU table")

    if quantity is None or quantity <= 0:
        errors.append("quantity must be a positive number")

    status = "FLAGGED" if errors else "PENDING"

    payload = {
        "sku_id": sku_id or "UNRESOLVED",
        "sku_name": sku_name or (resolved_sku["name"] if resolved_sku else None),
        "quantity": quantity if quantity is not None else 0,
        "destination_dc": destination_dc,
        "urgency": urgency,
        "source": source,
        "status": status,
        "raw_input": raw_input,
        "assumed_fields": assumed_fields,
    }
    return payload, errors


# ---------- the shared endpoint ----------
# Both P1's auto-alert path and this chatbot must POST here in this exact shape:
#   {sku_id, quantity, destination_dc, urgency, source, status}

@app.route("/requisitions", methods=["POST"])
def create_requisition():
    body = request.get_json(force=True) or {}

    required = ["sku_id", "quantity", "destination_dc", "source"]
    missing = [f for f in required if f not in body]
    if missing:
        return jsonify({"error": f"missing required fields: {missing}"}), 400

    payload, errors = _validate_and_build_row(
        sku_id=body.get("sku_id"),
        sku_name=None,
        quantity=body.get("quantity"),
        destination_dc=body.get("destination_dc"),
        urgency=body.get("urgency", "MEDIUM"),
        source=body.get("source"),
        raw_input=body.get("raw_input"),
        assumed_fields=body.get("assumed_fields", []),
    )
    new_id = db.insert_requisition(payload)
    row = db.get_requisition(new_id)
    return jsonify({"requisition": row, "validation_errors": errors})


@app.route("/requisitions", methods=["GET"])
def list_requisitions_route():
    limit = request.args.get("limit", 100, type=int)
    return jsonify(db.list_requisitions(limit))


@app.route("/requisitions/<int:req_id>", methods=["GET"])
def get_requisition_route(req_id):
    row = db.get_requisition(req_id)
    if not row:
        return jsonify({"error": "requisition not found"}), 404
    return jsonify(row)


@app.route("/requisitions/<int:req_id>/pdf", methods=["GET"])
def download_pdf_route(req_id):
    row = db.get_requisition(req_id)
    if not row:
        return jsonify({"error": "requisition not found"}), 404
    path = generate_po_pdf(row)
    return send_file(path, mimetype="application/pdf", as_attachment=True,
                      download_name=f"PO_{req_id}.pdf")


# ---------- chatbot entry point ----------

@app.route("/chat", methods=["POST"])
def chat_to_requisition():
    body = request.get_json(force=True) or {}
    text = (body.get("text") or "").strip()
    if not text:
        return jsonify({"error": "empty message"}), 400

    extracted = extract(text)

    payload, errors = _validate_and_build_row(
        sku_id=extracted["sku_id"],
        sku_name=extracted.get("sku_name"),
        quantity=extracted["quantity"],
        destination_dc=extracted["destination_dc"],
        urgency=extracted["urgency"],
        source="MANUAL_CHATBOT",
        raw_input=text,
        assumed_fields=extracted.get("assumed_fields", []),
    )
    new_id = db.insert_requisition(payload)
    row = db.get_requisition(new_id)

    return jsonify({
        "requisition": row,
        "validation_errors": errors,
        "matched_product_phrase": extracted.get("matched_product_phrase"),
    })


@app.route("/", methods=["GET"])
def index():
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
