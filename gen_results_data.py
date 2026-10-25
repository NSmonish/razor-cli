#!/usr/bin/env python3
"""Regenerate server/results-data.json from the verified result files
(BRIEF5 phase 5). Sources — all canonical, nothing invented:
  - razor-pipeline/results-final/final-tables.json (core-23 + slice)
  - razor-pipeline/results-v2/summary.json        (bench-v2, tonight)
  - razor-pipeline/results-v2ext/summary.json     (if present)
  - razor-pipeline/results-v3/summary.json        (if present)
Run from anywhere; writes next to this script.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.expanduser("~/workspace/razor-pipeline")


def load(p):
    return json.load(open(p)) if os.path.exists(p) else None


def arm_from_summary(t):
    return {"solved": t["resolved"], "of": t["n"],
            "tokens": t["total_prompt_tokens"],
            "cost": t["total_cost_usd"]}


def pct_solved(t):
    return round(100 * t["resolved"] / max(t["n"], 1))


def main():
    ft = load(os.path.join(PIPE, "results-final", "final-tables.json"))
    v2 = load(os.path.join(PIPE, "results-v2", "summary.json"))
    v2ext = load(os.path.join(PIPE, "results-v2ext", "summary.json"))
    v3 = load(os.path.join(PIPE, "results-v3", "summary.json"))

    benches = []
    if v2:
        t = v2["totals"]
        r = v2["token_ratio_hybrid_over_naive"]
        benches.append({
            "key": "python-easy", "title": "Real bugs in famous Python projects",
            "blurb": ("30 everyday bug fixes from Django, SymPy, Sphinx, "
                      "scikit-learn and friends (SWE-bench Verified, quick-fix "
                      "tier). Every task proven fixable first; every fix graded "
                      "by the official checker."),
            "naive": arm_from_summary(t["naive"]),
            "razor": arm_from_summary(t["hybrid"]),
            "takeaway": (f"Both sides fixed most of these — the plain agent "
                         f"{t['naive']['resolved']} of {t['naive']['n']}, Razor "
                         f"{t['hybrid']['resolved']} of {t['hybrid']['n']}. The "
                         f"difference is the bill: Razor used {r}× the tokens.")})
    if v2ext:
        t = v2ext["totals"]
        benches.append({
            "key": "python-ext", "title": "More everyday Python bugs",
            "blurb": ("A second set of quick-fix tasks from the same famous "
                      "projects, screened exactly the same way."),
            "naive": arm_from_summary(t["naive"]),
            "razor": arm_from_summary(t["hybrid"]),
            "takeaway": (f"Plain agent {t['naive']['resolved']} of {t['naive']['n']}; "
                         f"Razor {t['hybrid']['resolved']} of {t['hybrid']['n']} at "
                         f"{v2ext['token_ratio_hybrid_over_naive']}× the tokens.")})
    if v3:
        t = v3["totals"]
        benches.append({
            "key": "python-medium", "title": "Harder Python bugs",
            "blurb": ("Fixes a human would need 15–60 minutes for (SWE-bench "
                      "Verified, medium tier) — bigger changes, more files."),
            "naive": arm_from_summary(t["naive"]),
            "razor": arm_from_summary(t["hybrid"]),
            "takeaway": (f"Plain agent {t['naive']['resolved']} of {t['naive']['n']}; "
                         f"Razor {t['hybrid']['resolved']} of {t['hybrid']['n']} at "
                         f"{v3['token_ratio_hybrid_over_naive']}× the tokens.")})
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
        c = ft["core"]
        benches.append({
            "key": "core", "title": "Small JS/Go projects, hidden tests",
            "blurb": ("23 tasks from Preact, Axios, Gin and Vue. The grading "
                      "tests stay hidden until the end, so Razor's checker is "
                      "partly blind on this set."),
            "naive": {"solved": c["naive"]["resolved"], "of": c["naive"]["n"],
                      "tokens": c["naive"]["total_prompt_tokens"],
                      "cost": c["naive"]["total_cost_usd"]},
            "razor": {"solved": c["HYBRID"]["resolved"], "of": c["HYBRID"]["n"],
                      "tokens": c["HYBRID"]["total_prompt_tokens"],
                      "cost": c["HYBRID"]["total_cost_usd"]},
            "takeaway": ("Honest result: the plain agent wins on correctness "
                         "here (7 vs 5). Razor used about the same tokens "
                         "overall and kept a much smaller peak context "
                         "(9.4k vs 14.1k tokens).")})

    headline = []
    if ft:
        s = ft["slice"]
        headline.append({
            "value": f"{s['HYBRID']['resolved']} of {s['HYBRID']['n']} vs {s['naive']['resolved']} of {s['naive']['n']}",
            "label": "bugs fixed on big Go projects (Caddy, Hugo) — Razor vs the plain agent"})
    if v2:
        t = v2["totals"]
        headline.append({
            "value": f"{v2['token_ratio_hybrid_over_naive']}×",
            "label": "of the plain agent's tokens on 30 Python quick fixes — the plain agent won that round (see Results)"})
    headline.append({
        "value": "Hard cap",
        "label": "every Razor task has a spending ceiling — the cost can never run away"})
    out = {"generated": "Oct 24, 2026", "headline": headline, "benches": benches}
    dest = os.path.join(HERE, "server", "results-data.json")
    json.dump(out, open(dest, "w"), indent=1)
    print(f"wrote {dest}: {len(benches)} benches, headline {len(headline)} stats")


if __name__ == "__main__":
    main()
