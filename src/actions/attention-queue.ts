import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { dequeue, peekQueue, QueueEntry, subscribe } from "../attention-queue";
import { focusGhosttyWindow } from "../ghostty-focus";
import { attentionQueueIcon } from "../status-icon";

const RENDER_INTERVAL_MS = 2000;

function formatTitle(queue: readonly QueueEntry[]): string {
	if (queue.length === 0) return "Attention\nQueue\n—";
	return queue[0].name;
}

/**
 * A FIFO queue of Claude Code sessions that are idle or waiting for input.
 * Pressing the button focuses the oldest-waiting session's Ghostty window
 * and removes it from the queue; a session rejoins the back of the queue
 * once it transitions back into idle/waiting.
 */
@action({ UUID: "com.owenzanzal.agent-deck.attention-queue" })
export class AttentionQueueAction extends SingletonAction {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly unsubscribes = new Map<string, () => void>();

	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		const render = async () => {
			const queue = peekQueue();
			await ev.action.setTitle(formatTitle(queue));
			await ev.action.setImage(attentionQueueIcon(queue.length));
		};

		this.unsubscribes.set(ev.action.id, subscribe());

		await render();
		this.timers.set(ev.action.id, setInterval(render, RENDER_INTERVAL_MS));
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		const timer = this.timers.get(ev.action.id);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(ev.action.id);
		}

		const unsubscribe = this.unsubscribes.get(ev.action.id);
		if (unsubscribe) {
			unsubscribe();
			this.unsubscribes.delete(ev.action.id);
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		const next = dequeue();
		if (!next) {
			await ev.action.showAlert();
			return;
		}

		try {
			await focusGhosttyWindow(next.name);
		} catch {
			await ev.action.showAlert();
		}

		const queue = peekQueue();
		await ev.action.setTitle(formatTitle(queue));
		await ev.action.setImage(attentionQueueIcon(queue.length));
	}
}
