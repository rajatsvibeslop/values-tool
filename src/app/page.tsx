import Link from "next/link";
import { ArrowRight, Play, Plus, TriangleAlert } from "lucide-react";
import { db, getSettings } from "@/db";
import * as s from "@/db/schema";
import { dashboardData, rankings, valuesForSet } from "@/db/services";
import { convergenceDiagnostics } from "@/domain/convergence";
import { EmptyState, Metric, PageHeader, Panel } from "@/components/ui";
import { importPresetAction } from "./actions";
import { asc, desc, eq, inArray } from "drizzle-orm";

export default function DashboardPage() {
  const data = dashboardData(); const settings = getSettings();
  if (!data.selected) {
    const presets = db.select().from(s.presets).orderBy(asc(s.presets.name)).all();
    return <div className="page"><PageHeader title="Dashboard" description="Rank personal values through adaptive comparisons while keeping the reasoning behind every choice." />
      <Panel title="Choose a starting value set"><div className="grid three-col">{presets.map((preset) => { const catalog = preset.data as { description?: string; values?: unknown[] }; return <form action={importPresetAction} className="panel-body stack" key={preset.id} style={{ border: "1px solid var(--border)", borderRadius: 6 }}><div><strong>{preset.name}</strong><p className="muted small">{catalog.description}</p></div><span className="badge">{catalog.values?.length ?? 0} values</span><input type="hidden" name="slug" value={preset.slug} /><button className="btn btn-primary" type="submit"><Plus size={15} /> Import preset</button></form>; })}</div><p className="small muted" style={{ marginBottom: 0 }}>You can also create a custom set or import JSON/CSV from the Values or Imports & exports pages.</p></Panel>
    </div>;
  }

  const values = valuesForSet(data.selected.id); const rankMap = new Map(data.ranking.map((row) => [row.valueId, row]));
  const snapshotRows = db.select().from(s.ratingSnapshots).where(eq(s.ratingSnapshots.valueSetId, data.selected.id)).orderBy(desc(s.ratingSnapshots.createdAt)).limit(settings.convergence.stabilityWindow).all();
  const entries = snapshotRows.length ? db.select().from(s.ratingSnapshotEntries).where(inArray(s.ratingSnapshotEntries.snapshotId, snapshotRows.map((snapshot) => snapshot.id))).orderBy(asc(s.ratingSnapshotEntries.rank)).all() : [];
  const recentRankings = snapshotRows.map((snapshot) => entries.filter((entry) => entry.snapshotId === snapshot.id).sort((a, b) => a.rank - b.rank).map((entry) => entry.valueId));
  const diagnostics = convergenceDiagnostics({ values: values.map((value) => ({ id: value.id, name: value.name, aliases: value.aliases, parentCategory: value.parentCategory, rating: rankMap.get(value.id) ?? { mu: settings.rating.mu, sigma: settings.rating.sigma, comparisons: 0, wins: 0, losses: 0, ties: 0, incomparable: 0, lastComparedAt: null } })), recentRankings, config: settings.convergence, suspectedContradictions: data.tensions.filter((tension) => tension.status === "suggested").length });
  const activeSession = data.sessions.find((session) => session.status === "active" || session.status === "paused");
  const contextRanks = data.contexts.map((context) => ({ context, rows: rankings(data.selected!.id, `context:${context.id}`) }));
  const disagreements = contextRanks.reduce((count, scoped) => count + scoped.rows.filter((row, index) => Math.abs(index - data.ranking.findIndex((global) => global.valueId === row.valueId)) >= 3).length, 0);

  return <div className="page">
    <PageHeader title="Dashboard" description={`${data.selected.name} · global evidence across ${values.length} active values`} actions={activeSession ? <Link className="btn btn-primary" href={`/compare?session=${activeSession.id}`}><Play size={16} /> Resume session</Link> : <Link className="btn btn-primary" href="/compare"><Plus size={16} /> New session</Link>} />
    <div className="grid metrics">
      <Metric label="Comparisons" value={data.comparisons} detail="Recorded decisions" />
      <Metric label="Evidence gaps" value={diagnostics.insufficientValues} detail={`Below ${settings.convergence.minimumComparisons} comparisons`} />
      <Metric label="Near-ties" value={diagnostics.unresolvedNearTies} detail="Overlapping adjacent estimates" />
      <Metric label="Suspected tensions" value={data.tensions.filter((item) => item.status === "suggested").length} detail={`${disagreements} context rank disagreements`} />
    </div>
    <div className="grid two-col" style={{ marginTop: 16 }}>
      <Panel title="Current global ranking" action={<Link className="btn btn-sm" href={`/rankings?set=${data.selected.id}`}>All rankings <ArrowRight size={14} /></Link>}>
        {data.ranking.length ? <div className="stack">{data.ranking.slice(0, settings.convergence.topK).map((row, index) => <Link href={`/values/${row.valueId}`} className="spread" key={row.valueId}><div className="row"><span className="rank-number">{index + 1}</span><div><strong>{row.value.name}</strong><div className="small muted">{row.value.parentCategory || "Uncategorized"} · {row.comparisons} comparisons</div></div></div><div style={{ textAlign: "right" }}><strong className="mono">{row.mu.toFixed(2)}</strong><div className="small muted">± {row.sigma.toFixed(2)}</div></div></Link>)}</div> : <EmptyState title="No rating evidence yet">Start a comparison session to estimate rankings.</EmptyState>}
      </Panel>
      <div className="stack">
        <Panel title="Convergence state"><div className="stack"><div className="row"><span className={`badge ${diagnostics.state === "more-needed" ? "badge-warning" : "badge-accent"}`}>{diagnostics.state.replaceAll("-", " ")}</span><strong>{Math.round(diagnostics.topKStability * 100)}% top-k stability</strong></div><p style={{ margin: 0 }}>{diagnostics.explanation}</p><div><div className="spread small"><span>Average uncertainty</span><span className="mono">{diagnostics.averageUncertainty.toFixed(2)} / {settings.convergence.uncertaintyThreshold.toFixed(2)}</span></div><div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, 100 - diagnostics.averageUncertainty / settings.rating.sigma * 100))}%` }} /></div></div><Link className="btn" href="/rankings?view=diagnostics">Inspect diagnostics</Link></div></Panel>
        <Panel title="Attention needed"><div className="stack">
          <Link className="spread" href="/tensions"><span className="row"><TriangleAlert size={16} color="var(--warning)" /> Suggested tensions</span><strong>{data.tensions.filter((item) => item.status === "suggested").length}</strong></Link>
          <Link className="spread" href="/rankings?view=contexts"><span>Context disagreements</span><strong>{disagreements}</strong></Link>
          <Link className="spread" href="/values?filter=sparse"><span>Values lacking evidence</span><strong>{diagnostics.insufficientValues}</strong></Link>
        </div></Panel>
      </div>
    </div>
    <Panel title="Recent ranking snapshots" action={<Link className="btn btn-sm" href="/rankings?view=timeline">View timeline</Link>} className="" >{snapshotRows.length ? <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Reason</th><th>Top value</th><th>Snapshot</th></tr></thead><tbody>{snapshotRows.slice(0, 6).map((snapshot) => { const top = entries.find((entry) => entry.snapshotId === snapshot.id && entry.rank === 1); return <tr key={snapshot.id}><td>{snapshot.createdAt.toLocaleString()}</td><td>{snapshot.reason.replaceAll("-", " ")}</td><td>{values.find((value) => value.id === top?.valueId)?.name ?? "No entries"}</td><td className="mono">{snapshot.id.slice(0, 8)}</td></tr>; })}</tbody></table></div> : <EmptyState title="No snapshots yet">Snapshots are captured before and after comparisons.</EmptyState>}</Panel>
  </div>;
}
