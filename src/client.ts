// Shared by the desktop (extension.ts) and web (browser.ts) entry points.
import * as vscode from "vscode";
import {
  BaseLanguageClient,
  CloseAction,
  ErrorAction,
  LanguageClientOptions,
  MessageTransports,
  RevealOutputChannelOn,
  State,
} from "vscode-languageclient";
import type { Executable } from "vscode-languageclient/node";
import { uriConverters, wasiServer } from "./wasi";

const LANGUAGES = ["nova", "nova-patch", "nova-schema"] as const;
const INSTALL_HINT =
  "Install it with `cargo install novafile-lsp` (or `cargo install --path crates/novafile-lsp` from a checkout of https://github.com/novafile/nova), " +
  "or set `novafile.server.path` in your user settings to the binary.";

export interface Platform {
  /**
   * The native server to run, or undefined to run the bundled WASI build.
   * Throws when the user configured a path that cannot be used.
   */
  nativeServer(args: string[]): Promise<Executable | undefined>;
  createClient(
    server: Executable | (() => Promise<MessageTransports>),
    options: LanguageClientOptions,
  ): BaseLanguageClient;
}

let client: BaseLanguageClient | undefined;
let wasi = false;
let outputChannel: vscode.LogOutputChannel | undefined;
let traceChannel: vscode.LogOutputChannel | undefined;

export async function activateWith(context: vscode.ExtensionContext, platform: Platform): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("NOVA Language Server", { log: true });
  traceChannel = vscode.window.createOutputChannel("NOVA Language Server Trace", { log: true });
  context.subscriptions.push(outputChannel, traceChannel);

  const restart = async (interactive: boolean) => {
    await stopClient();
    await startClient(context, platform, { interactive });
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("novafile.restartServer", () => restart(true)),
    vscode.commands.registerCommand("novafile.showOutput", () => outputChannel?.show(true)),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        e.affectsConfiguration("novafile.server.path") ||
        e.affectsConfiguration("novafile.server.args") ||
        e.affectsConfiguration("novafile.server.enable")
      ) {
        await restart(false);
      }
    }),
    // The WASI file system mounts the workspace folders at process start.
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      if (wasi) await restart(false);
    }),
  );

  context.subscriptions.push({ dispose: () => void stopClient() });
  registerPatchDetection(context);
  await startClient(context, platform, { interactive: false });
}

export async function deactivate(): Promise<void> {
  await stopClient();
}

// ---------------------------------------------------------------------------
// Language server
// ---------------------------------------------------------------------------

async function startClient(
  context: vscode.ExtensionContext,
  platform: Platform,
  { interactive }: { interactive: boolean },
): Promise<void> {
  const config = vscode.workspace.getConfiguration("novafile");
  if (!config.get<boolean>("server.enable", true)) {
    if (interactive) {
      void vscode.window.showInformationMessage(
        "The NOVA language server is disabled (`novafile.server.enable`).",
      );
    }
    return;
  }

  // `server.args` has `machine` scope: only user (or remote machine) settings apply.
  const args = config.inspect<string[]>("server.args")?.globalValue ?? [];
  let native: Executable | undefined;
  try {
    native = await platform.nativeServer(args);
  } catch (error) {
    reportStartFailure(String(config.inspect<string>("server.path")?.globalValue), error);
    return;
  }
  wasi = native === undefined;
  const label = native ? `${native.command} ${args.join(" ")}`.trim() : "bundled nvf-lsp.wasm (WASI)";

  // Workspace folders may live on virtual file systems (e.g. `vscode-vfs` on vscode.dev).
  const schemes = new Set(["file", "untitled", ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.scheme)]);
  const clientOptions: LanguageClientOptions = {
    documentSelector: LANGUAGES.flatMap((language) => [...schemes].map((scheme) => ({ scheme, language }))),
    synchronize: {
      // The server reads `.novs` files in the workspace to resolve `@schema` references.
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.novs"),
    },
    uriConverters: wasi ? uriConverters() : undefined,
    outputChannel,
    traceOutputChannel: traceChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationFailedHandler: (error) => {
      reportStartFailure(label, error);
      return false;
    },
    errorHandler: {
      error: () => ({ action: ErrorAction.Continue }),
      closed: () => ({
        action: CloseAction.DoNotRestart,
        message: "The NOVA language server stopped. Run “NOVA: Restart Language Server” to start it again.",
      }),
    },
  };

  const newClient = platform.createClient(native ?? wasiServer(context, args, outputChannel), clientOptions);
  newClient.onDidChangeState((e) => {
    if (e.newState === State.Running) outputChannel?.appendLine(`Started ${label}`);
  });
  client = newClient;
  try {
    await newClient.start();
    if (interactive) void vscode.window.setStatusBarMessage("NOVA language server restarted", 3000);
  } catch (error) {
    client = undefined;
    reportStartFailure(label, error);
  }
}

async function stopClient(): Promise<void> {
  const current = client;
  client = undefined;
  if (!current) return;
  try {
    if (current.isRunning()) await current.stop();
    else await current.dispose();
  } catch {
    // Stopping a client whose server never started throws; nothing to do.
  }
}

function reportStartFailure(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  outputChannel?.appendLine(`Failed to start ${label}: ${message}`);
  const missing = /ENOENT|not found|cannot find|spawn/i.test(message);
  const text = missing
    ? `NOVA: the language server \`${label}\` was not found. ${INSTALL_HINT}`
    : `NOVA: the language server \`${label}\` failed to start: ${message}`;
  const openSettings = "Open Settings";
  const showOutput = "Show Output";
  void vscode.window.showErrorMessage(text, openSettings, showOutput).then((choice) => {
    if (choice === openSettings) {
      void vscode.commands.executeCommand("workbench.action.openSettings", "novafile.server");
    } else if (choice === showOutput) {
      outputChannel?.show(true);
    }
  });
}

// ---------------------------------------------------------------------------
// Patch detection
//
// VS Code's built-in Diff language claims `*.patch` by extension, which beats
// the `firstLine` rule contributed for `nova-patch`. NOVA patches may also
// start with comment lines. So when a `.patch` file opens as Diff, look at its
// first non-blank, non-comment line and switch it to NOVA Patch if that line is
// a `@patch` directive.
// ---------------------------------------------------------------------------

function registerPatchDetection(context: vscode.ExtensionContext): void {
  const check = (document: vscode.TextDocument) => {
    if (!vscode.workspace.getConfiguration("novafile").get<boolean>("patch.detectByContent", true)) return;
    if (document.languageId === "nova-patch") return;
    if (!/\.patch$/i.test(document.uri.path)) return;
    if (document.languageId !== "diff" && document.languageId !== "plaintext") return;
    if (isNovaPatch(document)) {
      void vscode.languages.setTextDocumentLanguage(document, "nova-patch");
    }
  };
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(check));
  vscode.workspace.textDocuments.forEach(check);
}

export function isNovaPatch(document: Pick<vscode.TextDocument, "lineCount" | "lineAt">): boolean {
  const limit = Math.min(document.lineCount, 50);
  for (let i = 0; i < limit; i++) {
    let text = document.lineAt(i).text;
    if (i === 0 && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trim() === "" || text.startsWith("#") || /^@nova(\s|$)/.test(text)) continue;
    return /^@patch(\s|$)/.test(text);
  }
  return false;
}
