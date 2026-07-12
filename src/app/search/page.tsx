import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { fullHistory } from "@/db/services";
import { EmptyState, PageHeader, Panel } from "@/components/ui";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? "";
  const needle = query.toLowerCase();
  const values = db
    .select()
    .from(s.values)
    .all()
    .filter((value) =>
      `${value.name} ${value.shortDefinition} ${value.sourceDefinition} ${value.personalDefinition}`
        .toLowerCase()
        .includes(needle),
    );
  const history = fullHistory().filter((event) =>
    `${event.left.name} ${event.right.name} ${event.notes.map((note) => note.text).join(" ")}`
      .toLowerCase()
      .includes(needle),
  );
  const claims = db
    .select()
    .from(s.claims)
    .orderBy(desc(s.claims.updatedAt))
    .all()
    .filter((claim) => claim.text.toLowerCase().includes(needle));
  const tensions = db
    .select()
    .from(s.tensions)
    .orderBy(desc(s.tensions.updatedAt))
    .all()
    .filter((tension) =>
      `${tension.title} ${tension.description} ${tension.userNotes}`
        .toLowerCase()
        .includes(needle),
    );
  const sessions = db
    .select()
    .from(s.comparisonSessions)
    .all()
    .filter((session) =>
      `${session.name} ${session.description} ${session.notes}`
        .toLowerCase()
        .includes(needle),
    );
  return (
    <div className="page">
      <PageHeader
        title="Search"
        description={query ? `Results for ${query}` : "Search local records."}
      />
      {!query ? (
        <Panel>
          <EmptyState title="Enter a search term">
            Use the search field above.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid two-col">
          <Panel title={`Values · ${values.length}`}>
            <div className="stack">
              {values.map((value) => (
                <Link
                  className="btn spread"
                  href={`/values/${value.id}`}
                  key={value.id}
                >
                  <strong>{value.name}</strong>
                  <span className="small muted">{value.shortDefinition}</span>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel title={`Comparison notes · ${history.length}`}>
            <div className="stack">
              {history.map((event) => (
                <Link
                  className="notice"
                  href={`/history?event=${event.id}`}
                  key={event.id}
                >
                  <strong>
                    {event.left.name} vs {event.right.name}
                  </strong>
                  <div className="small">
                    {event.notes.map((note) => note.text).join(" · ")}
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
          <Panel title={`Claims · ${claims.length}`}>
            {claims.map((claim) => (
              <p key={claim.id}>
                {claim.text}{" "}
                <span className="mono">[{claim.id.slice(0, 8)}]</span>
              </p>
            ))}
          </Panel>
          <Panel title={`Tensions · ${tensions.length}`}>
            {tensions.map((tension) => (
              <p key={tension.id}>
                <strong>{tension.title}</strong> · {tension.description}
              </p>
            ))}
          </Panel>
          <Panel title={`Sessions · ${sessions.length}`}>
            {sessions.map((session) => (
              <p key={session.id}>
                <strong>{session.name}</strong> · {session.notes}
              </p>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
