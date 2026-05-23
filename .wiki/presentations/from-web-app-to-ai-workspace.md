---
marp: true
title: From Web App to AI Workspace
type: "note"
status: "active"
language: "default"
source_paths:
  - "README.md"
  - "web/src/App.tsx"
  - "server/src/relay-server.ts"
updated_at: "2026-05-23"
paginate: true
footer: 'Agent CLI - Web UI - Local runtime - Remote control'
class: lead
size: 16:9
style: |
  :root {
    --bg: #07111f;
    --panel: #0e1b2d;
    --panel-soft: #13233a;
    --text: #eef4ff;
    --muted: #9fb2cc;
    --accent: #7dd3fc;
    --accent-2: #f59e0b;
  }

  section {
    background:
      radial-gradient(circle at top right, rgba(125, 211, 252, 0.16), transparent 30%),
      radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.10), transparent 25%),
      linear-gradient(160deg, #04101c 0%, #07111f 58%, #0b1728 100%);
    color: var(--text);
    font-family: "Aptos", "Segoe UI", Arial, sans-serif;
    padding: 64px;
    letter-spacing: 0.01em;
  }

  h1 {
    color: var(--text);
    font-size: 2.1em;
    line-height: 1.05;
    letter-spacing: -0.03em;
    margin-bottom: 0.45em;
  }

  p, li {
    color: var(--muted);
    font-size: 0.82em;
    line-height: 1.45;
  }

  strong {
    color: var(--text);
    font-weight: 700;
  }

  a {
    color: var(--accent);
  }

  .kicker {
    display: inline-block;
    margin-bottom: 18px;
    padding: 8px 14px;
    border: 1px solid rgba(125, 211, 252, 0.22);
    border-radius: 999px;
    color: var(--accent);
    background: rgba(13, 25, 43, 0.65);
    font-size: 0.58em;
    text-transform: uppercase;
    letter-spacing: 0.18em;
  }

  .summary {
    max-width: 880px;
    padding: 18px 22px;
    margin-top: 28px;
    background: rgba(13, 25, 43, 0.72);
    border: 1px solid rgba(159, 178, 204, 0.16);
    border-radius: 20px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
  }

  .summary strong {
    color: var(--accent-2);
  }

  .two-col {
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 28px;
    align-items: start;
    margin-top: 28px;
  }

  .card {
    padding: 18px 20px;
    border-radius: 18px;
    background: rgba(13, 25, 43, 0.72);
    border: 1px solid rgba(159, 178, 204, 0.14);
  }

  .card h2 {
    font-size: 0.86em;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--accent);
    margin: 0 0 10px 0;
  }

  .card ul {
    margin: 0;
    padding-left: 1.1em;
  }

  .card li {
    margin: 0.35em 0;
  }

  .flow {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .pill {
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(125, 211, 252, 0.10);
    border: 1px solid rgba(125, 211, 252, 0.16);
    color: var(--text);
    font-size: 0.58em;
  }

  .footer-note {
    position: absolute;
    left: 64px;
    right: 64px;
    bottom: 36px;
    color: rgba(159, 178, 204, 0.72);
    font-size: 0.52em;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  footer {
    color: rgba(159, 178, 204, 0.72);
    font-size: 0.52em;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
---

<div class="kicker">Local intelligence</div>

# From Web App to AI Workspace. Control stays local.

<div class="summary">
The web interface launches the experience, but the workspace does the thinking, remembering, and executing.
</div>

<!--
Presenter Script:
Open with the shift from a browser app to a local AI workspace. The UI is still important, but it is no longer the system of record.
Support:
- Inference: The product model centers on local execution plus remote access.
- Evidence gap: This is a conceptual framing slide, not a measured claim.
-->

---

# Existing Systems Stay as Data Sources. They feed, not own, the workflow.

<div class="summary">
Legacy apps, files, and services remain valuable because they supply context, history, and business data.
</div>

<!--
Presenter Script:
The goal is not to replace every existing system. The goal is to let those systems contribute data while the workspace owns reasoning and action.
Support:
- Fact: Business data often already exists in files, APIs, and external tools.
- Inference: Treating them as sources reduces migration pressure.
-->

---

# The Local AI Workspace Experience. One place to launch and continue.

<div class="two-col">
  <div class="card">
    <h2>Experience</h2>
    <ul>
      <li>Start in the web app.</li>
      <li>Connect to the local session.</li>
      <li>Review outputs and approvals.</li>
    </ul>
  </div>
  <div class="card">
    <h2>Outcome</h2>
    <ul>
      <li>Less context switching.</li>
      <li>Faster iteration loops.</li>
      <li>Persistent work state.</li>
    </ul>
  </div>
</div>

<!--
Presenter Script:
The workspace experience should feel continuous. A user can launch in the browser, keep the state local, and return later without losing the thread.
Support:
- Inference: The web UI is a companion surface, not the only surface.
- Evidence gap: Exact UX behavior depends on the implemented relay and world store.
-->

---

# Layered Knowledge Base: Files, APIs, Memories, Insights. Each layer serves a different job.

<div class="summary">
Each layer in the workspace stack has a distinct role: source material, live data, durable context, and interpreted patterns.
</div>

<div class="flow">
  <span class="pill">Files</span>
  <span class="pill">APIs</span>
  <span class="pill">Memories</span>
  <span class="pill">Insights</span>
</div>

<!--
Presenter Script:
The workspace gets stronger when each layer keeps its role. Files hold source material, APIs supply live data, memories preserve durable context, and insights capture interpretation.
Support:
- Inference: Layering reduces duplication and keeps retrieval targeted.
- Evidence gap: The exact schema is product-specific.
-->

---

# Knowledge Distillation: From Raw Data to Useful Memory. Turn noise into next moves.

<div class="summary">
Raw files and events become curated memory, usable insights, and action-ready context - the input that powers AGENTS.md, skills, and the CLI.
</div>

<!--
Presenter Script:
This is the transformation layer. It is where a large amount of raw material becomes compact, decision-grade memory that the rest of the system can act on.
Support:
- Inference: Distillation is the key value-add of the workspace.
- Fact: The repo already separates sessions, messages, and events.
-->

---

# Local Files + Business Data + LLM Reasoning. Useful output needs all three.

<div class="summary">
The workspace is strongest when it can read local context, consult business data, and reason over both in one loop.
</div>

<!--
Presenter Script:
Single-source systems are brittle. The better pattern is to combine local files, business data, and model reasoning into one controlled workflow.
Support:
- Inference: No single input type is enough for complex tasks.
- Evidence gap: This is a synthesis claim, not a benchmark result.
-->

---

# AGENTS.md as the Workspace Brain. It sets the operating rules.

<div class="summary">
The system prompt, repo instructions, and local conventions tell the agent how to behave inside the workspace.
</div>

<!--
Presenter Script:
AGENTS.md is the first place the workspace declares intent. It tells the model what matters, what to avoid, and how to work.
Support:
- Fact: The repo includes AGENTS.md at the root.
- Inference: This file functions as policy and coordination, not product content.
-->

---

# Skills as Reusable Business Workflows. Encoded expertise beats repeated prompting.

<div class="summary">
Skills package proven procedures so the agent can execute consistently across repeated tasks.
</div>

<!--
Presenter Script:
Skills turn expertise into repeatable workflows. That makes the workspace more reliable because the same pattern can be invoked instead of reinvented.
Support:
- Inference: Skills are a form of operational memory.
- Fact: The repo already organizes agent knowledge into skills.
-->

---

# Trust Boundary: Permissions, Logs, and Human Approval. Safety is part of the design.

<div class="summary">
Good workspace design makes actions visible, permissions narrow, and approval explicit before sensitive steps.
</div>

<!--
Presenter Script:
Trust comes from boundaries. Users need to know what the agent can do, what it already did, and where a human decision is required.
Support:
- Inference: Logs and approvals are core trust mechanisms.
- Evidence gap: The exact policy model may evolve with implementation.
-->

---

# CLI as the Execution Engine. It turns intent into action.

<div class="summary">
The command line remains the fastest path from instruction to work, especially when tools and automation are involved.
</div>

<!--
Presenter Script:
The CLI is where the workspace actually does work. It connects prompts, runtime behavior, tools, and local state into one execution path.
Support:
- Fact: The project includes a CLI entry point and runtime settings.
- Inference: The CLI is the action layer for both local and remote use.
-->

---

# Remote Control: Continue Work from Anywhere. The session follows the user.

<div class="summary">
The relay carries coordination signals only. Agent execution, tools, workspace files, and credentials never leave the local machine.
</div>

<!--
Presenter Script:
Remote control is about continuity, not relocation. The relay server forwards status, output, and approval requests to a paired browser - but the execution always stays local.
Support:
- Fact: The repo relay transmits normalized coordination data, not agent state or credentials.
- Inference: Keeping execution local preserves trust boundaries and removes cloud risk.
-->

---

# Web Experience: Launch, Connect, Review, Sync. The browser is the front door.

<div class="summary">
The web UI does four jobs: launch a session, pair with the local runtime, surface outputs for review, and push approvals back to the agent.
</div>

<div class="flow">
  <span class="pill">Launch</span>
  <span class="pill">Connect</span>
  <span class="pill">Review</span>
  <span class="pill">Sync</span>
</div>

<!--
Presenter Script:
The browser is not the executor - it is the control panel. It gives remote supervisors a clear view of what the local agent produced and a way to act on it.
Support:
- Fact: The repo includes a web UI that pairs with the local runtime via relay.
- Inference: The web layer is coordination and approval, not intelligence or storage.
-->

---

# End User Journey: Ask, Generate, Approve, Deliver. Close the loop.

<div class="summary">
The user asks for work, the workspace generates it, the user approves it, and the result gets delivered.
</div>

<!--
Presenter Script:
This is the clearest product loop. The agent should make the path from ask to delivery short, visible, and reviewable.
Support:
- Inference: Approval is part of the workflow, not an afterthought.
- Fact: The system already models remote approvals and commands.
-->

---

# The New Work Model: Web Experience, Local Intelligence. One system, two surfaces.

<div class="summary">
The web surface coordinates people, while the local workspace keeps the intelligence, state, and execution close to the machine.
</div>

<!--
Presenter Script:
Close by naming the new model. The user experience becomes web-first, but the intelligence remains local, durable, and controllable.
Support:
- Inference: This is the deck's central thesis.
- Fact: The repo architecture already points in this direction.
-->
