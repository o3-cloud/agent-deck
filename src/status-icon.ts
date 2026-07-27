import { SessionStatus } from "./session-reader";

const COLORS: Record<SessionStatus, string> = {
	waiting: "#f5a623", // amber - needs attention
	busy: "#4a90d9", // blue - working
	idle: "#7ed321", // green - idle, nothing to do
	shell: "#9b9b9b", // gray - dropped to a shell prompt; may still be waiting on the human
};

function circleIcon(color: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144"><circle cx="72" cy="72" r="60" fill="${color}"/></svg>`;
}

export function iconForStatus(status: SessionStatus): string {
	return circleIcon(COLORS[status]);
}

// Shown while a freshly-launched session hasn't registered yet.
export const STARTING_ICON = circleIcon("#f5a623");

/**
 * Same dot as the other status icons, colored amber (the "waiting" color)
 * with the live count centered inside. No dot at all when the queue is
 * empty — the button's title already says so.
 */
export function attentionQueueIcon(count: number): string | undefined {
	if (count <= 0) return undefined;

	const label = count > 99 ? "99+" : String(count);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
		`<circle cx="72" cy="72" r="60" fill="${COLORS.waiting}"/>` +
		// dominant-baseline="central" isn't consistently honored across SVG
		// renderers (it left the digit sitting almost entirely above center
		// in testing); an explicit baseline offset works everywhere.
		`<text x="72" y="92" text-anchor="middle" font-family="sans-serif" font-size="56" font-weight="600" fill="#1a1a1a">${label}</text>` +
		`</svg>`
	);
}
