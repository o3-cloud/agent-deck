import { listSessions, Session, SessionStatus } from "./session-reader";

// "shell" means the session has dropped to a shell prompt, but that can just
// as easily be Claude sitting there waiting on the human as it can be idle —
// so it needs the same attention as "waiting" and "idle" do.
const ATTENTION_STATUSES: ReadonlySet<SessionStatus> = new Set(["waiting", "idle", "shell"]);

function needsAttention(status: SessionStatus): boolean {
	return ATTENTION_STATUSES.has(status);
}

export type QueueEntry = {
	sessionId: string;
	name: string;
};

// Module-level singleton: the queue and per-session status history persist
// across button appear/disappear so a transition isn't missed just because
// the Stream Deck UI was navigated away and back.
const queue: QueueEntry[] = [];
const lastStatus = new Map<string, SessionStatus>();

const POLL_INTERVAL_MS = 2000;
let timer: ReturnType<typeof setInterval> | undefined;
let listenerCount = 0;

function reconcile(sessions: Session[]): void {
	const liveIds = new Set(sessions.map((s) => s.sessionId));

	// Drop entries whose session ended or no longer needs attention (e.g. the
	// user answered it directly in the terminal instead of via this button).
	for (let i = queue.length - 1; i >= 0; i--) {
		const session = sessions.find((s) => s.sessionId === queue[i].sessionId);
		if (!session || !needsAttention(session.status)) {
			queue.splice(i, 1);
		}
	}

	// Enqueue sessions on the *transition* into idle/waiting, not merely for
	// being idle/waiting, so a session already popped off the front by a
	// button press doesn't get put right back on the next poll tick.
	for (const session of sessions) {
		const previous = lastStatus.get(session.sessionId);
		const wasAttention = previous !== undefined && needsAttention(previous);
		const isAttention = needsAttention(session.status);

		if (isAttention && !wasAttention && session.name && !queue.some((e) => e.sessionId === session.sessionId)) {
			queue.push({ sessionId: session.sessionId, name: session.name });
		}
	}

	for (const id of lastStatus.keys()) {
		if (!liveIds.has(id)) lastStatus.delete(id);
	}
	for (const session of sessions) {
		lastStatus.set(session.sessionId, session.status);
	}
}

async function tick(): Promise<void> {
	reconcile(await listSessions());
}

/**
 * Starts the shared polling loop that keeps the attention queue in sync with
 * live session status, ref-counted across however many button instances are
 * currently visible. Returns an unsubscribe function.
 */
export function subscribe(): () => void {
	listenerCount++;
	if (!timer) {
		void tick();
		timer = setInterval(tick, POLL_INTERVAL_MS);
	}

	let unsubscribed = false;
	return () => {
		if (unsubscribed) return;
		unsubscribed = true;
		listenerCount = Math.max(0, listenerCount - 1);
		if (listenerCount === 0 && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	};
}

export function peekQueue(): readonly QueueEntry[] {
	return queue;
}

/**
 * Removes and returns the oldest-waiting entry in the queue.
 */
export function dequeue(): QueueEntry | undefined {
	return queue.shift();
}
