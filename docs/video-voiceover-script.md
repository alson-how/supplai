# SupplAI — Demo Video Voiceover Script

**Video:** `SupplAI-feature-tutorial.webm` · **Runtime:** ~1:48
**Target pace:** ~150 words/min (relaxed, confident). Total ≈ 265 words.
**Tip:** Let the full-screen **title cards** breathe — pause ~1 second on each, then start the line.

Timecodes are approximate — narrate to what's on screen, not to the clock.

---

| Time | On screen | Say (voiceover) |
|---|---|---|
| **0:00–0:03** | Title card: *SupplAI by GIFS* | "This is **SupplAI** — a decision co-pilot for petrochemical supply teams. It turns market signals into smarter supply decisions." |
| **0:03–0:08** | Sign-in | "Planners sign in through secure, role-based access. I'm logging in as a Commercial Planner." |
| **0:08–0:12** | Executive overview | "The dashboard opens on the health of the whole book — forecast demand, fulfilment, and forecast accuracy, all live." |
| **0:12–0:15** | Card: *1 · Demand Intelligence* | "First — Demand Intelligence." |
| **0:15–0:42** | Command centre, bar charts, filter, cross-filter, table | "This is our decision command centre. It answers three questions at a glance: **where** is demand, **what's** in demand, and can we **trust** the number. Markets are ranked by predicted tonnes — Vietnam leads, which matches the real world; it's the number-one polypropylene importer. I can filter to a single grade to see exactly where that product is wanted. And the charts are linked — click any bar and the other re-scopes instantly. Below, every product-market pair, each with a confidence band and a backtested accuracy score." |
| **0:42–0:45** | Card: *2 · Scenario Simulator* | "Next — the Scenario Simulator." |
| **0:45–1:12** | Create → assumptions → run → plan → recommendations → decision | "This is where a forecast becomes a **plan**. I create a what-if scenario and tune the assumptions — demand, price, cost, margins. Then I run the optimiser. **Google OR-Tools** computes the profit-maximising allocation against real inventory, production, credit and logistics limits — and it shows exactly why: binding constraints, unmet demand, exclusions. Every recommendation is ranked and explained — and the planner stays in control: approve, modify, or reject, with a reason, fully audited." |
| **1:12–1:15** | Card: *3 · AI Co-pilot* | "Now the part judges always ask about — the AI." |
| **1:15–1:35** | AI explanations + Ask the plan | "Two capabilities, and one hard rule: the AI **explains and answers — it never computes the numbers.** The solver owns those. Every recommendation comes with a plain-English rationale. And you can ask the plan questions directly — *what are the top opportunities, why was something excluded* — with answers grounded **only** in the optimiser's results. Never invented." |
| **1:35–1:38** | Card: *4 · Data Import* | "Finally — data." |
| **1:38–1:44** | CSV import | "Everything runs on your real numbers — products, customers, prices and sales import from CSV. Imported sales sharpen the forecast; prices and market news flow straight into the optimiser." |
| **1:44–1:48** | Outro card | "SupplAI — sense demand, optimise allocation, explain the trade-off, and decide with confidence. Thank you." |

---

## Delivery tips

- **Slow down on the numbers.** When Vietnam or the margin appears, land it — that's your proof it's real.
- **Emphasise the one differentiator:** *"the AI explains, the solver decides."* Judges reward a clear, trustworthy AI boundary.
- **Breathe on the title cards** (four of them). They're your natural section breaks.
- If you're running long, the easiest cuts are the sign-in and executive-overview lines — trim them to one short sentence each.

## 30-second elevator version (if you only get 30s)

> "SupplAI is a decision co-pilot for petrochemical supply teams. It forecasts demand across every product and market, then a Google OR-Tools optimiser turns that into a profit-maximising allocation plan — ranked, explained, and fully within inventory, credit and logistics limits. An AI layer explains every recommendation and answers questions in plain English, but it never touches the numbers — the solver owns those. Planners approve, modify or reject, and it's all audited. Everything runs on real imported data. From market signals to smarter supply decisions."

## Likely judge questions — quick answers

- **"Does the AI make the decisions?"** No — a constrained optimiser (OR-Tools) computes every number; the AI only explains and answers. That's a deliberate trust boundary.
- **"Is the data real?"** The demo runs on synthetic-but-grounded Southeast-Asia data anchored to real 2025–26 price levels and real trade flows (Vietnam is genuinely the #1 PP importer). It imports authentic CSVs the same way.
- **"What if the AI is unavailable?"** It degrades gracefully — a deterministic, key-free provider gives explanations and answers with zero API dependency, so the platform always works.
- **"Does changing an input actually change the plan?"** Yes — adjust an assumption, or import a price or a news signal, and the optimiser re-solves; the recommendations and margins move.
