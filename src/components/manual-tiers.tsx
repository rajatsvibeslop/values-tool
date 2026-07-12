"use client";

import { GripVertical, Save } from "lucide-react";
import { useState } from "react";
import { saveManualTiersAction } from "@/app/actions";

interface Tier {
  name: string;
  valueIds: string[];
}

const TIER_NAMES = ["S", "A", "B", "C", "D", "F"];

function normalizeTiers(initial: Tier[], values: { id: string }[]): Tier[] {
  const active = new Set(values.map((value) => value.id));
  const assigned = new Set<string>();
  const restored = initial.map((tier) => ({
    name: tier.name,
    valueIds: tier.valueIds.filter((id) => {
      if (!active.has(id) || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    }),
  }));
  const ordered = [
    ...TIER_NAMES.map(
      (name) => restored.find((tier) => tier.name === name) ?? { name, valueIds: [] },
    ),
    ...restored.filter(
      (tier) => tier.name !== "Unplaced" && !TIER_NAMES.includes(tier.name),
    ),
  ];
  const unplaced = restored.find((tier) => tier.name === "Unplaced") ?? {
    name: "Unplaced",
    valueIds: [],
  };
  unplaced.valueIds.push(
    ...values.map((value) => value.id).filter((id) => !assigned.has(id)),
  );
  ordered.push(unplaced);
  return ordered;
}

export function ManualTiers({
  valueSetId,
  values,
  initial,
}: {
  valueSetId: string;
  values: { id: string; name: string }[];
  initial: Tier[];
}) {
  const [tiers, setTiers] = useState<Tier[]>(() => normalizeTiers(initial, values));
  function drop(valueId: string, target: number) {
    setTiers((current) =>
      current.map((tier, index) => ({
        ...tier,
        valueIds:
          index === target
            ? [...tier.valueIds.filter((id) => id !== valueId), valueId]
            : tier.valueIds.filter((id) => id !== valueId),
      })),
    );
  }
  function moveNext(valueId: string) {
    const current = tiers.findIndex((tier) => tier.valueIds.includes(valueId));
    drop(valueId, current < 0 || current === tiers.length - 1 ? 0 : current + 1);
  }
  return (
    <div>
      <div className="panel">
        {tiers.map((tier, index) => (
          <div
            className="tier-row"
            key={`${tier.name}-${index}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event.dataTransfer.getData("text/plain"), index)}
          >
            <div className="tier-label">{tier.name}</div>
            <div className="tier-values">
              {tier.valueIds.map((id) => (
                <button
                  type="button"
                  className="btn btn-sm"
                  draggable
                  title={`Move to ${tiers[index === tiers.length - 1 ? 0 : index + 1]!.name}`}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", id)}
                  onClick={() => moveNext(id)}
                  key={id}
                >
                  <GripVertical size={13} />
                  {values.find((value) => value.id === id)?.name || "Unnamed value"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form action={saveManualTiersAction} className="form-actions">
        <input type="hidden" name="valueSetId" value={valueSetId} />
        <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
        <button className="btn" type="submit">
          <Save size={15} /> Save manual tiers
        </button>
      </form>
    </div>
  );
}
