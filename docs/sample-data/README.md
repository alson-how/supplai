# Sample data — PE/PP Southeast Asia

Ready-to-import CSVs for demoing SupplAI on realistic data. Import them from the
**Data import** screen (or `POST /api/imports/:entity`) in this order:

| File | Import as | Rows | What it drives |
|---|---|---|---|
| `sales-history-sea.csv` | `sales` | 960 | Real 24-month demand history → the demand forecast / command centre |
| `market-prices-history-sea.csv` | `market-prices` | 720 | 18-month price series → the optimiser's margins and allocation |
| `market-prices-sea-2026.csv` | `market-prices` | 40 | A single-date July-2026 price snapshot (alternative to the series) |

All files match the app's exact import headers and validate with **0 invalid rows**.
Use `mode: validate` for a dry run, then `mode: commit` to persist.

## How realistic is this?

The numbers are **synthetic but grounded in real 2024–2026 public reference points**,
not random. They are generated deterministically by `generate_sea_dataset.py`
(re-run it to reproduce byte-for-byte). Anchors used:

- **Prices** — PP in Southeast Asia averaged ~USD 965/t across 2025; NE Asia ~USD
  990/t in Dec 2025. Q1 2026 saw a sharp rally (China PP ~942 → ~1,264/t Jan→Mar);
  by mid-2026 NE Asia ~USD 1,420/t with SE Asia firm ~1,230–1,260/t. Grade spreads
  follow the usual order (LDPE dearest; homopolymer/raffia cheapest) and import
  markets sit above producer markets.
- **Volumes** — relative market sizes reflect real trade: **Vietnam is the world's
  #1 polypropylene importer**, Indonesia is large, Thailand/Malaysia are producer
  markets, Singapore is a smaller hub. Grades carry realistic base tonnages
  (raffia and film move the most), with gentle demand growth and mild seasonality.

These are a stand-in so the demo runs on convincing, cite-able shapes. For a
production pilot, replace them with authentic exports:

- **Prices (free):** businessanalytiq PP/PE price indices; Trading Economics.
- **Demand volumes (free):** UN Comtrade / World Bank WITS / OEC import tonnage by
  country for HS **3901** (polyethylene) and **3902** (polypropylene). Netweight
  (kg) ÷ 1000 = tonnes → the `quantity` column.
- **Granular commercial (paid):** ICIS, Intratec, ChemAnalyst; Volza for
  shipment-level records.

The column formats above are exactly what those exports need to be shaped into —
the generator is a convenient template for that transform.

## Regenerate

```bash
python3 docs/sample-data/generate_sea_dataset.py
```
