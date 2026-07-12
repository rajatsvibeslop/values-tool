import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  Check,
  Database,
  Download,
  FileText,
  History,
  GripVertical,
  ListOrdered,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Settings,
  SlidersHorizontal,
  Sun,
  Tags,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { BrowserDatabase } from "./database";
import {
  BrowserRepository,
  presetCatalog,
  type ContextRow,
  type EventRow,
  type QueueRow,
  type RatingRow,
  type SetRow,
  type SessionRow,
  type ValueRow,
  type RapidQuestion,
  uid,
} from "./repository";
import { estimateRanks } from "@/domain/statistics";
import { convergenceDiagnostics } from "@/domain/convergence";
import { conservativeScore, TrueSkillRatingSystem } from "@/domain/rating";
import {
  intervalDomain,
  rankRelation,
  stableTiers,
} from "@/domain/ranking-view";
import type { ComparisonResult, Confidence, Strength } from "@/domain/types";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import Papa from "papaparse";
import {
  OpenAICompatibleScenarioProvider,
  type HostedScenarioProvider,
} from "@/domain/scenarios";

type Route =
  | "dashboard"
  | "compare"
  | "queue"
  | "rankings"
  | "values"
  | "tensions"
  | "history"
  | "reports"
  | "data"
  | "settings"
  | "search";
const nav: [Route, string, typeof Activity][] = [
  ["dashboard", "Dashboard", Activity],
  ["compare", "Compare", ArrowLeftRight],
  ["queue", "Queue", ListOrdered],
  ["rankings", "Rankings", BarChart3],
  ["values", "Values", Tags],
  ["tensions", "Tensions", TriangleAlert],
  ["history", "History", History],
  ["reports", "Reports", FileText],
  ["data", "Data", Database],
  ["settings", "Settings", Settings],
];
const routeFromHash = (): Route => {
  const value = location.hash.slice(1).split("?")[0] as Route;
  return nav.some(([route]) => route === value) || value === "search"
    ? value
    : "dashboard";
};

export function StaticApp() {
  const [db, setDb] = useState<BrowserDatabase>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("values-theme") === "dark" ||
      (!localStorage.getItem("values-theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches),
  );
  useEffect(() => {
    BrowserDatabase.create()
      .then(async (database) => {
        const repository = new BrowserRepository(database);
        for (const session of repository
          .sessions()
          .filter((item) => item.status !== "completed")) {
          const automatic = repository
            .queue(session.id)
            .filter((item) => item.reason !== "Manual comparison");
          if (
            automatic.length !== 1 ||
            automatic.some((item) => !item.reason.startsWith("Exact ordering"))
          )
            await repository.regenerateQueue(session.id);
        }
        setDb(database);
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      );
    const hash = () => setRoute(routeFromHash());
    addEventListener("hashchange", hash);
    return () => removeEventListener("hashchange", hash);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const mutate = async (work: () => Promise<unknown>) => {
    try {
      setError("");
      await work();
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  if (!db)
    return (
      <div className="page">
        <div className="panel empty">
          <strong>
            {error ? "Workspace could not open" : "Opening your workspace"}
          </strong>
          {error || "Loading your saved work…"}
        </div>
      </div>
    );
  const repo = new BrowserRepository(db);
  function theme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("values-theme", next ? "dark" : "light");
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }
  return (
    <div className="app-shell" data-revision={revision}>
      <aside className="sidebar">
        <a className="brand" href="#dashboard">
          <span className="brand-mark">
            <SlidersHorizontal size={16} />
          </span>
          <span>Values Tool</span>
        </a>
        <nav className="nav-list" aria-label="Primary navigation">
          {nav.map(([href, label, Icon]) => (
            <a
              className={`nav-item ${route === href ? "tab-active" : ""}`}
              href={`#${href}`}
              key={href}
            >
              <Icon size={19} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className="btn btn-icon btn-sm"
            onClick={theme}
            aria-label="Toggle color theme"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </aside>
      <div className="content-shell">
        <header className="topbar">
          <form
            className="search-form"
            onSubmit={(event) => {
              event.preventDefault();
              const query = new FormData(event.currentTarget).get("q");
              location.hash = `search?q=${encodeURIComponent(String(query))}`;
            }}
          >
            <Search size={16} />
            <input
              name="q"
              aria-label="Search all records"
              placeholder="Search values, notes, claims, tensions..."
            />
          </form>
        </header>
        <main>
          {error && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="notice notice-warning">
                <strong>Action failed</strong>
                <div>{error}</div>
              </div>
            </div>
          )}
          <Router route={route} repo={repo} db={db} mutate={mutate} />
        </main>
      </div>
    </div>
  );
}

function Router({
  route,
  repo,
  db,
  mutate,
}: {
  route: Route;
  repo: BrowserRepository;
  db: BrowserDatabase;
  mutate: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const props = { repo, db, mutate };
  if (route === "dashboard") return <Dashboard {...props} />;
  if (route === "values") return <ValuesView {...props} />;
  if (route === "compare") return <Compare {...props} />;
  if (route === "queue") return <Queue {...props} />;
  if (route === "rankings") return <Rankings {...props} />;
  if (route === "tensions") return <Tensions {...props} />;
  if (route === "history") return <HistoryView {...props} />;
  if (route === "reports") return <Reports {...props} />;
  if (route === "data") return <DataView {...props} />;
  if (route === "settings") return <SettingsView {...props} />;
  return <SearchView {...props} />;
}

type ViewProps = {
  repo: BrowserRepository;
  db: BrowserDatabase;
  mutate: (work: () => Promise<unknown>) => Promise<void>;
};

type ScenarioConfig = {
  provider: "local" | HostedScenarioProvider;
  model: string;
  apiKey: string;
};

const scenarioConfig = (): ScenarioConfig => ({
  provider: (localStorage.getItem("scenario-provider") as ScenarioConfig["provider"]) || "local",
  model: localStorage.getItem("scenario-model") || "",
  apiKey: sessionStorage.getItem("scenario-api-key") || "",
});
const Page = ({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <div className="page">
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions}
    </div>
    {children}
  </div>
);
const Panel = ({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="panel">
    {title && (
      <div className="panel-head">
        <h2 className="panel-title">{title}</h2>
        {action}
      </div>
    )}
    <div className="panel-body">{children}</div>
  </section>
);
const Empty = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="empty">
    <strong>{title}</strong>
    {children}
  </div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
const submit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const parsedStringList = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

function useSelectedSet(repo: BrowserRepository) {
  const sets = repo.sets();
  const [selected, setSelected] = useState(
    localStorage.getItem("values-set") ?? "",
  );
  const set = sets.find((item) => item.id === selected) ?? sets[0];
  const select = (id: string) => {
    localStorage.setItem("values-set", id);
    setSelected(id);
  };
  return { sets, set, select };
}

function Dashboard({ repo, db, mutate }: ViewProps) {
  const { sets, set, select } = useSelectedSet(repo);
  if (!set)
    return (
      <Page
        title="Dashboard"
        description="Rank personal values through adaptive comparisons while preserving the evidence behind every choice."
      >
        <Panel title="Choose a starting value set">
          <div className="preset-list">
            {presetCatalog.map((preset) => (
              <div
                className="preset-row"
                key={preset.slug}
              >
                <div>
                  <strong>{preset.name}</strong>
                  <span className="mono muted">{preset.values.length}</span>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    mutate(async () => {
                      const id = await repo.importPreset(preset.slug);
                      localStorage.setItem("values-set", id);
                    })
                  }
                >
                  <Plus size={15} /> Use set
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </Page>
    );
  const values = repo.values(set.id);
  const ratings = repo.orderedRatings(set.id);
  const sessions = repo.sessions();
  const history = repo.history(set.id);
  const exactRanking = repo.exactRanking(set.id);
  const rapidRanking = repo.rapidRanking(set.id);
  const settings = repo.settings();
  const snapshots = db.query<{ id: string }>(
    "SELECT id FROM rating_snapshots WHERE value_set_id=? ORDER BY created_at DESC LIMIT ?",
    [set.id, settings.convergence.stabilityWindow],
  );
  const recent = snapshots.map((snapshot) =>
    db
      .query<{
        value_id: string;
      }>(
        "SELECT value_id FROM rating_snapshot_entries WHERE snapshot_id=? ORDER BY rank",
        [snapshot.id],
      )
      .map((row) => row.value_id),
  );
  const diagnostics = convergenceDiagnostics({
    values: ratings.map((rating) => ({
      id: rating.value_id,
      name: rating.name,
      parentCategory: rating.parent_category,
      aliases: [],
      rating,
    })),
    recentRankings: recent,
    config: settings.convergence,
    suspectedContradictions: db.query(
      "SELECT id FROM tensions WHERE status='suggested'",
    ).length,
  });
  return (
    <Page
      title="Dashboard"
      description={`${set.name} · global evidence across ${values.length} active values`}
      actions={
        <select
          className="select"
          value={set.id}
          onChange={(event) => select(event.target.value)}
        >
          {sets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      }
    >
      <div className="grid metrics">
        <Metric
          label="Questions"
          value={sessions
            .filter((session) => session.value_set_id === set.id)
            .reduce((sum, session) => sum + session.completed_count, 0)}
          detail={`${history.length} ranking relations`}
        />
        <Metric
          label="Evidence gaps"
          value={diagnostics.insufficientValues}
          detail="Below minimum coverage"
        />
        <Metric
          label="Near-ties"
          value={diagnostics.unresolvedNearTies}
          detail="Overlapping estimates"
        />
        <Metric
          label="Tensions"
          value={
            db.query("SELECT id FROM tensions WHERE status='suggested'").length
          }
          detail="Suggestions awaiting review"
        />
      </div>
      <div className="grid two-col" style={{ marginTop: 16 }}>
        <Panel
          title="Current top values"
          action={
            <a className="btn btn-sm" href="#rankings">
              Inspect
            </a>
          }
        >
          {ratings.length ? (
            <div className="stack">
              {ratings
                .slice(0, settings.convergence.topK)
                .map((rating, index) => (
                  <div className="spread" key={rating.value_id}>
                    <div className="row">
                      <span className="rank-number">{index + 1}</span>
                      <div>
                        <strong>{rating.name}</strong>
                        <div className="small muted">
                          {rating.parent_category || "Uncategorized"} ·{" "}
                          {rating.comparisons} comparisons
                        </div>
                      </div>
                    </div>
                    <div className="mono">
                      {rating.mu.toFixed(2)} ± {rating.sigma.toFixed(2)}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty title="No evidence yet">
              <a className="btn" href="#compare">
                Start comparing
              </a>
            </Empty>
          )}
        </Panel>
        <div className="stack">
          <Panel title="Convergence">
            <span className="badge badge-accent">
              {exactRanking?.complete
                ? "order complete"
                : rapidRanking?.complete
                  ? "rapid pass complete"
                : diagnostics.state.replaceAll("-", " ")}
            </span>
            <p>
              {exactRanking?.complete
                ? `All ${exactRanking.total} values are placed. Interval overlap shows which boundaries still merit verification.`
                : rapidRanking?.complete
                  ? `${rapidRanking.questions} five-value questions completed. Review intervals and retest unresolved boundaries.`
                : diagnostics.explanation}
            </p>
            <div className="progress">
              <span
                style={{
                  width: exactRanking?.complete || rapidRanking?.complete
                    ? "100%"
                    : `${Math.round(diagnostics.topKStability * 100)}%`,
                }}
              />
            </div>
          </Panel>
          <Panel title="Resume work">
            {sessions.find((session) => session.status !== "completed") ? (
              <a className="btn btn-primary" href="#compare">
                Resume{" "}
                {
                  sessions.find((session) => session.status !== "completed")!
                    .name
                }
              </a>
            ) : (
              <a className="btn" href="#compare">
                Start a session
              </a>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
const Metric = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) => (
  <div className="panel metric">
    <div className="metric-label">{label}</div>
    <div className="metric-value">{value}</div>
    <div className="metric-detail">{detail}</div>
  </div>
);

function ValuesView({ repo, db, mutate }: ViewProps) {
  const { sets, set, select } = useSelectedSet(repo);
  const values = set ? repo.values(set.id, true) : [];
  const [active, setActive] = useState("");
  const selected = values.find((value) => value.id === active);
  return (
    <Page
      title="Values"
      description="Manage value sets, source definitions, personal revisions, aliases, categories, and evidence profiles."
    >
      <div className="grid two-col">
        <div className="stack">
          <Panel title="Value sets">
            <div className="stack">
              {sets.map((item) => (
                <button
                  className={`btn spread ${item.id === set?.id ? "btn-primary" : ""}`}
                  key={item.id}
                  onClick={() => select(item.id)}
                >
                  <span>{item.name}</span>
                  <span>{item.value_count}</span>
                </button>
              ))}
            </div>
            <hr className="divider" />
            <form
              onSubmit={(event) => {
                const data = submit(event);
                mutate(async () => {
                  const id = await repo.createSet(
                    String(data.get("name")),
                    String(data.get("description")),
                  );
                  select(id);
                });
              }}
              className="stack"
            >
              <Field label="New custom set name">
                <input className="input" name="name" required />
              </Field>
              <Field label="Description">
                <input className="input" name="description" />
              </Field>
              <button className="btn" type="submit">
                <Plus size={14} /> Create set
              </button>
            </form>
            {set && (
              <details style={{ marginTop: 12 }}>
                <summary>Set actions</summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      const data = submit(event);
                      mutate(() =>
                        repo.updateSet(set.id, {
                          name: String(data.get("name")),
                          description: String(data.get("description")),
                          archived: Boolean(data.get("archived")),
                        }),
                      );
                    }}
                  >
                    <Field label="Set name">
                      <input
                        className="input"
                        name="name"
                        defaultValue={set.name}
                      />
                    </Field>
                    <Field label="Description">
                      <input
                        className="input"
                        name="description"
                        defaultValue={set.description}
                      />
                    </Field>
                    <label className="check-row">
                      <input type="checkbox" name="archived" /> Archive set
                    </label>
                    <button className="btn">Save set</button>
                  </form>
                  <hr className="divider" />
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      const data = submit(event);
                      mutate(async () => {
                        const result = await repo.cloneOrMergeSets(
                          data.getAll("sets").map(String),
                          String(data.get("name")),
                        );
                        select(result.id);
                      });
                    }}
                  >
                    <Field label="Clone or merge into">
                      <input
                        className="input"
                        name="name"
                        defaultValue={`${set.name} copy`}
                        required
                      />
                    </Field>
                    {sets.map((item) => (
                      <label className="check-row small" key={item.id}>
                        <input
                          type="checkbox"
                          name="sets"
                          value={item.id}
                          defaultChecked={item.id === set.id}
                        />{" "}
                        {item.name}
                      </label>
                    ))}
                    <button className="btn">Create combined set</button>
                  </form>
                </div>
              </details>
            )}
          </Panel>
          {set && (
            <Panel
              title={`${set.name} values`}
              action={
                <span className="badge">
                  {values.filter((value) => value.active).length} active
                </span>
              }
            >
              <div className="stack">
                {values.map((value) => (
                  <button
                    className="btn spread"
                    key={value.id}
                    onClick={() => setActive(value.id)}
                  >
                    <span style={{ textAlign: "left" }}>
                      <strong>{value.name}</strong>
                      <span
                        className="small muted"
                        style={{ display: "block" }}
                      >
                        {value.personal_definition || value.short_definition}
                      </span>
                    </span>
                    <span className="badge">
                      {value.parent_category || "Uncategorized"}
                    </span>
                  </button>
                ))}
              </div>
              <hr className="divider" />
              <form
                className="stack"
                onSubmit={(event) => {
                  const data = submit(event);
                  mutate(() =>
                    repo.addValue(set.id, {
                      name: String(data.get("name")),
                      definition: String(data.get("definition")),
                      category: String(data.get("category")),
                    }),
                  );
                  event.currentTarget.reset();
                }}
              >
                <Field label="Add value">
                  <input className="input" name="name" required />
                </Field>
                <Field label="Definition">
                  <textarea className="textarea" name="definition" />
                </Field>
                <Field label="Parent category">
                  <input className="input" name="category" />
                </Field>
                <button className="btn btn-primary" type="submit">
                  Add value
                </button>
              </form>
            </Panel>
          )}
        </div>
        <div className="stack">
          {selected ? (
            <ValueProfile
              value={selected}
              repo={repo}
              db={db}
              mutate={mutate}
            />
          ) : (
            <Panel title="Value evidence profile">
              <Empty title="Select a value">
                Definitions, revisions, comparison notes, wins, losses,
                reversals, claims, and provenance appear here.
              </Empty>
            </Panel>
          )}
          <Panel title="Import built-in preset">
            <div className="stack">
              {presetCatalog.map((preset) => (
                <div className="spread" key={preset.slug}>
                  <div>
                    <strong>{preset.name}</strong>
                    <div className="small muted">
                      {preset.values.length} values
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      mutate(async () => {
                        const id = await repo.importPreset(preset.slug);
                        select(id);
                      })
                    }
                  >
                    Import
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function ValueProfile({
  value,
  repo,
  db,
  mutate,
}: { value: ValueRow } & ViewProps) {
  const events = repo
    .history()
    .filter(
      (event) =>
        event.left_value_id === value.id || event.right_value_id === value.id,
    );
  const notes = events.flatMap((event) =>
    (event.notes ?? []).map((note) => ({ ...note, event: event.id })),
  );
  const revisions = db.query<{
    id: string;
    personal_definition: string;
    change_note: string;
    created_at: number;
  }>(
    "SELECT * FROM definition_revisions WHERE value_id=? ORDER BY created_at DESC",
    [value.id],
  );
  const claims = db.query<{
    id: string;
    text: string;
    status: string;
    confidence: string;
  }>("SELECT * FROM claims WHERE value_id=? ORDER BY updated_at DESC", [
    value.id,
  ]);
  return (
    <>
      <Panel
        title={value.name}
        action={<span className="badge">evidence profile</span>}
      >
        <form
          className="stack"
          onSubmit={(event) => {
            const data = submit(event);
            mutate(() =>
              repo.updateValue(value.id, {
                name: String(data.get("name")),
                definition: String(data.get("definition")),
                category: String(data.get("category")),
                aliases: String(data.get("aliases"))
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
                tags: String(data.get("tags"))
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }),
            );
          }}
        >
          <Field label="Display name">
            <input className="input" name="name" defaultValue={value.name} />
          </Field>
          <Field label="Personal definition">
            <textarea
              className="textarea"
              name="definition"
              defaultValue={value.personal_definition || value.short_definition}
            />
          </Field>
          <Field label="Parent category">
            <input
              className="input"
              name="category"
              defaultValue={value.parent_category}
            />
          </Field>
          <div className="form-grid">
            <Field label="Aliases">
              <input
                className="input"
                name="aliases"
                defaultValue={(value.aliases ?? []).join(", ")}
              />
            </Field>
            <Field label="Tags">
              <input
                className="input"
                name="tags"
                defaultValue={parsedStringList(value.tags).join(", ")}
              />
            </Field>
          </div>
          <div className="notice small">
            <strong>Source definition</strong>
            <div>{value.source_definition || "No source definition"}</div>
            <div>
              {value.source_taxonomy} · {value.source_identifier}
            </div>
          </div>
          <button className="btn" type="submit">
            Save definition revision
          </button>
        </form>
        <button
          className="btn btn-danger"
          style={{ marginTop: 8 }}
          onClick={() =>
            mutate(() => repo.setValueActive(value.id, !value.active))
          }
        >
          {value.active ? "Archive value" : "Restore value"}
        </button>
      </Panel>
      <Panel title="Structured evidence">
        <Evidence
          title="Why this value tends to win"
          notes={notes.filter((note) => note.note_type === "winner_mattered")}
        />
        <Evidence
          title="What it protects"
          notes={notes.filter((note) => note.note_type === "loser_protects")}
        />
        <Evidence
          title="Conditions that reverse priority"
          notes={notes.filter((note) => note.note_type === "reversal")}
        />
        <Evidence
          title="Representative user statements"
          notes={notes.filter((note) => note.note_type === "reasoning")}
        />
        <hr className="divider" />
        <strong>Definition revisions</strong>
        {revisions.map((revision) => (
          <div
            className="notice small"
            key={revision.id}
            style={{ marginTop: 8 }}
          >
            {revision.change_note} ·{" "}
            {new Date(revision.created_at).toLocaleString()}
            <div>{revision.personal_definition}</div>
          </div>
        ))}
        <hr className="divider" />
        <strong>Claims</strong>
        {claims.map((claim) => (
          <div className="notice small" key={claim.id} style={{ marginTop: 8 }}>
            <span className="badge">{claim.status}</span> {claim.text}
          </div>
        ))}
        <form
          className="stack"
          style={{ marginTop: 12 }}
          onSubmit={(event) => {
            const data = submit(event);
            mutate(() =>
              db.transaction(() => {
                const id = uid();
                const stamp = Date.now();
                db.run("INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?)", [
                  id,
                  value.id,
                  String(data.get("claim")),
                  "interpretation",
                  "medium",
                  "draft",
                  "manual",
                  null,
                  stamp,
                  stamp,
                ]);
                for (const source of data.getAll("sources"))
                  db.run("INSERT INTO claim_sources VALUES (?,?,?)", [
                    id,
                    source,
                    "supports",
                  ]);
              }),
            );
          }}
        >
          <Field label="New synthesized claim">
            <textarea className="textarea" name="claim" required />
          </Field>
          <div className="small" style={{ maxHeight: 120, overflow: "auto" }}>
            {events.slice(0, 8).map((event) => (
              <label className="check-row" key={event.id}>
                <input type="checkbox" name="sources" value={event.id} />{" "}
                {event.left_name} vs {event.right_name} [{event.id.slice(0, 8)}]
              </label>
            ))}
          </div>
          <button className="btn" type="submit">
            Create evidence-linked draft
          </button>
        </form>
      </Panel>
    </>
  );
}
const Evidence = ({
  title,
  notes,
}: {
  title: string;
  notes: { text: string; event: string }[];
}) => (
  <div style={{ marginBottom: 12 }}>
    <strong>{title}</strong>
    {notes.length ? (
      notes.slice(0, 5).map((note) => (
        <div className="small" key={`${note.event}-${note.text}`}>
          {note.text}{" "}
          <a className="mono" href={`#history?event=${note.event}`}>
            [{note.event.slice(0, 8)}]
          </a>
        </div>
      ))
    ) : (
      <div className="small muted">No direct evidence recorded.</div>
    )}
  </div>
);

function Compare({ repo, db, mutate }: ViewProps) {
  const sets = repo.sets();
  const contexts = repo.contexts();
  const settings = repo.settings();
  const sessions = repo.sessions();
  const activeSession = sessions.find((item) => item.status === "active");
  const [sessionId, setSessionId] = useState(activeSession?.id ?? "");
  const [creating, setCreating] = useState(!activeSession);
  const [sessionMode, setSessionMode] = useState<"rapid" | "exact">("rapid");
  const [newSetId, setNewSetId] = useState(
    localStorage.getItem("values-set") ??
      sets[0]?.id ??
      `preset:${presetCatalog[0]!.slug}`,
  );
  const importedPresetSlugs = new Set(
    sets.flatMap((set) => {
      try {
        const metadata = JSON.parse(set.source_metadata) as { preset?: string };
        return metadata.preset ? [metadata.preset] : [];
      } catch {
        return [];
      }
    }),
  );
  const availablePresets = presetCatalog.filter(
    (preset) => !importedPresetSlugs.has(preset.slug),
  );
  const setChoice =
    sets.some((set) => set.id === newSetId) || newSetId.startsWith("preset:")
      ? newSetId
      : (sets[0]?.id ?? `preset:${presetCatalog[0]!.slug}`);
  const setChoiceName = setChoice.startsWith("preset:")
    ? presetCatalog.find((preset) => `preset:${preset.slug}` === setChoice)?.name
    : sets.find((set) => set.id === setChoice)?.name;
  const session = creating
    ? undefined
    : sessions.find((item) => item.id === sessionId);
  const queue = session ? repo.queue(session.id) : [];
  const activeMode = session ? repo.sessionMode(session.id) : sessionMode;
  const rapidQuestion = session && activeMode === "rapid" ? repo.rapidQuestion(session.id) : null;
  const exactProgress = session ? repo.exactProgress(session.id) : null;
  const pair = queue[0];
  const values = session ? repo.values(session.value_set_id) : [];
  const currentRatings = session ? repo.ratings(session.value_set_id) : [];
  const left = values.find((value) => value.id === pair?.left_value_id);
  const right = values.find((value) => value.id === pair?.right_value_id);
  const [notes, setNotes] = useState(false);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        !pair
      )
        return;
      const map: Record<string, ComparisonResult> = {
        "1": "left",
        "2": "tie",
        "3": "right",
        i: "incomparable",
        s: "skip",
        u: "malformed",
      };
      if (map[event.key.toLowerCase()])
        document
          .querySelector<HTMLButtonElement>(
            `[data-result="${map[event.key.toLowerCase()]}"]`,
          )
          ?.click();
      if (event.key.toLowerCase() === "n") setNotes((value) => !value);
    };
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, [pair]);
  if (creating || !session)
    return (
      <Page
        title="Compare"
        description="Start a purpose-specific session with optional contexts. The selected value set is fixed for that session."
      >
        <div className="grid two-col">
          <Panel title="New session">
            <form
                className="stack"
                onSubmit={(event) => {
                  const data = submit(event);
                  mutate(async () => {
                    const selectedSetId = setChoice.startsWith("preset:")
                      ? await repo.importPreset(setChoice.slice("preset:".length))
                      : setChoice;
                    const id = await repo.startSession(
                      selectedSetId,
                      String(data.get("name")),
                      data.getAll("contexts").map(String),
                      sessionMode,
                    );
                    localStorage.setItem("values-set", selectedSetId);
                    setNewSetId(selectedSetId);
                    setSessionId(id);
                    setCreating(false);
                  });
                }}
              >
                <Field label="Session name">
                  <input className="input" name="name" required />
                </Field>
                <Field label="Value set">
                  <select
                    className="select"
                    name="set"
                    value={setChoice}
                    onChange={(event) => setNewSetId(event.target.value)}
                  >
                    {sets.length > 0 && (
                      <optgroup label="Your value sets">
                        {sets.map((set) => (
                          <option value={set.id} key={set.id}>
                            {set.name} ({set.value_count} values)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {availablePresets.length > 0 && (
                      <optgroup label="Start from a preset">
                        {availablePresets.map((preset) => (
                          <option value={`preset:${preset.slug}`} key={preset.slug}>
                            {preset.name} ({preset.values.length} values)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
                <Field label="Method">
                  <select
                    className="select"
                    value={sessionMode}
                    onChange={(event) => setSessionMode(event.target.value as "rapid" | "exact")}
                  >
                    <option value="rapid">Rapid · rank 5 values per question</option>
                    <option value="exact">Exact · compare 2 values at a time</option>
                  </select>
                </Field>
                <div className="notice small">
                  This session will compare{" "}
                  <strong>
                    {setChoiceName}
                  </strong>
                  .
                </div>
                <div className="field">
                  <span>Contexts</span>
                  {contexts.map((context) => (
                    <label className="check-row" key={context.id}>
                      <input
                        type="checkbox"
                        name="contexts"
                        value={context.id}
                        defaultChecked={false}
                      />{" "}
                      {context.name}
                    </label>
                  ))}
                </div>
                <button className="btn btn-primary" type="submit">
                  Start session
                </button>
              </form>
          </Panel>
          <Panel title="Previous sessions">
            <div className="stack">
              {sessions.map((item) => (
                <button
                  className="btn spread"
                  key={item.id}
                  onClick={() => {
                    setSessionId(item.id);
                    setCreating(false);
                  }}
                >
                  <span>{item.name}</span>
                  <span className="badge">
                    {item.status} · {item.completed_count}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </Page>
    );
  if (activeMode === "rapid" && rapidQuestion)
    return (
      <RapidCompare
        key={rapidQuestion.id}
        repo={repo}
        db={db}
        mutate={mutate}
        session={session}
        question={rapidQuestion}
        values={values}
        contexts={contexts}
        onNewSession={() => setCreating(true)}
      />
    );
  if (!pair || !left || !right)
    return (
      <Page
        title={session.name}
        description={
          exactProgress?.complete || session.status === "completed"
            ? "Ordering complete."
            : "No matchup is currently queued."
        }
        actions={
          <button className="btn" onClick={() => setCreating(true)}>
            <Plus size={14} /> New session
          </button>
        }
      >
        <Panel title={exactProgress?.complete || session.status === "completed" ? "Ranking ready" : "Next comparison"}>
          {exactProgress?.complete || session.status === "completed" ? (
            <div className="spread">
              <div>
                <strong>{values.length} values ranked</strong>
                <div className="small muted">Review tiers and interval overlap.</div>
              </div>
              <a className="btn btn-primary" href="#rankings">
                View ranking
              </a>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => mutate(() => repo.regenerateQueue(session.id))}
            >
              <RefreshCw size={15} /> Continue ordering
            </button>
          )}
        </Panel>
      </Page>
    );
  const sessionContexts = db
    .query<{
      context_id: string;
    }>("SELECT context_id FROM session_contexts WHERE session_id=?", [
      session.id,
    ])
    .map((row) => row.context_id);
  const priorEvents = repo.history(session.value_set_id).slice(0, 8);
  const sessionActions = (
    <div className="row">
      <span className="badge">
        {exactProgress?.placed ?? 0}/{exactProgress?.total ?? values.length} placed
      </span>
      <button className="btn" type="button" onClick={() => setCreating(true)}>
        <Plus size={14} /> New session
      </button>
      <button
        className="btn"
        type="button"
        onClick={() =>
          mutate(() =>
            db.transaction(() =>
              db.run(
                "UPDATE comparison_sessions SET status='paused',updated_at=? WHERE id=?",
                [Date.now(), session.id],
              ),
            ),
          )
        }
      >
        Pause
      </button>
    </div>
  );
  return (
    <Page
      title={session.name}
      description={pair.reason}
      actions={sessionActions}
    >
      <div className="ordering-strip">
        <div>
          <span className="ordering-label">PLACE {Math.min((exactProgress?.placed ?? 0) + 1, exactProgress?.total ?? values.length)} OF {exactProgress?.total ?? values.length}</span>
          <strong>Which should guide the choice?</strong>
        </div>
        <div className="ordering-progress" aria-label="Ordering progress">
          <span style={{ width: `${((exactProgress?.placed ?? 0) / Math.max(1, exactProgress?.total ?? values.length)) * 100}%` }} />
        </div>
        <span className="mono muted">
          ≤ {Math.max(0, (exactProgress?.worstCase ?? 0) - (exactProgress?.reusedComparisons ?? 0))} new
        </span>
      </div>
      <form
        onSubmit={(event) => {
          const data = submit(event);
          const result = String(
            (event.nativeEvent as SubmitEvent).submitter instanceof
              HTMLButtonElement
              ? (
                  (event.nativeEvent as SubmitEvent)
                    .submitter as HTMLButtonElement
                ).value
              : "skip",
          ) as ComparisonResult;
          mutate(() =>
            repo.submit({
              sessionId: session.id,
              setId: session.value_set_id,
              leftId: left.id,
              rightId: right.id,
              result,
              strength: String(data.get("strength")) as Strength,
              confidence: String(data.get("confidence")) as Confidence,
              consideration: String(
                data.get("consideration") || "intrinsic",
              ) as "intrinsic" | "obligation" | "instrumental" | "uncertainty",
              tags: String(data.get("tags") ?? "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              relatedEventIds: data.getAll("relatedEvents").map(String),
              contexts: data.getAll("contexts").map(String),
              reasoning: String(data.get("reasoning") ?? ""),
              winner: String(data.get("winner") ?? ""),
              loser: String(data.get("loser") ?? ""),
              reversal: String(data.get("reversal") ?? ""),
            }),
          );
        }}
      >
        <div className="compare-layout">
          {[left, right]
            .map((value, index) => (
              <article className="value-card" key={value.id}>
                <div>
                  <span className="badge">
                    {value.parent_category || value.source_taxonomy}
                  </span>
                  {settings.display.showRatingsDuringComparison && (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      Rank{" "}
                      {currentRatings.findIndex(
                        (rating) => rating.value_id === value.id,
                      ) + 1}{" "}
                      · σ{" "}
                      {currentRatings
                        .find((rating) => rating.value_id === value.id)
                        ?.sigma.toFixed(2)}
                    </span>
                  )}
                  <h2>{value.name}</h2>
                  <p>{value.personal_definition || value.short_definition}</p>
                </div>
                <details>
                  <summary>Source definition</summary>
                  <p className="small muted">
                    {value.source_definition || "No separate source definition"}
                  </p>
                </details>
                {index === 0 && <span />}
              </article>
            ))
            .reduce<ReactNode[]>(
              (all, item, index) =>
                index
                  ? [
                      ...all,
                      <div className="versus" key="or">
                        OR
                      </div>,
                      item,
                    ]
                  : [item],
              [],
            )}
        </div>
        <div className="decision-bar">
          <button className="btn btn-primary" data-result="left" value="left">
            Left wins <span className="shortcut">1</span>
          </button>
          <button className="btn" data-result="tie" value="tie">
            Tie <span className="shortcut">2</span>
          </button>
          <button className="btn btn-primary" data-result="right" value="right">
            Right wins <span className="shortcut">3</span>
          </button>
        </div>
        <div className="decision-secondary" style={{ marginTop: 10 }}>
          <button
            className="btn btn-sm"
            data-result="incomparable"
            value="incomparable"
          >
            Incomparable <span className="shortcut">I</span>
          </button>
          <button className="btn btn-sm" data-result="skip" value="skip">
            Skip <span className="shortcut">S</span>
          </button>
          <button
            className="btn btn-sm"
            data-result="malformed"
            value="malformed"
          >
            Definition unclear <span className="shortcut">U</span>
          </button>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => setNotes((value) => !value)}
          >
            Add detail <span className="shortcut">N</span>
          </button>
        </div>
        {!notes && (
          <>
            <input type="hidden" name="strength" value="moderate" />
            <input type="hidden" name="confidence" value="confident" />
            <input type="hidden" name="consideration" value="intrinsic" />
            {sessionContexts.map((contextId) => (
              <input key={contextId} type="hidden" name="contexts" value={contextId} />
            ))}
          </>
        )}
        {notes && <Panel>
          <div className="form-grid">
            <Field label="Strength">
              <select
                className="select"
                name="strength"
                defaultValue="moderate"
              >
                <option>slight</option>
                <option>moderate</option>
                <option>strong</option>
              </select>
            </Field>
            <Field label="Confidence">
              <select
                className="select"
                name="confidence"
                defaultValue="confident"
              >
                <option>uncertain</option>
                <option>somewhat</option>
                <option>confident</option>
                <option>highly</option>
              </select>
            </Field>
            <div className="field">
              <span>Contexts</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {contexts.map((context) => (
                  <label className="check-row" key={context.id}>
                    <input
                      type="checkbox"
                      name="contexts"
                      value={context.id}
                      defaultChecked={sessionContexts.includes(context.id)}
                    />{" "}
                    {context.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="Free-form reasoning">
                <textarea className="textarea" name="reasoning" />
              </Field>
              <Field label="Why the winner mattered more">
                <textarea className="textarea" name="winner" />
              </Field>
              <Field label="What the loser still protects">
                <textarea className="textarea" name="loser" />
              </Field>
              <Field label="What would reverse the decision">
                <textarea className="textarea" name="reversal" />
              </Field>
              <Field label="Decision basis">
                <select className="select" name="consideration">
                  <option value="intrinsic">Intrinsic preference</option>
                  <option value="obligation">Obligation</option>
                  <option value="instrumental">Instrumental</option>
                  <option value="uncertainty">Uncertainty</option>
                </select>
              </Field>
              <Field label="Tags">
                <input
                  className="input"
                  name="tags"
                  placeholder="Comma separated"
                />
              </Field>
              {priorEvents.length > 0 && (
                <div className="field">
                  <span>Related comparisons</span>
                  {priorEvents.map((item) => (
                    <label className="check-row small" key={item.id}>
                      <input
                        type="checkbox"
                        name="relatedEvents"
                        value={item.id}
                      />{" "}
                      {item.left_name} vs {item.right_name} [
                      {item.id.slice(0, 8)}]
                    </label>
                  ))}
                </div>
              )}
            </div>
        </Panel>}
      </form>
    </Page>
  );
}

function RapidCompare({
  repo,
  db,
  mutate,
  session,
  question,
  values,
  contexts,
  onNewSession,
}: ViewProps & {
  session: SessionRow;
  question: RapidQuestion;
  values: ValueRow[];
  contexts: ContextRow[];
  onNewSession: () => void;
}) {
  const questionValues = question.valueIds
    .map((id) => values.find((value) => value.id === id))
    .filter((value): value is ValueRow => Boolean(value));
  const [order, setOrder] = useState(question.valueIds);
  const [scenario, setScenario] = useState(question.scenario);
  const [scenarioError, setScenarioError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [notes, setNotes] = useState(false);
  const attempted = useRef("");
  const sessionContextIds = db
    .query<{ context_id: string }>(
      "SELECT context_id FROM session_contexts WHERE session_id=?",
      [session.id],
    )
    .map((row) => row.context_id);
  const contextNames = contexts
    .filter((context) => sessionContextIds.includes(context.id))
    .map((context) => context.name);

  const generateScenario = async (automatic = false) => {
    const config = scenarioConfig();
    if (config.provider === "local") return;
    if (!config.apiKey) {
      if (!automatic) setScenarioError("Add a scenario API key in Settings.");
      return;
    }
    setGenerating(true);
    setScenarioError("");
    try {
      const provider = new OpenAICompatibleScenarioProvider({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
      });
      const generated = await provider.generate({
        values: questionValues.map((value) => ({
          name: value.name,
          definition: value.personal_definition || value.short_definition,
          category: value.parent_category,
        })),
        contexts: contextNames,
        purpose: session.name,
        question: question.question,
      });
      setScenario(generated);
      await mutate(() => repo.updateRapidScenario(session.id, generated));
    } catch (cause) {
      setScenarioError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    const config = scenarioConfig();
    const requestKey = `scenario-request:${question.id}`;
    if (
      scenario.provider === "local" &&
      config.provider !== "local" &&
      config.apiKey &&
      attempted.current !== question.id &&
      !sessionStorage.getItem(requestKey)
    ) {
      attempted.current = question.id;
      sessionStorage.setItem(requestKey, "started");
      void generateScenario(true);
    }
    // The request is keyed in sessionStorage; rerunning for other state is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const reorder = (sourceId: string, targetId: string) =>
    setOrder((current) => {
      const source = current.indexOf(sourceId);
      const target = current.indexOf(targetId);
      if (source < 0 || target < 0 || source === target) return current;
      const next = [...current];
      next.splice(source, 1);
      next.splice(target, 0, sourceId);
      return next;
    });

  return (
    <Page
      title={session.name}
      description={question.reason}
      actions={
        <div className="row">
          <span className="badge">{question.question}/{question.budget}</span>
          <button className="btn" onClick={onNewSession}>
            <Plus size={14} /> New session
          </button>
          <button
            className="btn"
            onClick={() =>
              mutate(() =>
                db.transaction(() =>
                  db.run("UPDATE comparison_sessions SET status='paused',updated_at=? WHERE id=?", [Date.now(), session.id]),
                ),
              )
            }
          >
            Pause
          </button>
        </div>
      }
    >
      <div className="ordering-strip rapid-strip">
        <div>
          <span className="ordering-label">QUESTION {question.question} OF {question.budget}</span>
          <strong>Rank what should matter most.</strong>
        </div>
        <div className="ordering-progress">
          <span style={{ width: `${((question.question - 1) / question.budget) * 100}%` }} />
        </div>
        <span className="mono muted">5 at a time</span>
      </div>
      <section className="scenario-band" aria-live="polite">
        <Sparkles size={18} />
        <div>
          <span className="scenario-label">
            {generating ? "GENERATING SCENARIO" : `${scenario.provider.toUpperCase()} SCENARIO`}
          </span>
          <p>{generating ? "Creating a neutral decision context…" : scenario.text}</p>
          {scenarioError && <div className="small badge-danger">{scenarioError}</div>}
        </div>
        {scenarioConfig().provider !== "local" && (
          <button className="btn btn-sm" disabled={generating} onClick={() => void generateScenario(false)}>
            <RefreshCw size={13} /> Regenerate
          </button>
        )}
      </section>
      <form
        onSubmit={(event) => {
          const data = submit(event);
          mutate(() =>
            repo.submitRapidRanking({
              sessionId: session.id,
              setId: session.value_set_id,
              orderedValueIds: order,
              contexts: sessionContextIds,
              reasoning: String(data.get("reasoning") ?? ""),
            }),
          );
        }}
      >
        <div className="rapid-rank-list">
          {order.map((valueId, index) => {
            const value = questionValues.find((item) => item.id === valueId)!;
            return (
              <article
                className="rapid-rank-row"
                draggable
                key={value.id}
                onDragStart={(event) => event.dataTransfer.setData("text/value-id", value.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => reorder(event.dataTransfer.getData("text/value-id"), value.id)}
              >
                <span className="rapid-rank-number">{index + 1}</span>
                <GripVertical className="muted" size={18} aria-hidden="true" />
                <div className="rapid-rank-copy">
                  <strong>{value.name}</strong>
                  <span>{value.personal_definition || value.short_definition}</span>
                </div>
                <div className="rapid-rank-actions">
                  <button type="button" className="btn btn-icon btn-sm" disabled={index === 0} onClick={() => move(index, -1)} title="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" className="btn btn-icon btn-sm" disabled={index === order.length - 1} onClick={() => move(index, 1)} title="Move down">
                    <ArrowDown size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <div className="rapid-submit">
          <button type="button" className="btn" onClick={() => setNotes((value) => !value)}>
            Add note
          </button>
          {notes && <input className="input" name="reasoning" placeholder="Why this order?" />}
          <button className="btn btn-primary" type="submit">
            <Check size={15} /> Use this order
          </button>
        </div>
      </form>
    </Page>
  );
}

function Queue({ repo, db, mutate }: ViewProps) {
  const sessions = repo.sessions();
  const session =
    sessions.find((item) => item.status === "active") ?? sessions[0];
  const queue = session ? repo.queue(session.id) : [];
  const values = session ? repo.values(session.value_set_id) : [];
  const rapid = session ? repo.rapidQuestion(session.id) : null;
  const progress = session && !rapid ? repo.exactProgress(session.id) : null;
  const move = (item: QueueRow, delta: number) =>
    mutate(() =>
      db.transaction(() => {
        const target = queue.find(
          (other) => other.position === item.position + delta,
        );
        if (!target) return;
        db.run("UPDATE comparison_queue SET position=-1 WHERE id=?", [item.id]);
        db.run("UPDATE comparison_queue SET position=? WHERE id=?", [
          item.position,
          target.id,
        ]);
        db.run("UPDATE comparison_queue SET position=? WHERE id=?", [
          target.position,
          item.id,
        ]);
      }),
    );
  return (
    <Page
      title="Comparison queue"
      description={
        session
          ? session.name
          : "Start a session to order a value set."
      }
      actions={
        session && (
          <button
            className="btn"
            onClick={() => mutate(() => repo.regenerateQueue(session.id))}
          >
            <RefreshCw size={15} /> Refresh next
          </button>
        )
      }
    >
      {session ? (
        <div className="grid two-col">
          <Panel
            title={rapid ? `Rapid question ${rapid.question}/${rapid.budget}` : progress?.complete ? "Ordering complete" : "Next required comparison"}
            action={rapid ? <span className="badge">5 values</span> : progress && <span className="mono">{progress.placed}/{progress.total} placed</span>}
          >
            {rapid ? (
              <div className="stack">
                <p style={{ marginTop: 0 }}>{rapid.scenario.text}</p>
                {rapid.valueIds.map((id, index) => (
                  <div className="spread" key={id}>
                    <span className="mono">{index + 1}</span>
                    <strong>{values.find((value) => value.id === id)?.name}</strong>
                  </div>
                ))}
                <a className="btn btn-primary" href="#compare">Rank these values</a>
              </div>
            ) : <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pair</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>
                        {
                          values.find(
                            (value) => value.id === item.left_value_id,
                          )?.name
                        }{" "}
                        vs{" "}
                        {
                          values.find(
                            (value) => value.id === item.right_value_id,
                          )?.name
                        }
                      </td>
                      <td>
                        <span className="badge badge-accent">
                          {item.reason}
                        </span>
                      </td>
                      <td>
                        <div className="row">
                          <button
                            className="btn btn-icon btn-sm"
                            onClick={() => move(item, -1)}
                            disabled={!index}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            className="btn btn-icon btn-sm"
                            onClick={() => move(item, 1)}
                            disabled={index === queue.length - 1}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
          </Panel>
          <Panel title="Manual comparison">
            <form
              className="stack"
              onSubmit={(event) => {
                const data = submit(event);
                const left = String(data.get("left"));
                const right = String(data.get("right"));
                if (left === right)
                  throw new Error("Choose two different values");
                mutate(() =>
                  db.transaction(() =>
                    db.run(
                      "INSERT INTO comparison_queue VALUES (?,?,?,?,?,?,?,?)",
                      [
                        uid(),
                        session.id,
                        left,
                        right,
                        "Manual comparison",
                        0,
                        queue.length,
                        Date.now(),
                      ],
                    ),
                  ),
                );
              }}
            >
              <Field label="First value">
                <select className="select" name="left">
                  {values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Second value">
                <select
                  className="select"
                  name="right"
                  defaultValue={values[1]?.id}
                >
                  {values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn btn-primary">Add to queue</button>
            </form>
          </Panel>
        </div>
      ) : (
        <Panel>
          <Empty title="No session">
            <a className="btn" href="#compare">
              Start comparing
            </a>
          </Empty>
        </Panel>
      )}
    </Page>
  );
}

interface SharedResult {
  version: 1;
  name: string;
  scope: string;
  createdAt: string;
  topK: number;
  conservativeK: number;
  rows: {
    id: string;
    name: string;
    category: string;
    mu: number;
    sigma: number;
    comparisons: number;
  }[];
}

function encodeSharedResult(result: SharedResult): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeSharedResult(value: string): SharedResult | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
    );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const result = JSON.parse(new TextDecoder().decode(bytes)) as SharedResult;
    return result.version === 1 && Array.isArray(result.rows) ? result : null;
  } catch {
    return null;
  }
}

function ShareRankingButton({ result }: { result: SharedResult }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        const url = `${location.origin}${location.pathname}#rankings?share=${encodeSharedResult(result)}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check size={14} /> : <Upload size={14} />}{" "}
      {copied ? "Link copied" : "Share results"}
    </button>
  );
}

function SharedRankings({ result }: { result: SharedResult }) {
  const estimates = estimateRanks(
    new Map(
      result.rows.map((row) => [
        row.id,
        {
          ...row,
          wins: 0,
          losses: 0,
          ties: 0,
          incomparable: 0,
          lastComparedAt: null,
        },
      ]),
    ),
    result.topK,
  );
  const rows: RatingRow[] = result.rows.map((row) => ({
    value_id: row.id,
    value_set_id: "shared",
    scope_key: result.scope,
    context_id: null,
    name: row.name,
    parent_category: row.category,
    mu: row.mu,
    sigma: row.sigma,
    comparisons: row.comparisons,
    wins: 0,
    losses: 0,
    ties: 0,
    incomparable: 0,
    lastComparedAt: null,
  }));
  const tiers = stableTiers(rows);
  return (
    <Page
      title={result.name}
      description="Shared ranking snapshot"
      actions={<span className="badge">Read-only snapshot</span>}
    >
      <div className="notice small" style={{ marginBottom: 16 }}>
        Shared {new Date(result.createdAt).toLocaleString()} ·{" "}
        {result.scope.replace(":", " · ")} · comparison notes are not included.
      </div>
      <Panel title="Stable tiers">
        <div className="report-tiers">
          {tiers.map((tier, index) => (
            <div className="tier-row" key={index}>
              <div className="tier-label">{index + 1}</div>
              <div className="tier-values">
                {tier.map((row) => <strong key={row.value_id}>{row.name}</strong>)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <div className="grid two-col" style={{ marginTop: 16 }}>
        <IntervalPlot rows={rows} />
        <IntervalMatrix rows={rows} tiers={tiers} />
      </div>
      <Panel title="Ranking detail">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Value</th>
                <th>Mean</th>
                <th>Uncertainty</th>
                <th>Conservative</th>
                <th>Rank interval</th>
                <th>Top-{result.topK}</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={row.id}>
                  <td>
                    <span className="rank-number">{index + 1}</span>
                  </td>
                  <td>
                    <strong>{row.name}</strong>
                    <div className="small muted">{row.category}</div>
                  </td>
                  <td className="mono">{row.mu.toFixed(2)}</td>
                  <td className="mono">{row.sigma.toFixed(2)}</td>
                  <td className="mono">
                    {(row.mu - result.conservativeK * row.sigma).toFixed(2)}
                  </td>
                  <td>
                    {estimates.get(row.id)?.low}-{estimates.get(row.id)?.high}
                  </td>
                  <td>
                    {Math.round(
                      (estimates.get(row.id)?.topKProbability ?? 0) * 100,
                    )}
                    %
                  </td>
                  <td>{row.comparisons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="form-actions">
        <a className="btn btn-primary" href="#dashboard">
          Open your local workspace
        </a>
      </div>
    </Page>
  );
}

function Rankings(props: ViewProps) {
  const shared = decodeSharedResult(
    new URLSearchParams(location.hash.split("?")[1]).get("share") ?? "",
  );
  return shared ? (
    <SharedRankings result={shared} />
  ) : (
    <LocalRankings {...props} />
  );
}

function LocalRankings({ repo, db }: ViewProps) {
  const { sets, set, select } = useSelectedSet(repo);
  const contexts = repo.contexts();
  const [context, setContext] = useState("");
  const [mode, setMode] = useState("combined");
  const [view, setView] = useState("exact");
  if (!set)
    return (
      <Page title="Rankings" description="Posterior rankings and uncertainty">
        <Empty title="No value set">
          <a href="#values">Create values</a>
        </Empty>
      </Page>
    );
  const scope = context ? `${mode}:${context}` : "global";
  const rows = repo.orderedRatings(set.id, scope);
  const exactRanking = repo.exactRanking(set.id, scope);
  const settings = repo.settings();
  const estimates = estimateRanks(
    new Map(rows.map((row) => [row.value_id, row])),
    settings.convergence.topK,
  );
  const system = new TrueSkillRatingSystem(settings.rating);
  const values = repo.values(set.id);
  const events = repo.events(set.id);
  const tiers = stableTiers(rows);
  const sharedResult: SharedResult = {
    version: 1,
    name: set.name,
    scope,
    createdAt: new Date().toISOString(),
    topK: settings.convergence.topK,
    conservativeK: settings.rating.conservativeK,
    rows: rows.map((row) => ({
      id: row.value_id,
      name: row.name,
      category: row.parent_category,
      mu: row.mu,
      sigma: row.sigma,
      comparisons: row.comparisons,
    })),
  };
  return (
    <Page
      title="Rankings"
      description="Posterior means, uncertainty, conservative scores, intervals, stable tiers, and context-specific evidence."
      actions={<ShareRankingButton result={sharedResult} />}
    >
      <Panel>
        <div className="form-grid">
          <Field label="Value set">
            <select
              className="select"
              value={set.id}
              onChange={(event) => select(event.target.value)}
            >
              {sets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Context">
            <select
              className="select"
              value={context}
              onChange={(event) => setContext(event.target.value)}
            >
              <option value="">Global</option>
              {contexts.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Evidence">
            <select
              className="select"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="combined">Global + context</option>
              <option value="context">Context only</option>
            </select>
          </Field>
        </div>
      </Panel>
      <div className="tabs spread" style={{ marginTop: 16 }}>
        <div className="row">
          {["exact", "tiers", "uncertainty", "relations"].map((item) => (
            <button
              className={`tab ${view === item ? "tab-active" : ""}`}
              onClick={() => setView(item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <select
          className="select"
          aria-label="More ranking views"
          value={
            ["exact", "tiers", "uncertainty", "relations"].includes(view)
              ? ""
              : view
          }
          onChange={(event) =>
            event.target.value && setView(event.target.value)
          }
          style={{ width: 180, minHeight: 32 }}
        >
          <option value="">More views</option>
          <option value="matrix">Comparison matrix</option>
          <option value="probabilities">Win probabilities</option>
          <option value="categories">Categories</option>
          <option value="contexts">Contexts</option>
          <option value="timeline">Timeline</option>
          <option value="diagnostics">Diagnostics</option>
          <option value="manual">Manual tiers</option>
        </select>
      </div>
      <div style={{ marginTop: 16 }}>
        {view === "exact" && (
          <Panel title={exactRanking?.complete ? "Exact ordering" : "Estimated ordering"}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Value</th>
                    <th>Mean</th>
                    <th>σ</th>
                    <th>Conservative</th>
                    <th>Interval</th>
                    <th>Top-k</th>
                    <th>N</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.value_id}>
                      <td>
                        <span className="rank-number">{index + 1}</span>
                      </td>
                      <td>
                        <strong>{row.name}</strong>
                        <div className="small muted">{row.parent_category}</div>
                      </td>
                      <td>{row.mu.toFixed(2)}</td>
                      <td>{row.sigma.toFixed(2)}</td>
                      <td>
                        {conservativeScore(
                          row,
                          settings.rating.conservativeK,
                        ).toFixed(2)}
                      </td>
                      <td>
                        {estimates.get(row.value_id)?.low}-
                        {estimates.get(row.value_id)?.high}
                      </td>
                      <td>
                        {Math.round(
                          (estimates.get(row.value_id)?.topKProbability ?? 0) *
                            100,
                        )}
                        %
                      </td>
                      <td>{row.comparisons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
        {view === "tiers" && (
          <div className="stack">
            {tiers.map((tier, index) => (
              <Panel
                title={`Tier ${String.fromCharCode(65 + index)}`}
                key={index}
              >
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {tier.map((row) => (
                    <span className="badge badge-accent" key={row.value_id}>
                      {row.name} · {row.mu.toFixed(1)} ± {row.sigma.toFixed(1)}
                    </span>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}
        {view === "uncertainty" && (
          <IntervalPlot rows={rows} />
        )}
        {view === "relations" && <IntervalMatrix rows={rows} tiers={tiers} />}
        {view === "matrix" && <Matrix values={values} events={events} />}
        {view === "probabilities" && (
          <Panel title="Pairwise win probabilities">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Value</th>
                    {rows.map((row) => (
                      <th key={row.value_id}>{row.name.slice(0, 10)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.value_id}>
                      <th>{a.name}</th>
                      {rows.map((b) => (
                        <td key={b.value_id}>
                          {a === b
                            ? "—"
                            : `${Math.round(system.winProbability(a, b) * 100)}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
        {view === "categories" && <Category rows={rows} />}
        {view === "contexts" && (
          <ContextRanks
            repo={repo}
            setId={set.id}
            contexts={contexts}
            rows={rows}
          />
        )}
        {view === "timeline" && <Timeline db={db} repo={repo} setId={set.id} />}
        {view === "diagnostics" && (
          <Diagnostics repo={repo} db={db} setId={set.id} rows={rows} />
        )}
        {view === "manual" && (
          <ManualTierBrowser db={db} setId={set.id} values={values} />
        )}
      </div>
    </Page>
  );
}

function IntervalPlot({ rows }: { rows: RatingRow[] }) {
  const z = 1.645;
  const domain = intervalDomain(rows, z);
  return (
    <Panel title="90% credible intervals">
      <div className="interval-list">
        {rows.map((row, index) => {
          const low = row.mu - z * row.sigma;
          const high = row.mu + z * row.sigma;
          return (
            <div className="interval-row" key={row.value_id}>
              <span className="mono interval-rank">{index + 1}</span>
              <strong>{row.name}</strong>
              <div className="interval-axis" aria-label={`${row.name}: ${low.toFixed(1)} to ${high.toFixed(1)}`}>
                <span
                  className="interval-line"
                  style={{
                    left: `${((low - domain.minimum) / domain.span) * 100}%`,
                    width: `${((high - low) / domain.span) * 100}%`,
                  }}
                />
                <span
                  className="interval-point"
                  style={{ left: `${((row.mu - domain.minimum) / domain.span) * 100}%` }}
                />
              </div>
              <span className="mono interval-value">{low.toFixed(1)}–{high.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function IntervalMatrix({
  rows,
  tiers,
}: {
  rows: RatingRow[];
  tiers: RatingRow[][];
}) {
  const cell = Math.max(7, Math.min(18, Math.floor(480 / Math.max(1, rows.length))));
  const starts = new Set<number>();
  let offset = 0;
  for (const tier of tiers) {
    starts.add(offset);
    offset += tier.length;
  }
  return (
    <Panel
      title="Ordering confidence"
      action={
        <div className="matrix-legend" aria-label="Matrix legend">
          <span><i className="relation-above" /> Above</span>
          <span><i className="relation-overlap" /> Unresolved</span>
          <span><i className="relation-below" /> Below</span>
        </div>
      }
    >
      <div className="relation-wrap">
        <table className="relation-matrix">
          <thead>
            <tr>
              <th aria-label="Value" />
              {rows.map((row, index) => (
                <th style={{ minWidth: cell, height: cell }} key={row.value_id} title={row.name}>{index + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, rowIndex) => (
              <tr className={starts.has(rowIndex) ? "tier-break" : ""} key={a.value_id}>
                <th><span className="mono">{rowIndex + 1}</span> {a.name}</th>
                {rows.map((b) => {
                  const relation = rankRelation(a, b);
                  return (
                    <td
                      className={`relation-${relation}`}
                      style={{ width: cell, minWidth: cell, height: cell }}
                      key={b.value_id}
                      title={`${a.name} vs ${b.name}: ${relation}`}
                      aria-label={`${a.name} is ${relation} ${b.name}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Matrix({
  values,
  events,
}: {
  values: ValueRow[];
  events: ReturnType<BrowserRepository["events"]>;
}) {
  return (
    <Panel title="Comparison matrix">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Value</th>
              {values.map((value) => (
                <th key={value.id}>{value.name.slice(0, 10)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((a) => (
              <tr key={a.id}>
                <th>{a.name}</th>
                {values.map((b) => {
                  const paired = events.filter(
                    (event) =>
                      [event.leftValueId, event.rightValueId].includes(a.id) &&
                      [event.leftValueId, event.rightValueId].includes(b.id),
                  );
                  return (
                    <td key={b.id}>{a === b ? "—" : paired.length || "·"}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
function Category({ rows }: { rows: RatingRow[] }) {
  return (
    <Panel title="Category summary">
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {[
              ...new Set(
                rows.map((row) => row.parent_category || "Uncategorized"),
              ),
            ].map((name) => {
              const group = rows.filter(
                (row) => (row.parent_category || "Uncategorized") === name,
              );
              return (
                <tr key={name}>
                  <th>{name}</th>
                  <td>{group.length} values</td>
                  <td>
                    μ{" "}
                    {(
                      group.reduce((sum, row) => sum + row.mu, 0) / group.length
                    ).toFixed(2)}
                  </td>
                  <td>
                    σ{" "}
                    {(
                      group.reduce((sum, row) => sum + row.sigma, 0) /
                      group.length
                    ).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
function ContextRanks({
  repo,
  setId,
  contexts,
  rows,
}: {
  repo: BrowserRepository;
  setId: string;
  contexts: ContextRow[];
  rows: RatingRow[];
}) {
  return (
    <Panel title="Context comparison">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Value</th>
              <th>Global</th>
              {contexts.map((context) => (
                <th key={context.id}>{context.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.value_id}>
                <td>{row.name}</td>
                <td>
                  {repo
                    .ratings(setId)
                    .findIndex((item) => item.value_id === row.value_id) + 1}
                </td>
                {contexts.map((context) => (
                  <td key={context.id}>
                    {repo
                      .ratings(setId, `context:${context.id}`)
                      .findIndex((item) => item.value_id === row.value_id) + 1}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
function Timeline({
  db,
  repo,
  setId,
}: {
  db: BrowserDatabase;
  repo: BrowserRepository;
  setId: string;
}) {
  const values = repo.values(setId);
  const snapshots = db.query<{
    id: string;
    reason: string;
    created_at: number;
  }>(
    "SELECT * FROM rating_snapshots WHERE value_set_id=? ORDER BY created_at DESC",
    [setId],
  );
  return (
    <Panel title="Ranking changes over time">
      <div className="stack">
        {snapshots.map((snapshot) => (
          <div className="spread" key={snapshot.id}>
            <span>
              {new Date(snapshot.created_at).toLocaleString()} ·{" "}
              {snapshot.reason}
            </span>
            <strong>
              {db
                .query<{ value_id: string }>(
                  "SELECT value_id FROM rating_snapshot_entries WHERE snapshot_id=? ORDER BY rank LIMIT 3",
                  [snapshot.id],
                )
                .map(
                  (item) =>
                    values.find((value) => value.id === item.value_id)?.name,
                )
                .join(" · ")}
            </strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function Diagnostics({
  repo,
  db,
  setId,
  rows,
}: {
  repo: BrowserRepository;
  db: BrowserDatabase;
  setId: string;
  rows: RatingRow[];
}) {
  const settings = repo.settings();
  const snapshots = db.query<{ id: string }>(
    "SELECT id FROM rating_snapshots WHERE value_set_id=? ORDER BY created_at DESC LIMIT ?",
    [setId, settings.convergence.stabilityWindow],
  );
  const diagnostics = convergenceDiagnostics({
    values: rows.map((row) => ({
      id: row.value_id,
      name: row.name,
      parentCategory: row.parent_category,
      aliases: [],
      rating: row,
    })),
    recentRankings: snapshots.map((snapshot) =>
      db
        .query<{
          value_id: string;
        }>(
          "SELECT value_id FROM rating_snapshot_entries WHERE snapshot_id=? ORDER BY rank",
          [snapshot.id],
        )
        .map((item) => item.value_id),
    ),
    config: settings.convergence,
    suspectedContradictions: db.query(
      "SELECT id FROM tensions WHERE status='suggested'",
    ).length,
  });
  return (
    <div className="grid metrics">
      {Object.entries(diagnostics)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => (
          <Metric
            key={key}
            label={key.replaceAll(/([A-Z])/g, " $1")}
            value={Number(value).toFixed(2)}
            detail="Convergence diagnostic"
          />
        ))}
      <Panel title={diagnostics.state}>
        <p>{diagnostics.explanation}</p>
      </Panel>
    </div>
  );
}
function ManualTierBrowser({
  db,
  setId,
  values,
}: {
  db: BrowserDatabase;
  setId: string;
  values: ValueRow[];
}) {
  const [tiers, setTiers] = useState(
    ["A", "B", "C", "Unplaced"].map((name, index) => ({
      name,
      ids: index === 3 ? values.map((value) => value.id) : ([] as string[]),
    })),
  );
  const drop = (id: string, target: number) =>
    setTiers((all) =>
      all.map((tier, index) => ({
        ...tier,
        ids:
          index === target
            ? [...tier.ids.filter((value) => value !== id), id]
            : tier.ids.filter((value) => value !== id),
      })),
    );
  return (
    <>
      <div className="notice">
        Manual tiers remain separate from inferred rankings.
      </div>
      <div className="panel">
        {tiers.map((tier, index) => (
          <div
            className="tier-row"
            key={tier.name}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) =>
              drop(event.dataTransfer.getData("text/plain"), index)
            }
          >
            <div className="tier-label">{tier.name}</div>
            <div className="tier-values">
              {tier.ids.map((id) => (
                <button
                  className="btn btn-sm"
                  draggable
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/plain", id)
                  }
                  key={id}
                >
                  {values.find((value) => value.id === id)?.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn"
        onClick={() =>
          db.transaction(() => {
            db.query<{ id: string }>(
              "SELECT id FROM manual_tiers WHERE value_set_id=?",
              [setId],
            ).forEach((row) =>
              db.run("DELETE FROM manual_tiers WHERE id=?", [row.id]),
            );
            tiers.forEach((tier, position) => {
              const id = uid();
              db.run("INSERT INTO manual_tiers VALUES (?,?,?,?,?,?,?)", [
                id,
                setId,
                null,
                tier.name,
                position,
                Date.now(),
                Date.now(),
              ]);
              tier.ids.forEach((valueId, itemPosition) =>
                db.run("INSERT INTO manual_tier_values VALUES (?,?,?)", [
                  id,
                  valueId,
                  itemPosition,
                ]),
              );
            });
            const inferred = db
              .query<{
                value_id: string;
              }>("SELECT value_id FROM ratings WHERE value_set_id=? AND scope_key='global' ORDER BY mu DESC", [setId])
              .map((row) => row.value_id);
            const manual = tiers.slice(0, -1).flatMap((tier) => tier.ids);
            manual.forEach((valueId, manualRank) => {
              const inferredRank = inferred.indexOf(valueId);
              if (
                inferredRank < 0 ||
                Math.abs(inferredRank - manualRank) <
                  Math.max(4, Math.floor(values.length * 0.25))
              )
                return;
              const signature = `manual-tier:${valueId}`;
              if (
                db.one("SELECT id FROM tensions WHERE detection_type=?", [
                  signature,
                ])
              )
                return;
              const tensionId = uid();
              const stamp = Date.now();
              db.run("INSERT INTO tensions VALUES (?,?,?,?,?,?,?,?,?)", [
                tensionId,
                "Manual tier differs from inferred rank",
                "The user's manual placement is materially different from the posterior ordering.",
                "medium",
                "suggested",
                signature,
                "",
                stamp,
                stamp,
              ]);
              db.run("INSERT INTO tension_values VALUES (?,?)", [
                tensionId,
                valueId,
              ]);
            });
          })
        }
      >
        Save manual tiers
      </button>
    </>
  );
}

function Tensions({ db, mutate }: ViewProps) {
  const tensions = db.query<{
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    user_notes: string;
  }>("SELECT * FROM tensions ORDER BY updated_at DESC");
  const values = db.query<{ id: string; name: string }>(
    'SELECT id,name FROM "values"',
  );
  return (
    <Page
      title="Tensions"
      description="Cycles, reversals, conditional priorities, and conflicts remain suggestions until you accept them."
    >
      <div className="grid two-col">
        <div className="stack">
          {tensions.length ? (
            tensions.map((tension) => (
              <Panel
                title={tension.title}
                action={
                  <span className="badge">
                    {tension.severity} · {tension.status}
                  </span>
                }
                key={tension.id}
              >
                <p>{tension.description}</p>
                <div className="row">
                  {db
                    .query<{
                      value_id: string;
                    }>(
                      "SELECT value_id FROM tension_values WHERE tension_id=?",
                      [tension.id],
                    )
                    .map((link) => (
                      <span className="badge badge-accent" key={link.value_id}>
                        {
                          values.find((value) => value.id === link.value_id)
                            ?.name
                        }
                      </span>
                    ))}
                </div>
                <div className="small muted">
                  {db
                    .query<{
                      event_id: string;
                    }>(
                      "SELECT event_id FROM tension_sources WHERE tension_id=?",
                      [tension.id],
                    )
                    .map((source) => (
                      <a
                        href={`#history?event=${source.event_id}`}
                        key={source.event_id}
                      >
                        [{source.event_id.slice(0, 8)}]{" "}
                      </a>
                    ))}
                </div>
                {tension.status === "suggested" && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        mutate(() =>
                          db.transaction(() =>
                            db.run(
                              "UPDATE tensions SET status='accepted',updated_at=? WHERE id=?",
                              [Date.now(), tension.id],
                            ),
                          ),
                        )
                      }
                    >
                      <Check size={14} /> Accept
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        mutate(() =>
                          db.transaction(() =>
                            db.run(
                              "UPDATE tensions SET status='dismissed',updated_at=? WHERE id=?",
                              [Date.now(), tension.id],
                            ),
                          ),
                        )
                      }
                    >
                      <X size={14} /> Dismiss
                    </button>
                  </div>
                )}
              </Panel>
            ))
          ) : (
            <Panel>
              <Empty title="No tensions detected">
                Reversals, cycles, and context disagreements will be proposed
                here.
              </Empty>
            </Panel>
          )}
        </div>
        <Panel title="Record manual tension">
          <form
            className="stack"
            onSubmit={(event) => {
              const data = submit(event);
              mutate(() =>
                db.transaction(() => {
                  const id = uid();
                  const stamp = Date.now();
                  db.run("INSERT INTO tensions VALUES (?,?,?,?,?,?,?,?,?)", [
                    id,
                    data.get("title"),
                    data.get("description"),
                    data.get("severity"),
                    "accepted",
                    "manual",
                    data.get("notes"),
                    stamp,
                    stamp,
                  ]);
                  data
                    .getAll("values")
                    .forEach((valueId) =>
                      db.run("INSERT INTO tension_values VALUES (?,?)", [
                        id,
                        valueId,
                      ]),
                    );
                }),
              );
            }}
          >
            <Field label="Title">
              <input className="input" name="title" required />
            </Field>
            <Field label="Description">
              <textarea className="textarea" name="description" required />
            </Field>
            <Field label="Severity">
              <select className="select" name="severity">
                <option>low</option>
                <option>medium</option>
                <option>high</option>
              </select>
            </Field>
            <div className="field">
              <span>Values involved</span>
              <div style={{ maxHeight: 180, overflow: "auto" }}>
                {values.map((value) => (
                  <label className="check-row" key={value.id}>
                    <input type="checkbox" name="values" value={value.id} />{" "}
                    {value.name}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Notes">
              <textarea className="textarea" name="notes" />
            </Field>
            <button className="btn btn-primary">Create tension</button>
          </form>
        </Panel>
      </div>
    </Page>
  );
}

function HistoryView({ repo, mutate }: ViewProps) {
  const [q, setQ] = useState("");
  const hashId = new URLSearchParams(location.hash.split("?")[1]).get("event");
  const [selectedId, setSelectedId] = useState(hashId ?? "");
  const events = repo
    .history()
    .filter((event) =>
      `${event.left_name} ${event.right_name} ${(event.notes ?? []).map((note) => note.text).join(" ")} ${event.result}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    );
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  return (
    <Page
      title="History"
      description="Append-only comparisons, repeated pairs, source notes, before/after snapshots, and explicit supersession."
    >
      <Panel title="Search and filters">
        <div className="form-grid">
          <Field label="Notes, values, or result">
            <input
              className="input"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </Field>
          <Field label="Result">
            <select
              className="select"
              onChange={(event) => setQ(event.target.value)}
            >
              <option value="">Any</option>
              {[
                "left",
                "right",
                "tie",
                "incomparable",
                "skip",
                "malformed",
              ].map((result) => (
                <option key={result}>{result}</option>
              ))}
            </select>
          </Field>
        </div>
      </Panel>
      <div className="grid two-col" style={{ marginTop: 16 }}>
        <Panel title={`${events.length} comparison events`}>
          <div className="stack">
            {events.map((event) => (
              <button
                className="btn spread"
                onClick={() => setSelectedId(event.id)}
                key={event.id}
              >
                <span style={{ textAlign: "left" }}>
                  <strong>
                    {event.left_name} vs {event.right_name}
                  </strong>
                  <span className="small muted" style={{ display: "block" }}>
                    {new Date(event.occurred_at).toLocaleString()} ·{" "}
                    {event.result} · {event.confidence}
                  </span>
                </span>
                <span className="mono">{event.id.slice(0, 8)}</span>
              </button>
            ))}
          </div>
        </Panel>
        {selected && (
          <div className="stack">
            <Panel
              title="Selected source record"
              action={<span className="mono">{selected.id.slice(0, 8)}</span>}
            >
              <p>
                <strong>
                  {selected.left_name} vs {selected.right_name}
                </strong>{" "}
                · {selected.result}
              </p>
              {selected.notes?.map((note) => (
                <div className="notice" key={`${note.note_type}-${note.text}`}>
                  <strong>{note.note_type}</strong>
                  <div>{note.text}</div>
                </div>
              ))}
              <hr className="divider" />
              <form
                className="stack"
                onSubmit={(event) => {
                  const data = submit(event);
                  mutate(() =>
                    repo.correct(
                      selected.id,
                      String(data.get("result")) as ComparisonResult,
                      String(data.get("reason")),
                    ),
                  );
                }}
              >
                <Field label="Corrected result">
                  <select
                    className="select"
                    name="result"
                    defaultValue={selected.result}
                  >
                    {[
                      "left",
                      "right",
                      "tie",
                      "incomparable",
                      "skip",
                      "malformed",
                    ].map((result) => (
                      <option key={result}>{result}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Correction reason">
                  <input className="input" name="reason" required />
                </Field>
                <button className="btn btn-danger">
                  Append correction and replay
                </button>
              </form>
            </Panel>
            <Panel title="Repeated pair">
              {repo
                .history(selected.value_set_id)
                .filter(
                  (event) =>
                    [event.left_value_id, event.right_value_id].includes(
                      selected.left_value_id,
                    ) &&
                    [event.left_value_id, event.right_value_id].includes(
                      selected.right_value_id,
                    ),
                )
                .map((event) => (
                  <div className="spread small" key={event.id}>
                    <span>
                      {new Date(event.occurred_at).toLocaleDateString()} ·{" "}
                      {event.result}
                    </span>
                    <span className="mono">{event.id.slice(0, 8)}</span>
                  </div>
                ))}
            </Panel>
          </div>
        )}
      </div>
    </Page>
  );
}

function Reports({ repo, db }: ViewProps) {
  const { sets, set, select } = useSelectedSet(repo);
  if (!set)
    return (
      <Page title="Reports" description="Evidence-backed printable analysis">
        <Empty title="No value set">Import values first.</Empty>
      </Page>
    );
  const rows = repo.orderedRatings(set.id);
  const tiers = stableTiers(rows);
  const history = repo.history(set.id);
  const tensions = db.query<{
    id: string;
    title: string;
    description: string;
    status: string;
  }>("SELECT * FROM tensions WHERE status IN ('accepted','suggested')");
  const claims = db.query<{
    id: string;
    text: string;
    creation_method: string;
    status: string;
  }>("SELECT * FROM claims WHERE status IN ('accepted','draft')");
  const markdown = reportMarkdown(
    set,
    rows,
    history,
    tensions,
    claims,
    repo.settings(),
  );
  const html = reportHtml(set, rows, tiers, history, tensions, claims);
  return (
    <Page
      title="Reports"
      description="A printable, provenance-aware synthesis separating user statements, statistics, rules, AI drafts, and manual interpretation."
      actions={
        <>
          <select
            className="select"
            value={set.id}
            onChange={(event) => select(event.target.value)}
          >
            {sets.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button className="btn no-print" onClick={() => print()}>
            Print
          </button>
          <button
            className="btn no-print"
            onClick={() => download(`${set.name}.html`, html, "text/html")}
          >
            <Download size={14} /> HTML
          </button>
          <button
            className="btn no-print"
            onClick={() =>
              download(`${set.name}.md`, markdown, "text/markdown")
            }
          >
            <Download size={14} /> Markdown
          </button>
        </>
      }
    >
      <article className="report">
        <header className="report-cover">
          <div className="report-kicker">Values profile</div>
          <h1>{set.name}</h1>
          <p className="mono muted">{new Date().toLocaleString()}</p>
        </header>
        <h2>Stable tiers</h2>
        <div className="report-tiers">
          {tiers.map((tier, index) => (
            <div className="tier-row" key={index}>
              <div className="tier-label">{index + 1}</div>
              <div className="tier-values">
                {tier.map((row) => (
                  <span key={row.value_id}>
                    <strong>{row.name}</strong>
                    <small className="mono">{row.mu.toFixed(1)} ± {row.sigma.toFixed(1)}</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <h2>Intervals</h2>
        <IntervalPlot rows={rows} />
        <h2>Definitely above or below</h2>
        <IntervalMatrix rows={rows} tiers={tiers} />
        <h2>Method</h2>
        <p>
          Ratings are replayed from recorded comparisons. Tiers join neighbors
          whose pairwise ordering is below 90% confidence. Incomparable, skipped,
          and unclear choices are not treated as draws. Confidence modifiers are{" "}
          {repo.settings().rating.modifiersEnabled
            ? "enabled with bounded observation-noise adjustments"
            : "recorded but disabled for rating updates"}
          .
        </p>
        <h2>Contexts</h2>
        {repo.contexts().map((context) => (
          <p key={context.id}>
            <strong>{context.name}:</strong>{" "}
            {repo
              .ratings(set.id, `context:${context.id}`)
              .slice(0, 3)
              .map((row) => row.name)
              .join(", ") || "unresolved"}
          </p>
        ))}
        <h2>Claims</h2>
        {claims.map((claim) => (
          <p key={claim.id}>
            <span className="badge">
              {claim.creation_method} · {claim.status}
            </span>{" "}
            {claim.text} <span className="mono">[{claim.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Tensions</h2>
        {tensions.map((tension) => (
          <p key={tension.id}>
            <strong>{tension.title}</strong> ({tension.status}) —{" "}
            {tension.description}{" "}
            <span className="mono">[{tension.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Comparison appendix</h2>
        {history.map((event) => (
          <p className="small" key={event.id}>
            <span className="mono">[{event.id.slice(0, 8)}]</span>{" "}
            {new Date(event.occurred_at).toLocaleDateString()} ·{" "}
            {event.left_name} vs {event.right_name} · {event.result} ·{" "}
            {(event.notes ?? []).map((note) => note.text).join(" | ")}
          </p>
        ))}
      </article>
    </Page>
  );
}

const escapeHtml = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function reportHtml(
  set: SetRow,
  rows: RatingRow[],
  tiers: RatingRow[][],
  history: EventRow[],
  tensions: { id: string; title: string; description: string; status: string }[],
  claims: { id: string; text: string; creation_method: string; status: string }[],
) {
  const z = 1.645;
  const domain = intervalDomain(rows, z);
  const tierStarts = new Set<number>();
  let position = 0;
  for (const tier of tiers) {
    tierStarts.add(position);
    position += tier.length;
  }
  const tierMarkup = tiers
    .map(
      (tier, index) => `<div class="tier"><b>${index + 1}</b><div>${tier
        .map((row) => `<span>${escapeHtml(row.name)} <small>${row.mu.toFixed(1)} ± ${row.sigma.toFixed(1)}</small></span>`)
        .join("")}</div></div>`,
    )
    .join("");
  const intervalMarkup = rows
    .map((row, index) => {
      const low = row.mu - z * row.sigma;
      const high = row.mu + z * row.sigma;
      return `<div class="interval"><code>${index + 1}</code><strong>${escapeHtml(row.name)}</strong><i><u style="left:${((low - domain.minimum) / domain.span) * 100}%;width:${((high - low) / domain.span) * 100}%"></u><em style="left:${((row.mu - domain.minimum) / domain.span) * 100}%"></em></i><code>${low.toFixed(1)}–${high.toFixed(1)}</code></div>`;
    })
    .join("");
  const matrixMarkup = `<table class="matrix"><thead><tr><th></th>${rows.map((_, index) => `<th>${index + 1}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (a, rowIndex) => `<tr class="${tierStarts.has(rowIndex) ? "break" : ""}"><th>${rowIndex + 1} ${escapeHtml(a.name)}</th>${rows
        .map((b) => `<td class="${rankRelation(a, b)}" title="${escapeHtml(a.name)} / ${escapeHtml(b.name)}"></td>`)
        .join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(set.name)} · values report</title><style>
  :root{--ink:#111315;--muted:#657079;--rule:#d9dee2;--blue:#2455ff;--green:#14805e;--amber:#d99000;--red:#cb4b41}*{box-sizing:border-box}body{margin:0;color:var(--ink);font:14px/1.4 Arial,sans-serif}main{max-width:1200px;margin:auto;padding:48px}header{border-top:8px solid var(--ink);padding:24px 0 34px}h1{font-size:42px;margin:0}h2{font-size:18px;margin:44px 0 14px;border-bottom:2px solid var(--ink);padding-bottom:8px}code,small{font-family:ui-monospace,monospace;color:var(--muted)}.tier{display:grid;grid-template-columns:54px 1fr;border-top:1px solid var(--rule)}.tier>b{font-size:24px;padding:14px}.tier>div{display:flex;flex-wrap:wrap;gap:8px;padding:12px}.tier span{border:1px solid var(--rule);padding:6px 8px}.tier small{margin-left:6px}.interval{display:grid;grid-template-columns:28px 170px 1fr 86px;gap:10px;align-items:center;min-height:30px}.interval i{height:12px;position:relative;background:#f0f2f4}.interval u{position:absolute;top:3px;height:6px;background:#aab8ff;text-decoration:none}.interval em{position:absolute;top:0;width:2px;height:12px;background:var(--blue)}.legend{display:flex;gap:16px;margin:8px 0}.legend i{width:12px;height:12px;display:inline-block;margin-right:4px}.matrix{border-collapse:collapse;font-size:9px}.matrix th{height:13px;min-width:11px;font-weight:400}.matrix tbody th{text-align:right;padding-right:7px;white-space:nowrap;max-width:150px;overflow:hidden}.matrix td{width:11px;height:11px;border:1px solid white}.matrix .above,.legend .above{background:var(--green)}.matrix .below,.legend .below{background:#cbd2d7}.matrix .overlap,.legend .overlap{background:var(--amber)}.matrix .same{background:var(--ink)}.matrix tr.break td,.matrix tr.break th{border-top:2px solid var(--ink)}.records p{margin:5px 0}@media print{@page{size:landscape;margin:10mm}main{padding:0}.matrix{font-size:7px}.matrix td{width:8px;height:8px}}
  </style></head><body><main><header><small>VALUES PROFILE · ${new Date().toISOString()}</small><h1>${escapeHtml(set.name)}</h1></header><h2>Stable tiers</h2>${tierMarkup}<h2>90% credible intervals</h2>${intervalMarkup}<h2>Definitely above or below</h2><div class="legend"><span><i class="above"></i>above</span><span><i class="overlap"></i>unresolved</span><span><i class="below"></i>below</span></div>${matrixMarkup}<h2>Claims</h2>${claims.map((claim) => `<p><small>${escapeHtml(claim.creation_method)} · ${escapeHtml(claim.status)} · ${escapeHtml(claim.id.slice(0, 8))}</small><br>${escapeHtml(claim.text)}</p>`).join("") || "<p>None recorded.</p>"}<h2>Tensions</h2>${tensions.map((tension) => `<p><strong>${escapeHtml(tension.title)}</strong> · ${escapeHtml(tension.description)} <small>${escapeHtml(tension.id.slice(0, 8))}</small></p>`).join("") || "<p>None recorded.</p>"}<h2>Comparison appendix</h2><div class="records">${history.map((event) => `<p><small>${escapeHtml(event.id.slice(0, 8))}</small> ${escapeHtml(event.left_name)} / ${escapeHtml(event.right_name)} · ${escapeHtml(event.result)}</p>`).join("")}</div></main></body></html>`;
}
function reportMarkdown(
  set: SetRow,
  rows: RatingRow[],
  history: EventRow[],
  tensions: { id: string; title: string; description: string }[],
  claims: { id: string; text: string; creation_method: string }[],
  settings: ReturnType<BrowserRepository["settings"]>,
) {
  return `# ${set.name}\n\nGenerated ${new Date().toISOString()}\n\n## Methodology\n\nTrueSkill settings: \`${JSON.stringify(settings.rating)}\`. Ratings replay the immutable effective comparison log.\n\n## Overall ranking\n\n${rows.map((row, index) => `${index + 1}. **${row.name}** — mu ${row.mu.toFixed(2)}, sigma ${row.sigma.toFixed(2)}, n=${row.comparisons}`).join("\n")}\n\n## Claims\n\n${claims.map((claim) => `- [${claim.creation_method}] ${claim.text} [${claim.id}]`).join("\n")}\n\n## Tensions\n\n${tensions.map((tension) => `- **${tension.title}**: ${tension.description} [${tension.id}]`).join("\n")}\n\n## Comparison appendix\n\n${history.map((event) => `- [${event.id}] ${event.left_name} vs ${event.right_name}: ${event.result}`).join("\n")}\n`;
}

function DataView({ repo, db, mutate }: ViewProps) {
  const [message, setMessage] = useState("");
  const jsonBackup = () => JSON.stringify(db.exportJson(), null, 2);
  const csvTables = [
    "values",
    "comparison_events",
    "contexts",
    "comparison_sessions",
    "ratings",
    "rating_snapshots",
    "claims",
    "claim_sources",
    "tensions",
    "tension_sources",
  ];
  return (
    <Page
      title="Data"
      description="Back up, restore, import, and export your work."
    >
      {message && (
        <div className="notice">
          <strong>{message}</strong>
        </div>
      )}
      <div className="grid two-col">
        <div className="stack">
          <Panel title="Complete backup">
            <button
              className="btn btn-primary"
              onClick={() =>
                download(
                  `values-tool-${new Date().toISOString().slice(0, 10)}.json`,
                  jsonBackup(),
                  "application/json",
                )
              }
            >
              <Download size={15} /> Download JSON backup
            </button>
          </Panel>
          <Panel title="Normalized CSV files">
            <div className="grid form-grid">
              {csvTables.map((table) => (
                <button
                  className="btn spread"
                  key={table}
                  onClick={() =>
                    download(
                      `${table === "comparison_events" ? "comparisons" : table === "comparison_sessions" ? "sessions" : table}.csv`,
                      toCsv(db.query(`SELECT * FROM "${table}"`)),
                      "text/csv",
                    )
                  }
                >
                  <span className="mono">{table}.csv</span>
                  <Download size={13} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Restore backup">
            <div className="notice notice-warning small">
              Restore validates the envelope and commits all table replacements
              in one transaction.
            </div>
            <input
              className="input"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  mutate(async () => {
                    await db.restoreJson(JSON.parse(await file.text()));
                    setMessage("Backup restored atomically");
                  });
              }}
            />
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Import value set JSON or CSV">
            <ImportSet repo={repo} mutate={mutate} />
          </Panel>
          <Panel title="Your data">
            <p>Saved on this device. Export a backup before clearing browser data.</p>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
function ImportSet({
  repo,
  mutate,
}: {
  repo: BrowserRepository;
  mutate: ViewProps["mutate"];
}) {
  const [mode, setMode] = useState("json");
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        const data = submit(event);
        const raw = String(data.get("data"));
        mutate(async () => {
          if (mode === "json") {
            const value = JSON.parse(raw) as {
              name: string;
              description?: string;
              values: {
                name: string;
                shortDefinition?: string;
                definition?: string;
                parentCategory?: string;
              }[];
            };
            if (!value.name || !Array.isArray(value.values))
              throw new Error("JSON requires name and values");
            const id = await repo.createSet(value.name, value.description);
            for (const item of value.values)
              await repo.addValue(id, {
                name: item.name,
                definition: item.shortDefinition ?? item.definition ?? "",
                category: item.parentCategory,
              });
          } else {
            const result = Papa.parse<Record<string, string>>(raw, {
              header: true,
              skipEmptyLines: true,
            });
            if (result.errors.length)
              throw new Error(
                result.errors
                  .map((error) => `Row ${error.row}: ${error.message}`)
                  .join("; "),
              );
            if (!result.meta.fields?.includes("name"))
              throw new Error("CSV needs a name column");
            const id = await repo.createSet(
              String(data.get("name")) || "Imported CSV",
            );
            for (const item of result.data) {
              await repo.addValue(id, {
                name: item.name,
                definition: item.short_definition ?? "",
                category: item.parent_category,
              });
            }
          }
        });
      }}
    >
      <Field label="Format">
        <select
          className="select"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option>json</option>
          <option>csv</option>
        </select>
      </Field>
      {mode === "csv" && (
        <Field label="Set name">
          <input className="input" name="name" />
        </Field>
      )}
      <Field label="Contents">
        <textarea
          className="textarea mono"
          style={{ minHeight: 260 }}
          name="data"
          required
        />
      </Field>
      <button className="btn btn-primary">
        <Upload size={14} /> Validate and import
      </button>
      <div className="small muted">
        JSON:{" "}
        <span className="mono">{`{"name":"My values","values":[{"name":"Care","shortDefinition":"Supporting flourishing"}]}`}</span>
        <br />
        CSV: <span className="mono">name,short_definition,parent_category</span>
      </div>
    </form>
  );
}

function SettingsView({ repo, db, mutate }: ViewProps) {
  const settings = repo.settings();
  const contexts = db.query<ContextRow>(
    "SELECT id,name,description,archived FROM contexts ORDER BY name",
  );
  return (
    <Page
      title="Settings"
      description="Algorithm priors, draw model, adaptive selection, convergence goals, display bias controls, contexts, and export preferences."
    >
      <div className="grid two-col">
        <Panel title="Rating and convergence">
          <div className="notice notice-warning small">
            Changing rating parameters requires deterministic replay of all
            comparison events. Saving below performs that replay immediately.
          </div>
          <form
            className="stack"
            style={{ marginTop: 14 }}
            onSubmit={(event) => {
              const data = submit(event);
              const rating = {
                ...settings.rating,
                mu: Number(data.get("mu")),
                sigma: Number(data.get("sigma")),
                beta: Number(data.get("beta")),
                tau: Number(data.get("tau")),
                drawProbability: Number(data.get("draw")),
                conservativeK: Number(data.get("k")),
                modifiersEnabled: Boolean(data.get("modifiers")),
              };
              const convergence = {
                ...settings.convergence,
                topK: Number(data.get("topK")),
                minimumComparisons: Number(data.get("minimum")),
                stabilityWindow: Number(data.get("window")),
                uncertaintyThreshold: Number(data.get("threshold")),
                retestFrequency: Number(data.get("retest")),
                tiersSufficient: Boolean(data.get("tiers")),
              };
              const selection = {
                ...settings.selection,
                uncertainty: Number(data.get("weightUncertainty")),
                similarity: Number(data.get("weightSimilarity")),
                topFocus: Number(data.get("weightTop")),
                boundary: Number(data.get("weightBoundary")),
                coverage: Number(data.get("weightCoverage")),
                retest: Number(data.get("weightRetest")),
                crossCategory: Number(data.get("weightCategory")),
                contradiction: Number(data.get("weightContradiction")),
                contextDisagreement: Number(data.get("weightContext")),
              };
              const display = {
                ...settings.display,
                showRatingsDuringComparison: Boolean(data.get("showRatings")),
              };
              mutate(async () => {
                await db.transaction(() => {
                  db.run(
                    "UPDATE application_settings SET value=?,updated_at=? WHERE key='rating'",
                    [JSON.stringify(rating), Date.now()],
                  );
                  db.run(
                    "UPDATE application_settings SET value=?,updated_at=? WHERE key='convergence'",
                    [JSON.stringify(convergence), Date.now()],
                  );
                  db.run(
                    "UPDATE application_settings SET value=?,updated_at=? WHERE key='selection'",
                    [JSON.stringify(selection), Date.now()],
                  );
                  db.run(
                    "UPDATE application_settings SET value=?,updated_at=? WHERE key='display'",
                    [JSON.stringify(display), Date.now()],
                  );
                });
                for (const set of repo.sets()) await repo.recompute(set.id);
              });
            }}
          >
            <div className="form-grid">
              <Num name="mu" label="Initial mean" value={settings.rating.mu} />
              <Num
                name="sigma"
                label="Initial uncertainty"
                value={settings.rating.sigma}
              />
              <Num
                name="beta"
                label="Performance variance"
                value={settings.rating.beta}
              />
              <Num name="tau" label="Dynamics" value={settings.rating.tau} />
              <Num
                name="draw"
                label="Draw probability"
                value={settings.rating.drawProbability}
              />
              <Num
                name="k"
                label="Conservative coefficient"
                value={settings.rating.conservativeK}
              />
              <Num
                name="topK"
                label="Desired top-k"
                value={settings.convergence.topK}
              />
              <Num
                name="minimum"
                label="Minimum comparisons"
                value={settings.convergence.minimumComparisons}
              />
              <Num
                name="window"
                label="Stability window"
                value={settings.convergence.stabilityWindow}
              />
              <Num
                name="threshold"
                label="Uncertainty threshold"
                value={settings.convergence.uncertaintyThreshold}
              />
              <Num
                name="retest"
                label="Retest frequency"
                value={settings.convergence.retestFrequency}
              />
            </div>
            <details>
              <summary>Adaptive selection weights</summary>
              <div className="form-grid" style={{ marginTop: 10 }}>
                <Num
                  name="weightUncertainty"
                  label="Uncertainty"
                  value={settings.selection.uncertainty}
                />
                <Num
                  name="weightSimilarity"
                  label="Similarity"
                  value={settings.selection.similarity}
                />
                <Num
                  name="weightTop"
                  label="Top focus"
                  value={settings.selection.topFocus}
                />
                <Num
                  name="weightBoundary"
                  label="Top-k boundary"
                  value={settings.selection.boundary}
                />
                <Num
                  name="weightCoverage"
                  label="Coverage"
                  value={settings.selection.coverage}
                />
                <Num
                  name="weightRetest"
                  label="Retest"
                  value={settings.selection.retest}
                />
                <Num
                  name="weightCategory"
                  label="Cross-category"
                  value={settings.selection.crossCategory}
                />
                <Num
                  name="weightContradiction"
                  label="Contradiction"
                  value={settings.selection.contradiction}
                />
                <Num
                  name="weightContext"
                  label="Context disagreement"
                  value={settings.selection.contextDisagreement}
                />
              </div>
            </details>
            <label className="check-row">
              <input
                type="checkbox"
                name="modifiers"
                defaultChecked={settings.rating.modifiersEnabled}
              />{" "}
              Let strength and confidence apply bounded observation-noise
              modifiers
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="tiers"
                defaultChecked={settings.convergence.tiersSufficient}
              />{" "}
              Stable tiers are sufficient
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="showRatings"
                defaultChecked={settings.display.showRatingsDuringComparison}
              />{" "}
              Show current ratings during comparison
            </label>
            <div className="row">
              <button className="btn btn-primary">Save and replay</button>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  mutate(async () => {
                    await db.transaction(() => {
                      for (const key of [
                        "rating",
                        "selection",
                        "convergence",
                      ] as const)
                        db.run(
                          "UPDATE application_settings SET value=?,updated_at=? WHERE key=?",
                          [
                            JSON.stringify(DEFAULT_SETTINGS[key]),
                            Date.now(),
                            key,
                          ],
                        );
                    });
                    for (const set of repo.sets()) await repo.recompute(set.id);
                  })
                }
              >
                Reset algorithm defaults
              </button>
            </div>
          </form>
        </Panel>
        <div className="stack">
          <ScenarioSettings />
          <Panel title="Contexts">
            <div className="stack">
              {contexts.map((context) => (
                <form
                  className="spread"
                  key={context.id}
                  onSubmit={(event) => {
                    const data = submit(event);
                    mutate(() =>
                      db.transaction(() =>
                        db.run(
                          "UPDATE contexts SET name=?,description=?,archived=?,updated_at=? WHERE id=?",
                          [
                            data.get("name"),
                            data.get("description"),
                            data.get("archived") ? 1 : 0,
                            Date.now(),
                            context.id,
                          ],
                        ),
                      ),
                    );
                  }}
                >
                  <input
                    className="input"
                    name="name"
                    defaultValue={context.name}
                  />
                  <input
                    className="input"
                    name="description"
                    defaultValue={context.description}
                  />
                  <button className="btn btn-sm">Save</button>
                  <label className="check-row small">
                    <input
                      type="checkbox"
                      name="archived"
                      defaultChecked={Boolean(context.archived)}
                    />{" "}
                    Archived
                  </label>
                </form>
              ))}
            </div>
            <form
              className="row"
              style={{ marginTop: 12 }}
              onSubmit={(event) => {
                const data = submit(event);
                mutate(() =>
                  db.transaction(() =>
                    db.run("INSERT INTO contexts VALUES (?,?,?,?,?,?,?)", [
                      uid(),
                      data.get("name"),
                      data.get("description"),
                      0,
                      0,
                      Date.now(),
                      Date.now(),
                    ]),
                  ),
                );
                event.currentTarget.reset();
              }}
            >
              <input
                className="input"
                name="name"
                placeholder="New context"
                required
              />
              <input
                className="input"
                name="description"
                placeholder="Description"
              />
              <button className="btn">
                <Plus size={14} />
              </button>
            </form>
          </Panel>
          <Panel title="Rating modifier policy">
            <p>
              Disabled by default. When enabled, decision strength and
              confidence multiply performance variance by transparent factors
              bounded from 0.85 to 1.15. They never change the recorded outcome,
              and replay remains deterministic.
            </p>
          </Panel>
          <ResetEvidence repo={repo} mutate={mutate} />
        </div>
      </div>
    </Page>
  );
}

function ScenarioSettings() {
  const initial = scenarioConfig();
  const [provider, setProvider] = useState<ScenarioConfig["provider"]>(initial.provider);
  const [saved, setSaved] = useState(false);
  return (
    <Panel title="Decision scenarios">
      <form
        className="stack"
        onSubmit={(event) => {
          const data = submit(event);
          localStorage.setItem("scenario-provider", provider);
          localStorage.setItem("scenario-model", String(data.get("model") ?? ""));
          const key = String(data.get("apiKey") ?? "").trim();
          if (key) sessionStorage.setItem("scenario-api-key", key);
          else sessionStorage.removeItem("scenario-api-key");
          setSaved(true);
        }}
      >
        <Field label="Generator">
          <select
            className="select"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as ScenarioConfig["provider"]);
              setSaved(false);
            }}
          >
            <option value="local">On-device · definitions only</option>
            <option value="openrouter">OpenRouter Free</option>
            <option value="deepseek">DeepSeek V4 Flash</option>
          </select>
        </Field>
        {provider !== "local" && (
          <>
            <Field label="API key · kept for this tab only">
              <input
                className="input"
                name="apiKey"
                type="password"
                autoComplete="off"
                defaultValue={initial.apiKey}
                required
              />
            </Field>
            <Field label="Model">
              <input
                className="input"
                name="model"
                defaultValue={
                  initial.model ||
                  (provider === "openrouter" ? "openrouter/free" : "deepseek-v4-flash")
                }
              />
            </Field>
          </>
        )}
        <div className="spread">
          <span className="small muted">
            {provider === "local"
              ? "No network request. Scenarios are composed from the active definitions."
              : "Generated automatically when each rapid question opens."}
          </span>
          <button className="btn btn-primary">{saved ? "Saved" : "Save"}</button>
        </div>
      </form>
    </Panel>
  );
}

function ResetEvidence({ repo, mutate }: Pick<ViewProps, "repo" | "mutate">) {
  const sets = repo.sets();
  const [setId, setSetId] = useState(sets[0]?.id ?? "");
  const [setConfirmation, setSetConfirmation] = useState("");
  const [allConfirmation, setAllConfirmation] = useState("");
  const selected = sets.find((set) => set.id === setId);
  return (
    <Panel title="Reset ranking evidence">
      <div className="stack">
        <p className="small muted">
          Comparisons, sessions, ratings, snapshots, claims, tensions, and manual tiers are removed. Values and definitions remain.
        </p>
        <Field label="Value set">
          <select className="select" value={setId} onChange={(event) => setSetId(event.target.value)}>
            {sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
          </select>
        </Field>
        <Field label={`Type RESET ${selected?.name ?? "SET"}`}>
          <input className="input" value={setConfirmation} onChange={(event) => setSetConfirmation(event.target.value)} />
        </Field>
        <button
          className="btn btn-danger"
          disabled={!selected || setConfirmation !== `RESET ${selected.name}`}
          onClick={() =>
            mutate(async () => {
              await repo.resetEvidence(setId);
              setSetConfirmation("");
            })
          }
        >
          Reset this value set
        </button>
        <hr className="divider" />
        <Field label="Type RESET ALL">
          <input className="input" value={allConfirmation} onChange={(event) => setAllConfirmation(event.target.value)} />
        </Field>
        <button
          className="btn btn-danger"
          disabled={allConfirmation !== "RESET ALL"}
          onClick={() =>
            mutate(async () => {
              await repo.resetEvidence();
              setAllConfirmation("");
            })
          }
        >
          Reset every value set
        </button>
      </div>
    </Panel>
  );
}
const Num = ({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) => (
  <Field label={label}>
    <input
      className="input"
      type="number"
      step="any"
      name={name}
      defaultValue={value}
    />
  </Field>
);

function SearchView({ repo, db }: ViewProps) {
  const query =
    new URLSearchParams(location.hash.split("?")[1]).get("q")?.toLowerCase() ??
    "";
  const values = db
    .query<ValueRow>('SELECT * FROM "values"')
    .filter((value) =>
      `${value.name} ${value.short_definition} ${value.source_definition} ${value.personal_definition}`
        .toLowerCase()
        .includes(query),
    );
  const events = repo
    .history()
    .filter((event) =>
      `${event.left_name} ${event.right_name} ${(event.notes ?? []).map((note) => note.text).join(" ")}`
        .toLowerCase()
        .includes(query),
    );
  const claims = db
    .query<{ id: string; text: string }>("SELECT id,text FROM claims")
    .filter((claim) => claim.text.toLowerCase().includes(query));
  const tensions = db
    .query<{
      id: string;
      title: string;
      description: string;
    }>("SELECT id,title,description FROM tensions")
    .filter((tension) =>
      `${tension.title} ${tension.description}`.toLowerCase().includes(query),
    );
  return (
    <Page
      title="Search"
      description={`Practical local search results for “${query}”.`}
    >
      <div className="grid two-col">
        <Panel title={`Values (${values.length})`}>
          <div className="stack">
            {values.map((value) => (
              <a className="btn spread" href="#values" key={value.id}>
                <strong>{value.name}</strong>
                <span className="small muted">{value.short_definition}</span>
              </a>
            ))}
          </div>
        </Panel>
        <Panel title={`Comparison notes (${events.length})`}>
          <div className="stack">
            {events.map((event) => (
              <a
                className="notice"
                href={`#history?event=${event.id}`}
                key={event.id}
              >
                <strong>
                  {event.left_name} vs {event.right_name}
                </strong>
                <div className="small">
                  {event.notes?.map((note) => note.text).join(" · ")}
                </div>
              </a>
            ))}
          </div>
        </Panel>
        <Panel title={`Claims (${claims.length})`}>
          {claims.map((claim) => (
            <p key={claim.id}>
              {claim.text}{" "}
              <span className="mono">[{claim.id.slice(0, 8)}]</span>
            </p>
          ))}
        </Panel>
        <Panel title={`Tensions (${tensions.length})`}>
          {tensions.map((tension) => (
            <p key={tension.id}>
              <strong>{tension.title}</strong> · {tension.description}
            </p>
          ))}
        </Panel>
      </div>
    </Page>
  );
}

function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]!);
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    columns.map(cell).join(","),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(",")),
  ].join("\n");
}
