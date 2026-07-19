#!/usr/bin/env python3
"""Generate a realistic PE/PP Southeast-Asia dataset for the SupplAI demo.

Deterministic (no randomness) so results are reproducible. Grounded in real
2025-2026 reference points gathered from public reporting:
  - PP, Southeast Asia averaged ~USD 965/t across 2025; NE Asia ~USD 990/t Dec 2025.
  - Q1 2026 rally: China PP ~942 -> ~1,264/t (Jan->Mar); SE Asia tracked ~100/t below.
  - By mid-2026 NE Asia ~USD 1,420/t; SE Asia firm ~1,230-1,260/t.
  - Vietnam is the world's #1 polypropylene importer; Indonesia large; then
    Thailand/Malaysia (domestic producers); Singapore a smaller hub market.
Grade and market differentials reflect typical PE/PP spreads (LDPE dearest,
raffia/homopolymer cheapest; import-parity markets above producer markets).

Outputs two CSVs in the app's exact import format:
  - sales-history-sea.csv        (24 monthly points per product/market)
  - market-prices-history-sea.csv (18 monthly points per product/market)
"""
import csv
import math
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# 8 seeded grades (code -> family key used for price/volume shaping)
PRODUCTS = {
    'H110MA': 'PP_HOMO',      # PP Homopolymer, injection
    'T1000':  'PP_RAFFIA',    # PP Homopolymer, raffia (woven sacks)
    'K8003':  'PP_IMPACT',    # PP Impact Copolymer, automotive
    'C9001':  'PP_RANDOM',    # PP Random Copolymer, clear packaging
    'F7000':  'HDPE_FILM',    # HDPE Film
    'B5502':  'HDPE_BLOW',    # HDPE Blow moulding
    'R3840':  'LLDPE',        # LLDPE Rotomoulding
    'P4200':  'LDPE',         # LDPE Coating
}
MARKETS = ['Vietnam', 'Indonesia', 'Thailand', 'Malaysia', 'Singapore']

# --- PRICE MODEL (USD/tonne) -------------------------------------------------
# Base monthly path for "PP homopolymer, Vietnam import parity" (24 months,
# 2024-08 .. 2026-07). Stable-to-soft 2024, decline through 2025 (China self-
# sufficiency), sharp Q1 2026 rally, firm into mid-2026.
BASE_PRICE = {
    '2024-08': 1030, '2024-09': 1010, '2024-10': 1000, '2024-11': 995, '2024-12': 1005,
    '2025-01': 1015, '2025-02': 1025, '2025-03': 1030, '2025-04': 1010, '2025-05': 990,
    '2025-06': 975,  '2025-07': 965,  '2025-08': 960,  '2025-09': 985, '2025-10': 975,
    '2025-11': 965,  '2025-12': 960,  '2026-01': 980,  '2026-02': 1080, '2026-03': 1180,
    '2026-04': 1160, '2026-05': 1190, '2026-06': 1230, '2026-07': 1250,
}
# Grade premium vs PP homopolymer base (USD/t)
FAMILY_PRICE_OFFSET = {
    'PP_HOMO': 0, 'PP_RAFFIA': -10, 'PP_IMPACT': 70, 'PP_RANDOM': 90,
    'HDPE_FILM': 20, 'HDPE_BLOW': 10, 'LLDPE': 40, 'LDPE': 130,
}
# Market differential vs Vietnam (USD/t)
MARKET_PRICE_OFFSET = {'Vietnam': 0, 'Indonesia': 15, 'Thailand': -10, 'Malaysia': -30, 'Singapore': 25}

# --- VOLUME MODEL (tonnes / month) ------------------------------------------
# Product base monthly volume — commodity grades move the most tonnes.
FAMILY_BASE_VOLUME = {
    'PP_HOMO': 520, 'PP_RAFFIA': 610, 'PP_IMPACT': 340, 'PP_RANDOM': 420,
    'HDPE_FILM': 560, 'HDPE_BLOW': 500, 'LLDPE': 360, 'LDPE': 300,
}
# Relative market size (Vietnam #1 importer, Singapore smallest domestic).
MARKET_VOLUME_WEIGHT = {'Vietnam': 1.30, 'Indonesia': 1.15, 'Thailand': 0.95, 'Malaysia': 0.90, 'Singapore': 0.60}

PRICE_MONTHS = list(BASE_PRICE.keys())[-18:]           # last 18 months of prices
SALES_MONTHS = list(BASE_PRICE.keys())                 # full 24 months of sales


def price(code, family, market, month):
    p = BASE_PRICE[month] + FAMILY_PRICE_OFFSET[family] + MARKET_PRICE_OFFSET[market]
    # tiny deterministic per-series micro-differential so grades aren't identical
    micro = ((hash((code, market)) % 11) - 5)  # +/-5 USD
    return round(p + micro)


def volume(code, family, market, month, idx):
    base = FAMILY_BASE_VOLUME[family] * MARKET_VOLUME_WEIGHT[market]
    # gentle underlying demand growth over the 24 months (~0.45%/mo)
    trend = 1 + 0.0045 * idx
    # mild seasonality: consumer-packaging demand firmer in H2 / year-end
    m = int(month[5:7])
    seasonal = 1 + 0.09 * math.sin((m / 12.0) * 2 * math.pi - 0.6)
    # deterministic +/-3% texture per (product, market, month)
    micro = 1 + (((hash((code, market, month)) % 61) - 30) / 1000.0)
    return int(round(base * trend * seasonal * micro))


def trend_label(prev, cur):
    if prev is None:
        return 'STABLE', 0.0
    change = (cur - prev) / prev * 100
    if change >= 1.0:
        return 'UP', round(change, 1)
    if change <= -1.0:
        return 'DOWN', round(change, 1)
    return 'STABLE', round(change, 1)


def write_prices():
    path = os.path.join(OUT_DIR, 'market-prices-history-sea.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['productCode', 'marketCountry', 'signalDate', 'marketPricePerUnit',
                    'currency', 'source', 'reliabilityScore', 'trend', 'percentageChange'])
        rows = 0
        for code, family in PRODUCTS.items():
            for market in MARKETS:
                prev = None
                for month in PRICE_MONTHS:
                    cur = price(code, family, market, month)
                    tr, pct = trend_label(prev, cur)
                    w.writerow([code, market, f'{month}-15', cur, 'USD',
                                'SEA CFR public reporting (proxy, 2024-2026)', 0.9, tr, pct])
                    prev = cur
                    rows += 1
    return path, rows


def write_sales():
    path = os.path.join(OUT_DIR, 'sales-history-sea.csv')
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['productCode', 'marketCountry', 'period', 'quantity'])
        rows = 0
        for code, family in PRODUCTS.items():
            for market in MARKETS:
                for idx, month in enumerate(SALES_MONTHS):
                    w.writerow([code, market, month, volume(code, family, market, month, idx)])
                    rows += 1
    return path, rows


if __name__ == '__main__':
    pp, pr = write_prices()
    sp, sr = write_sales()
    print(f'wrote {pr} price rows  -> {pp}')
    print(f'wrote {sr} sales rows  -> {sp}')
