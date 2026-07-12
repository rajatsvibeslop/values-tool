import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, hasValueSets } from "@/db";
import * as s from "@/db/schema";
import { createSnapshot, importPreset, recomputeRatings, refreshTensionSuggestions, valuesForSet } from "@/db/services";

if (hasValueSets()) {
  console.log("Seed skipped: the target database already contains a value set.");
  process.exit(0);
}

const valueSetId = importPreset("editable-card-sort");
const values = valuesForSet(valueSetId);
const byName = new Map(values.map((value) => [value.name, value.id]));
const sessionId = randomUUID(); const started = new Date(Date.now() - 45 * 86400000);
db.insert(s.comparisonSessions).values({ id: sessionId, name: "Development evidence session", description: "Seeded comparisons demonstrating uncertainty and context effects", valueSetId, status: "completed", startedAt: started, endedAt: new Date(), completedCount: 0, notes: "Development-only demonstration history", beforeSnapshotId: null, afterSnapshotId: null, createdAt: started, updatedAt: new Date() }).run();

const comparisons = [
  ["Care", "Freedom", "left", "relationships"], ["Freedom", "Security", "left", "general-life"], ["Security", "Care", "left", "work"],
  ["Honesty", "Belonging", "left", "morality"], ["Belonging", "Honesty", "left", "relationships"], ["Curiosity", "Stability", "left", "creativity"],
  ["Stability", "Curiosity", "left", "work"], ["Meaning", "Joy", "left", "general-life"], ["Joy", "Meaning", "tie", "lifestyle"],
  ["Fairness", "Care", "tie", "morality"], ["Responsibility", "Freedom", "left", "work"], ["Freedom", "Responsibility", "left", "creativity"],
  ["Trust", "Mastery", "left", "relationships"], ["Mastery", "Trust", "left", "work"], ["Service", "Authenticity", "left", "community"],
  ["Authenticity", "Service", "left", "general-life"], ["Peace", "Mastery", "left", "lifestyle"], ["Growth", "Security", "left", "creativity"],
  ["Security", "Growth", "left", "relationships"], ["Wonder", "Stability", "incomparable", "creativity"], ["Tradition", "Curiosity", "malformed", "general-life"],
  ["Stewardship", "Joy", "left", "community"], ["Meaning", "Freedom", "left", "general-life"], ["Care", "Meaning", "right", "general-life"],
  ["Honesty", "Care", "left", "morality"], ["Care", "Honesty", "left", "relationships"], ["Responsibility", "Fairness", "tie", "work"],
] as const;

let index = 0;
for (const [leftName, rightName, result, contextId] of comparisons) {
  const id = randomUUID(); const occurredAt = new Date(started.getTime() + index * 36 * 60 * 60 * 1000); index++;
  db.transaction((tx) => {
    tx.insert(s.comparisonEvents).values({ id, sessionId, valueSetId, leftValueId: byName.get(leftName)!, rightValueId: byName.get(rightName)!, result, strength: index % 3 === 0 ? "strong" : "moderate", confidence: index % 4 === 0 ? "somewhat" : "confident", consideration: contextId === "morality" ? "obligation" : "intrinsic", tags: [contextId, result === "tie" ? "near-tie" : "tradeoff"], relatedEventIds: [], supersedesEventId: null, correctionReason: "", erroneous: false, selectionReason: index < 6 ? "Sparse evidence" : "Retest for stability", leftPresentedFirst: index % 2 === 0, occurredAt, createdAt: occurredAt }).run();
    tx.insert(s.comparisonEventContexts).values({ eventId: id, contextId }).run();
    tx.insert(s.comparisonNotes).values({ id: randomUUID(), eventId: id, noteType: "reasoning", text: `${leftName} and ${rightName} protect different needs in ${contextId.replace("-", " ")}.`, createdAt: occurredAt }).run();
    if (result === "left" || result === "right") tx.insert(s.comparisonNotes).values({ id: randomUUID(), eventId: id, noteType: "winner_mattered", text: `${result === "left" ? leftName : rightName} mattered more because it addressed the immediate stakes.`, createdAt: occurredAt }).run();
    if (index % 5 === 0) tx.insert(s.comparisonNotes).values({ id: randomUUID(), eventId: id, noteType: "reversal", text: `This priority could reverse when the ${contextId} constraints change.`, createdAt: occurredAt }).run();
  });
}
db.update(s.comparisonSessions).set({ completedCount: comparisons.length }).where(eq(s.comparisonSessions.id, sessionId)).run();
recomputeRatings(valueSetId); createSnapshot(valueSetId, "development-seed"); refreshTensionSuggestions(valueSetId);

const evidence = db.select().from(s.comparisonEvents).limit(3).all(); const claimId = randomUUID(); const stamp = new Date();
db.transaction((tx) => {
  tx.insert(s.claims).values({ id: claimId, valueId: byName.get("Care"), text: "Care is prioritized most consistently in close relationships.", claimType: "contextual_priority", confidence: "medium", status: "accepted", creationMethod: "manual", supersedesClaimId: null, createdAt: stamp, updatedAt: stamp }).run();
  for (const event of evidence) tx.insert(s.claimSources).values({ claimId, eventId: event.id, relationship: "supports" }).run();
  const accepted = tx.select().from(s.tensions).limit(1).get(); if (accepted) tx.update(s.tensions).set({ status: "accepted", userNotes: "Accepted for development demonstration" }).where(eq(s.tensions.id, accepted.id)).run();
  const dismissed = tx.select().from(s.tensions).limit(1).offset(1).get(); if (dismissed) tx.update(s.tensions).set({ status: "dismissed", userNotes: "Dismissed for development demonstration" }).where(eq(s.tensions.id, dismissed.id)).run();
});
console.log(`Seeded ${valueSetId} with ${values.length} values and ${comparisons.length} comparisons.`);
