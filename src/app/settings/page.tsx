import { asc } from "drizzle-orm";
import { RotateCcw, Save } from "lucide-react";
import { db, getSettings } from "@/db";
import * as s from "@/db/schema";
import {
  createContextAction,
  resetAlgorithmSettingsAction,
  saveSettingsAction,
  updateContextAction,
} from "../actions";
import { PageHeader, Panel } from "@/components/ui";

export default function SettingsPage() {
  const settings = getSettings();
  const contexts = db
    .select()
    .from(s.contexts)
    .orderBy(asc(s.contexts.name))
    .all();
  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Rating, convergence, contexts, and display preferences."
      />
      <div className="grid two-col">
        <Panel title="Rating and convergence">
          <div className="notice notice-warning small">
            Rating changes replay the complete effective event log.
          </div>
          <form
            action={saveSettingsAction}
            className="stack"
            style={{ marginTop: 14 }}
          >
            <div className="form-grid">
              <NumberField
                name="mu"
                label="Initial mean"
                value={settings.rating.mu}
              />
              <NumberField
                name="sigma"
                label="Initial uncertainty"
                value={settings.rating.sigma}
              />
              <NumberField
                name="beta"
                label="Performance variance"
                value={settings.rating.beta}
              />
              <NumberField
                name="tau"
                label="Dynamics"
                value={settings.rating.tau}
              />
              <NumberField
                name="drawProbability"
                label="Draw probability"
                value={settings.rating.drawProbability}
              />
              <NumberField
                name="conservativeK"
                label="Conservative coefficient"
                value={settings.rating.conservativeK}
              />
              <NumberField
                name="topK"
                label="Desired top-k"
                value={settings.convergence.topK}
              />
              <NumberField
                name="minimumComparisons"
                label="Minimum comparisons"
                value={settings.convergence.minimumComparisons}
              />
              <NumberField
                name="stabilityWindow"
                label="Stability window"
                value={settings.convergence.stabilityWindow}
              />
              <NumberField
                name="uncertaintyThreshold"
                label="Uncertainty threshold"
                value={settings.convergence.uncertaintyThreshold}
              />
              <NumberField
                name="retestFrequency"
                label="Retest frequency"
                value={settings.convergence.retestFrequency}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                name="modifiersEnabled"
                defaultChecked={settings.rating.modifiersEnabled}
              />{" "}
              Let strength and confidence modify observation noise
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                name="tiersSufficient"
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
              Show ratings while comparing
            </label>
            <button className="btn btn-primary" type="submit">
              <Save size={14} /> Save and replay
            </button>
          </form>
          <form action={resetAlgorithmSettingsAction} style={{ marginTop: 8 }}>
            <button className="btn" type="submit">
              <RotateCcw size={14} /> Reset algorithm defaults
            </button>
          </form>
        </Panel>
        <Panel title="Contexts">
          <div className="stack">
            {contexts.map((context) => (
              <form
                action={updateContextAction}
                className="stack"
                key={context.id}
              >
                <input type="hidden" name="id" value={context.id} />
                <div className="form-grid">
                  <input
                    className="input"
                    name="name"
                    defaultValue={context.name}
                    aria-label={`${context.name} name`}
                  />
                  <input
                    className="input"
                    name="description"
                    defaultValue={context.description}
                    aria-label={`${context.name} description`}
                  />
                </div>
                <div className="spread">
                  <label className="check-row small">
                    <input
                      type="checkbox"
                      name="archived"
                      defaultChecked={context.archived}
                    />{" "}
                    Archived
                  </label>
                  <button className="btn btn-sm">Save</button>
                </div>
              </form>
            ))}
          </div>
          <hr className="divider" />
          <form action={createContextAction} className="stack">
            <div className="form-grid">
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
            </div>
            <button className="btn">Add context</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function NumberField({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        className="input"
        id={name}
        name={name}
        type="number"
        step="any"
        defaultValue={value}
      />
    </div>
  );
}
