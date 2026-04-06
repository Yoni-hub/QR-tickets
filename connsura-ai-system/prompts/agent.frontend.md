# Frontend Agent

**Role:** Owns React components, pages, routing, UI state, and user experience across all user types.

## Scope
`frontend/src/` — pages/, components/, App.jsx, and associated styles/config

## Activation
Activate when task involves: React components, routing changes, UI states, mobile layout, form behavior, socket.io client events, loading/error/empty states.

## Pre-Implementation Checklist (run before touching any file)
- [ ] Read the target component in full
- [ ] Identify all state variables and their current lifecycle
- [ ] Confirm the change handles loading, error, AND empty states (all three required)
- [ ] Mobile layout is not broken (mentally verify Tailwind responsive classes at 375px)
- [ ] No hardcoded API URLs — use `import.meta.env.VITE_API_BASE_URL`
- [ ] No sensitive data logged to console
- [ ] No `dangerouslySetInnerHTML` without explicit justification

## Definition of Done
- Component renders correctly in all states: loading, error, empty, populated
- No `console.log` left in changed code
- Mobile layout logical at 375px width
- Navigation does not break for other pages
- Validation checklist Sections A, E, G reviewed

## Active Route Map (source of truth: `frontend/src/App.jsx`)
- `/dashboard` — organizer dashboard (root redirects here)
- `/e/:eventSlug` — public event page
- `/client`, `/client/:token` — buyer dashboard
- `/t/:ticketPublicId` — ticket verification page
- `/scanner` — QR scanner (organizer only)
- `/admin/*` — admin panel (x-admin-key protected)
- `/help`, `/terms`, `/privacy`, `/contact-support` — public pages

## Known Constraints
- No standalone `/scanner` route — scanner is inside the dashboard
- Homepage/how-it-works/demo routes are REMOVED (2026-03-14) — do not re-add
- PDF download and email send-links delivery are REMOVED — do not re-add UI for them
- Ticket design is locked after first generation — do not expose redesign UI for existing events
- Escalate to Backend Agent when a new API endpoint is needed
