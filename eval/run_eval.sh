#!/usr/bin/env bash
# Razor eval harness — run the scaffold on the 20 launch-eval repos and record
# what it detected for each. Deterministic (RAZOR_NO_LLM=1), so results are
# reproducible. Outputs a results table to eval/results.txt.
#
# Usage (from the repo root):
#   bash eval/run_eval.sh
#
# Requires: node, git, and `npm install` already done in the repo root.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${RAZOR_EVAL_DIR:-/tmp/razor-eval}"
OUT="$ROOT/eval/results.txt"
CASES="$ROOT/eval/eval_cases.txt"

mkdir -p "$WORK/src" "$WORK/pack"
: > "$OUT"
{
  echo "Razor eval results"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "razor-cli commit: $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo n/a)"
  echo "Mode: scaffold with RAZOR_NO_LLM=1 (deterministic, no LLM)"
  echo "----------------------------------------------------------------------"
} >> "$OUT"

run_case () {
  local name="$1" url="$2"
  local d="$WORK/src/$name" p="$WORK/pack/$name"
  rm -rf "$d" "$p"
  if ! git clone --depth 1 "$url" "$d" >/dev/null 2>&1; then
    echo "$name | CLONE_FAILED | $url" >> "$OUT"; return
  fi
  RAZOR_NO_LLM=1 node "$ROOT/index.js" scaffold "$d" -o "$p" >/dev/null 2>&1 || {
    echo "$name | SCAFFOLD_FAILED" >> "$OUT"; return; }

  node -e '
    const fs=require("fs"),path=require("path"),cp=require("child_process");
    const root=process.argv[1], src=process.argv[2], pack=process.argv[3], name=process.argv[4];
    const scan=JSON.parse(cp.execSync("node "+root+"/index.js scan "+JSON.stringify(src)).toString());
    let skills=[]; try{skills=fs.readdirSync(path.join(pack,"skills"))}catch(e){}
    let check=""; try{check=fs.readFileSync(path.join(pack,"scripts","check.sh"),"utf8").trim().split("\n").slice(3).join(" ; ")}catch(e){}
    const files=(function w(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())r=r.concat(w(f));else r.push(f)}return r})(pack).length;
    console.log(name+" | lang="+scan.language+" fw="+scan.framework+" test="+scan.testing+" orm="+scan.orm+
                " | skills="+(skills.join(",")||"-")+" | check="+(check||"-")+" | files="+files);
  ' "$ROOT" "$d" "$p" "$name" >> "$OUT"
}

# read "name<TAB or space>url" lines from eval_cases.txt
while read -r name url; do
  [ -z "$name" ] && continue
  case "$name" in \#*) continue;; esac
  echo "running $name ..."
  run_case "$name" "$url"
done < "$CASES"

echo "----------------------------------------------------------------------" >> "$OUT"
echo "Done. See $OUT"
cat "$OUT"
