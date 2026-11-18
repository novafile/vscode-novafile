// Desktop entry point: prefer a native `nvf-lsp`, fall back to the bundled WASI build.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { Executable, LanguageClient, TransportKind } from "vscode-languageclient/node";
import { activateWith, deactivate, isNovaPatch } from "./client";

export { deactivate, isNovaPatch };

export function activate(context: vscode.ExtensionContext): Promise<void> {
  return activateWith(context, {
    nativeServer,
    createClient: (server, options) => new LanguageClient("novafile", "NOVA Language Server", server, options),
  });
}

async function nativeServer(args: string[]): Promise<Executable | undefined> {
  // `server.path` has `machine` scope, and only the user-level value is read: a
  // workspace (e.g. a cloned repository's .vscode/settings.json) must never choose
  // the binary the extension runs.
  const configured = vscode.workspace.getConfiguration("novafile").inspect<string>("server.path")?.globalValue?.trim();
  const command = configured ? userPath(configured) : onPath("nvf-lsp");
  if (!command) return undefined;
  return { command, args, transport: TransportKind.stdio };
}

/** Resolves the user's setting: absolute, `~/…`, or a bare name looked up on `PATH`. */
function userPath(value: string): string {
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(1));
  if (path.isAbsolute(value)) return value;
  if (!value.includes("/") && !value.includes("\\")) {
    const found = onPath(value);
    if (found) return found;
    throw new Error(`\`${value}\` was not found on PATH`);
  }
  // A relative path would resolve against the workspace, which may be untrusted.
  throw new Error(`\`novafile.server.path\` must be absolute, start with \`~/\`, or be a bare name on PATH (got \`${value}\`)`);
}

/**
 * Absolute path of `name` on `PATH`, or undefined. Done here rather than by
 * `spawn` because Windows also searches the working directory (the workspace)
 * first; relative `PATH` entries are skipped for the same reason.
 */
function onPath(name: string): string | undefined {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        if (fs.statSync(candidate).isFile()) {
          fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        }
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return undefined;
}
