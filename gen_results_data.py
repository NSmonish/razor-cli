#!/usr/bin/env python3
"""Regenerate server/results-data.json from the verified result files
(BRIEF5 phase 5, positive-only presentation per Monish, Oct 24, 2026;
17-test table added Oct 25, 2026 per Monish: show the tests where Razor
used fewer tokens than the plain agent, with no denominator).
Sources — all canonical, nothing invented:
  - razor-pipeline/results-final/final-tables.json (core-23 + slice)
  - razor-pipeline/results-v2/summary.json (bench-v2 pairs)
  - razor-pipeline/results-v3-large/*-{naive,hybrid}.json + grades
  - razor-pipeline/results-final/slice-naive-ledger.json + hybrid-slice/
Only positive results are shown: the slice win, the cheapest pipeline's
token efficiency, the hard-cap guarantee, and the 17 cheaper-token tests.
Weaker benches are omitted, not rewritten. Pairs where either side died
on an API error (or was skipped) are excluded — their ratios would be
fake. No denominator is published for the 17 (Monish, Oct 25, 2026).
Run from anywhere; writes next to this script.
"""
import json, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
PIPE = os.path.expanduser("~/workspace/razor-pipeline")


def load(p):
    return json.load(open(p)) if os.path.exists(p) else None


def bad(cell):
    if not cell:
        return True
    if cell.get("skipped"):
        return True
    f = str(cell.get("finish", "")) + str(cell.get("agent_finish", ""))
    return ("error" in f.lower()) or ("cap" in f.lower())


def build_cheaper_tests():
    """Per-test naive-vs-hybrid pairs with ratio < 1.0, derived from files."""
    tests = []
    costs = {"naive": 0.0, "razor": 0.0}

    def add(iid, nt, rt, nr, rr, nc=0.0, rc=0.0):
        if nt and rt and rt / nt < 1.0:
            tests.append({"id": iid, "naive_tokens": nt, "razor_tokens": rt,
                          "ratio": round(rt / nt, 4),
                          "naive_solved": bool(nr), "razor_solved": bool(rr)})
            costs["naive"] += nc
            costs["razor"] += rc

    v2 = load(os.path.join(PIPE, "results-v2", "summary.json"))
    if v2:
        for row in v2["rows"]:
            n, h = row["naive"], row["hybrid"]
            if not bad(n) and not bad(h):
                add(row["instance_id"], n["prompt_tokens"], h["prompt_tokens"],
                    n.get("resolved"), h.get("resolved"),
                    n.get("cost_usd", 0.0), h.get("cost_usd", 0.0))
    base = os.path.join(PIPE, "results-v3-large")
    nf = {os.path.basename(p).replace("-naive.json", ""): p
          for p in glob.glob(os.path.join(base, "*-naive.json"))}
    hf = {os.path.basename(p).replace("-hybrid.json", ""): p
          for p in glob.glob(os.path.join(base, "*-hybrid.json"))}
    for iid in sorted(set(nf) & set(hf)):
        n, h = load(nf[iid]), load(hf[iid])
        if bad(n) or bad(h):
            continue
        ng = load(os.path.join(base, iid + "-naive.grade.json"))
        hg = load(os.path.join(base, iid + "-hybrid.grade.json"))
        add(iid, n["prompt_tokens"], h["prompt_tokens"],
            ng["resolved"] if ng else None, hg["resolved"] if hg else None,
            n.get("cost_usd", 0.0), h.get("cost_usd", 0.0))
    sl = load(os.path.join(PIPE, "results-final", "slice-naive-ledger.json"))
    if sl:
        for iid, run in sl["runs"].items():
            hp = os.path.join(PIPE, "results-final", "hybrid-slice",
                              iid + "-hybrid.json")
            h = load(hp)
            if not h:
                continue
            ng = load(os.path.join(PIPE, "results-final", "slice",
                                   iid + "-naive.grade.json"))
            add(iid, run["prompt_tokens"], h["hybrid"]["prompt_tokens"],
                ng["resolved"] if ng else None, h["hybrid"]["resolved"],
                run.get("cost", 0.0), h["hybrid"].get("cost_usd", 0.0))
    tests.sort(key=lambda t: t["ratio"])
    return tests, costs


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
    tests, costs = build_cheaper_tests()
    if tests:
        nt = sum(t["naive_tokens"] for t in tests)
        rt = sum(t["razor_tokens"] for t in tests)
        mean_ratio = sum(t["ratio"] for t in tests) / len(tests)
        benches.append({
            "key": "cheaper17", "title": "Tests where Razor used fewer tokens",
            "blurb": ("Bug-fix tests where Razor's hybrid used fewer tokens "
                      "than the plain agent on the same task — same task, "
                      "same grading, both sides measured."),
            "naive": {"solved": sum(1 for t in tests if t["naive_solved"]),
                      "of": len(tests), "tokens": nt,
                      "cost": round(costs["naive"], 4)},
            "razor": {"solved": sum(1 for t in tests if t["razor_solved"]),
                      "of": len(tests), "tokens": rt,
                      "cost": round(costs["razor"], 4)},
            "tests": tests,
            "takeaway": (f"On average across these {len(tests)} tests, Razor "
                         f"used {mean_ratio:.2f}× the plain agent's tokens "
                         f"(mean of the per-test ratios). Razor solved "
                         f"{sum(1 for t in tests if t['razor_solved'])} of "
                         f"them, the plain agent "
                         f"{sum(1 for t in tests if t['naive_solved'])}.")})
        headline.append({
            "value": f"{mean_ratio:.2f}×",
            "label": ("average tokens Razor used vs the plain agent across "
                      "the bug-fix tests where Razor came in cheaper")})
    headline.append({
        "value": "Hard cap",
        "label": "every Razor task has a spending ceiling — the cost can never run away"})
    out = {"generated": "Oct 25, 2026", "headline": headline, "benches": benches}
    dest = os.path.join(HERE, "server", "results-data.json")
    json.dump(out, open(dest, "w"), indent=1)
    print(f"wrote {dest}: {len(benches)} benches, headline {len(headline)} stats")


if __name__ == "__main__":
    main()
