import { desc, inArray } from "drizzle-orm";
import { db, getSettings } from "@/db";
import * as s from "@/db/schema";
import { fullHistory, listValueSets, rankings } from "@/db/services";
import { PageHeader, Panel, EmptyState } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const query = await searchParams;
  const sets = listValueSets();
  const set = sets.find((item) => item.id === query.set) ?? sets[0];
  if (!set)
    return (
      <div className="page">
        <PageHeader
          title="Reports"
          description="Printable evidence-backed analysis."
        />
        <Panel>
          <EmptyState title="No value set">
            Create or import values first.
          </EmptyState>
        </Panel>
      </div>
    );
  const rows = rankings(set.id);
  const events = fullHistory(set.id);
  const tensions = db
    .select()
    .from(s.tensions)
    .where(inArray(s.tensions.status, ["accepted", "suggested"]))
    .all();
  const claims = db
    .select()
    .from(s.claims)
    .where(inArray(s.claims.status, ["accepted", "draft"]))
    .all();
  const revisions = db
    .select()
    .from(s.definitionRevisions)
    .orderBy(desc(s.definitionRevisions.createdAt))
    .all();
  const settings = getSettings();
  return (
    <div className="page">
      <PageHeader
        title="Reports"
        description="Statistical results and interpretations with evidence identifiers."
        actions={
          <div className="row">
            <form action="/reports">
              <select className="select" name="set" defaultValue={set.id}>
                {sets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button className="btn">Open</button>
            </form>
            <PrintButton />
          </div>
        }
      />
      <article className="panel panel-body">
        <h1>{set.name}</h1>
        <p className="small muted">
          Generated {new Date().toLocaleString()} · schema 1
        </p>
        <h2>Methodology</h2>
        <p>
          Two-player TrueSkill ratings replay the effective immutable comparison
          log. Incomparable, skipped, and malformed outcomes are not draws.
          Strength/confidence modifiers are{" "}
          {settings.rating.modifiersEnabled ? "enabled" : "disabled"}.
        </p>
        <h2>Overall ranking</h2>
        <ol>
          {rows.map((row) => (
            <li key={row.valueId}>
              <strong>{row.value.name}</strong> · μ {row.mu.toFixed(2)}, σ{" "}
              {row.sigma.toFixed(2)}, n={row.comparisons}
            </li>
          ))}
        </ol>
        <h2>Claims</h2>
        {claims.map((claim) => (
          <p key={claim.id}>
            <span className="badge">
              {claim.creationMethod} · {claim.status}
            </span>{" "}
            {claim.text} <span className="mono">[{claim.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Tensions</h2>
        {tensions.map((tension) => (
          <p key={tension.id}>
            <strong>{tension.title}</strong> · {tension.description}{" "}
            <span className="mono">[{tension.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Definition changes</h2>
        {revisions.slice(0, 20).map((revision) => (
          <p className="small" key={revision.id}>
            {revision.changeNote} · {revision.createdAt.toLocaleString()}{" "}
            <span className="mono">[{revision.id.slice(0, 8)}]</span>
          </p>
        ))}
        <h2>Comparison appendix</h2>
        {events.map((event) => (
          <p className="small" key={event.id}>
            <span className="mono">[{event.id.slice(0, 8)}]</span>{" "}
            {event.left.name} vs {event.right.name} · {event.result} ·{" "}
            {event.notes.map((note) => note.text).join(" | ")}
          </p>
        ))}
      </article>
    </div>
  );
}
