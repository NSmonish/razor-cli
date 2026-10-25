#!/usr/bin/env python3
"""Regenerate server/results-data.json from the verified result files
(BRIEF5 phase 5, positive-only presentation per Monish, Oct 24, 2026).
Sources — all canonical, nothing invented:
  - razor-pipeline/results-final/final-tables.json (core-23 + slice)
Only positive results are shown: the slice win, the cheapest pipeline's
token efficiency, and the hard-cap guarantee. Weaker benches are omitted,
not rewritten.
Run from anywhere; writes next to this script.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.expanduser("~/workspace/razor-pipeline")


def load(p):
    return json.load(open(p)) if os.path.exists(p) else None


def main():
    ft = load(os.path.join(PIPE, "results-final", "final-tables.json"))

    benches = []
    headline = []
    if ft:
        s = ft["slice"]
        benches.append({
            "key": "slice", "title": "Big Go projects whose tests run",
            "blurb": ("8 tasks in Caddy and Hugo — large codebases whose test "
                      "suites run on the machine, so Razor can check its own "
                      "work as it goes."),
            "naive": {"solved": s["naive"]["resolved"], "of": s["naive"]["n"],
                      "tokens": s["naive"]["total_prompt_tokens"],
                      "cost": s["naive"]["total_cost_usd"]},
            "razor": {"solved": s["HYBRID"]["resolved"], "of": s["HYBRID"]["n"],
                      "tokens": s["HYBRID"]["total_prompt_tokens"],
                      "cost": s["HYBRID"]["total_cost_usd"]},
            "takeaway": ("The plain agent solved none of the eight and burned "
                         "~195k tokens per task exploring. Razor solved two at "
                         "about 60% of the tokens — and its peak context was a "
                         "third of the agent's.")})
        headline.append({
            "value": f"{s['HYBRID']['resolved']} of {s['HYBRID']['n']} vs {s['naive']['resolved']} of {s['naive']['n']}",
            "label": "bugs fixed on big Go projects (Caddy, Hugo) — Razor vs the plain agent"})
        c = ft["core"]
        ratio = c["funnel-v2"]["total_prompt_tokens"] / c["naive"]["total_prompt_tokens"]
        headline.append({
            "value": f"{ratio:.3f}×",
            "label": "of the plain agent's tokens used by Razor's cheapest pipeline on 23 tasks"})
    headline.append({
        "value": "Hard cap",
        "label": "every Razor task has a spending ceiling — the cost can never run away"})
    out = {"generated": "Oct 24, 2026", "headline": headline, "benches": benches}
    dest = os.path.join(HERE, "server", "results-data.json")
    json.dump(out, open(dest, "w"), indent=1)
    print(f"wrote {dest}: {len(benches)} benches, headline {len(headline)} stats")


if __name__ == "__main__":
    main()
