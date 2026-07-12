"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Ban, ChevronDown, Equal, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { submitComparisonAction } from "@/app/actions";

interface ValueView { id: string; name: string; definition: string; sourceDefinition: string; taxonomy: string; category: string; notes: string[]; rank?: number; sigma?: number }

export function ComparisonForm({ sessionId, valueSetId, left, right, contexts, defaultContextIds, selectionReason, showRatings }: { sessionId: string; valueSetId: string; left: ValueView; right: ValueView; contexts: { id: string; name: string }[]; defaultContextIds: string[]; selectionReason: string; showRatings: boolean }) {
  const formRef = useRef<HTMLFormElement>(null); const [deeper, setDeeper] = useState(false);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase(); const mapping: Record<string, string> = { "1": "left", "2": "tie", "3": "right", i: "incomparable", s: "skip", u: "malformed" };
      if (mapping[key]) { event.preventDefault(); buttons.current[mapping[key]]?.click(); }
      if (key === "n") { event.preventDefault(); setDeeper((value) => !value); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, []);

  return <form ref={formRef} action={submitComparisonAction}>
    <input type="hidden" name="sessionId" value={sessionId} /><input type="hidden" name="valueSetId" value={valueSetId} /><input type="hidden" name="leftValueId" value={left.id} /><input type="hidden" name="rightValueId" value={right.id} /><input type="hidden" name="selectionReason" value={selectionReason} />
    <div className="compare-layout">
      {[left, right].map((value, index) => <article className="value-card" key={value.id} aria-label={`${index === 0 ? "Left" : "Right"} value: ${value.name}`}>
        <div><div className="spread"><span className="badge">{value.category || value.taxonomy || "Personal value"}</span>{showRatings && value.rank && <span className="small muted">Estimated rank {value.rank} · σ {value.sigma?.toFixed(2)}</span>}</div><h2>{value.name}</h2><p>{value.definition || "This value needs a clearer definition."}</p>{value.notes.length > 0 && <div className="notice" style={{ marginTop: 16 }}><strong className="small">Relevant prior note</strong><div className="small">{value.notes[0]}</div></div>}</div>
        <details><summary className="small row"><ChevronDown size={14} /> Source definition and taxonomy</summary><p className="small muted" style={{ marginTop: 9 }}>{value.sourceDefinition || "No separate source definition."}</p><p className="small muted" style={{ marginTop: 5 }}>{value.taxonomy || "No source taxonomy"}</p></details>
      </article>).reduce<React.ReactNode[]>((nodes, card, index) => index === 0 ? [card, <div className="versus" key="versus">OR</div>] : [...nodes, card], [])}
    </div>
    <div className="decision-bar">
      <div className="decision-side"><button ref={(node) => { buttons.current.left = node; }} className="btn btn-primary" name="result" value="left" type="submit"><ArrowLeft size={16} /> Left wins <span className="shortcut">1</span></button><button ref={(node) => { buttons.current.tie = node; }} className="btn" name="result" value="tie" type="submit"><Equal size={16} /> Tie <span className="shortcut">2</span></button></div>
      <span />
      <div className="decision-side"><button ref={(node) => { buttons.current.tie = node; }} className="btn" name="result" value="tie" type="submit"><Equal size={16} /> Tie <span className="shortcut">2</span></button><button ref={(node) => { buttons.current.right = node; }} className="btn btn-primary" name="result" value="right" type="submit">Right wins <ArrowRight size={16} /> <span className="shortcut">3</span></button></div>
    </div>
    <div className="decision-secondary" style={{ marginTop: 10 }}>
      <button ref={(node) => { buttons.current.incomparable = node; }} className="btn btn-sm" name="result" value="incomparable" type="submit"><Ban size={14} /> Incomparable <span className="shortcut">I</span></button>
      <button ref={(node) => { buttons.current.skip = node; }} className="btn btn-sm" name="result" value="skip" type="submit"><SkipForward size={14} /> Skip <span className="shortcut">S</span></button>
      <button ref={(node) => { buttons.current.malformed = node; }} className="btn btn-sm" name="result" value="malformed" type="submit"><AlertCircle size={14} /> Definition unclear <span className="shortcut">U</span></button>
      <button className="btn btn-sm" type="button" onClick={() => setDeeper((value) => !value)}><ChevronDown size={14} /> Decision notes <span className="shortcut">N</span></button>
    </div>
    <section className="panel" style={{ marginTop: 16 }}><div className="panel-body form-grid">
      <div className="field"><label htmlFor="strength">Decision strength</label><select className="select" id="strength" name="strength" defaultValue="moderate"><option value="slight">Slight</option><option value="moderate">Moderate</option><option value="strong">Strong</option></select></div>
      <div className="field"><label htmlFor="confidence">Confidence</label><select className="select" id="confidence" name="confidence" defaultValue="confident"><option value="uncertain">Uncertain</option><option value="somewhat">Somewhat confident</option><option value="confident">Confident</option><option value="highly">Highly confident</option></select></div>
      <div className="field"><span className="field-label">Context</span><div className="row" style={{ flexWrap: "wrap" }}>{contexts.map((context) => <label className="check-row small" key={context.id}><input type="checkbox" name="contextIds" value={context.id} defaultChecked={defaultContextIds.includes(context.id)} /> {context.name}</label>)}</div></div>
      <div className="field"><label htmlFor="consideration">Decision basis</label><select className="select" id="consideration" name="consideration"><option value="intrinsic">Intrinsic preference</option><option value="obligation">Obligation</option><option value="instrumental">Instrumental consideration</option><option value="uncertainty">Uncertainty</option></select></div>
    </div></section>
    {deeper && <section className="panel" style={{ marginTop: 16 }}><div className="panel-head"><h2 className="panel-title">Preserve the reasoning</h2><span className="small muted">All fields optional</span></div><div className="panel-body form-grid">
      <div className="field"><label htmlFor="reasoning">Free-form reasoning</label><textarea className="textarea" id="reasoning" name="reasoning" /></div>
      <div className="field"><label htmlFor="winner_mattered">Why the winner mattered more</label><textarea className="textarea" id="winner_mattered" name="winner_mattered" /></div>
      <div className="field"><label htmlFor="loser_protects">What the loser still protects or contributes</label><textarea className="textarea" id="loser_protects" name="loser_protects" /></div>
      <div className="field"><label htmlFor="reversal">What circumstances would reverse this decision?</label><textarea className="textarea" id="reversal" name="reversal" /></div>
      <div className="field"><label htmlFor="tags">Tags, comma separated</label><input className="input" id="tags" name="tags" /></div>
    </div></section>}
  </form>;
}
