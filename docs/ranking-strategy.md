# Ranking Strategy

## Goal

When a person's preference is stable, transitive, and easy to answer, the fastest route
to a complete order is a comparison sort, not an indefinitely replenished uncertainty
queue. A binary answer contains at most one bit. There are `n!` possible complete
orders, so any method needs at least `ceil(log2(n!))` answers in the worst case. For 100
values that lower bound is 525.

The default product target is instead a high-quality inferred order in fewer than 100
questions. Direct rapid sessions can ask the user to fully order five values. Hosted
scenario sessions use a less abstract portrait task: identify the person most and least
like the user among three controlled actions. The application uses a fixed budget of 80
and retains uncertainty rather than claiming a worst-case exact guarantee. Portrait mode
deliberately trades some information per question for lower cognitive load.

The application therefore uses a deterministic binary-insertion scheduler for exact
ordering sessions. Its worst case for 100 values is 573 decisive comparisons. It is
resumable, replays deterministically, uses a seeded starting order to avoid alphabetical
bias, and reuses consistent prior comparisons. The next question is always the one that
splits the remaining insertion interval approximately in half.

Sources:

- Jamieson and Nowak, *Active Ranking using Pairwise Comparisons* (NeurIPS 2011):
  https://papers.nips.cc/paper_files/paper/2011/hash/6c14da109e294d1e8155be8aa4b1ce8e-Abstract.html
- Princeton Algorithms, comparison-sorting lower bound and mergesort analysis:
  https://www.cs.princeton.edu/courses/archive/fall06/cos226/lectures/sort3.pdf
- Falahatgar et al., *Maximum Selection and Ranking under Noisy Comparisons* (ICML
  2017): https://proceedings.mlr.press/v70/falahatgar17a.html
- Heckel et al., *Approximate Ranking from Pairwise Comparisons* (AISTATS 2018):
  https://proceedings.mlr.press/v84/heckel18a.html
- Saha and Gopalan, *Active Ranking with Subset-wise Preferences* (AISTATS 2019):
  https://proceedings.mlr.press/v89/saha19a.html
- Schwartz et al., *Extending the Cross-Cultural Validity of the Theory of Basic Human
  Values with a Different Method of Measurement* (2001):
  https://doi.org/10.1177/0022022101032005001
- Marley and Louviere, *Some probabilistic models of best, worst, and best-worst
  choices* (2005): https://doi.org/10.1016/j.jmp.2005.05.003

## Division of responsibility

- **Exact-order scheduler:** establishes a finite partial or total order with as few new
  questions as practical under the stable-preference assumption.
- **Rapid scheduler:** selects five-value subsets for sparse coverage, uncertainty,
  boundary resolution, novel relations, and category diversity. A full answer is encoded
  as four adjacent relations, not ten falsely independent pairwise observations.
- **Portrait instrument:** assigns three distinct focal values before generation. The LLM
  verbalizes matched anonymous actions but cannot alter their hidden scoring keys. A
  most/least response creates two adjacent relations and retains the complete stimulus.
- **TrueSkill:** estimates latent strength and posterior uncertainty, including sparse
  contextual rankings.
- **Verification:** targets adjacent boundaries with weak posterior separation,
  contradictory repeated answers, cycles, and context reversals. It does not repeatedly
  sample already settled distant pairs.
- **Tiers:** preserve posterior overlap and explicit ties. Incomparability is never
  silently converted into a draw or an arbitrary fact.

## Why the queue contains one item

Binary insertion is adaptive: the answer determines the next midpoint. The UI therefore
shows one required comparison and a finite progress bound instead of pretending that a
20-item batch is independently valid. Manual comparisons remain available but do not
replace the exact-order question unless they answer that same unresolved relation.

## Limits

No pairwise method can guarantee an arbitrary exact order of 100 distinct items in 100
or 200 binary answers. Faster completion requires a weaker target (top-k or approximate
tiers), stronger modeling assumptions, or richer feedback such as fully ordering a
small group at once. When preferences are noisy or contextual, the exact-sort result is
a hypothesis that must be checked at its weakest adjacent boundaries.
