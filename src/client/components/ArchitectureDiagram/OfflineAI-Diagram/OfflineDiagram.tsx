import "./OfflineDiagram.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientItem {
  icon: string;
  iconBg: string;
  name: string;
  tech: string;
}

interface ContainerItem {
  id: string;
  className: string;
  port: string;
  icon: string;
  name: string;
  tech: string;
  tags: { label: string; color: string }[];
  tooltip: string;
  dashed?: boolean;
}

interface ModelTask {
  label: string;
  desc: string;
  accent: "t-teal" | "t-purple" | "t-yellow" | "t-red";
}

interface ModelDef {
  id: string;
  cardClass: string;
  numClass: string;
  numLabel: string;
  icon: string;
  name: string;
  hfId: string;
  hfUrl: string;
  tasks: ModelTask[];
  note?: string;
  tags: { label: string; color: string }[];
}

interface EvalCard {
  id: string;
  cardClass: string;
  icon: string;
  title: string;
  desc: string;
  note?: string;
  tags: { label: string; color: string }[];
}

interface FlowStep {
  num: string;
  icon: string;
  title: string;
  desc: string;
  code: string;
}

interface InfraItem {
  className: string;
  icon: string;
  label: string;
  name: string;
  desc: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const CLIENTS: ClientItem[] = [
  {
    icon: "🌐",
    iconBg: "rgba(0,229,255,0.1)",
    name: "Web Browser",
    tech: "React + Vite",
  },
  {
    icon: "📱",
    iconBg: "rgba(155,93,229,0.1)",
    name: "Mobile",
    tech: "PWA-ready",
  },
  {
    icon: "🤖",
    iconBg: "rgba(57,255,20,0.1)",
    name: "AI Chat UI",
    tech: "React Component",
  },
];

const CONTAINERS: ContainerItem[] = [
  {
    id: "frontend",
    className: "frontend",
    port: ":5173",
    icon: "⚡",
    name: "Frontend",
    tech: "React + Vite + TypeScript",
    tags: [
      { label: "Vite HMR", color: "cyan" },
      { label: "TypeScript", color: "cyan" },
      { label: "Bun runtime", color: "cyan" },
    ],
    tooltip:
      "Image: oven/bun:canary-alpine\nStage: dev\nCommand: bunx vite --host 0.0.0.0\nPort: 5173\nHMR: Docker watch sync",
  },
  {
    id: "backend",
    className: "backend",
    port: ":3000",
    icon: "🦊",
    name: "Backend",
    tech: "Bun + Elysia.js",
    tags: [
      { label: "REST API", color: "green" },
      { label: "Elysia Routes", color: "green" },
      { label: "Bun runtime", color: "green" },
    ],
    tooltip:
      "Image: oven/bun:canary-alpine\nStage: dev\nCommand: bun run server\nPort: 3000\nFramework: Elysia.js\nWatch: sync+restart",
  },
  {
    id: "ollama",
    className: "ollama-container",
    port: ":11434",
    icon: "🦙",
    name: "Ollama",
    tech: "ollama/ollama · Docker",
    tags: [
      { label: "Model #1", color: "teal" },
      { label: "Model #2", color: "purple" },
      { label: "local only", color: "green" },
    ],
    tooltip:
      "Image: ollama/ollama:latest\nPort: 11434\nPre-loads: distil-qwen3 + Qwen2.5-Coder-7B\nNo external API calls\nFully offline inference",
  },
  {
    id: "db",
    className: "db",
    port: ":5432",
    icon: "🐘",
    name: "PostgreSQL",
    tech: "postgres:16-alpine",
    tags: [
      { label: "Persistent Vol", color: "orange" },
      { label: "postgres_data", color: "orange" },
    ],
    tooltip:
      "Image: postgres:16-alpine\nPort: 5432\nDB: test_db\nUser: root\nVolume: postgres_data\nRestart: always",
  },
  {
    id: "pgadmin",
    className: "pgadmin",
    port: ":5050",
    icon: "🗄️",
    name: "pgAdmin 4",
    tech: "dpage/pgadmin4",
    tags: [
      { label: "DB Admin UI", color: "yellow" },
      { label: "pgadmin_data", color: "yellow" },
    ],
    tooltip:
      "Image: dpage/pgadmin4\nPort: 5050 → 80\nEmail: admin@admin.com\nVolume: pgadmin_data\nRestart: always\nDepends on: db",
  },
  {
    id: "dockerfile",
    className: "dockerfile",
    port: "",
    icon: "📄",
    name: "Dockerfile",
    tech: "Multi-stage build",
    tags: [
      { label: "base", color: "cyan" },
      { label: "builder", color: "green" },
      { label: "prod", color: "orange" },
      { label: "dev", color: "yellow" },
    ],
    tooltip:
      "Base: oven/bun:canary-alpine\nStages: builder, production, dev\nExposes: 3000, 5173\nNon-root user: appuser",
    dashed: true,
  },
];

const MODELS: ModelDef[] = [
  {
    id: "model1",
    cardClass: "model1",
    numClass: "m1",
    numLabel: "Model #1",
    icon: "🔤",
    name: "distil-qwen3 (can be swapped)",
    hfId: "distil-labs/distil-qwen3-4b-text2sql-gguf-4bit",
    hfUrl:
      "https://huggingface.co/distil-labs/distil-qwen3-4b-text2sql-gguf-4bit",
    tasks: [
      {
        label: "Text → SQL",
        desc: "Converts the user's natural language prompt into a valid SQL query against the local PostgreSQL schema",
        accent: "t-teal",
      },
    ],
    note: "⚠ Local-only · No HF inference provider · Must be pre-loaded via Ollama",
    tags: [
      { label: "4B params", color: "teal" },
      { label: "GGUF 4-bit", color: "teal" },
      { label: "txt2sql", color: "teal" },
      { label: "offline", color: "green" },
    ],
  },
  {
    id: "model2",
    cardClass: "model2",
    numClass: "m2",
    numLabel: "Model #2",
    icon: "🧩",
    name: "Qwen2.5-Coder-7B",
    hfId: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    hfUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    tasks: [
      {
        label: "Response Generator",
        desc: "Converts raw SQL results into a human-friendly natural language response",
        accent: "t-purple",
      },
      {
        label: "LLM-as-Judge",
        desc: "Evaluates the quality and correctness of generated responses",
        accent: "t-yellow",
      },
      {
        label: "Count Evaluator",
        desc: "Compares result row count against ground truth test set answers",
        accent: "t-red",
      },
    ],
    note: "ℹ Used instead of Qwen3-Coder-Next — newest model required pre-release Ollama Docker image",
    tags: [
      { label: "7B params", color: "purple" },
      { label: "GGUF", color: "purple" },
      { label: "instruct", color: "purple" },
      { label: "offline", color: "green" },
    ],
  },
];

const EVAL_CARDS: EvalCard[] = [
  {
    id: "count",
    cardClass: "count",
    icon: "🔢",
    title: "Count Evaluator",
    desc: "Compares the number of rows returned by the SQL query against the expected count from a pre-built ground truth test set.",
    tags: [
      { label: "ground truth", color: "yellow" },
      { label: "row count", color: "yellow" },
    ],
  },
  {
    id: "judge",
    cardClass: "judge",
    icon: "⚖️",
    title: "LLM-as-Judge",
    desc: "Model #2 acts as an evaluator, scoring the generated response for correctness, relevance, and quality against the original query.",
    tags: [
      { label: "self-eval", color: "purple" },
      { label: "scoring", color: "purple" },
      { label: "Model #2", color: "purple" },
    ],
  },
  {
    id: "output",
    cardClass: "output",
    icon: "💬",
    title: "Human Response",
    desc: "Model #2  produces a readable natural language answer from the SQL results.",
    tags: [
      { label: "NL response", color: "green" },
      { label: "swappable", color: "cyan" },
    ],
  },
];

const FLOW_STEPS: FlowStep[] = [
  {
    num: "step 01",
    icon: "💬",
    title: "User Prompt",
    desc: "User types a natural language question in the React chat UI",
    code: "POST /api/query\n{ prompt: '...' }",
  },
  {
    num: "step 02",
    icon: "🦊",
    title: "Elysia Route",
    desc: "Backend receives request and forwards prompt to Ollama",
    code: "POST /api/query\nElysia.js handler",
  },
  {
    num: "step 03",
    icon: "🔤",
    title: "Text → SQL",
    desc: "Model #1 (distil-qwen3) converts prompt to a SQL query",
    code: "Ollama:11434\ndistil-qwen3 → SELECT ...",
  },
  {
    num: "step 04",
    icon: "🐘",
    title: "SQL Execution",
    desc: "Generated SQL runs against local PostgreSQL database",
    code: "pg.query(sql)\n→ rows[]",
  },
  {
    num: "step 05",
    icon: "🧩",
    title: "NL Response",
    desc: "Model #2 generates a human-friendly answer from the SQL results",
    code: "Ollama:11434\nQwen2.5-Coder → answer",
  },
  {
    num: "step 06",
    icon: "⚖️",
    title: "Evaluation",
    desc: "Model #2 scores response quality + count check vs ground truth",
    code: "LLM-as-Judge + count\n→ eval score",
  },
  {
    num: "step 07",
    icon: "✅",
    title: "UI Rendered",
    desc: "React renders AI answer + evaluation score in the chat UI",
    code: "{ answer, score }\n→ React re-render",
  },
];

const INFRA_ITEMS: InfraItem[] = [
  {
    className: "github",
    icon: "🐙",
    label: "Version Control",
    name: "GitHub",
    desc: "Shared repo · teammate access · branching workflow",
  },
  {
    className: "docker",
    icon: "🐳",
    label: "CI / CD",
    name: "Docker + Compose",
    desc: "Multi-stage Dockerfile · docker compose watch · bridge network",
  },
  {
    className: "bun",
    icon: "📦",
    label: "Runtime",
    name: "Bun (canary)",
    desc: "oven/bun:canary-alpine · fast installs · native TS support",
  },
  {
    className: "ollama-infra",
    icon: "🦙",
    label: "Model Runtime",
    name: "Ollama",
    desc: "Pre-loads both models · fully offline · Docker container",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Tag({ label, color }: { label: string; color: string }) {
  return <span className={`off-tag off-tag-${color}`}>{label}</span>;
}

function ContainerCard({ c }: { c: ContainerItem }) {
  return (
    <div className="off-tooltip-wrap">
      <div
        className={`off-container-card ${c.className}${c.dashed ? " dockerfile" : ""}`}
        style={c.dashed ? { cursor: "default" } : undefined}
      >
        {c.port && <span className="off-container-port">{c.port}</span>}
        <span className="off-container-icon">{c.icon}</span>
        <div className="off-container-name">{c.name}</div>
        <div className="off-container-tech">{c.tech}</div>
        <div className="off-tag-row">
          {c.tags.map((t) => (
            <Tag key={t.label} label={t.label} color={t.color} />
          ))}
        </div>
      </div>
      <div className="off-tooltip">{c.tooltip}</div>
    </div>
  );
}

function ModelCard({ model }: { model: ModelDef }) {
  return (
    <div className={`off-model-card ${model.cardClass}`}>
      <span className={`off-model-num ${model.numClass}`}>
        {model.numLabel}
      </span>
      <span className="off-model-icon">{model.icon}</span>
      <div className="off-model-name">{model.name}</div>
      <div className="off-model-id">
        <a href={model.hfUrl} target="_blank" rel="noopener noreferrer">
          {model.hfId}
        </a>
      </div>
      <div className="off-tag-row">
        {model.tags.map((t) => (
          <Tag key={t.label} label={t.label} color={t.color} />
        ))}
      </div>
      <div className="off-model-tasks">
        {model.tasks.map((task) => (
          <div key={task.label} className={`off-model-task ${task.accent}`}>
            <strong>{task.label}</strong>
            {task.desc}
          </div>
        ))}
      </div>
      {model.note && <div className="off-model-note">{model.note}</div>}
    </div>
  );
}

function FlowStep({ step, isLast }: { step: FlowStep; isLast: boolean }) {
  return (
    <div className="off-flow-step">
      {!isLast && <span className="off-flow-arrow">→</span>}
      <div className="off-flow-num">{step.num}</div>
      <span className="off-flow-icon">{step.icon}</span>
      <div className="off-flow-title">{step.title}</div>
      <div className="off-flow-desc">{step.desc}</div>
      <div className="off-flow-code">{step.code}</div>
    </div>
  );
}

export default function OfflineDiagram() {
  return (
    <div className="off-root">
      <div className="off-wrapper">
        <header className="off-header">
          <div className="off-badge">offline // ai system</div>
          <h1 className="off-title">
            Offline <span className="off-title-accent">AI System</span>
          </h1>
          <p className="off-subtitle">
            // local inference · no external API calls · 2 pre-loaded models via
            Ollama
          </p>
        </header>


        
        <div className="arch-problem-box">
          <div className="arch-problem-label">
            <span className="arch-problem-dot" />
            Core Problem
          </div>
          <p className="arch-problem-text">
            Users need to easily retrieve accurate information about compliance
            and cybersecurity as quickly as possible.
          </p>
        </div>

        <div className="off-diagram">
          <div className="off-clients-col off-panel">
            <div className="off-panel-label">
              <span
                className="off-panel-dot"
                style={{
                  background: "var(--cyan)",
                  boxShadow: "0 0 8px var(--cyan)",
                }}
              />
              Clients
            </div>
            <div className="off-section-title">Platforms</div>

            {CLIENTS.map((c) => (
              <div className="off-client-card" key={c.name}>
                <div
                  className="off-client-icon"
                  style={{ background: c.iconBg }}
                >
                  {c.icon}
                </div>
                <div>
                  <div className="off-client-name">{c.name}</div>
                  <div className="off-client-tech">{c.tech}</div>
                </div>
              </div>
            ))}

            <div className="off-protocol-row">
              <div className="off-section-title">Protocol</div>
              <div className="off-tag-row" style={{ marginTop: 10 }}>
                <Tag label="HTTP/1.1" color="cyan" />
                <Tag label="REST" color="cyan" />
                <Tag label="JSON" color="green" />
              </div>
            </div>
          </div>

          <div className="off-apps-col off-panel">
            <div className="off-panel-label">
              <span
                className="off-panel-dot"
                style={{
                  background: "var(--cyan)",
                  boxShadow: "0 0 8px var(--cyan)",
                }}
              />
              Application Layer
            </div>

            <div className="off-docker-zone">
              <div className="off-docker-zone-label">
                🐳&nbsp; Docker Compose Network · app-network (bridge)
              </div>
              <div className="off-containers-grid">
                {CONTAINERS.map((c) => (
                  <ContainerCard key={c.id} c={c} />
                ))}
              </div>
              <div className="off-network-row">
                <div className="off-network-line" />
                <div className="off-network-badge">
                  🔗 app-network · bridge driver · shared DNS
                </div>
                <div className="off-network-line" />
              </div>
            </div>
          </div>

          <div className="off-data-col off-panel">
            <div className="off-panel-label">
              <span
                className="off-panel-dot"
                style={{
                  background: "var(--orange)",
                  boxShadow: "0 0 8px var(--orange)",
                }}
              />
              Data Layer
            </div>

            <div className="off-db-card">
              <div className="off-db-card-header">
                <span className="off-db-card-icon">🐘</span>
                <div>
                  <div className="off-db-card-title">PostgreSQL 16</div>
                  <div className="off-db-card-sub">
                    Primary Database + SQL Target
                  </div>
                </div>
              </div>
              <div className="off-db-detail">
                <span className="off-db-key">host: </span>
                <span className="off-db-val">db:5432</span>
                <br />
                <span className="off-db-key">name: </span>
                <span className="off-db-val">test_db</span>
                <br />
                <span className="off-db-key">user: </span>
                <span className="off-db-val">root</span>
                <br />
                <span className="off-db-key">vol: </span>
                <span className="off-db-val">postgres_data</span>
              </div>
              <div className="off-tag-row">
                <Tag label="Persistent" color="orange" />
                <Tag label="alpine" color="orange" />
                <Tag label="SQL target" color="teal" />
              </div>
            </div>

            <div
              className="off-db-card"
              style={{ borderColor: "rgba(255,214,10,0.2)" }}
            >
              <div className="off-db-card-header">
                <span className="off-db-card-icon">📋</span>
                <div>
                  <div className="off-db-card-title">Ground Truth</div>
                  <div className="off-db-card-sub">Evaluation Test Set</div>
                </div>
              </div>
              <div className="off-db-detail">
                Pre-built set of expected result counts used for comparing SQL
                output during evaluation
              </div>
              <div className="off-tag-row">
                <Tag label="count-based" color="yellow" />
                <Tag label="test set" color="yellow" />
              </div>
            </div>

            <div
              className="off-db-card"
              style={{ borderColor: "rgba(255,214,10,0.12)" }}
            >
              <div className="off-db-card-header">
                <span className="off-db-card-icon">🗄️</span>
                <div>
                  <div className="off-db-card-title">pgAdmin 4</div>
                  <div className="off-db-card-sub">Admin Interface</div>
                </div>
              </div>
              <div className="off-db-detail">
                <span className="off-db-key">port: </span>
                <span className="off-db-val">5050</span>
                <br />
                <span className="off-db-key">vol: </span>
                <span className="off-db-val">pgadmin_data</span>
              </div>
              <div className="off-tag-row">
                <Tag label="GUI / Browser" color="yellow" />
              </div>
            </div>
          </div>

          <div className="off-ai-section off-panel">
            <div className="off-panel-label">
              <span
                className="off-panel-dot"
                style={{
                  background: "var(--teal)",
                  boxShadow: "0 0 8px var(--teal)",
                }}
              />
              Ollama — Local AI Pipeline (replaces external HuggingFace API)
            </div>

            <div className="off-ollama-zone">
              <div className="off-ollama-label">
                🦙&nbsp; ollama · port :11434 · Docker container · fully offline
              </div>
              <div className="off-models-grid">
                {MODELS.map((m) => (
                  <ModelCard key={m.id} model={m} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="off-section-title" style={{ marginBottom: 14 }}>
                Model #2 — Evaluation &amp; Response Layer
              </div>
              <div className="off-eval-grid">
                {EVAL_CARDS.map((card) => (
                  <div
                    key={card.id}
                    className={`off-eval-card ${card.cardClass}`}
                  >
                    <span className="off-eval-icon">{card.icon}</span>
                    <div className="off-eval-title">{card.title}</div>
                    <div className="off-eval-desc">{card.desc}</div>
                    {card.note && (
                      <div className="off-eval-note">{card.note}</div>
                    )}
                    <div className="off-tag-row">
                      {card.tags.map((t) => (
                        <Tag key={t.label} label={t.label} color={t.color} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="off-flow-section off-panel">
            <div className="off-panel-label">
              <span
                className="off-panel-dot"
                style={{
                  background: "var(--teal)",
                  boxShadow: "0 0 8px var(--teal)",
                }}
              />
              Full Call Flow — End to End
            </div>
            <div className="off-flow">
              {FLOW_STEPS.map((step, i) => (
                <FlowStep
                  key={step.num}
                  step={step}
                  isLast={i === FLOW_STEPS.length - 1}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="off-infra-row">
          {INFRA_ITEMS.map((item) => (
            <div key={item.name} className={`off-infra-card ${item.className}`}>
              <div className="off-infra-icon">{item.icon}</div>
              <div>
                <div className="off-infra-label">{item.label}</div>
                <div className="off-infra-name">{item.name}</div>
                <div className="off-infra-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
