import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  ListOrdered,
  Moon,
  Plus,
  RefreshCw,
  Search,
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
  type ValueRow,
  uid,
} from "./repository";
import { estimateRanks } from "@/domain/statistics";
import { convergenceDiagnostics } from "@/domain/convergence";
import { conservativeScore, TrueSkillRatingSystem } from "@/domain/rating";
import type { ComparisonResult, Confidence, Strength } from "@/domain/types";
import { DEFAULT_SETTINGS } from "@/db/defaults";
import Papa from "papaparse";

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
  ["data", "Imports & exports", Database],
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
      .then(setDb)
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
            {error
              ? "Database could not start"
              : "Opening local SQLite database"}
          </strong>
          {error ||
            "Loading the bundled SQLite WASM engine and IndexedDB data..."}
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
          <span className="small muted">SQLite · this browser</span>
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
          <div className="grid three-col">
            {presetCatalog.map((preset) => (
              <div
                className="panel-body stack"
                style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                key={preset.slug}
              >
                <div>
                  <strong>{preset.name}</strong>
                </div>
                <span className="badge">{preset.values.length} values</span>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    mutate(async () => {
                      const id = await repo.importPreset(preset.slug);
                      localStorage.setItem("values-set", id);
                    })
                  }
                >
                  <Plus size={15} /> Import preset
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </Page>
    );
  const values = repo.values(set.id);
  const ratings = repo.ratings(set.id);
  const sessions = repo.sessions();
  const history = repo.history(set.id);
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
          label="Comparisons"
          value={history.length}
          detail="Append-only events"
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
              {diagnostics.state.replaceAll("-", " ")}
            </span>
            <p>{diagnostics.explanation}</p>
            <div className="progress">
              <span
                style={{
                  width: `${Math.round(diagnostics.topKStability * 100)}%`,
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
  const [newSetId, setNewSetId] = useState(
    localStorage.getItem("values-set") ?? sets[0]?.id ?? "",
  );
  const session = creating
    ? undefined
    : sessions.find((item) => item.id === sessionId);
  const queue = session ? repo.queue(session.id) : [];
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
            {sets.length ? (
              <form
                className="stack"
                onSubmit={(event) => {
                  const data = submit(event);
                  mutate(async () => {
                    const selectedSetId = newSetId || sets[0]!.id;
                    const id = await repo.startSession(
                      selectedSetId,
                      String(data.get("name")),
                      data.getAll("contexts").map(String),
                    );
                    localStorage.setItem("values-set", selectedSetId);
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
                    value={newSetId || sets[0]?.id}
                    onChange={(event) => setNewSetId(event.target.value)}
                  >
                    {sets.map((set) => (
                      <option value={set.id} key={set.id}>
                        {set.name} ({set.value_count} values)
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="notice small">
                  This session will compare{" "}
                  <strong>
                    {
                      sets.find((set) => set.id === (newSetId || sets[0]?.id))
                        ?.name
                    }
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
                        defaultChecked={context.id === "general-life"}
                      />{" "}
                      {context.name}
                    </label>
                  ))}
                </div>
                <button className="btn btn-primary" type="submit">
                  Start session
                </button>
              </form>
            ) : (
              <Empty title="No value sets available">
                <a className="btn" href="#values">
                  Create or import a value set
                </a>
              </Empty>
            )}
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
  if (!pair || !left || !right)
    return (
      <Page
        title={session.name}
        description="No matchup is currently queued."
        actions={
          <button className="btn" onClick={() => setCreating(true)}>
            <Plus size={14} /> New session
          </button>
        }
      >
        <Panel>
          <button
            className="btn btn-primary"
            onClick={() => mutate(() => repo.regenerateQueue(session.id))}
          >
            <RefreshCw size={15} /> Regenerate adaptive queue
          </button>
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
        {session.completed_count} done · {queue.length} left
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
      description={`${session.completed_count} completed · ${queue.length} queued · ${pair.reason}`}
      actions={sessionActions}
    >
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
            Decision notes <span className="shortcut">N</span>
          </button>
        </div>
        <Panel>
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
          {notes && (
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
          )}
        </Panel>
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
          ? `${session.name} · inspect, reorder, regenerate, or add any manual pair.`
          : "Start a session to create an adaptive queue."
      }
      actions={
        session && (
          <button
            className="btn"
            onClick={() => mutate(() => repo.regenerateQueue(session.id))}
          >
            <RefreshCw size={15} /> Regenerate
          </button>
        )
      }
    >
      {session ? (
        <div className="grid two-col">
          <Panel title={`${queue.length} proposed matchups`}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pair</th>
                    <th>Reason</th>
                    <th>Score</th>
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
                      <td>{item.score.toFixed(2)}</td>
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
            </div>
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
      <Panel title="Ranking">
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
  const rows = repo.ratings(set.id, scope);
  const settings = repo.settings();
  const estimates = estimateRanks(
    new Map(rows.map((row) => [row.value_id, row])),
    settings.convergence.topK,
  );
  const system = new TrueSkillRatingSystem(settings.rating);
  const values = repo.values(set.id);
  const events = repo.events(set.id);
  const tiers: RatingRow[][] = [];
  rows.forEach((row) => {
    const previous = tiers.at(-1)?.at(-1);
    if (
      !previous ||
      Math.abs(previous.mu - row.mu) >
        Math.sqrt(previous.sigma ** 2 + row.sigma ** 2)
    )
      tiers.push([row]);
    else tiers.at(-1)!.push(row);
  });
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
          {["exact", "tiers", "uncertainty"].map((item) => (
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
          value={["exact", "tiers", "uncertainty"].includes(view) ? "" : view}
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
          <Panel title="Posterior ordering">
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
          <Panel title="95% posterior intervals">
            <div className="stack">
              {rows.map((row) => (
                <div key={row.value_id}>
                  <div className="spread">
                    <strong>{row.name}</strong>
                    <span className="mono">
                      {(row.mu - 2 * row.sigma).toFixed(1)}–
                      {(row.mu + 2 * row.sigma).toFixed(1)}
                    </span>
                  </div>
                  <div className="uncertainty-track" style={{ width: "100%" }}>
                    <span
                      style={{
                        width: `${Math.min(100, (row.sigma / settings.rating.sigma) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
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
  const rows = repo.ratings(set.id);
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
            Print HTML
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
      <article className="panel panel-body report">
        <h1>{set.name}</h1>
        <p className="muted">
          Generated {new Date().toLocaleString()} · Values Tool schema 1
        </p>
        <h2>Methodology and settings</h2>
        <p>
          Two-player TrueSkill posterior estimates are replayed from the
          effective immutable event stream. Incomparable, skipped, and malformed
          choices do not act as draws. Confidence modifiers are{" "}
          {repo.settings().rating.modifiersEnabled
            ? "enabled with bounded observation-noise adjustments"
            : "recorded but disabled for rating updates"}
          .
        </p>
        <h2>Overall ranking</h2>
        <ol>
          {rows.map((row) => (
            <li key={row.value_id}>
              <strong>{row.name}</strong> — μ {row.mu.toFixed(2)}, σ{" "}
              {row.sigma.toFixed(2)}, top evidence {row.comparisons}
            </li>
          ))}
        </ol>
        <h2>Context-specific differences</h2>
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
        <h2>Claims and top-value profiles</h2>
        {claims.map((claim) => (
          <p key={claim.id}>
            <span className="badge">
              {claim.creation_method} · {claim.status}
            </span>{" "}
            {claim.text} <span className="mono">[{claim.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Major tensions</h2>
        {tensions.map((tension) => (
          <p key={tension.id}>
            <strong>{tension.title}</strong> ({tension.status}) —{" "}
            {tension.description}{" "}
            <span className="mono">[{tension.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Uncertainty and unresolved questions</h2>
        <p>
          Posterior overlap indicates that tiers may be stable even where exact
          order is not. Context-only rankings with sparse evidence should be
          interpreted as unresolved.
        </p>
        <h2>Appendix of comparisons</h2>
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
      title="Imports & exports"
      description="Complete SQLite-backed backups, atomic restore, documented value-set imports, and normalized CSV analysis files."
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
          <Panel title="Portable SQLite">
            <p>
              The browser deployment runs the generated SQLite schema in a
              bundled WASM engine. Database bytes are stored in IndexedDB after
              every transaction and survive page reloads without a server,
              account, or external API.
            </p>
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
        </div>
      </div>
    </Page>
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
