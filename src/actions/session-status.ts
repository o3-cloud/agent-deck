import { action, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { listSessions, Session, SessionStatus } from "../session-reader";

const POLL_INTERVAL_MS = 2000;

// Display order, most attention-worthy first.
const STATUS_ORDER: SessionStatus[] = ["waiting", "busy", "idle", "shell"];

function formatTitle(sessions: Session[]): string {
	if (sessions.length === 0) return "No\nsessions";

	const counts = new Map<SessionStatus, number>();
	for (const session of sessions) {
		counts.set(session.status, (counts.get(session.status) ?? 0) + 1);
	}

	return STATUS_ORDER.filter((status) => counts.has(status))
		.map((status) => `${counts.get(status)} ${status}`)
		.join("\n");
}

/**
 * Displays a live count of running Claude Code sessions, grouped by status.
 */
@action({ UUID: "com.owenzanzal.claude-session-monitor.session-status" })
export class SessionStatusAction extends SingletonAction {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const update = async () => {
			const sessions = await listSessions();
			await ev.action.setTitle(formatTitle(sessions));
		};

		await update();

		this.timers.set(ev.action.id, setInterval(update, POLL_INTERVAL_MS));
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		const timer = this.timers.get(ev.action.id);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(ev.action.id);
		}
	}
}
