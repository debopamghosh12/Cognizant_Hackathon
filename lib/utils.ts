import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Defaults to 2 decimal places -- every individual amount (a PO/invoice/
// line-item total) should show the real stored value, not a rounded one
// that silently stops matching a related number shown elsewhere on the
// same or another page (e.g. a ₹19.50 PO total that displayed as "₹20" no
// longer agreed with the same amount shown precisely on its PDF -- two
// numbers that were always identical looked inconsistent purely from
// display rounding). maximumFractionDigits is only worth overriding for
// the rare aggregate/KPI case (a summed total across many records, where
// a rounded headline number is the right call) or a unit price that
// genuinely needs more than 2 decimals to be exact (e.g. ₹0.065/unit) --
// minimumFractionDigits tracks it (capped at 2) so an explicit 0 still
// renders as a clean whole-rupee amount instead of forcing ".00".
export function formatCurrency(value: number, currency = "INR", maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.min(2, maximumFractionDigits),
    maximumFractionDigits,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
