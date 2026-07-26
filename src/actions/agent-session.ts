import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEBUG_LOG_PATH = "/tmp/csm-debug.log";
function debugLog(message: string): void {
	try {
		appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${message}\n`);
	} catch {
		// ignore
	}
}

import { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";

import { launchAgentSession } from "../launcher";
import { focusGhosttyWindow } from "../ghostty-focus";
import { listSessions } from "../session-reader";

const POLL_INTERVAL_MS = 2000;
// A freshly-launched `claude` process (open -> Ghostty -> login shell -> claude
// startup) can easily take a few seconds to register its session file. Without
// a grace period, a poll tick landing in that window looks identical to "the
// session already ended" and wipes the binding before it ever had a chance.
const LAUNCH_GRACE_PERIOD_MS = 15000;
const DEFAULT_CWD = path.join(homedir(), "pai");

type AgentSessionSettings = {
	sessionId?: string;
	name?: string;
	launchedAt?: number;
};

/**
 * A button that launches a new Claude Code session when empty, shows that
 * session's live status once bound, and refocuses its Ghostty window on a
 * second press.
 */
@action({ UUID: "com.owenzanzal.claude-session-monitor.agent-session" })
export class AgentSessionAction extends SingletonAction<AgentSessionSettings> {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

	override async onWillAppear(ev: WillAppearEvent<AgentSessionSettings>): Promise<void> {
		debugLog(`[${ev.action.id}] onWillAppear`);

		const render = async () => {
			try {
				const settings = await ev.action.getSettings();
				if (!settings.sessionId) {
					debugLog(`[${ev.action.id}] render: unbound, showing Launch`);
					await ev.action.setTitle("Launch");
					return;
				}

				const sessions = await listSessions();
				const bound = sessions.find((s) => s.sessionId === settings.sessionId);
				debugLog(
					`[${ev.action.id}] render: looking for ${settings.sessionId}, found=${!!bound}, live sessionIds=${sessions.map((s) => s.sessionId).join(",")}`,
				);

				if (!bound) {
					const age = Date.now() - (settings.launchedAt ?? 0);
					if (age < LAUNCH_GRACE_PERIOD_MS) {
						debugLog(`[${ev.action.id}] render: not found yet but within grace period (${age}ms), leaving as-is`);
						return;
					}
					debugLog(`[${ev.action.id}] render: not found and past grace period (${age}ms), clearing`);
					await ev.action.setSettings({});
					await ev.action.setTitle("Launch");
					return;
				}

				await ev.action.setTitle(`${settings.name}\n${bound.status}`);
			} catch (error) {
				debugLog(`[${ev.action.id}] render FAILED: ${error instanceof Error ? error.stack : error}`);
			}
		};

		await render();

		this.timers.set(ev.action.id, setInterval(render, POLL_INTERVAL_MS));
	}

	override onWillDisappear(ev: WillDisappearEvent<AgentSessionSettings>): void {
		const timer = this.timers.get(ev.action.id);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(ev.action.id);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<AgentSessionSettings>): Promise<void> {
		debugLog(`[${ev.action.id}] onKeyDown`);
		const settings = await ev.action.getSettings();
		debugLog(`[${ev.action.id}] onKeyDown: current settings = ${JSON.stringify(settings)}`);

		if (!settings.sessionId) {
			await ev.action.setTitle("starting…");
			try {
				const { sessionId, name } = await launchAgentSession(DEFAULT_CWD);
				debugLog(`[${ev.action.id}] launched ${name} (${sessionId})`);
				await ev.action.setSettings({ sessionId, name, launchedAt: Date.now() });
				await ev.action.setTitle(`${name}\nstarting…`);
			} catch (error) {
				debugLog(`[${ev.action.id}] launch FAILED: ${error}`);
				await ev.action.setTitle("Launch");
				await ev.action.showAlert();
			}
			return;
		}

		debugLog(`[${ev.action.id}] already bound to ${settings.name} (${settings.sessionId}), focusing`);

		try {
			await focusGhosttyWindow(settings.name!);
		} catch (error) {
			debugLog(`[${ev.action.id}] focus FAILED: ${error}`);
			await ev.action.showAlert();
		}
	}
}
