# Stream Deck Agent Control Surface — SPEC

## Layout tracker (Stream Deck Mini, 2×3 grid)

Running tally of what's placed vs. still open, updated as the spec grows.

```
┌─────────┬─────────┬─────────┐
│    ?    │    ?    │    ?    │
├─────────┼─────────┼─────────┤
│    ?    │    ?    │ Atten.  │
│         │         │ Queue   │
└─────────┴─────────┴─────────┘
```

- **Bottom-right — Attention Queue.** Confirmed placement (this message). Existing behavior below.
- **Button 1 (the launcher/slot)** — position not yet pinned to a specific grid cell; still open whether it's one
  of several identical slots (open question 1) or a single unique key.
- 4 cells still fully open.

## Design principle

OpenAI's Codex Micro (see [Axios](https://www.axios.com/2026/07/15/openai-keyboard-codex-agents)) gives each function
a dedicated, fixed control: 6 status keys, separate command keys, a joystick, a reasoning dial — 13+ physical
controls in total.

The Stream Deck Mini has 6 keys and no joystick/dial. The design bet of this project is that **fewer controls that
change meaning based on state** beat more controls with fixed meaning. A button is not "the launcher" or "the
status light" — it's a **slot** that renders whatever is relevant to its current binding, and whose keypress means
whatever makes sense for that state. State drives the UI; the UI does not drive the state.

Non-goal (for now): matching Codex Micro's joystick-triggered canned workflows and reasoning-effort dial. Revisit
once the slot model is solid.

## Current scope vs. target

The existing implementation (`com.owenzanzal.agent-deck.sdPlugin`) is **Claude Code + Ghostty
specific**:
- Sessions are discovered from `~/.claude/sessions/*.json` (written by something outside this repo — presumably a
  Claude Code hook).
- Launch spawns `claude --session-id <uuid> --name <name>` inside a Ghostty window via Ghostty's own AppleScript
  dictionary.
- Window focus is Ghostty-specific (`ghostty-focus.ts`).

The stated end goal is agent-agnostic (Codex CLI, Aider, Cursor, etc.), not just Claude Code. This spec documents
today's concrete (Claude/Ghostty) behavior as the reference implementation and will flag where generalization
needs to happen, but doesn't design that generalization yet — separate section, later.

## Session status model (as implemented)

Backing store: `~/.claude/sessions/<pid>.json`, one file per live session.

```
{
  pid: number,
  sessionId: string,
  name?: string,
  cwd: string,
  status: "busy" | "shell" | "idle" | "waiting",
  waitingFor?: string,
  updatedAt: number
}
```

A session file is considered live only if `pid` resolves to a running process (checked via `kill(pid, 0)`); stale
files from dead processes are filtered out silently, not deleted.

Status → color (used for the key's icon, a plain 144×144 SVG dot):

| status  | color            | meaning |
|---------|------------------|---------|
| waiting | amber `#f5a623`  | needs attention — Claude is blocked on the human |
| busy    | blue `#4a90d9`   | actively working |
| idle    | green `#7ed321`  | nothing to do right now |
| shell   | gray `#9b9b9b`   | dropped to a shell prompt — ambiguous, treated as attention-worthy elsewhere (see Attention Queue, below) |

Poll interval: 2000ms, per-button (each `AgentSessionAction` instance runs its own `setInterval`).

## Button 1 — Launcher / Session Slot

One button, three states, persisted via Stream Deck's per-action settings (`sessionId`, `name`, `launchedAt`).

### State: Empty (no `sessionId` in settings) — now a 3-step flow, not a single press

Generalizing beyond Claude Code + Ghostty means the button can no longer launch on the first press with no
parameters. It now walks through two selection sub-states before launching. Per the state-driven-UI principle,
these sub-states take over the *whole deck*, not just this key — the other keys temporarily become the picker,
then the deck reverts to its normal page once the pick is made.

1. **Press empty slot → "Select Agent" state.** Deck's other keys are repurposed to list registered agents
   (Claude Code, Codex, ...). Pressing the original slot again cancels back to Empty (tentative — see open
   questions).
2. **Agent chosen → "Select App" state.** Keys are repurposed to list the app/terminal targets registered *for
   that agent* (see App registry below — the list is filtered by agent, not a flat cross-product of everything).
3. **App chosen → launch, same as before:**
   1. Generate a `sessionId` (UUID) and `name` (`agent-<6 hex chars>`) client-side, before the process exists.
   2. Render `"starting…"` + amber "starting" icon.
   3. Invoke the chosen app's launch adapter with the chosen agent's command template (see registries below).
   4. Persist `{ sessionId, name, launchedAt: now, agentId, appId }` to the button's settings immediately — the
      binding does not wait for the process to confirm it's alive.

(Today's actual code only implements step 3 for `agentId: claude` / `appId: ghostty`, skipping steps 1–2 entirely.
That's the reference case both registries below need to reproduce exactly before adding a second entry to either.)

### State: Bound, not yet visible (has `sessionId`, no matching live session file)
- Grace period: 15000ms from `launchedAt`.
- Within grace period: render is a no-op (leaves the "starting…" title/icon in place). Rationale: `open → Ghostty
  → login shell → claude startup` can take a few seconds, and a poll landing in that window is indistinguishable
  from "session already ended" — without the grace period the binding gets wiped before the process had a chance
  to register.
- Past grace period: treated as failed/ended — settings cleared, reverts to Empty state (`"Launch"`, no image).

### State: Bound, live
- Title: `"${name}\n${status}"`
- Image: colored dot per current status (table above)
- Re-rendered every 2000ms from the live session file.
- **On press:** does *not* relaunch. Focuses the Ghostty window whose title contains `name` (Claude Code prefixes
  titles with a status glyph, so matching is substring, not exact) — i.e., second press = "take me to this
  session," not "start another one."

### Explicitly out of scope for Button 1
- No way to end/kill a bound session from the button itself (only launch and focus/observe).
- No long-press / secondary action defined yet.
- No visual distinction between "waiting" (needs a decision) and "shell" (ambiguous) on this button specifically —
  that distinction currently only shows up in the Attention Queue button's queueing logic, not in Button 1's icon
  color (both would render their own respective dot colors, amber vs. gray, so it IS visible, just not called out
  specially).

## Session submenu (double-click on a bound, live slot)

Double-clicking a slot that's already bound to a live session opens a submenu, same state-driven-UI pattern as
the agent/app picker: the deck's other keys are temporarily repurposed, this time to actions/readouts scoped to
*that specific session* rather than to the launch flow.

Items so far:
- **Push-to-talk** — action. Presumably: focus that session's window, then trigger voice input directed at it
  (mirrors Codex Micro's dedicated push-to-talk key). Voice-input mechanism itself (OS dictation vs. a separate
  tool) is undefined.
- **Context usage** — info readout, presumably a live percentage/token count for that session.
- **Model** — info readout of which model that session is running. (Display-only, or does tapping it *switch* the
  model? Not stated — treating as display-only unless you say otherwise.)

### Two things this introduces that need deciding

**1. Double-click detection changes single-press latency.** The Stream Deck SDK gives you `KeyDown`/`KeyUp`, not a
native double-click event — detecting "was that a double-click" means waiting to see if a *second* `KeyDown`
arrives within some threshold (e.g. 300–400ms) before committing to the single-press action (today: focus the
window). That adds a small but real delay to *every* single press on a bound slot, not just the ones that turn
out to be double-clicks. An alternative that avoids this: use **hold duration** instead (fire the primary action
immediately on a quick `KeyUp`; fire the submenu once `KeyDown` has been held past a threshold, no need to wait
for a second press at all). Functionally different gesture (long-press vs. double-click) — flagging because it
avoids the latency tradeoff, not proposing to silently swap what you asked for.

**2. Status schema needs new fields.** `Session` (in `session-reader.ts`) currently only carries
`status`/`waitingFor` — nothing about context usage or model. Whatever writes `~/.claude/sessions/<pid>.json`
would need to start including those. This is the same "who produces this data" question as the Agent registry's
status-source problem, just at finer grain: even for Claude Code alone, someone needs to decide whether
context-usage/model come from that same hook or a different source, and for Codex CLI (or anything else) later,
those fields might not be available at all — submenu items may need to degrade gracefully per-agent (e.g. gray
out "Context usage" for an agent that doesn't expose it).

### Open question: does the submenu use the same exit gesture as the agent/app picker?

Whatever gets decided for "how do you back out of Select Agent / Select App" (open question 4, above) should
probably also govern how you leave this submenu and return to the normal bound-slot view — worth deciding once,
not twice.

## Registries

### Agent registry

Each entry needs at minimum:
- `id`, `displayName`
- launch command template (placeholders for generated session id / name)
- status source descriptor — how to detect busy/idle/waiting/shell for *this* agent
- icon/color overrides (optional — defaults to the existing 4-color table)

| agent | launch command | status source |
|---|---|---|
| Claude Code | `claude --session-id <id> --name <name>` | `~/.claude/sessions/<pid>.json` (existing; written by something outside this repo, presumably a Claude Code hook) |
| Codex CLI | TBD — need actual invocation syntax | **Unresolved.** No known equivalent to Claude Code's session-file hook. Codex CLI may not expose structured live status at all — may require log-tailing / heuristics, which changes the shape of `session-reader.ts` from "read a JSON file" to "per-agent adapter with its own polling strategy." |

This is the crux of "agent-agnostic": today, status is *pulled* by reading a file Claude Code happens to write.
Nothing forces a second agent to write anything similar. Each agent's adapter may need a genuinely different
detection strategy (hook-fed file, log-tail + regex, process CPU heuristic, etc.), unified behind a common
`Session` shape so `status-icon.ts` and the attention queue don't need to know which agent they're looking at.

### App/target registry

Each entry needs at minimum:
- `id`, `displayName`
- `kind`: `terminal` (spawns a CLI process the agent runs inside) vs. `editor-integrated` (agent runs inside the
  app's own UI — e.g. an editor's built-in agent panel, not a shell command)
- launch adapter: how to spawn (Ghostty uses its own AppleScript dictionary; other terminals/editors will each
  need their own — `open -a`, a different AppleScript dictionary, a URL scheme, etc.)
- focus adapter: how to raise/focus the right window once launched

| app | kind | launch | focus |
|---|---|---|---|
| Ghostty | terminal | Ghostty AppleScript `new window` w/ `initial input` (existing, `launcher.ts`) | Ghostty AppleScript, match window title by substring (existing, `ghostty-focus.ts`) |
| iTerm2, Terminal.app, etc. | terminal | TBD | TBD |
| Cursor, VS Code, etc. | editor-integrated | TBD — fundamentally different: no "type a shell command," more like "open project, invoke the editor's agent command/panel" | TBD |

The `terminal` vs. `editor-integrated` split matters because it's not just a different launch mechanism — status
detection differs too (a terminal-kind app still has a CLI agent process to inspect; an editor-integrated agent's
state lives inside the editor, which may or may not expose it).

**Constraint to note:** the agent × app pairing is not a free cross-product. Codex CLI presumably only makes sense
in `terminal`-kind apps for now; an editor's own built-in agent (e.g. Cursor's) isn't really "Claude Code running
inside Cursor," it's a different agent entirely tied to that editor. So "select app" in step 2 above should list
only apps compatible with the agent chosen in step 1 — the registry needs a compatibility mapping, not just two
flat lists.

## Button 6 (bottom-right) — Attention Queue [confirmed placement]

Already implemented as `AttentionQueueAction`. FIFO queue of sessions that transitioned into
`waiting`/`idle`/`shell`, so you can jump to "whatever needs me next" without hunting across slots.

- Title: oldest-waiting session's name, or `"Attention Queue —"` when empty.
- Icon: live count badge (amber dot with the queue length; no dot at all when empty).
- **On press:** pops the front of the queue and focuses that session's Ghostty window. Does not require the
  session to be bound to any particular launcher slot — it works off the shared session list directly.
- Re-enqueue rule: a session is added on the *transition into* an attention state, not merely for being in one —
  so a session already popped off the queue for one attention event doesn't immediately jump back on next poll.
  It re-enqueues only if it leaves and re-enters an attention state (e.g. goes `busy` → `waiting` again).
- Backed by a module-level singleton poll loop (`attention-queue.ts`), ref-counted across however many button
  instances are visible, 2000ms interval — independent of the per-slot polling in Button 1/N.

## Related existing buttons (context, not yet part of "the 6", TBD how it fits)

Still unplaced:

- **`SessionStatusAction`** — read-only aggregate across *all* live sessions, title = counts per status
  (e.g. `"2 waiting\n1 busy"`), icon color = most attention-worthy status present. No press behavior. Given the
  Attention Queue button now covers "what needs me," this read-only aggregate may be redundant — worth deciding
  if it earns a slot or gets dropped.

## Open questions

1. Is Button 1 one of **N identical slot buttons** (e.g. slots 1–4 are launchers, each bound to a different
   session once pressed), or is it unique and the other 5 keys do categorically different things?
2. ~~Where do `SessionStatusAction` and `AttentionQueueAction` fit~~ — **partially resolved:** Attention Queue is
   confirmed, bottom-right. `SessionStatusAction` (the read-only aggregate) is still unplaced and may be redundant
   now that Attention Queue exists — keep or drop?
3. **Picker mechanics:** when "Select Agent" / "Select App" take over the deck, how many keys are actually
   available to show choices? If another slot is already bound (showing a live session), does it get displaced
   during picking, or does the picker only use *unbound* keys — which shrinks as more slots fill up?
4. **Cancel/back:** what un-does a picker state — pressing the original slot again, a dedicated back affordance,
   a timeout, all of the above?
5. **Paging:** once agent or app lists exceed the number of available picker keys, how do you page/scroll? (Same
   problem Codex Micro doesn't have, since it has fixed dedicated controls instead of a picker.)
6. **Codex CLI status detection is unresolved** (see Agent registry) — is a log-tail adapter acceptable, or does
   this need Codex CLI to gain some kind of hook/status-file mechanism first, the way Claude Code apparently has?

Keep going — what's next?
