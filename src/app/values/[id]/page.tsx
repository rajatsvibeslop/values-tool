import Link from "next/link";
import { desc, eq, inArray, or } from "drizzle-orm";
import { ArrowLeft, Quote } from "lucide-react";
import { db } from "@/db";
import * as s from "@/db/schema";
import { createClaimAction } from "@/app/actions";
import { EmptyState, PageHeader, Panel } from "@/components/ui";

export default async function ValueProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const value = db.select().from(s.values).where(eq(s.values.id, id)).get();
  if (!value) return <div className="page"><PageHeader title="Value not found" description="This identifier does not exist in the local database." /><Link className="btn" href="/values"><ArrowLeft size={15} /> Values</Link></div>;
  const events = db.select().from(s.comparisonEvents).where(or(eq(s.comparisonEvents.leftValueId, id), eq(s.comparisonEvents.rightValueId, id))).orderBy(desc(s.comparisonEvents.occurredAt)).all(); const eventIds = events.map((event) => event.id);
  const notes = eventIds.length ? db.select().from(s.comparisonNotes).where(inArray(s.comparisonNotes.eventId, eventIds)).all() : []; const revisions = db.select().from(s.definitionRevisions).where(eq(s.definitionRevisions.valueId, id)).orderBy(desc(s.definitionRevisions.createdAt)).all(); const claims = db.select().from(s.claims).where(eq(s.claims.valueId, id)).orderBy(desc(s.claims.updatedAt)).all(); const sources = claims.length ? db.select().from(s.claimSources).where(inArray(s.claimSources.claimId, claims.map((claim) => claim.id))).all() : [];
  const won = events.filter((event) => (event.result === "left" && event.leftValueId === id) || (event.result === "right" && event.rightValueId === id)); const lost = events.filter((event) => (event.result === "left" && event.rightValueId === id) || (event.result === "right" && event.leftValueId === id));
  const noteText = (type: string, eventList = events) => notes.filter((note) => note.noteType === type && eventList.some((event) => event.id === note.eventId)); const tags = [...new Set(events.flatMap((event) => event.tags))];
  const allValues = db.select().from(s.values).all(); const counterpartNames = (eventList: typeof events) => [...new Set(eventList.map((event) => allValues.find((item) => item.id === (event.leftValueId === id ? event.rightValueId : event.leftValueId))?.name).filter(Boolean))].join(", ");
  return <div className="page"><PageHeader title={value.name} description={`${value.sourceTaxonomy || "Personal taxonomy"} · ${value.parentCategory || "Uncategorized"}`} actions={<Link className="btn" href="/values"><ArrowLeft size={15} /> Values</Link>} />
    <div className="grid two-col"><div className="stack"><Panel title="Current definition"><div className="stack"><div><span className="field-label">Current source definition</span><p>{value.sourceDefinition || "No source definition."}</p></div><div><span className="field-label">Current user definition</span><p>{value.personalDefinition || "No personal definition yet."}</p></div><div className="row"><span className="badge">{events.length} source comparisons</span>{tags.map((tag) => <span className="badge badge-accent" key={tag}>{tag}</span>)}</div></div></Panel>
      <Panel title="Evidence-backed profile"><div className="stack">
        <Evidence title="Why this value tends to win" notes={noteText("winner_mattered", won)} />
        <Evidence title="When it tends to lose" notes={noteText("winner_mattered", lost)} fallback={counterpartNames(lost) ? `Loses against: ${counterpartNames(lost)}` : undefined} />
        <Evidence title="What it protects" notes={noteText("loser_protects")} />
        <Evidence title="What it enables" notes={notes.filter((note) => /enable|allow|make possible/i.test(note.text))} />
        <Evidence title="What it costs" notes={notes.filter((note) => /cost|sacrifice|trade.?off/i.test(note.text))} />
        <Evidence title="Healthy expressions" notes={notes.filter((note) => /healthy|best|constructive/i.test(note.text))} />
        <Evidence title="Possible distorted expressions" notes={notes.filter((note) => /distort|excess|too much|unhealthy/i.test(note.text))} />
        <Evidence title="Common contexts" fallback="Context links are collected from each supporting comparison." notes={[]} />
        <Evidence title="Values it reinforces" fallback={counterpartNames(events.filter((event) => event.result === "tie")) || undefined} notes={[]} />
        <Evidence title="Values it conflicts with" fallback={counterpartNames([...won, ...lost]) || undefined} notes={[]} />
        <Evidence title="Conditions that reverse its priority" notes={noteText("reversal")} />
        <Evidence title="Unresolved questions and contradictions" notes={notes.filter((note) => /unclear|uncertain|question|contradict/i.test(note.text))} />
      </div></Panel>
      <Panel title="Representative quotations"><div className="stack">{notes.slice(0, 8).map((note) => <blockquote className="notice" key={note.id} style={{ margin: 0 }}><Quote size={14} /><div>“{note.text}”</div><Link className="small mono" href={`/history?event=${note.eventId}`}>Comparison {note.eventId.slice(0, 8)}</Link></blockquote>)}</div>{!notes.length && <EmptyState title="No quotations yet">Original note text is preserved here when comparisons include reasoning.</EmptyState>}</Panel>
    </div><div className="stack"><Panel title="Definition revision history">{revisions.length ? <div className="stack">{revisions.map((revision) => <div key={revision.id}><div className="spread"><strong>{revision.changeNote || "Revision"}</strong><span className="small muted">{revision.createdAt.toLocaleString()}</span></div><div className="small">{revision.personalDefinition || revision.shortDefinition}</div></div>)}</div> : <EmptyState title="No revisions">The current definition predates revision tracking.</EmptyState>}</Panel>
      <Panel title="Synthesized claims">{claims.length ? <div className="stack">{claims.map((claim) => <div className="notice" key={claim.id}><div className="spread"><span className="badge">{claim.status}</span><span className="small">{claim.creationMethod} · {claim.confidence}</span></div><p>{claim.text}</p><div className="small muted">{sources.filter((source) => source.claimId === claim.id).length} linked comparisons</div></div>)}</div> : <EmptyState title="No claims">Create a claim below without rewriting the source notes.</EmptyState>}<hr className="divider" /><details><summary>Create claim from evidence</summary><form action={createClaimAction} className="stack" style={{ marginTop: 12 }}><input type="hidden" name="valueId" value={id} /><input type="hidden" name="creationMethod" value="manual" /><div className="field"><label>Claim text</label><textarea className="textarea" name="text" required /></div><div className="form-grid"><div className="field"><label>Type</label><select className="select" name="claimType"><option>priority</option><option>protection</option><option>cost</option><option>reversal</option><option>interpretation</option></select></div><div className="field"><label>Confidence</label><select className="select" name="confidence"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div></div><input type="hidden" name="status" value="draft" /><div className="field"><span className="field-label">Supporting comparisons</span>{events.slice(0, 12).map((event) => <label className="check-row small" key={event.id}><input type="checkbox" name="supportingEventIds" value={event.id} /> {event.occurredAt.toLocaleDateString()} · {event.result} · {event.id.slice(0, 8)}</label>)}</div><button className="btn" type="submit">Create draft claim</button></form></details></Panel>
    </div></div>
  </div>;
}

function Evidence({ title, notes, fallback }: { title: string; notes: { id: string; eventId: string; text: string }[]; fallback?: string }) {
  return <div><strong>{title}</strong>{notes.length ? <ul>{notes.slice(0, 5).map((note) => <li key={note.id}>{note.text} <Link className="mono small" href={`/history?event=${note.eventId}`}>[{note.eventId.slice(0, 8)}]</Link></li>)}</ul> : <p className="small muted">{fallback ?? "No direct evidence recorded."}</p>}</div>;
}
