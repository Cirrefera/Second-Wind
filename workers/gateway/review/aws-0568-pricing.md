# AWS-0568 version 2 price review

The existing full-product maximum is preserved at $0.50 USDC. Pricing version 1 declares the following fixed allocation before a trial or purchase:

| What the product includes | Share | Exact USDC price |
| --- | ---: | ---: |
| Agent/session table plan, readiness sequence and verification | 50% | $0.25 |
| Status query index plan and verification | 20% | $0.10 |
| Item expiry configuration and verification | 10% | $0.05 |
| Point-in-time recovery configuration and verification | 10% | $0.05 |
| Change stream configuration and verification | 10% | $0.05 |

The base table is required by each optional feature. The allocation gives the common planner half of the price, the index configuration a larger share than the individual settings, and equal shares to the three individual settings. Prices reflect this declared product decision, not source size, inference cost, telemetry value or an inferred willingness to pay.

All 16 valid choices have deterministic integer prices from $0.25 to $0.50. The selected entry point and files execute in the sandbox, and their package hash is bound to the exact charge before acceptance. AWS service charges are outside this product price; the planner makes no AWS calls.

This is a draft pricing decision, tested but not published. The operator's publication review must bind the exact allocation and public contract. Changing the allocation requires a new immutable release and pricing version. Historical purchases retain their original amount and files.
