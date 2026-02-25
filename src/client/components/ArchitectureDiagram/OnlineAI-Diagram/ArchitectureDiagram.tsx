import "./ArchitectureDiagram.css";

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

interface AiStep {
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
    id: "ai",
    className: "ai",
    port: "ext",
    icon: "🧠",
    name: "AI Service",
    tech: "HuggingFace Inference",
    tags: [
      { label: "Kimi-K2-Instruct-0905", color: "purple" },
      { label: "Chatbot", color: "purple" },
      { label: "REST API", color: "purple" },
    ],
    tooltip:
      "Model: Kimi-K2-Instruct-0905\nProvider: HuggingFace Inference\nAuth: Bearer AI_APIKEY\nEndpoint: api-inference.huggingface.co\nCall: Backend → HF API → Model",
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

const AI_STEPS: AiStep[] = [
  {
    num: "step 01",
    icon: "💬",
    title: "User Input",
    desc: "User types message in React chatbot UI component",
    code: "frontend/:chat → POST /api/chat",
  },
  {
    num: "step 02",
    icon: "🦊",
    title: "Elysia Route",
    desc: "Backend receives request, authenticates, validates payload",
    code: "POST /api/chat\nElysia.js handler",
  },
  {
    num: "step 03",
    icon: "🔑",
    title: "Auth Header",
    desc: "Attaches HuggingFace API key from env variable",
    code: "Authorization:\nBearer $AI_APIKEY (hf_***)",
  },
  {
    num: "step 04",
    icon: "🌐",
    title: "HF Inference API",
    desc: "HTTP POST to HuggingFace Inference endpoint",
    code: "api-inference.huggingface.co/models/\nKimi-K2-Instruct-0905",
  },
  {
    num: "step 05",
    icon: "🧠",
    title: "Model Inference",
    desc: "Kimi-K2-Instruct-0905 parameter model runs inference on HF infrastructure",
    code: "Kimi-K2-Instruct-0905\n1t params · HF hosted",
  },
  {
    num: "step 06",
    icon: "📨",
    title: "Response Handling",
    desc: "Backend receives completion, optionally stores to Postgres, returns",
    code: "JSON response → DB log\n→ HTTP response",
  },
  {
    num: "step 07",
    icon: "✅",
    title: "UI Rendered",
    desc: "React renders AI message in chat UI, conversation state updated",
    code: "state.messages.push(reply)\nReact re-render",
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
    className: "hf",
    icon: "🤗",
    label: "AI Provider",
    name: "HuggingFace",
    desc: "Inference API · Kimi-K2-Instruct-0905 · Bearer token auth",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Tag({ label, color }: { label: string; color: string }) {
  return <span className={`arch-tag arch-tag-${color}`}>{label}</span>;
}

function ContainerCard({ c }: { c: ContainerItem }) {
  return (
    <div className={`arch-tooltip-wrap`}>
      <div
        className={`arch-container-card ${c.className}${c.dashed ? " dockerfile" : ""}`}
        style={c.dashed ? { cursor: "default" } : undefined}
      >
        {c.port && <span className="arch-container-port">{c.port}</span>}
        <span className="arch-container-icon">{c.icon}</span>
        <div className="arch-container-name">{c.name}</div>
        <div className="arch-container-tech">{c.tech}</div>
        <div className="arch-tag-row">
          {c.tags.map((t) => (
            <Tag key={t.label} label={t.label} color={t.color} />
          ))}
        </div>
      </div>
      <div className="arch-tooltip">{c.tooltip}</div>
    </div>
  );
}

function AiStep({ step, isLast }: { step: AiStep; isLast: boolean }) {
  return (
    <div className="arch-ai-step">
      {!isLast && <span className="arch-ai-step-arrow">→</span>}
      <div className="arch-ai-step-num">{step.num}</div>
      <span className="arch-ai-step-icon">{step.icon}</span>
      <div className="arch-ai-step-title">{step.title}</div>
      <div className="arch-ai-step-desc">{step.desc}</div>
      <div className="arch-ai-step-code">{step.code}</div>
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <div className="arch-root">
      <div className="arch-wrapper">
        <header className="arch-header">
          <h1 className="arch-title">
             <span className="arch-title-accent">Online AI Model</span>
          </h1>
        </header>

             <div className="arch-problem-box">
          <div className="arch-problem-label">
            <span className="arch-problem-dot" />
            Core Problem
          </div>
          <p className="arch-problem-text">
            Users need to easily retrieve accurate information about compliance and cybersecurity as quickly as possible.
          </p>
        </div>


        <div className="arch-diagram">
          <div className="arch-clients-col arch-panel">
            <div className="arch-panel-label">Clients</div>
            <div className="arch-section-title">Platforms</div>

            {CLIENTS.map((c) => (
              <div className="arch-client-card" key={c.name}>
                <div
                  className="arch-client-icon"
                  style={{ background: c.iconBg }}
                >
                  {c.icon}
                </div>
                <div>
                  <div className="arch-client-name">{c.name}</div>
                  <div className="arch-client-tech">{c.tech}</div>
                </div>
              </div>
            ))}

            <div className="arch-protocol-row">
              <div className="arch-section-title">Protocol</div>
              <div className="arch-tag-row" style={{ marginTop: 10 }}>
                <Tag label="HTTP/1.1" color="cyan" />
                <Tag label="REST" color="cyan" />
                <Tag label="JSON" color="green" />
              </div>
            </div>
          </div>


          <div className="arch-apps-col arch-panel">
            <div className="arch-panel-label">Application Layer</div>

            <div className="arch-docker-zone">
              <div className="arch-docker-zone-label">
                🐳&nbsp; Docker Compose Network · app-network (bridge)
              </div>

              <div className="arch-containers-grid">
                {CONTAINERS.map((c) => (
                  <ContainerCard key={c.id} c={c} />
                ))}
              </div>

              <div className="arch-network-row">
                <div className="arch-network-line" />
                <div className="arch-network-badge">
                  🔗 app-network · bridge driver · shared DNS
                </div>
                <div className="arch-network-line" />
              </div>
            </div>
          </div>

   
          <div className="arch-data-col arch-panel">
            <div className="arch-panel-label">Data Layer</div>

 
            <div className="arch-db-card">
              <div className="arch-db-card-header">
                <span className="arch-db-card-icon">🐘</span>
                <div>
                  <div className="arch-db-card-title">PostgreSQL 16</div>
                  <div className="arch-db-card-sub">Primary Database</div>
                </div>
              </div>
              <div className="arch-db-detail">
                <span className="arch-db-key">host: </span>
                <span className="arch-db-val">db:5432</span>
                <br />
                <span className="arch-db-key">name: </span>
                <span className="arch-db-val">test_db</span>
                <br />
                <span className="arch-db-key">user: </span>
                <span className="arch-db-val">root</span>
                <br />
                <span className="arch-db-key">vol: </span>
                <span className="arch-db-val">postgres_data</span>
              </div>
              <div className="arch-tag-row" style={{ marginTop: 8 }}>
                <Tag label="Persistent" color="orange" />
                <Tag label="alpine" color="orange" />
              </div>
            </div>

 
            <div
              className="arch-db-card"
              style={{ borderColor: "rgba(255,214,10,0.15)" }}
            >
              <div className="arch-db-card-header">
                <span className="arch-db-card-icon">🗄️</span>
                <div>
                  <div className="arch-db-card-title">pgAdmin 4</div>
                  <div className="arch-db-card-sub">Admin Interface</div>
                </div>
              </div>
              <div className="arch-db-detail">
                <span className="arch-db-key">port: </span>
                <span className="arch-db-val">5050</span>
                <br />
                <span className="arch-db-key">vol: </span>
                <span className="arch-db-val">pgadmin_data</span>
              </div>
              <div className="arch-tag-row" style={{ marginTop: 8 }}>
                <Tag label="GUI / Browser" color="yellow" />
              </div>
            </div>
          </div>

       
          <div className="arch-ai-section arch-panel">
            <div className="arch-ai-panel-label">
              <span className="arch-ai-dot" />
              &nbsp;AI Call Flow — Full Pipeline
            </div>
            <div className="arch-ai-flow">
              {AI_STEPS.map((step, i) => (
                <AiStep
                  key={step.num}
                  step={step}
                  isLast={i === AI_STEPS.length - 1}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="arch-infra-row">
          {INFRA_ITEMS.map((item) => (
            <div
              className={`arch-infra-card ${item.className}`}
              key={item.name}
            >
              <div className="arch-infra-icon">{item.icon}</div>
              <div>
                <div className="arch-infra-label">{item.label}</div>
                <div className="arch-infra-name">{item.name}</div>
                <div className="arch-infra-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
