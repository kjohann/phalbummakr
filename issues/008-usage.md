# 008 – Usage badges and duplicate warning

Status: todo · Depends on: 006

## What

Make it impossible to miss that a Photo is already in the Album. This is a key feature: reusing photos by accident was a real problem.

## Acceptance criteria

- [ ] Every thumbnail in the grid shows its Usage count in the current Album when it's above 0.
- [ ] Placing a Photo that's already used shows a warning that doesn't block. The Placement still happens.
- [ ] The grid can be filtered to "unused in this Album".
- [ ] Usage is computed in the domain core from the Album, not stored separately, and is unit-tested.
