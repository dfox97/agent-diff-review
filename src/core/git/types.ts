/**
 * Agent-agnostic command runner contract. Mirrors the shape of
 * `@earendil-works/pi-coding-agent`'s `ExtensionAPI.exec` so any tool binding
 * (pi, opencode, CLI, …) can plug in its own shell layer.
 */
export interface ExecOptions {
	cwd: string;
}

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

export type Exec = (cmd: string, args: string[], options: ExecOptions) => Promise<ExecResult>;
