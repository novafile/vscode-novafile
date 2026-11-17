import * as path from "node:path";
import * as vscode from "vscode";
import {
  CloseAction,
  ErrorAction,
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
  State,
  TransportKind,
} from "vscode-languageclient/node";

const LANGUAGES = ["nova", "nova-patch", "nova-schema"] as const;
const INSTALL_HINT =
  "Install it with `cargo install novafile-lsp` (or `cargo install --path crates/novafile-lsp` from a checkout of https://github.com/novafile/nova), " +
  "or set `novafile.server.path` to the binary.";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let traceChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel("NOVA Language Server");
  traceChannel = vscode.window.createOutputChannel("NOVA Language Server Trace");
  context.subscriptions.push(outputChannel, traceChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand("novafile.restartServer", async () => {
      await stopClient();
      await startClient(context, { interactive: true });
    }),
    vscode.commands.registerCommand("novafile.showOutput", () => outputChannel?.show(true)),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (
        e.affectsConfiguration("novafile.server.path") ||
        e.affectsConfiguration("novafile.server.args") ||
        e.affectsConfiguration("novafile.server.enable")
      ) {
        await stopClient();
        await startClient(context, { interactive: false });
      }
    }),
  );

  context.subscriptions.push({ dispose: () => void stopClient() });
  registerPatchDetection(context);
  await startClient(context, { interactive: false });
}

export async function deactivate(): Promise<void> {
  await stopClient();
}

// ---------------------------------------------------------------------------
// Language server
// ---------------------------------------------------------------------------

function serverCommand(): { command: string; args: string[] } {
  const config = vscode.workspace.getConfiguration("novafile");
  let command = (config.get<string>("server.path") ?? "").trim() || "nvf-lsp";
  // Allow `~/...` and workspace-relative paths in the setting.
  if (command.startsWith("~/")) {
    command = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", command.slice(2));
  } else if (command.includes("/") || command.includes("\\")) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder && !path.isAbsolute(command)) command = path.join(folder.uri.fsPath, command);
  }
  const args = config.get<string[]>("server.args") ?? [];
  return { command, args };
}

async function startClient(
  context: vscode.ExtensionContext,
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

  const { command, args } = serverCommand();
  const executable = { command, args, transport: TransportKind.stdio };
  const serverOptions: ServerOptions = { run: executable, debug: executable };

  const clientOptions: LanguageClientOptions = {
    documentSelector: LANGUAGES.flatMap((language) => [
      { scheme: "file", language },
      { scheme: "untitled", language },
    ]),
    synchronize: {
      // The server reads `.novs` files in the workspace to resolve `@schema` references.
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.novs"),
    },
    outputChannel,
    traceOutputChannel: traceChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never,
    initializationFailedHandler: (error) => {
      reportStartFailure(command, error);
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

  const newClient = new LanguageClient("novafile", "NOVA Language Server", serverOptions, clientOptions);
  newClient.onDidChangeState((e) => {
    if (e.newState === State.Running) outputChannel?.appendLine(`Started ${command} ${args.join(" ")}`.trim());
  });
  client = newClient;
  try {
    await newClient.start();
    if (interactive) void vscode.window.setStatusBarMessage("NOVA language server restarted", 3000);
  } catch (error) {
    client = undefined;
    reportStartFailure(command, error);
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

function reportStartFailure(command: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  outputChannel?.appendLine(`Failed to start ${command}: ${message}`);
  const missing = /ENOENT|not found|cannot find|spawn/i.test(message);
  const text = missing
    ? `NOVA: the language server \`${command}\` was not found. ${INSTALL_HINT}`
    : `NOVA: the language server \`${command}\` failed to start: ${message}`;
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
