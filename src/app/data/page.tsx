import { asc } from "drizzle-orm";
import { Download, FileJson, Upload } from "lucide-react";
import { db } from "@/db";
import * as s from "@/db/schema";
import { csvExports } from "@/db/transfer";
import { importValueSetAction, restoreBackupAction } from "../actions";
import { PageHeader, Panel } from "@/components/ui";

export default async function DataPage({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const query = await searchParams; const presets = db.select().from(s.presets).orderBy(asc(s.presets.name)).all();
  return <div className="page"><PageHeader title="Imports & exports" description="Portable backups, validated restores, value-set imports, and normalized datasets for independent analysis." />
    {query.restored && <div className="notice" style={{ marginBottom: 16 }}><strong>Backup restored</strong><div>All included records were validated and committed atomically.</div></div>}
    <div className="grid two-col"><div className="stack"><Panel title="Complete JSON backup"><p>Includes the schema and application version, value sets, definitions, contexts, sessions, immutable events, ratings, snapshots, claims, tensions, settings, and evidence links.</p><a className="btn btn-primary" href="/api/export/json"><FileJson size={16} /> Download complete backup</a></Panel>
      <Panel title="Normalized CSV dataset"><div className="grid form-grid">{Object.keys(csvExports).map((file) => <a className="btn spread" href={`/api/export/csv?file=${file}`} key={file}><span className="mono">{file}.csv</span><Download size={14} /></a>)}</div></Panel>
      <Panel title="Restore complete backup"><div className="notice notice-warning small">Restore replaces the current database contents. The import is parsed and validated before a single transaction deletes or inserts any record.</div><form action={restoreBackupAction} className="stack" style={{ marginTop: 14 }}><div className="field"><label htmlFor="file">Backup JSON file</label><input className="input" id="file" type="file" name="file" accept="application/json,.json" /></div><details><summary>Or paste JSON</summary><textarea className="textarea" name="data" style={{ minHeight: 180 }} /></details><button className="btn btn-danger" type="submit"><Upload size={15} /> Validate and restore</button></form></Panel>
    </div><div className="stack"><Panel title="Import a value set"><form action={importValueSetAction} className="stack"><div className="form-grid"><div className="field"><label>Format</label><select className="select" name="mode"><option value="json">JSON</option><option value="csv">CSV</option></select></div><div className="field"><label>CSV set name</label><input className="input" name="name" placeholder="Imported values" /></div></div><div className="field"><label>File contents</label><textarea className="textarea mono" style={{ minHeight: 280 }} name="data" required placeholder={'{"format":"values-tool-value-set","version":1,"name":"My values","values":[{"name":"Care","shortDefinition":"Supporting flourishing"}]}'}/></div><button className="btn btn-primary" type="submit"><Upload size={15} /> Validate and import</button></form><hr className="divider" /><div className="small muted"><strong>CSV columns</strong><br /><span className="mono">name, short_definition, source_definition, personal_definition, source_taxonomy, source_identifier, parent_category, aliases, tags</span><br />Separate aliases and tags with <span className="mono">|</span>. Only <span className="mono">name</span> is required.</div></Panel>
      <Panel title="Built-in catalog sources"><div className="stack">{presets.map((preset) => <div key={preset.id}><strong>{preset.name}</strong><div className="small muted">{preset.citation}</div><div className="small">{preset.licenseNote}</div></div>)}</div></Panel>
    </div></div>
  </div>;
}
