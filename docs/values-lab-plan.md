# Values Lab Implementation Plan

## Target product

Refit the current values-tool codebase into the new Values Lab product spine:

- `Quiz` as the primary entry point
- `Reports` for inferred rankings and exports
- `Settings` for value sets, contexts, scoring, generation, and reset controls

## Work sequence

1. Collapse the exposed navigation to the new three-surface model.
2. Rename the primary comparison flow to `Quiz` and make it the default landing state.
3. Reduce the amount of explanatory text in the browser UI.
4. Keep the static GitHub Pages path as the user-facing runtime.
5. Align the Next.js shell so both adapters advertise the same product shape.
6. Preserve the existing local-first persistence, rating replay, export, and data-import machinery.

## Notes

- The current repository already has a durable data model and rating engine.
- The main risk is UI inconsistency between the static Pages app and the Next.js shell.
- The first pass should change the visible product shape before deeper feature work.
