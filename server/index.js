// Razor skill registry — minimal cloud hub so a team can publish generated
// skills and pull them into any workspace. REST + a tiny HTML landing page.
//
// endpoints:
//   GET  /                      landing page (human-friendly)
//   GET  /health                liveness probe (for the host)
//   GET  /api/skills            list/search (?namespace=&q=)
//   GET  /api/skills/:ns/:name  pull one skill (full, with files)
//   POST /api/skills            publish (body: namespace,name,version,
//                               description,triggers,evidence,files)
//
// auth: if PUBLISH_TOKEN is set, POST requires header x-publish-token to match.
// if it's unset, the hub is open (fine for a demo/team instance).
const express = require('express');
const path = require('path');
const { createStore } = require('./store');

function createApp(store) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const nsOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,38}$/.test(s);
  const nameOk = (s) => typeof s === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(s);

  app.get('/health', (req, res) => res.json({ ok: true, store: store.kind }));

  app.get('/', (req, res) => {
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const origin = `${proto}://${req.get('host')}`;
    const logo = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#1f3864"/><text x="24" y="33" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="bold" fill="#ffffff" text-anchor="middle">R</text><path d="M9 40L39 8" stroke="#7fd4ff" stroke-width="3" stroke-linecap="round"/></svg>`;
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<title>Razor — Skill Registry</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:880px;margin:0 auto;padding:0 20px 60px;color:#1b1f24}
a{color:#1f3864}
code{background:#f2f4f8;padding:2px 6px;border-radius:4px}
pre{background:#0f1b2d;color:#e6edf3;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:14px}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #e6eaf0}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;color:#1f3864}
.nav nav a{margin-left:18px;text-decoration:none;font-size:15px}
.nav nav a.gh{border:1px solid #1f3864;border-radius:8px;padding:5px 14px}
.hero{text-align:center;padding:56px 0 40px}
.hero h1{font-size:38px;margin:22px 0 10px;color:#1b1f24}
.lede{font-size:18px;color:#3c4450;max-width:640px;margin:0 auto 26px}
.btn{display:inline-block;text-decoration:none;border:1px solid #1f3864;border-radius:10px;padding:10px 22px;margin:0 6px;font-weight:600}
.btn.primary{background:#1f3864;color:#fff}
.stats{display:flex;gap:14px;margin:10px 0 8px}
.stats div{flex:1;background:#f2f5fa;border-radius:10px;padding:14px 16px}
.stats b{display:block;font-size:22px;color:#1f3864}
.stats span{font-size:13.5px;color:#3c4450}
section{margin:44px 0}
section h2{font-size:26px;color:#1f3864;margin-bottom:10px}
.muted{color:#5b6472;font-size:14.5px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.step{border:1px solid #d8dee6;border-radius:10px;padding:14px 16px}
.step b{color:#1f3864}
.skill{border:1px solid #d8dee6;border-radius:8px;padding:12px 16px;margin:12px 0}
.skill h4{margin:0 0 4px;font-size:17px}.skill h4 .ver{font-weight:normal;color:#5b6472;font-size:13px}
.skill .desc{margin:4px 0;color:#333}.skill .tags{margin:6px 0}
.skill .tag{display:inline-block;background:#eef2f7;color:#1f3864;border-radius:10px;padding:1px 9px;margin:0 4px 4px 0;font-size:13px}
.skill .pullcmd{position:relative}.skill .pullcmd button{position:absolute;top:8px;right:8px;font-size:12px;padding:3px 10px;border:1px solid #9fb3c8;border-radius:6px;background:#fff;cursor:pointer}
#skills-empty{color:#5b6472}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
blockquote{border-left:4px solid #1f3864;background:#f7f9fc;border-radius:0 10px 10px 0;padding:14px 16px;margin:0;font-size:14.5px}
blockquote cite{display:block;margin-top:10px;font-style:normal;font-size:13px;color:#5b6472}
footer{border-top:1px solid #e6eaf0;margin-top:56px;padding-top:18px;color:#5b6472;font-size:14px;text-align:center}
</style></head>
<body>
<header class="nav"><div class="brand">${logo(34)}<span>Razor</span></div>
<nav><a href="#registry">Skills</a><a href="#how">How it works</a><a href="#example">Example</a><a href="#feedback">Feedback</a><a class="gh" href="https://github.com/NSmonish/razor-cli">GitHub</a></nav></header>

<section class="hero">
${logo(76)}
<h1>Your coding agent needs a teammate.</h1>
<p class="lede">Razor scans your repository, learns its conventions, and generates right-sized, token-efficient agent context packs — AGENTS.md, layered docs, and shareable skills.</p>
<div><a class="btn primary" href="#registry">Browse the skills</a><a class="btn" href="#start">Get started</a></div>
</section>

<section class="stats">
<div><b>10</b><span>user interviews with engineers at Google, Meta, Salesforce, Ericsson and more</span></div>
<div><b>&minus;2% / +23%</b><span>task-resolution drop / inference-cost spike from bloated LLM-generated context files (Gloaguen et al., 2026)</span></div>
<div><b>&frac13;</b><span>of the right context retrieved by SOTA models on ContextBench — the rest is wasted tokens</span></div>
</section>

<section id="problem">
<h2>The problem</h2>
<p>Deploying a coding agent into a complex codebase is like sending someone into the Butler Library stacks without a guide. The agent burns 100k tokens grepping for a pattern, comes back empty-handed, hallucinates conventions, and ignores how your repo actually works.</p>
<p>Hand-written or LLM-generated AGENTS.md files were supposed to fix this — but research shows generated repo-wide context files <i>lower</i> task success while raising cost. So developers hand-maintain instruction files that nobody keeps up to date.</p>
</section>

<section id="how">
<h2>How Razor works</h2>
<div class="steps">
<div class="step"><b>1. Scan</b><p>Razor scans your repo — framework, ORM, test runner, scripts, structure — and captures evidence for every detection.</p><pre>node index.js scaffold ./my-repo -o ./pack</pre></div>
<div class="step"><b>2. Publish</b><p>Share the generated skills with your team on this registry.</p><pre>node index.js publish ./pack --registry ${origin} --namespace team-alpha</pre></div>
<div class="step"><b>3. Pull</b><p>Anyone pulls just the skill they need, straight into their workspace.</p><pre>node index.js pull team-alpha/run-tests --registry ${origin} -o .agent</pre></div>
</div>
</section>

<section id="registry">
<h2>Published skills</h2>
<p class="muted">Live from this registry — refreshes automatically.</p>
<div id="skills"><p id="skills-empty">Loading…</p></div>
<p class="muted">Raw JSON: <a href="/api/skills">/api/skills</a></p>
</section>

<section id="example">
<h2>Example</h2>
<p>Scanning the razor-cli repo itself:</p>
<pre>$ node index.js scaffold ./razor-cli -o ./pack
Razor is scanning the repository...
Detected: Express.js / unknown / unknown
Plan size: 6 (docs: 4, skills: 1)

Context pack written to ./pack/ (8 files):
  AGENTS.md
  overview.md / architecture.md / workflows.md / steering.md
  skills/code-push/SKILL.md
  scripts/check.sh
  skills.index.json</pre>
<p>The generated <code>code-push</code> skill ("Verify then push changes to the remote") was published to this registry. Try pulling it:</p>
<pre>node index.js pull smoke/code-push --registry ${origin} -o ./demo</pre>
</section>

<section id="feedback">
<h2>What users say</h2>
<div class="quotes">
<blockquote>"It happens maybe 1/5 times where the agent gets something wrong and is taking too many prompts to fix. Usually it will cost me half a day's work to update things to my standards."<cite>— Melody, Software Engineer, Google</cite></blockquote>
<blockquote>"At work, I have near unlimited tokens so dont usually worry about usage limits. However, something that constraints me is context window... every time I load session im already at 20% of 1m context window."<cite>— Kevin, Software Engineer, Meta</cite></blockquote>
<blockquote>"I also say, by the way, some of the SQL files are over 100,000 characters long. Do not pull them all into your context."<cite>— Dillon, Lead SWE, Salesforce</cite></blockquote>
</div>
<p class="muted">From 10 user interviews conducted by the Razor team, Fall 2026.</p>
</section>

<section id="start">
<h2>Get started</h2>
<pre>git clone https://github.com/NSmonish/razor-cli &amp;&amp; cd razor-cli
npm install
node index.js scaffold ./your-repo -o ./pack</pre>
<p>Then publish your pack's skills here and share the pull command with your team.</p>
</section>

<footer>Built by the Razor team &middot; COMS E6998 &mdash; Build an Agent Startup, Columbia University &middot; <a href="https://github.com/NSmonish/razor-cli">GitHub</a></footer>

<script>
var ORIGIN = ${JSON.stringify(origin)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function render(skills){
  var box=document.getElementById('skills');
  if(!skills.length){box.innerHTML='<p id="skills-empty">No skills published yet — be the first.</p>';return;}
  box.innerHTML=skills.map(function(s){
    var full=esc(s.namespace)+'/'+esc(s.name);
    var cmd='node index.js pull '+s.namespace+'/'+s.name+' --registry '+ORIGIN+' -o .agent';
    var tags=(s.triggers||[]).slice(0,8).map(function(t){return '<span class="tag">'+esc(t)+'</span>';}).join('');
    return '<div class="skill"><h4><code>'+full+'</code> <span class="ver">v'+esc(s.version||'1')+'</span></h4>'
      +(s.description?'<p class="desc">'+esc(s.description)+'</p>':'')
      +(tags?'<div class="tags">'+tags+'</div>':'')
      +'<div class="pullcmd"><pre>'+esc(cmd)+'</pre><button onclick="copyCmd(this)">Copy</button></div></div>';
  }).join('');
}
function copyCmd(btn){
  var cmd=btn.parentElement.querySelector('pre').textContent;
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(cmd).then(function(){btn.textContent='Copied!';setTimeout(function(){btn.textContent='Copy';},1500);});}
  else{var t=document.createElement('textarea');t.value=cmd;document.body.appendChild(t);t.select();try{document.execCommand('copy');btn.textContent='Copied!';}catch(e){}document.body.removeChild(t);setTimeout(function(){btn.textContent='Copy';},1500);}
}
async function load(){
  try{var r=await fetch('/api/skills');var d=await r.json();render(d.skills||[]);}
  catch(e){document.getElementById('skills').innerHTML='<p id="skills-empty">Could not load skills.</p>';}
}
load();setInterval(load,30000);
</script>
</body></html>`);
  });

  app.get('/api/skills', async (req, res) => {
    try {
      const items = await store.list(req.query.namespace || null, req.query.q || null);
      res.json({ count: items.length, skills: items });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/skills/:ns/:name', async (req, res) => {
    try {
      const rec = await store.get(req.params.ns, req.params.name);
      if (!rec) return res.status(404).json({ error: 'not found' });
      res.json(rec);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/skills', async (req, res) => {
    const token = process.env.PUBLISH_TOKEN;
    if (token && req.get('x-publish-token') !== token) {
      return res.status(401).json({ error: 'bad or missing x-publish-token' });
    }
    const b = req.body || {};
    if (!nsOk(b.namespace)) return res.status(400).json({ error: 'invalid namespace (a-z0-9-, <=39 chars)' });
    if (!nameOk(b.name)) return res.status(400).json({ error: 'invalid skill name (kebab-case)' });
    if (!b.files || typeof b.files !== 'object' || !b.files['SKILL.md']) {
      return res.status(400).json({ error: 'files must include at least SKILL.md' });
    }
    try {
      const saved = await store.publish({
        namespace: b.namespace,
        name: b.name,
        version: typeof b.version === 'string' ? b.version : '1',
        description: typeof b.description === 'string' ? b.description : '',
        triggers: Array.isArray(b.triggers) ? b.triggers : [],
        evidence: typeof b.evidence === 'string' ? b.evidence : '',
        files: b.files,
      });
      res.status(201).json({ published: `${saved.namespace}/${saved.name}`, version: saved.version, updated_at: saved.updated_at });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return app;
}

async function start() {
  const store = createStore();
  await store.init();
  const app = createApp(store);
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Razor registry listening on :${port} (store: ${store.kind})`);
  });
}

if (require.main === module) start();

module.exports = { createApp };
