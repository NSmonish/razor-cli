// Razor skill registry — minimal cloud hub so a team can publish generated
// skills and pull them into any workspace. REST + multi-page site.
//
// endpoints:
//   GET  /                      home (product story)
//   GET  /guide                 how to launch Razor on your repo
//   GET  /skills                published skills (live, with pull commands)
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

const LOGO = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#1f3864"/><text x="24" y="33" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="bold" fill="#ffffff" text-anchor="middle">R</text><path d="M9 40L39 8" stroke="#7fd4ff" stroke-width="3" stroke-linecap="round"/></svg>`;

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:16px/1.65 -apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0a0f1e;color:#e9eef7}
a{color:#7fd4ff}
code{background:#1a2340;padding:2px 7px;border-radius:5px;font-size:.92em}
pre{background:#0d1326;border:1px solid #22304d;color:#dbe7ff;padding:16px 18px;border-radius:10px;overflow-x:auto;font-size:14px;line-height:1.55}
pre .p{color:#3ddc84}
.nav{position:sticky;top:0;z-index:10;background:rgba(10,15,30,.88);backdrop-filter:blur(10px);border-bottom:1px solid #1c2742}
.nav-inner{max-width:1080px;margin:0 auto;padding:13px 20px;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:19px;color:#fff;text-decoration:none}
.nav nav a{margin-left:22px;text-decoration:none;color:#9aa7bd;font-size:15px}
.nav nav a.active,.nav nav a:hover{color:#fff}
.nav nav a.gh{border:1px solid #5b9dff;border-radius:8px;padding:6px 15px;color:#fff}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.hero{text-align:center;padding:88px 20px 66px;position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;inset:-40px;background:radial-gradient(620px 320px at 50% 0%,rgba(91,157,255,.22),transparent 70%);pointer-events:none}
.hero h1{font-size:48px;line-height:1.15;margin:28px 0 14px;background:linear-gradient(92deg,#ffffff 20%,#9cc4ff 80%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{font-size:18.5px;color:#aeb9cf;max-width:660px;margin:0 auto 30px}
.btn{display:inline-block;text-decoration:none;border:1px solid #5b9dff;border-radius:10px;padding:11px 24px;margin:0 6px;font-weight:600;color:#fff}
.btn.primary{background:linear-gradient(92deg,#3b7de9,#5b9dff);border:none;box-shadow:0 6px 24px rgba(91,157,255,.35)}
.btn:hover{filter:brightness(1.12)}
.stats{display:flex;gap:14px;margin:6px 0}
.stats div{flex:1;background:#101832;border:1px solid #1c2742;border-radius:12px;padding:16px 18px}
.stats b{display:block;font-size:24px;color:#7fd4ff}
.stats span{font-size:13.5px;color:#9aa7bd}
section.block{margin:56px 0}
section.block h2{font-size:29px;margin-bottom:12px;color:#fff}
.muted{color:#9aa7bd;font-size:14.5px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:#101832;border:1px solid #1c2742;border-radius:12px;padding:18px 20px}
.card b{color:#7fd4ff}
.card h3{margin:0 0 6px;font-size:17px}
.stepnum{display:inline-block;background:linear-gradient(92deg,#3b7de9,#5b9dff);color:#fff;font-weight:700;border-radius:50%;width:30px;height:30px;line-height:30px;text-align:center;margin-bottom:8px;font-size:15px}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
blockquote{border:1px solid #1c2742;border-left:4px solid #5b9dff;background:#101832;border-radius:0 12px 12px 0;padding:16px 18px;margin:0;font-size:14.5px;color:#d5deef}
blockquote cite{display:block;margin-top:12px;font-style:normal;font-size:13px;color:#9aa7bd}
.skill{background:#101832;border:1px solid #1c2742;border-radius:10px;padding:14px 18px;margin:12px 0;transition:border-color .15s}
.skill:hover{border-color:#5b9dff}
.skill h4{margin:0 0 4px;font-size:17px}.skill h4 .ver{font-weight:normal;color:#9aa7bd;font-size:13px}
.skill .desc{margin:4px 0;color:#c3cede}.skill .tags{margin:8px 0}
.skill .tag{display:inline-block;background:#182448;color:#9cc4ff;border-radius:10px;padding:1px 10px;margin:0 5px 5px 0;font-size:13px}
.skill .pullcmd{position:relative}.skill .pullcmd button{position:absolute;top:8px;right:8px;font-size:12px;padding:4px 12px;border:1px solid #5b9dff;border-radius:7px;background:#0d1428;color:#fff;cursor:pointer}
#skills-empty{color:#9aa7bd}
.cta-band{background:linear-gradient(92deg,#16265c,#1f3864);border:1px solid #2c4a8f;border-radius:16px;padding:36px;text-align:center;margin:64px 0}
.cta-band h2{margin:0 0 8px;color:#fff}
.cta-band p{color:#b9c6e2;margin:0 0 20px}
footer{border-top:1px solid #1c2742;margin-top:70px;padding:34px 0 46px;color:#9aa7bd;font-size:14px}
.foot-grid{max-width:1080px;margin:0 auto;padding:0 20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:24px}
.foot-grid h4{color:#fff;margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em}
.foot-grid a{display:block;color:#9aa7bd;text-decoration:none;margin:6px 0}
.foot-grid a:hover{color:#fff}
.foot-bottom{max-width:1080px;margin:26px auto 0;padding:18px 20px 0;border-top:1px solid #1c2742;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
@media(max-width:640px){.hero h1{font-size:34px}.stats{flex-direction:column}}
`;

function layout({ title, active, origin, body }) {
  const nav = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${title} — Razor</title><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Razor scans your repository and generates right-sized, token-efficient agent context packs.">
<style>${CSS}</style></head>
<body>
<header class="nav"><div class="nav-inner">
<a class="brand" href="/">${LOGO(32)}<span>Razor</span></a>
<nav>${nav('/', 'Home', 'home')}${nav('/guide', 'Guide', 'guide')}${nav('/skills', 'Skills', 'skills')}<a class="gh" href="https://github.com/NSmonish/razor-cli">GitHub</a></nav>
</div></header>
<div class="wrap">${body}</div>
<footer><div class="foot-grid">
<div><h4>Product</h4><a href="/#problem">The problem</a><a href="/guide">How it works</a><a href="/skills">Skill registry</a></div>
<div><h4>Resources</h4><a href="https://github.com/NSmonish/razor-cli">GitHub repo</a><a href="/api/skills">Registry API</a><a href="/health">Health check</a></div>
<div><h4>Team</h4><a href="/#feedback">User feedback</a><span style="display:block;color:#9aa7bd;margin:6px 0">COMS E6998 — Build an Agent Startup</span><span style="display:block;color:#9aa7bd;margin:6px 0">Columbia University, Fall 2026</span></div>
</div><div class="foot-bottom"><span>Razor — give your coding agent a teammate.</span><span>Registry: ${origin}</span></div></footer>
</body></html>`;
}

function createApp(store) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const nsOk = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,38}$/.test(s);
  const nameOk = (s) => typeof s === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(s);
  app.get('/health', (req, res) => res.json({ ok: true, store: store.kind }));

  const getOrigin = (req) => `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;

  // ---- Home: product story ----
  app.get('/', (req, res) => {
    const origin = getOrigin(req);
    const body = `
<section class="hero">
${LOGO(84)}
<h1>Your coding agent needs a teammate.</h1>
<p class="lede">Razor scans your repository, learns its conventions, and generates right-sized, token-efficient agent context packs — AGENTS.md, layered docs, and shareable skills.</p>
<div><a class="btn primary" href="/guide">Launch Razor on your repo</a><a class="btn" href="/skills">Browse the skills</a></div>
</section>

<section class="block"><div class="stats">
<div><b>10</b><span>user interviews with engineers at Google, Meta, Salesforce, Ericsson and more</span></div>
<div><b>&minus;2% / +23%</b><span>task-resolution drop / inference-cost spike from bloated LLM-generated context files (Gloaguen et al., 2026)</span></div>
<div><b>&frac13;</b><span>of the right context retrieved by SOTA models on ContextBench — the rest is wasted tokens</span></div>
</div></section>

<section class="block" id="problem">
<h2>The problem</h2>
<p>Deploying a coding agent into a complex codebase is like sending someone into the Butler Library stacks without a guide. The agent burns 100k tokens grepping for a pattern, comes back empty-handed, hallucinates conventions, and ignores how your repo actually works.</p>
<p>Hand-written or LLM-generated AGENTS.md files were supposed to fix this — but research shows generated repo-wide context files <i>lower</i> task success while raising cost. So developers hand-maintain instruction files that nobody keeps up to date.</p>
</section>

<section class="block">
<h2>How it works</h2>
<div class="grid3">
<div class="card"><span class="stepnum">1</span><h3>Scan</h3><p class="muted">Razor scans your repo — framework, ORM, test runner, scripts, structure — and captures evidence for every detection.</p></div>
<div class="card"><span class="stepnum">2</span><h3>Publish</h3><p class="muted">Share the generated skills with your team on the <a href="/skills">skill registry</a>.</p></div>
<div class="card"><span class="stepnum">3</span><h3>Pull</h3><p class="muted">Anyone pulls just the skill they need, straight into their workspace. No regeneration.</p></div>
</div>
<p style="margin-top:16px"><a class="btn primary" href="/guide">Read the full guide</a></p>
</section>

<section class="block" id="feedback">
<h2>What users say</h2>
<div class="quotes">
<blockquote>"It happens maybe 1/5 times where the agent gets something wrong and is taking too many prompts to fix. Usually it will cost me half a day's work to update things to my standards."<cite>— Melody, Software Engineer, Google</cite></blockquote>
<blockquote>"At work, I have near unlimited tokens so dont usually worry about usage limits. However, something that constraints me is context window... every time I load session im already at 20% of 1m context window."<cite>— Kevin, Software Engineer, Meta</cite></blockquote>
<blockquote>"I also say, by the way, some of the SQL files are over 100,000 characters long. Do not pull them all into your context."<cite>— Dillon, Lead SWE, Salesforce</cite></blockquote>
</div>
<p class="muted">From 10 user interviews conducted by the Razor team, Fall 2026.</p>
</section>

<section class="block">
<h2>Measured results</h2>
<p class="muted">Side-by-side on the same simulated bug-fix task — same agent, same model, with and without Razor guidance.</p>
<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:15px">
<tr style="text-align:left;color:#9aa7bd"><th style="padding:8px 12px">Metric</th><th style="padding:8px 12px">Without Razor</th><th style="padding:8px 12px">With Razor</th></tr>
<tr style="border-top:1px solid #1c2742"><td style="padding:8px 12px">Token consumption</td><td style="padding:8px 12px">5.5M tokens</td><td style="padding:8px 12px;color:#3ddc84">4.3M tokens</td></tr>
<tr style="border-top:1px solid #1c2742"><td style="padding:8px 12px">Context used</td><td style="padding:8px 12px">230k average</td><td style="padding:8px 12px;color:#3ddc84">180k average</td></tr>
<tr style="border-top:1px solid #1c2742"><td style="padding:8px 12px">Time consumed</td><td style="padding:8px 12px">32 minutes</td><td style="padding:8px 12px;color:#3ddc84">12 minutes</td></tr>
</table></div>
<p class="muted">Demo on fastify (~79k LOC), simulated bug fix, Sonnet 5.5 on Claude Code. Disclaimer: 3 repetitions of one simulated task — more testing needed for real-world efficacy.</p>
</section>

<section class="block">
<h2>Questions, answered</h2>
<div class="grid3">
<div class="card"><h3>Does Razor do the coding?</h3><p class="muted">No — your coding agent does. Razor writes the guide it follows.</p></div>
<div class="card"><h3>Can we inspect the output?</h3><p class="muted">Yes. The guidance is plain readable files: AGENTS.md, topic docs, skills, and check scripts.</p></div>
<div class="card"><h3>Have you measured savings?</h3><p class="muted">Early results above are promising. We are designing proper trials to measure tokens, context, and time rigorously.</p></div>
<div class="card"><h3>How do we try it?</h3><p class="muted">Give us 20 minutes: show us a recent task, where you corrected the agent, and what instructions you use. Contact: lc4008@columbia.edu</p></div>
</div>
</section>

<section class="cta-band">
<h2>Stop letting your agent wander the stacks.</h2>
<p>Generate a context pack for your repo in under a minute.</p>
<a class="btn primary" href="/guide">Get started</a>
</section>`;
    res.type('html').send(layout({ title: 'Skill Registry', active: 'home', origin, body }));
  });

  // ---- Guide: launch Razor on your repo ----
  app.get('/guide', (req, res) => {
    const origin = getOrigin(req);
    const body = `
<section class="block" style="margin-top:40px">
<h2>Launch Razor on your repo</h2>
<p class="muted">End to end: from zero to a published skill in about ten minutes. You need Node 18+.</p>
</section>

<section class="block">
<h2>0. One-time setup</h2>
<pre><span class="p">$</span> cd razor-cli
<span class="p">$</span> npm install</pre>
<p>Optional, for the LLM features (skill discovery + prose polish) — put a Gemini API key in <code>.env</code>:</p>
<pre>GEMINI_API_KEY=your_key_here</pre>
<p class="muted">Get a free key at <a href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a>. Without a key, Razor still runs and produces a full grounded pack — it just skips the LLM polish and discovery.</p>
</section>

<section class="block">
<h2>1. Get a repo to run on</h2>
<pre><span class="p">$</span> git clone https://github.com/goldbergyoni/nodejs-testing-best-practices /tmp/myrepo</pre>
<p class="muted">Or point Razor at any local repo path.</p>
</section>

<section class="block">
<h2>2. Scan it <span class="muted" style="font-weight:normal">— optional sanity check</span></h2>
<p>See what Razor detects, with evidence — which file proved each fact:</p>
<pre><span class="p">$</span> node index.js scan /tmp/myrepo</pre>
<p class="muted">Prints JSON: language, framework, testing, ORM, scripts, structure, plus an evidence map.</p>
</section>

<section class="block">
<h2>3. Generate the full context pack</h2>
<pre><span class="p">$</span> node index.js scaffold /tmp/myrepo -o /tmp/mypack</pre>
<p>This produces the whole pack in <code>/tmp/mypack/</code>: <code>AGENTS.md</code>, layered docs (overview, architecture, workflows, verification, steering), <code>skills/&lt;name&gt;/SKILL.md</code>, <code>scripts/check.sh</code>, and <code>skills.index.json</code>. With a Gemini key, it also discovers repo-specific skills and polishes the prose.</p>
<p>Pick the layout for your agent tool with <code>-t</code>:</p>
<pre><span class="p">$</span> node index.js scaffold /tmp/myrepo -o /tmp/mypack -t agents-md   <span class="p">#</span> default: Cursor, Codex, Copilot, Gemini CLI
<span class="p">$</span> node index.js scaffold /tmp/myrepo -o /tmp/mypack -t claude      <span class="p">#</span> skills under .claude/skills/
<span class="p">$</span> node index.js scaffold /tmp/myrepo -o /tmp/mypack -t kiro        <span class="p">#</span> docs/skills under .kiro/</pre>
</section>

<section class="block">
<h2>4. Look at what it generated</h2>
<pre><span class="p">$</span> find /tmp/mypack -type f | sort
<span class="p">$</span> cat /tmp/mypack/AGENTS.md</pre>
<p>Or view it as an interactive HTML page — click files to see their content:</p>
<pre><span class="p">$</span> node view_pack.js /tmp/mypack</pre>
</section>

<section class="block">
<h2>5. Use the pack with your coding agent</h2>
<p>Copy the pack contents into your repo root so the agent auto-discovers it:</p>
<pre><span class="p">$</span> cp -R /tmp/mypack/. /tmp/myrepo/</pre>
<p>Then open <code>/tmp/myrepo</code> in your agent (Claude Code, Cursor, etc.) — it reads <code>AGENTS.md</code> and loads skills on demand.</p>
</section>

<section class="block">
<h2>6. Share skills via the cloud hub <span class="muted" style="font-weight:normal">— optional</span></h2>
<p>Publish the pack's skills so teammates can reuse them:</p>
<pre><span class="p">$</span> node index.js publish /tmp/mypack --registry ${origin} --namespace your-team</pre>
<p>Pull a skill on another machine:</p>
<pre><span class="p">$</span> node index.js pull your-team/run-tests --registry ${origin} -o /tmp/mypack</pre>
<p class="muted">Browse what's published: <a href="/api/skills">/api/skills</a> · <a href="/skills">Skills page</a></p>
</section>

<section class="block">
<h2>7. Add a specific skill later <span class="muted" style="font-weight:normal">— optional</span></h2>
<pre><span class="p">$</span> node index.js add-skill db-migrations /tmp/myrepo -o /tmp/mypack</pre>
<p class="muted">Known skills: run-tests, lint-fix, code-push, db-migrations, local-env, build.</p>
</section>

<section class="block">
<h2>The minimal version</h2>
<p>The three commands that matter:</p>
<pre><span class="p">$</span> git clone &lt;repo-url&gt; /tmp/myrepo
<span class="p">$</span> node index.js scaffold /tmp/myrepo -o /tmp/mypack
<span class="p">$</span> cp -R /tmp/mypack/. /tmp/myrepo/      <span class="p">#</span> then open in your agent</pre>
</section>

<section class="cta-band">
<h2>Your repo is one scan away.</h2>
<p>Generate the pack, publish the skills, share the pull command.</p>
<a class="btn primary" href="/skills">See published skills</a>
</section>`;
    res.type('html').send(layout({ title: 'Guide', active: 'guide', origin, body }));
  });


  // ---- Skills: live team registry ----
  app.get('/skills', (req, res) => {
    const origin = getOrigin(req);
    const body = `
<section class="block" style="margin-top:40px">
<h2>Team skills</h2>
<p class="muted">Every skill published to this registry, live. Click <b>Copy</b> on any card to get its pull command.</p>
<div id="skills"><p id="skills-empty">Loading…</p></div>
<p class="muted">Raw JSON: <a href="/api/skills">/api/skills</a> · Publish yours: <a href="/guide">read the guide</a></p>
</section>
<script>
var ORIGIN = ${JSON.stringify(origin)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function render(skills){
  var box=document.getElementById('skills');
  if(!skills.length){box.innerHTML='<p id="skills-empty">No skills published yet — <a href="/guide">publish the first one</a>.</p>';return;}
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
</script>`;
    res.type('html').send(layout({ title: 'Skills', active: 'skills', origin, body }));
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
