# Razor Eval

Reproducible evaluation of Razor's `scaffold` on 20 real, popular,
production-grade repositories (small libraries → large multi-language codebases).

## Files

- `eval_cases.txt` — the 20 repos (name + git URL).
- `run_eval.sh` — clones each repo and runs `scaffold --offline`, recording the
  detected stack, skills, check command, and file count. Regenerates `results.txt`.
- `results.txt` — the recorded outputs for all 20 repos.

## Run it yourself

From the repo root (after `npm install`):

```bash
bash eval/run_eval.sh
```

Clones go to `/tmp/razor-eval` by default (override with `RAZOR_EVAL_DIR`).
Note: this clones large repos (PyTorch, TensorFlow, Kubernetes, gRPC are
multi-GB) — expect it to take several minutes and some disk space. Delete
`/tmp/razor-eval` when done.

## Results summary

19/20 PASS (95%) under a strict criterion (correct stack + real build/test
commands + no hallucination + right-sized). The one hard failure is #11
(realworld — a meta/spec repo, not a real app). Full criterion, per-case
pass/fail judgement, failure analysis, and the LLM-enrichment spot-check are in
`../eval_launch_readiness.md`.

The run is `--offline` on purpose so results are deterministic and reproducible;
the optional LLM pass only rewrites prose wording and does not change detected
stack, commands, or skills.
