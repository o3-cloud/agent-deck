import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const SESSIONS_DIR = path.join(homedir(), ".claude", "sessions");

export type SessionStatus = "busy" | "shell" | "idle" | "waiting";

export type Session = {
	pid: number;
	sessionId: string;
	name?: string;
	cwd: string;
	status: SessionStatus;
	waitingFor?: string;
	updatedAt: number;
};

function isLive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function parseSession(raw: string): Session | undefined {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return undefined;
	}

	if (typeof data !== "object" || data === null) return undefined;
	const d = data as Record<string, unknown>;

	if (typeof d.pid !== "number" || typeof d.status !== "string") return undefined;
	if (!isLive(d.pid)) return undefined;

	return {
		pid: d.pid,
		sessionId: typeof d.sessionId === "string" ? d.sessionId : "",
		name: typeof d.name === "string" ? d.name : undefined,
		cwd: typeof d.cwd === "string" ? d.cwd : "",
		status: d.status as SessionStatus,
		waitingFor: typeof d.waitingFor === "string" ? d.waitingFor : undefined,
		updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : 0,
	};
}

/**
 * Reads ~/.claude/sessions, oldest-updated first (FIFO order for later steps).
 */
export async function listSessions(): Promise<Session[]> {
	let entries: string[];
	try {
		entries = await readdir(SESSIONS_DIR);
	} catch {
		return [];
	}

	const sessionFiles = entries.filter((name) => /^\d+\.json$/.test(name));

	const sessions = await Promise.all(
		sessionFiles.map(async (fileName) => {
			try {
				const raw = await readFile(path.join(SESSIONS_DIR, fileName), "utf-8");
				return parseSession(raw);
			} catch {
				return undefined;
			}
		}),
	);

	return sessions
		.filter((s): s is Session => s !== undefined)
		.sort((a, b) => a.updatedAt - b.updatedAt);
}
