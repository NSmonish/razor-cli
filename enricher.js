// enricher — optional LLM pass that rewrites the PROSE docs (overview /
// architecture / workflows / steering) into clearer language. it is given the
// scan JSON + the deterministic draft and told to improve wording ONLY from
// those facts — never invent. skills and check.sh are left deterministic on
// purpose (they hold exact commands). if there's no key or the call fails,
// callers fall back to the deterministic draft.
const { GoogleGenerativeAI } = require('@google/generative-ai');

// which docs are prose (worth enriching) vs mechanical (leave alone)
const PROSE_DOCS = new Set(['overview', 'architecture', 'workflows', 'steering']);

function isProseDoc(name) {
  return PROSE_DOCS.has(name);
}

function hasRealKey() {
  if (process.env.RAZOR_NO_LLM === '1') return false; // internal eval/CI switch
  const k = process.env.GEMINI_API_KEY;
  return !!(k && k !== 'your_actual_key_here');
}

// prompt: improve wording, keep every fact, add nothing new.
function buildEnrichPrompt(docName, draft, scanJson) {
  return `You are refining one section of an AI agent context pack for a specific code repository. The section is "${docName}.md".

Below is (1) a JSON scan of the repository and (2) a DRAFT of this section built mechanically from that scan.

Rewrite the DRAFT so it reads clearly and helps a coding agent, following these strict rules:
- Use ONLY facts present in the scan JSON or the draft. Do NOT invent commands, file names, libraries, or conventions.
- Keep every concrete fact from the draft (stack, commands, directories, env var names, config files). You may rephrase and reorganize, not drop facts.
- Keep it concise and skimmable. Markdown only. Keep the top-level "# ${docName.charAt(0).toUpperCase() + docName.slice(1)}" heading.
- Do not add praise, intros, or conclusions. Output ONLY the markdown for this section.

SCAN JSON:
${scanJson}

DRAFT:
${draft}`;
}

// enrich a single doc's markdown. returns improved markdown, or the original
// draft on any failure. retries transient 503/429 a couple times.
async function enrichDoc(model, docName, draft, scanJson) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await model.generateContent(buildEnrichPrompt(docName, draft, scanJson));
      const text = result.response.text().trim();
      // guard: if the model returned something tiny/empty, keep the draft
      if (text && text.length > 20) return text;
      return draft;
    } catch (e) {
      const msg = e.message || '';
      if (/\b(503|429)\b/.test(msg) && attempt < 3) {
        await sleep(attempt * 2000);
        continue;
      }
      // any non-transient error: fall back to the draft, don't crash the pack
      return draft;
    }
  }
  return draft;
}

// enrich a map of { docName: draftMarkdown } in place-ish; returns a new map.
// only prose docs are sent to the model; others are passed through untouched.
// if no key, returns drafts unchanged.
async function enrichDocs(drafts, scanJson, opts = {}) {
  if (!hasRealKey()) return { docs: drafts, usedLLM: false };

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || opts.model || 'gemini-3.5-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName });

  const out = {};
  let usedLLM = false;
  for (const [name, draft] of Object.entries(drafts)) {
    if (isProseDoc(name)) {
      const improved = await enrichDoc(model, name, draft, scanJson);
      out[name] = improved;
      if (improved !== draft) usedLLM = true;
    } else {
      out[name] = draft;
    }
  }
  return { docs: out, usedLLM };
}

module.exports = { enrichDocs, isProseDoc, buildEnrichPrompt, hasRealKey };
