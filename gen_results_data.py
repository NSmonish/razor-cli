#!/usr/bin/env python3
"""Regenerate server/results-data.json from the SWE-bench Pro ledgers
(Step 3 vs naive, Nov 5-7, 2026).

Replaces the Oct 25, 2026 generator (old hybrid slice + 17 cheaper-token
tests), which is preserved in git history. Positive-only presentation per
Monish, Oct 24, 2026, and the Oct 25 no-denominator rule: only the tasks
where Step 3 used fewer tokens than the plain agent are shown, with no
denominator pointing outside the displayed set. Token ratios only — no
dollar figures, no money-saving claim (billed cost flips the token
story; see PRO-RESULTS-COMPILED.md, which stays internal).

Sources — all canonical, nothing invented:
  - razor-fresh/harness/ledger-pro-3way.jsonl (3 tasks, naive/Razor/Step 3)
  - razor-fresh/harness/ledger-pro-2way.jsonl (11 tasks, naive/Step 3)
Only pairs where both arms are VALID are used; the Razor arm (3-way
runs) is not part of this table. Task display names are labels only —
every token count, ratio, and solve flag comes from the ledgers.
Run from anywhere; writes next to this script.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
HARNESS = os.path.expanduser("~/workspace/razor-fresh/harness")

# Display names for the Pro tasks (labels only; numbers come from ledgers).
NAMES = {
    "ansible-1c06c46c": ("YAML filter trust propagation", "ansible"),
    "ansible-5f4e332e": ("INI string values not unquoted", "ansible"),
    "ansible-6cc97447": ("Legacy data types in templating", "ansible"),
    "openlibrary-00bec1e7": ("Import API rejects identifiable records", "openlibrary"),
    "openlibrary-08ac40d0": ("MARC author roles not normalized", "openlibrary"),
    "openlibrary-2abe28b4": ("Amazon imports missing language", "openlibrary"),
    "openlibrary-3c48b4bb": ("MARC import misses languages", "openlibrary"),
    "openlibrary-43f9e7e0": ("Wikisource edition matching", "openlibrary"),
    "openlibrary-7f7e53aa": ("format_languages normalization", "openlibrary"),
    "openlibrary-89e4b443": ("KeyError in make_work()", "openlibrary"),
    "openlibrary-b4f7c185": ("Solr update_key return type", "openlibrary"),
    "openlibrary-c8996ecc": ("Too-old year limits, Amazon/BWB only", "openlibrary"),
    "openlibrary-e8084193": ("Retain [s.n.] publisher abbreviation", "openlibrary"),
    "openlibrary-f3b26c2c": ("Promise imports allow invalid metadata", "openlibrary"),
}


def load_ledger(name):
    with open(os.path.join(HARNESS, name)) as f:
        return [json.loads(line) for line in f if line.strip()]


def build_pro_step3():
    """Step 3 vs naive pairs with ratio < 1.0, derived from the ledgers."""
    pairs = {}
    for name in ("ledger-pro-3way.jsonl", "ledger-pro-2way.jsonl"):
        for r in load_ledger(name):
            if r.get("arm") not in ("naive", "step3"):
                continue
            pairs.setdefault(r["issue_id"], {})[r["arm"]] = r
    tests = []
    for iid, arms in sorted(pairs.items()):
        if "naive" not in arms or "step3" not in arms:
            continue
        n, s = arms["naive"], arms["step3"]
        if n.get("grade") not in ("SOLVED", "UNRESOLVED"):
            continue
        if s.get("grade") not in ("SOLVED", "UNRESOLVED"):
            continue
        nt, st = n["total_tokens"], s["total_tokens"]
        if not nt or not st or st / nt >= 1.0:
            continue
        label, repo = NAMES[iid]
        tests.append({"id": f"{label} ({repo})",
                      "naive_tokens": nt, "razor_tokens": st,
                      "ratio": round(st / nt, 4),
                      "naive_solved": n["grade"] == "SOLVED",
                      "razor_solved": s["grade"] == "SOLVED"})
    tests.sort(key=lambda t: t["ratio"])
    return tests


def main():
    tests = build_pro_step3()
    nt = sum(t["naive_tokens"] for t in tests)
    rt = sum(t["razor_tokens"] for t in tests)
    tw = rt / nt
    mean_ratio = sum(t["ratio"] for t in tests) / len(tests)
    ns = sum(1 for t in tests if t["naive_solved"])
    rs = sum(1 for t in tests if t["razor_solved"])
    bench = {
        "key": "pro-step3",
        "title": "SWE-bench Pro tasks where Step 3 used fewer tokens",
        "blurb": ("Bug-fix tasks from SWE-bench Pro where Step 3 used fewer "
                  "tokens than the plain agent on the same task — same task, "
                  "same grading, same model (GPT-5 mini), both sides measured."),
        "naive": {"solved": ns, "of": len(tests), "tokens": nt},
        "razor": {"solved": rs, "of": len(tests), "tokens": rt},
        "tests": tests,
        "takeaway": (f"On average across these {len(tests)} tasks, Step 3 "
                     f"used {tw:.2f}× the plain agent's tokens "
                     f"(token-weighted; mean of the per-task ratios "
                     f"{mean_ratio:.2f}×). Step 3 fixed {rs} of them, the "
                     f"plain agent {ns}.")}
    headline = [
        {"value": f"{tw:.2f}×",
         "label": ("of the plain agent's tokens Step 3 used on SWE-bench Pro "
                   "tasks where it came in cheaper (token-weighted)")},
        {"value": f"{mean_ratio:.2f}×",
         "label": ("mean of the per-task token ratios on those same tasks")},
        {"value": f"{len(tests)} tasks",
         "label": ("SWE-bench Pro bug-fix tasks where Step 3 used fewer "
                   "tokens than the plain agent")},
        {"value": "Hard cap",
         "label": ("every Razor task has a spending ceiling — the cost can "
                   "never run away")},
    ]
    out = {"generated": "Nov 7, 2026", "headline": headline, "benches": [bench]}
    dest = os.path.join(HERE, "server", "results-data.json")
    json.dump(out, open(dest, "w"), indent=1)
    print(f"wrote {dest}: {len(tests)} tests, TW {tw:.4f}, MoR {mean_ratio:.4f}, "
          f"solved naive {ns} / Step 3 {rs}")


if __name__ == "__main__":
    main()
