"use client";

import { GripVertical, Save } from "lucide-react";
import { useState } from "react";
import { saveManualTiersAction } from "@/app/actions";

interface Tier { name: string; valueIds: string[] }

export function ManualTiers({ valueSetId, values, initial }: { valueSetId: string; values: { id: string; name: string }[]; initial: Tier[] }) {
  const [tiers, setTiers] = useState<Tier[]>(initial.length ? initial : [{ name: "A", valueIds: [] }, { name: "B", valueIds: [] }, { name: "C", valueIds: [] }, { name: "Unplaced", valueIds: values.map((value) => value.id) }]);
  function drop(valueId: string, target: number) { setTiers((current) => current.map((tier, index) => ({ ...tier, valueIds: index === target ? [...tier.valueIds.filter((id) => id !== valueId), valueId] : tier.valueIds.filter((id) => id !== valueId) }))); }
  return <div><div className="panel">{tiers.map((tier, index) => <div className="tier-row" key={`${tier.name}-${index}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event.dataTransfer.getData("text/plain"), index)}><div className="tier-label">{tier.name}</div><div className="tier-values">{tier.valueIds.map((id) => <button type="button" className="btn btn-sm" draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", id)} key={id}><GripVertical size={13} /> {values.find((value) => value.id === id)?.name}</button>)}</div></div>)}</div><form action={saveManualTiersAction} className="form-actions"><input type="hidden" name="valueSetId" value={valueSetId} /><input type="hidden" name="tiers" value={JSON.stringify(tiers)} /><button className="btn" type="submit"><Save size={15} /> Save manual tiers</button></form></div>;
}
