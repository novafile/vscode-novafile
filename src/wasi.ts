// Runs the bundled `server/nvf-lsp.wasm` (wasm32-wasip1) through the
// `ms-vscode.wasm-wasi-core` extension. Works on desktop and in VS Code for the Web.
//
// File system layout seen by the server:
//   /workspace/<n>   workspace folder n (index in `workspace.workspaceFolders`)
// Every URI under folder n, whatever its scheme, is sent to the server as
// `file:///workspace/<n>/...`, so the server only needs `file://` → path.
// Mounts are fixed at process start; the caller restarts the server when the
// workspace folders change.
import { Wasm, type ProcessOptions, type Readable, type Writable } from "@vscode/wasm-wasi/v1";
import * as vscode from "vscode";
import {
  Emitter,
  ReadableStreamMessageReader,
  WriteableStreamMessageWriter,
  type LanguageClientOptions,
  type MessageTransports,
} from "vscode-languageclient";

export function wasiServer(
  context: vscode.ExtensionContext,
  args: string[],
  log: vscode.OutputChannel | undefined,
): () => Promise<MessageTransports> {
  return async () => {
    const wasm = await Wasm.load();
    const options: ProcessOptions = {
      args,
      stdio: { in: { kind: "pipeIn" }, out: { kind: "pipeOut" }, err: { kind: "pipeOut" } },
      mountPoints: (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
        kind: "vscodeFileSystem",
        uri: folder.uri,
        mountPoint: `/workspace/${folder.index}`,
      })),
    };
    const module = await wasm.compile(vscode.Uri.joinPath(context.extensionUri, "server", "nvf-lsp.wasm"));
    const process = await wasm.createProcess("nvf-lsp", module, options);
    const decoder = new TextDecoder();
    process.stderr?.onData((data) => log?.append(decoder.decode(data)));
    return transports(process.run(), process.stdout!, process.stdin!);
  };
}

// Adapted from @vscode/wasm-wasi-lsp `startServer` (still a pre-release pinned to an
// older vscode-languageclient), so the dependency is not needed.
function transports(exit: Promise<number>, stdout: Readable, stdin: Writable): MessageTransports {
  const error = new Emitter<[Error, undefined, undefined]>();
  const end = new Emitter<void>();
  const close = new Emitter<void>();
  exit.then(
    (code) => (code === 0 ? end.fire() : error.fire([new Error(`nvf-lsp.wasm exited with code ${code}`), undefined, undefined])),
    (e: unknown) => error.fire([e instanceof Error ? e : new Error(String(e)), undefined, undefined]),
  );
  const reader = { onData: stdout.onData, onError: error.event, onClose: close.event, onEnd: end.event };
  const writer = {
    onError: error.event,
    onClose: close.event,
    onEnd: end.event,
    write: (data: string | Uint8Array) => (typeof data === "string" ? stdin.write(data, "utf-8") : stdin.write(data)),
    end: () => {},
  };
  return {
    reader: new ReadableStreamMessageReader(reader),
    writer: new WriteableStreamMessageWriter(writer),
    detached: false,
  };
}

/** Maps workspace-folder URIs to `file:///workspace/<n>` and back. */
export function uriConverters(): LanguageClientOptions["uriConverters"] {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
    code: folder.uri.toString().replace(/\/$/, ""),
    wasm: `file:///workspace/${folder.index}`,
  }));
  const swap = (value: string, from: "code" | "wasm", to: "code" | "wasm") => {
    for (const folder of folders) {
      const prefix = folder[from];
      if (value === prefix || value.startsWith(prefix + "/")) return folder[to] + value.slice(prefix.length);
    }
    return value;
  };
  return {
    code2Protocol: (uri) => swap(uri.toString(), "code", "wasm"),
    protocol2Code: (value) => vscode.Uri.parse(swap(value, "wasm", "code")),
  };
}
