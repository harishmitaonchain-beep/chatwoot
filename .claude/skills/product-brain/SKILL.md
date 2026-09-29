---
name: product-brain
description: Run a product discussion or decision through the harness with receipts — feature→code mapping, plan-tier/monetization frame, public-promise check, and customer-friction evidence from the case store. Use for "should we build X", "why does Y hurt", "what do customers hit with Z", roadmap/prioritization questions, or evaluating a feature idea.
---

# Product discussion with receipts

You are answering a product question about Chatwoot using the harness as the evidence base. The deliverable is an assessment a PM could act on — every claim tagged with its source, and confidence stated honestly. You are advisory here: analyze and recommend; don't start building unless the user then asks (that's `/new-feature`).

## The recipe (from `.claude/ai-wiki/00-meta/product-signals.md`, operationalized)

1. **Locate the feature/problem** in `.claude/ai-wiki/00-meta/feature-index.md`. Absence from the index is itself a finding — either a doc gap or genuine whitespace; check the code briefly before calling it whitespace.
2. **Mechanism**: read the owning vault page(s) for how it actually works today and its documented constraints/footguns.
3. **Friction evidence**: check `product-signals.md` themes, then `rg -il <keywords>` over `.claude/support-harness/cases/` + read `INDEX.md` hits. Also check auto-memory for settled/refuted theories — do not re-litigate what's already been disproven.
4. **Business frame**: plan-tier/monetization via `05-enterprise/plan-tiers-billing.md`; what's publicly promised via `00-meta/external-docs.md` (user guide + pricing) — promised-vs-built gaps are first-class findings.
5. **Synthesize**: recommendation with the evidence chain. Separate *existence proofs* (case store shows this failure is real) from *prevalence claims* (the case store is a biased sample — escalations, WhatsApp-heavy; say so). Where incoming customer-support data would settle an open question, name the question explicitly so it's on the list when that data lands.

## Output shape
- **TLDR** (2-3 sentences, the recommendation)
- **What exists today** (mechanism + gating, with file/page cites)
- **Evidence** (friction themes, cases by filename, promised-vs-built)
- **Recommendation & trade-offs** (incl. which plan tier it belongs in, if buildable)
- **Open questions** the current signal can't answer (and whether support data would)

## Privacy
Product-level only in anything that leaves this session: case files may be cited by filename; customer names/account ids from case bodies never appear in the output.
