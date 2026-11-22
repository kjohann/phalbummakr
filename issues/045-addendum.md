# 045 addendum - Bound grid Page previews

Status: done

Immediate review follow-up to [045 - Quick grid layout](045-quick-grid-layout.md).
An entirely populated 12 by 12 grid can request 144 cold editor previews at
once, potentially exhausting memory while decoding original Photos.

## Acceptance criteria

- [x] Limit simultaneous editor preview requests from Page canvases to four,
  including when both Pages in a Spread contain large grids.
- [x] Skip queued requests for Pages or Slots that are no longer visible,
  including when leaving Album mode; requests already started may finish.
  Return to Album mode without reloading previews that were already ready.
- [x] A newly placed Photo or explicit retry takes priority over background
  grid previews, keeping drag prewarming useful.
- [x] Preserve preview caching, drag prewarming, thumbnail loading, error
  reporting and retry behavior.
- [x] Focused workspace tests exercise a populated 12 by 12 Page and navigation
  while requests are pending.

## Implementation and verification

The Page canvas queues at most four editor preview requests, reusing the
thumbnail queue's scheduling pattern. Navigation and mode changes cancel
requests that have not started; visible work resumes when returning. New
Placements and explicit retries take priority. Already-ready previews stay
visible across mode changes. The existing preview cache and drag prewarming
remain unchanged.

Workspace tests populate 12 by 12 Pages on both sides of a Spread and verify
the four-request limit, navigation cancellation, mode changes, priority and
retry after failure using mock Photo ports. A replacement-and-restore test
also checks that the loading indicator resolves correctly. Thumbnail and
prewarming regressions pass. The full 418-test suite, lint, typecheck and
production build pass; the existing bundle-size warning remains.

## Earlier considerations and inbox

- The cache-hit decoding, transport and LRU suggestions in
  [006's addendum](006-addendum.md) remain deferred: this change schedules
  requests without changing the cache or image representation.
- Dense-Page snapping profiling from [013](013-slot-snapping.md) remains
  deferred; Slot geometry and snapping are unchanged.
- No inbox notes were resolved.

## Future considerations (low priority)

- Sort mode's unlimited Comparison prewarms previews separately and is not
  limited by the Page-canvas queue. Addressing that existing workflow needs
  its own cancellation and priority behavior.
- Even with bounded decoding, a fully populated Spread retains many editor
  previews. Profile memory and loading time with real Photos if dense grids
  become a regular workflow; the concurrency tests use mock Photo ports.
