"""
generate_suppliers.py

Synthetic supplier catalog for PR2 -- Autonomous Procure-to-Pay.
Cognizant NPN Hackathon -- Supplier Selection module.

Schema: one row per supplier x SKU pair.
Output: data/suppliers.csv

120 suppliers across 9 archetypes arranged in 3 performance tiers.
Four archetypes are deliberate outliers that break trivial price-quality
correlation so the selection model cannot learn a simple linear rule:

  Tier 1 -- High Quality / High Price (~40 suppliers)
    PREMIUM             (30)  core: fast, expensive, excellent quality
    PREMIUM_SLOW         (6)  outlier: expensive + slow lead time
    EXPENSIVE_UNRELIABLE (4)  outlier: expensive + poor quality

  Tier 2 -- Mid-Range (~40 suppliers)
    BALANCED            (28)  core: medium on everything
    CHEAP_RELIABLE       (8)  outlier: cheap + high quality/reliability
    FAST_BUDGET          (4)  outlier: fast delivery + budget price

  Tier 3 -- Low-Cost / Lower-Reliability (~40 suppliers)
    ECONOMY             (20)  core: low price, moderate reliability
    CHEAP_SLOW          (12)  core: lowest price, long lead time
    LOW_QUALITY          (8)  worst quality, high defect rate

SKU market concentration (non-uniform by design):
  SKU-EXC-001  45-60 suppliers   commodity excipient, highly competitive
  SKU-API-001  32-48 suppliers   common active ingredient
  SKU-API-002  25-38 suppliers   less common active ingredient
  SKU-PKG-001  14-22 suppliers   primary packaging specialists
  SKU-PKG-002   4-7  suppliers   niche secondary packaging

Run:
    pip install faker numpy pandas
    python scripts/generate_suppliers.py
"""

import os
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

# -- Reproducibility ----------------------------------------------------------
SEED = 42
random.seed(SEED)
rng  = np.random.default_rng(SEED)
fake = Faker()
Faker.seed(SEED)

# -- I/O paths ----------------------------------------------------------------
ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
_out_name = os.environ.get("SUPPLIERS_OUT", "suppliers.csv")
OUT_CSV   = DATA_DIR / _out_name

# -- SKU catalog --------------------------------------------------------------
# Placeholder -- swap sku_id / category / base_price once P1 confirms their list.
SKUS = [
    {"sku_id": "SKU-API-001", "category": "Active Ingredient",   "base_price": 2.10},
    {"sku_id": "SKU-API-002", "category": "Active Ingredient",   "base_price": 1.85},
    {"sku_id": "SKU-EXC-001", "category": "Excipient",           "base_price": 0.45},
    {"sku_id": "SKU-PKG-001", "category": "Primary Packaging",   "base_price": 0.30},
    {"sku_id": "SKU-PKG-002", "category": "Secondary Packaging", "base_price": 0.18},
]
SKU_IDS = [s["sku_id"] for s in SKUS]
SKU_MAP  = {s["sku_id"]: s for s in SKUS}

# Per-SKU market concentration targets.
# 'min' and 'max' are unique supplier counts; 'weight' drives random assignment.
SKU_TARGETS = {
    "SKU-EXC-001": {"min": 45, "max": 60, "weight": 0.38},
    "SKU-API-001": {"min": 32, "max": 48, "weight": 0.28},
    "SKU-API-002": {"min": 25, "max": 38, "weight": 0.18},
    "SKU-PKG-001": {"min": 14, "max": 22, "weight": 0.11},
    "SKU-PKG-002": {"min":  4, "max":  7, "weight": 0.05},
}

# -- Archetype definitions ----------------------------------------------------
# Columns: (label, count, price_mult, lead_time_days, otd, quality_score,
#           defect_rate, utilization, gmp_cert_prob, base_risk_tier)
#
# price_mult is applied to each SKU's base_price to produce realistic per-SKU prices.
# base_risk_tier is bumped when utilization > 0.88 or gmp_certified is False.
#
# Outlier archetypes break price-quality correlation:
#   PREMIUM_SLOW         -- high price but slow lead time  (price !=> speed)
#   EXPENSIVE_UNRELIABLE -- high price but poor quality     (price !=> quality)
#   CHEAP_RELIABLE       -- low price but high quality      (cheap !=> bad)
#   FAST_BUDGET          -- fast delivery but budget price  (fast !=> expensive)

ARCHETYPES = [
    # label                count  price_mult     lead_time   otd            quality        defect          util           gmp_p  base_risk
    # --- Tier 1: High Quality / High Price ---
    ("PREMIUM",              30,  (1.15, 1.35),  ( 1,  4),  (0.93, 0.99), (0.90, 0.97), (0.005, 0.018), (0.40, 0.72),  0.99,  "LOW"),
    ("PREMIUM_SLOW",          6,  (1.15, 1.35),  ( 9, 16),  (0.88, 0.96), (0.90, 0.97), (0.006, 0.020), (0.45, 0.75),  0.98,  "LOW"),
    ("EXPENSIVE_UNRELIABLE",  4,  (1.20, 1.40),  ( 4,  9),  (0.79, 0.88), (0.63, 0.77), (0.048, 0.078), (0.60, 0.90),  0.65,  "HIGH"),
    # --- Tier 2: Mid-Range ---
    ("BALANCED",             28,  (0.93, 1.08),  ( 3,  7),  (0.86, 0.95), (0.82, 0.92), (0.015, 0.040), (0.45, 0.82),  0.90,  "LOW"),
    ("CHEAP_RELIABLE",        8,  (0.72, 0.85),  ( 3,  7),  (0.91, 0.97), (0.88, 0.96), (0.007, 0.022), (0.50, 0.80),  0.92,  "LOW"),
    ("FAST_BUDGET",           4,  (0.80, 0.93),  ( 1,  3),  (0.84, 0.93), (0.78, 0.88), (0.022, 0.050), (0.55, 0.85),  0.82,  "LOW"),
    # --- Tier 3: Low-Cost / Lower-Reliability ---
    ("ECONOMY",              20,  (0.78, 0.92),  ( 5, 10),  (0.83, 0.92), (0.78, 0.88), (0.025, 0.055), (0.50, 0.85),  0.80,  "MEDIUM"),
    ("CHEAP_SLOW",           12,  (0.68, 0.82),  ( 9, 16),  (0.80, 0.91), (0.73, 0.84), (0.030, 0.065), (0.55, 0.88),  0.72,  "MEDIUM"),
    ("LOW_QUALITY",           8,  (0.72, 0.88),  ( 3, 10),  (0.77, 0.87), (0.62, 0.77), (0.055, 0.080), (0.65, 0.95),  0.35,  "HIGH"),
]
# Tier counts: (30+6+4) + (28+8+4) + (20+12+8) = 40 + 40 + 40 = 120

COUNTRIES     = ["US", "IN", "DE", "CN", "GB", "NL", "SG", "CA", "JP", "CH"]
PAYMENT_TERMS = [15, 30, 45, 60, 90]

# -- Suitability label formula ------------------------------------------------
# Weights represent procurement priorities for a P2P system:
#   Cost     30% -- primary objective: minimise spend
#   OTD      25% -- delivery reliability drives production continuity
#   Quality  25% -- defect/recall costs have high downstream impact
#   Lead     20% -- flexibility matters, but less than reliability or quality
#
# Prices and lead times are normalised per-SKU so suppliers are compared only
# against other suppliers offering the same product (not across categories).
#
# Two noise layers prevent a model learning the formula exactly:
#   1. Heteroscedastic Gaussian -- sigma is widest near the decision boundary,
#      reflecting genuine uncertainty about borderline suppliers.
#   2. Random label flips (FLIP_RATE) -- simulates procurement overrides,
#      policy exceptions, and annotation disagreement.
W_COST          = 0.30
W_LEAD          = 0.20
W_OTD           = 0.25
W_QUALITY       = 0.25
GMP_PENALTY     = 0.55   # score multiplier: non-GMP suppliers in API/Excipient
NOISE_BASE      = 0.04   # minimum Gaussian sigma (applies everywhere)
NOISE_BORDER    = 0.09   # extra sigma added at the decision boundary (score=0.5)
FLIP_RATE       = 0.03   # fraction of is_preferred labels randomly flipped

# -- Name generation ----------------------------------------------------------
# 30 prefixes x 15 suffixes = 450 unique combinations; 120 are drawn without
# replacement, so collision probability is negligible.
_PREFIXES = [
    "MedPharm", "ApexRx", "Vericore", "NovaBio", "GlobalRx", "PharmaLink",
    "BioNexus", "MedSource", "ClearPath", "AlphaRx", "CertaPharm", "PrimeMed",
    "TrueLine", "NexGen", "OmniPharm", "BioAssure", "SpectraRx", "CoreMed",
    "ElitePharma", "ProMed", "SafeRx", "HelixPharm", "ZenithMed", "PurePath",
    "UltraRx", "TerraPharm", "StellarBio", "PeakMed", "AxisPharma", "VisionRx",
]
_SUFFIXES = [
    "Distributors Inc.", "Supply Co.", "Logistics Ltd.",
    "Pharmaceutical Partners", "Medical Supply", "Group LLC",
    "Solutions Ltd.", "Healthcare Supply", "Industries Inc.",
    "Corporation", "International Ltd.", "Trading Co.",
    "Bio-Sciences Ltd.", "Life Sciences Inc.", "Pharma Corp.",
]


def _unique_name(used: set) -> str:
    for _ in range(1000):
        candidate = f"{random.choice(_PREFIXES)} {random.choice(_SUFFIXES)}"
        if candidate not in used:
            used.add(candidate)
            return candidate
    # Fallback: Faker-generated last name + pharma term (virtually never reached)
    candidate = f"{fake.last_name()}Pharma {random.choice(_SUFFIXES)}"
    used.add(candidate)
    return candidate


# -- Helpers ------------------------------------------------------------------
def _risk_tier(base: str, utilization: float, gmp: bool) -> str:
    """
    Bump risk tier when near capacity (util > 0.88) or not GMP-certified.
    Each condition raises the tier by one step; two conditions can raise by two.
    """
    ladder = ["LOW", "MEDIUM", "HIGH"]
    idx = ladder.index(base)
    if utilization > 0.88:
        idx = min(idx + 1, 2)
    if not gmp:
        idx = min(idx + 1, 2)
    return ladder[idx]


# -- Step 1: build 120 supplier entity records --------------------------------
def build_supplier_entities() -> list[dict]:
    entities   = []
    used_names: set = set()
    sup_num    = 1

    for (label, count, price_mult, lead_time, otd, quality,
         defect, util_range, gmp_prob, base_risk) in ARCHETYPES:

        for _ in range(count):
            gmp      = random.random() < gmp_prob
            util_val = round(float(rng.uniform(*util_range)), 4)

            entities.append({
                "supplier_id":             f"SUP-{sup_num:03d}",
                "supplier_name":           _unique_name(used_names),
                "country":                 random.choice(COUNTRIES),
                "gmp_certified":           gmp,
                "current_utilization_pct": util_val,
                # internal keys -- guide row generation, not written to CSV
                "_archetype":  label,
                "_base_risk":  base_risk,
                "_price_mult": price_mult,
                "_lead_time":  lead_time,
                "_otd":        otd,
                "_quality":    quality,
                "_defect":     defect,
            })
            sup_num += 1

    return entities


# -- Step 2: assign SKUs with non-uniform market concentration ----------------
def assign_skus(entities: list[dict]) -> dict[str, list[str]]:
    """
    Returns {supplier_id: [sku_id, ...]} satisfying:
      - Each supplier carries 1-3 SKUs (most carry 1, a minority carry 2-3).
      - Each SKU's unique-supplier count falls within SKU_TARGETS[sku]["min/max"].
      - SKU selection is weighted by SKU_TARGETS[sku]["weight"], producing
        the non-uniform market concentration described in the module docstring.
    """
    sup_to_skus: dict[str, list[str]] = {e["supplier_id"]: [] for e in entities}
    sku_counts:  dict[str, int]       = {sku: 0 for sku in SKU_IDS}

    sku_weights = [SKU_TARGETS[s]["weight"] for s in SKU_IDS]

    def _pick_sku(already_has: list[str]) -> str | None:
        """Weighted choice from SKUs not already carried and not at max capacity."""
        available = [
            s for s in SKU_IDS
            if s not in already_has
            and sku_counts[s] < SKU_TARGETS[s]["max"]
        ]
        if not available:
            # Relax max constraint if all options are capped
            available = [s for s in SKU_IDS if s not in already_has]
        if not available:
            return None
        w = [SKU_TARGETS[s]["weight"] for s in available]
        total = sum(w)
        return random.choices(available, weights=[x / total for x in w], k=1)[0]

    # Pass 1: every supplier gets exactly one primary SKU (weighted).
    for ent in entities:
        sid  = ent["supplier_id"]
        sku  = _pick_sku(sup_to_skus[sid])
        if sku:
            sup_to_skus[sid].append(sku)
            sku_counts[sku] += 1

    # Pass 2: with probability 0.17 add a second SKU, 0.03 add a third.
    # This produces ~1.2 avg SKUs per supplier without overloading niche SKUs.
    for ent in entities:
        sid     = ent["supplier_id"]
        n_extra = random.choices([0, 1, 2], weights=[0.80, 0.17, 0.03], k=1)[0]
        for _ in range(n_extra):
            sku = _pick_sku(sup_to_skus[sid])
            if sku:
                sup_to_skus[sid].append(sku)
                sku_counts[sku] += 1

    # Pass 3: enforce minimum coverage -- add suppliers to any under-covered SKU.
    for sku in SKU_IDS:
        min_cov = SKU_TARGETS[sku]["min"]
        while sku_counts[sku] < min_cov:
            # Candidates: suppliers that don't yet carry this SKU and have < 3 SKUs
            candidates = [
                e for e in entities
                if sku not in sup_to_skus[e["supplier_id"]]
                and len(sup_to_skus[e["supplier_id"]]) < 3
            ]
            if not candidates:
                # Relax the 3-SKU cap
                candidates = [
                    e for e in entities
                    if sku not in sup_to_skus[e["supplier_id"]]
                ]
            if not candidates:
                break
            # Prefer suppliers with fewer SKUs to spread coverage evenly
            candidates.sort(key=lambda e: len(sup_to_skus[e["supplier_id"]]))
            chosen_id = candidates[0]["supplier_id"]
            sup_to_skus[chosen_id].append(sku)
            sku_counts[sku] += 1

    return sup_to_skus


# -- Step 3: generate one row per supplier x SKU pair ------------------------
def generate_rows(entities: list[dict], sup_to_skus: dict[str, list[str]]) -> list[dict]:
    rows  = []
    today = date.today()

    for ent in entities:
        sid  = ent["supplier_id"]
        gmp  = ent["gmp_certified"]
        util = ent["current_utilization_pct"]
        risk = _risk_tier(ent["_base_risk"], util, gmp)

        for sku_id in sup_to_skus.get(sid, []):
            sku = SKU_MAP[sku_id]

            # Pricing -- archetype multiplier applied to SKU base price.
            # Keeps absolute prices comparable within a SKU, not across SKUs.
            price_mult = float(rng.uniform(*ent["_price_mult"]))
            unit_price = round(sku["base_price"] * price_mult, 4)

            # Performance metrics -- sampled within archetype bands
            lead_time = int(rng.integers(ent["_lead_time"][0],
                                         ent["_lead_time"][1] + 1))  # inclusive hi
            otd       = round(float(rng.uniform(*ent["_otd"])), 4)
            quality   = round(float(rng.uniform(*ent["_quality"])), 4)
            defect    = round(float(rng.uniform(*ent["_defect"])), 5)

            # fill_rate: correlated with otd but independently noisy.
            # A supplier can be on-time but short-ship, or late but fully filled.
            # Noise offset avoids interval-inversion at low otd values.
            fill_noise = float(rng.uniform(-0.07, 0.05))
            fill_rate  = round(min(1.00, max(0.75, otd + fill_noise)), 4)

            # Capacity and commercial terms
            moq      = int(rng.choice([100, 200, 250, 500, 750, 1000]))
            capacity = int(rng.integers(5_000, 50_001))
            payment  = int(rng.choice(PAYMENT_TERMS))

            # Validity window -- all records active (valid_to = NULL)
            days_ago   = int(rng.integers(30, 731))  # up to 2 years back
            valid_from = (today - timedelta(days=days_ago)).isoformat()

            rows.append({
                "supplier_id":                  sid,
                "supplier_name":                ent["supplier_name"],
                "country":                      ent["country"],
                "gmp_certified":                gmp,
                "risk_tier":                    risk,
                "sku_id":                       sku_id,
                "category":                     sku["category"],
                "unit_price":                   unit_price,
                "currency":                     "USD",
                "minimum_order_quantity":       moq,
                "payment_terms_days":           payment,
                "lead_time_days":               lead_time,
                "on_time_delivery_pct":         otd,
                "fill_rate_pct":                fill_rate,
                "quality_score":                quality,
                "defect_rate_pct":              defect,
                "max_capacity_units_per_month": capacity,
                "current_utilization_pct":      util,
                "valid_from":                   valid_from,
                "valid_to":                     "",  # NULL = currently active
            })

    return rows


# -- Step 4: compute suitability labels ---------------------------------------
def compute_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds two label columns and returns a new DataFrame:

      suitability_score  float [0, 1]  continuous target for regression
      is_preferred       bool          binary target for classification

    Formula (applied to a working copy; no internal columns leak to CSV):

      cost_score  = 1 - min-max(unit_price)   within each sku_id
      speed_score = 1 - min-max(lead_time)    within each sku_id
      base        = W_COST * cost_score
                  + W_LEAD * speed_score
                  + W_OTD  * on_time_delivery_pct
                  + W_QUALITY * quality_score

    Then, in order:
      1. GMP compliance penalty  -- base *= GMP_PENALTY for non-certified
         suppliers in "Active Ingredient" or "Excipient" categories. This
         reflects regulatory audit risk that dwarfs any price savings.

      2. Heteroscedastic Gaussian noise  -- sigma_i = NOISE_BASE +
         NOISE_BORDER * borderline_weight_i, where borderline_weight peaks
         at 1.0 when base == 0.5 and falls to 0 at the extremes. Suppliers
         near the decision boundary get the most noise because they are
         genuinely the hardest to classify in real procurement decisions.

      3. Clip to [0, 1], round to 4 d.p. -> suitability_score

      4. Threshold at the 38th percentile of the *noiseless* base scores.
         This keeps the threshold stable across re-runs with the same seed
         and produces a roughly 62/38 preferred/not-preferred split that
         reflects a realistic qualified-vendor list.

      5. Random label flips (FLIP_RATE) on is_preferred to simulate
         procurement overrides and annotation noise.
    """
    df = df.copy()

    # -- Per-SKU min-max normalisation ----------------------------------------
    def _minmax(x: pd.Series) -> pd.Series:
        lo, hi = x.min(), x.max()
        return (x - lo) / (hi - lo + 1e-9)

    df["_cost_score"]  = 1.0 - df.groupby("sku_id")["unit_price"].transform(_minmax)
    df["_speed_score"] = 1.0 - df.groupby("sku_id")["lead_time_days"].transform(_minmax)

    # -- Weighted base score --------------------------------------------------
    df["_base"] = (
        W_COST    * df["_cost_score"]
        + W_LEAD    * df["_speed_score"]
        + W_OTD     * df["on_time_delivery_pct"]
        + W_QUALITY * df["quality_score"]
    )

    # -- GMP compliance penalty -----------------------------------------------
    regulated  = df["category"].isin(["Active Ingredient", "Excipient"])
    penalised  = (~df["gmp_certified"]) & regulated
    df.loc[penalised, "_base"] *= GMP_PENALTY

    # -- Threshold: 38th percentile of noiseless scores ----------------------
    # Computed before noise is added so it doesn't shift with random draws.
    threshold = float(np.percentile(df["_base"], 38))

    # -- Heteroscedastic Gaussian noise ---------------------------------------
    # borderline_weight: 1.0 when base == 0.5, 0.0 at 0.0 or 1.0
    border_wt = (1.0 - (df["_base"] - 0.5).abs() * 2.0).clip(0.0, 1.0)
    sigma     = (NOISE_BASE + NOISE_BORDER * border_wt).to_numpy()
    noise     = rng.normal(loc=0.0, scale=sigma)

    df["suitability_score"] = (df["_base"].to_numpy() + noise).clip(0.0, 1.0).round(4)  # type: ignore[arg-type]

    # -- Binary label with random flips ---------------------------------------
    preferred  = df["suitability_score"].to_numpy() >= threshold
    flip_mask  = rng.random(len(df)) < FLIP_RATE
    df["is_preferred"] = preferred ^ flip_mask   # XOR flips the chosen rows

    # Drop all internal working columns (prefixed with _)
    internal = [c for c in df.columns if c.startswith("_")]
    return df.drop(columns=internal)


# -- Main ---------------------------------------------------------------------
def main() -> None:
    print("Step 1: building 120 supplier entities")
    entities = build_supplier_entities()
    assert len(entities) == 120, f"Expected 120 suppliers, got {len(entities)}"

    print("Step 2: assigning SKUs (non-uniform market concentration)")
    sup_to_skus = assign_skus(entities)

    print("Step 3: generating supplier x SKU rows")
    rows = generate_rows(entities, sup_to_skus)
    df   = pd.DataFrame(rows)

    print("Step 4: computing suitability labels")
    df = compute_labels(df)

    df.to_csv(OUT_CSV, index=False)

    sep = "-" * 60

    # -- Coverage summary
    print(f"\n{sep}")
    print(f"Output : {OUT_CSV}")
    print(f"Rows   : {len(df)}  ({df['supplier_id'].nunique()} unique suppliers)")
    print()

    print("SKU market concentration:")
    print(f"  {'SKU':15s}  {'Suppliers':>9}  {'Target range':>14}")
    for sku in SKU_IDS:
        n   = df[df["sku_id"] == sku]["supplier_id"].nunique()
        lo  = SKU_TARGETS[sku]["min"]
        hi  = SKU_TARGETS[sku]["max"]
        ok  = "OK" if lo <= n <= hi else "!!"
        print(f"  {sku:15s}  {n:>9}  {lo}-{hi:>3}  {ok}")

    # -- Risk tier
    print()
    print("Risk tier (supplier level):")
    ent_df = pd.DataFrame([
        {"supplier_id": e["supplier_id"], "_archetype": e["_archetype"]}
        for e in entities
    ])
    merged = df.drop_duplicates("supplier_id")[["supplier_id", "risk_tier"]].merge(ent_df)
    for tier in ["LOW", "MEDIUM", "HIGH"]:
        n = (merged["risk_tier"] == tier).sum()
        print(f"  {tier:6s}  {n:>3}")

    # -- Archetype summary: shows price-quality relationship is non-linear
    print()
    print("Archetype summary (verify outliers break trivial correlation):")
    arch_map = {e["supplier_id"]: e["_archetype"] for e in entities}
    df["_archetype"] = df["supplier_id"].map(arch_map)

    # Tier labels for display ordering
    tier_order = {
        "PREMIUM": 1, "PREMIUM_SLOW": 2, "EXPENSIVE_UNRELIABLE": 3,
        "BALANCED": 4, "CHEAP_RELIABLE": 5, "FAST_BUDGET": 6,
        "ECONOMY": 7, "CHEAP_SLOW": 8, "LOW_QUALITY": 9,
    }
    arch_summary = (
        df.groupby("_archetype")
        .agg(
            n_sups      =("supplier_id",    "nunique"),
            avg_price   =("unit_price",     "mean"),
            avg_lead    =("lead_time_days",  "mean"),
            avg_quality =("quality_score",  "mean"),
            avg_defect  =("defect_rate_pct","mean"),
        )
        .round(3)
        .reset_index()
    )
    arch_summary["_order"] = arch_summary["_archetype"].map(tier_order)
    arch_summary = arch_summary.sort_values("_order").drop(columns="_order")
    arch_summary = arch_summary.rename(columns={"_archetype": "archetype"})
    print(arch_summary.to_string(index=False))

    # -- Label distribution ---------------------------------------------------
    print()
    print("Suitability label distribution:")
    n_pref   = df["is_preferred"].sum()
    n_total  = len(df)
    sc       = df["suitability_score"]
    print(f"  is_preferred = True  : {n_pref:>4}  ({n_pref/n_total*100:.1f}%)")
    print(f"  is_preferred = False : {n_total-n_pref:>4}  ({(n_total-n_pref)/n_total*100:.1f}%)")
    print(f"  suitability_score    : mean={sc.mean():.3f}  std={sc.std():.3f}"
          f"  p25={sc.quantile(0.25):.3f}  p50={sc.median():.3f}  p75={sc.quantile(0.75):.3f}")

    # -- Preferred rate by archetype (key sanity check) -----------------------
    # Outlier archetypes should produce non-obvious label patterns:
    #   CHEAP_RELIABLE    -> high preferred rate  (cheap != bad)
    #   FAST_BUDGET       -> high preferred rate  (fast != expensive)
    #   EXPENSIVE_UNRELIABLE -> low preferred rate  (expensive != good)
    #   PREMIUM_SLOW      -> low-to-mid preferred rate  (premium != fast)
    print()
    print("Preferred rate by archetype (sanity check for outlier archetypes):")
    pref_by_arch = (
        df.groupby("_archetype")["is_preferred"]
        .agg(preferred="sum", total="count")
        .assign(pref_rate=lambda d: (d["preferred"] / d["total"]).round(2))
        .reset_index()
        .rename(columns={"_archetype": "archetype"})
    )
    pref_by_arch["_order"] = pref_by_arch["archetype"].map(tier_order)
    pref_by_arch = pref_by_arch.sort_values("_order").drop(columns="_order")
    print(pref_by_arch[["archetype", "preferred", "total", "pref_rate"]].to_string(index=False))

    print(sep)
    print("Done.")


if __name__ == "__main__":
    main()
