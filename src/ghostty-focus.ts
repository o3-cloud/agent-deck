import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Ghostty ships its own native AppleScript dictionary (see `sdef
// /Applications/Ghostty.app`), which reaches every window regardless of which
// underlying OS process created it (multiple "open -na" launches spawn
// separate processes that System Events' UI-scripting layer can't see past
// the first one). Matching is by "contains", not exact equality: Claude Code
// prefixes the title with a status indicator (e.g. "✳ ") that we don't
// want to have to replicate.
const FOCUS_SCRIPT = `
on run argv
	set targetName to item 1 of argv
	tell application "Ghostty"
		activate
		set targetWindow to first window whose name contains targetName
		activate window targetWindow
	end tell
end run
`;

/**
 * Raises and focuses the Ghostty window whose title contains `name`.
 */
export async function focusGhosttyWindow(name: string): Promise<void> {
	await execFileAsync("osascript", ["-e", FOCUS_SCRIPT, name]);
}
