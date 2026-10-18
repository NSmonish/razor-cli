#!/usr/bin/env node
// Build an interactive, self-contained HTML viewer for a Razor context pack.
// Sidebar lists every file; clicking one reveals its content (hidden until clicked).
// Markdown is rendered via a CDN marked.js; code files shown as-is. No server.
// usage: node view_pack.js <pack-dir> [out.html]
const fs = require('fs');
const path = require('path');

const pack = process.argv[2];
const out = process.argv[3] || '/tmp/razor-pack-view.html';
if (!pack || !fs.existsSync(pack)) {
  console.error('usage: node view_pack.js <pack-dir> [out.html]');
  process.exit(1);
}

// collect files in a sensible demo order
function walk(dir) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) r = r.concat(walk(f));
    else r.push(f);
  }
  return r;
}
const order = (rel) => {
  const o = ['AGENTS.md', 'overview.md', 'architecture.md', 'workflows.md',
    'verification.md', 'steering.md'];
  const i = o.indexOf(rel);
  if (i >= 0) return i;
  if (rel.startsWith('skills/')) return 20;
  if (rel.endsWith('check.sh')) return 30;
  if (rel.endsWith('skills.index.json')) return 31;
  return 25;
};

const files = walk(pack)
  .map((f) => ({ rel: path.relative(pack, f), abs: f }))
  .sort((a, b) => order(a.rel) - order(b.rel) || a.rel.localeCompare(b.rel))
  .map(({ rel, abs }) => ({
    rel,
    kind: rel.endsWith('.md') ? 'md' : (rel.endsWith('.json') ? 'json' : (rel.endsWith('.sh') ? 'bash' : 'text')),
    content: fs.readFileSync(abs, 'utf8'),
  }));

const data = JSON.stringify(files);
const packName = path.basename(pack);

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Razor Context Pack — ${packName}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<style>
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1f24}
header{background:#1f3864;color:#fff;padding:16px 24px}
header h1{margin:0;font-size:1.25rem}
header .sub{opacity:.8;font-size:.85rem;margin-top:2px}
.layout{display:flex;min-height:calc(100vh - 64px)}
.sidebar{width:290px;background:#f7f9fc;border-right:1px solid #e5e9f0;padding:14px 0;overflow-y:auto}
.sidebar .group{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#8a94a6;padding:12px 20px 4px}
.sidebar a{display:block;padding:8px 20px;color:#1b1f24;text-decoration:none;font-size:.9rem;cursor:pointer;border-left:3px solid transparent}
.sidebar a:hover{background:#eef2f8}
.sidebar a.active{background:#e6edf7;border-left-color:#1f3864;font-weight:600}
.content{flex:1;padding:28px 40px;overflow-y:auto;max-width:900px}
.placeholder{color:#8a94a6;margin-top:40px;font-size:1.05rem}
.content h1{color:#1f3864;font-size:1.5rem}
.content h2{color:#1f3864;border-bottom:2px solid #e5e9f0;padding-bottom:.2rem}
code{background:#f2f4f8;padding:.1rem .35rem;border-radius:4px;font-size:.9em}
pre{background:#0f1b2d;color:#e6edf3;padding:14px 16px;border-radius:8px;overflow-x:auto}
pre code{background:none;color:inherit;padding:0}
blockquote{border-left:4px solid #1f3864;margin:.6rem 0;padding:.3rem .9rem;color:#555;background:#f7f9fc}
.filetag{display:inline-block;font-size:.7rem;background:#e6edf7;color:#1f3864;padding:1px 7px;border-radius:10px;margin-left:6px}
</style></head><body>
<header><h1>Razor Context Pack</h1><div class="sub">${packName} — click a file to view its content</div></header>
<div class="layout">
  <nav class="sidebar" id="sidebar"></nav>
  <main class="content" id="content"><div class="placeholder">← Select a file from the left to view it.</div></main>
</div>
<script>
const FILES = ${data};
const sb = document.getElementById('sidebar');
const content = document.getElementById('content');
function groupOf(rel){
  if(rel==='AGENTS.md') return 'Entry';
  if(rel.startsWith('skills/')) return 'Skills';
  if(rel.endsWith('.sh')||rel.endsWith('.json')) return 'Tooling';
  return 'Docs';
}
let groups={};
FILES.forEach((f,i)=>{(groups[groupOf(f.rel)]=groups[groupOf(f.rel)]||[]).push(i)});
['Entry','Docs','Skills','Tooling'].forEach(g=>{
  if(!groups[g]) return;
  const h=document.createElement('div');h.className='group';h.textContent=g;sb.appendChild(h);
  groups[g].forEach(i=>{
    const a=document.createElement('a');a.textContent=FILES[i].rel;a.dataset.i=i;
    a.onclick=()=>show(i,a);sb.appendChild(a);
  });
});
function show(i,el){
  document.querySelectorAll('.sidebar a').forEach(x=>x.classList.remove('active'));
  if(el) el.classList.add('active');
  const f=FILES[i];
  if(f.kind==='md'){content.innerHTML=marked.parse(f.content);}
  else{const lang=f.kind;const pre=document.createElement('pre');const code=document.createElement('code');
    code.textContent=f.content;pre.appendChild(code);content.innerHTML='<h1>'+f.rel+'</h1>';content.appendChild(pre);}
}
</script></body></html>`;

fs.writeFileSync(out, html);
console.log('rendered:', out);
