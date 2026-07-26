import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LaunchedSession = {
	sessionId: string;
	name: string;
};

// Launching via "open -na Ghostty.app" spawns a genuinely separate OS process
// per call. AppleScript's "tell application Ghostty" (and even System Events'
// UI-scripting) can only ever reach ONE of those processes at a time, making
// window focus fundamentally unreliable once more than one is running.
// Ghostty's own native scripting dictionary's "new window" command instead
// creates the window inside whichever single instance is already running, so
// every window it creates stays reachable together. "initial input" just
// types the command into a normal interactive shell, so PATH/login-shell rc
// sourcing works exactly as it would if the user typed it themselves.
const LAUNCH_SCRIPT = `
on run argv
	set targetCwd to item 1 of argv
	set targetCommand to item 2 of argv
	tell application "Ghostty"
		activate
		new window with configuration {initial working directory:targetCwd, initial input:targetCommand & return}
	end tell
end run
`;

/**
 * Launches a new Claude Code session in a Ghostty window, pre-assigning its
 * session ID and display name so callers can immediately bind an action to it
 * without waiting for the process to report back.
 */
export async function launchAgentSession(cwd: string): Promise<LaunchedSession> {
	const sessionId = randomUUID();
	const name = `agent-${randomBytes(3).toString("hex")}`;
	const command = `claude --session-id ${sessionId} --name ${name}`;

	await execFileAsync("osascript", ["-e", LAUNCH_SCRIPT, cwd, command]);

	return { sessionId, name };
}
