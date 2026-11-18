// Web entry point (vscode.dev, github.dev): only the bundled WASI build can run.
import type * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/browser";
import { activateWith, deactivate } from "./client";

export { deactivate };

export function activate(context: vscode.ExtensionContext): Promise<void> {
  return activateWith(context, {
    nativeServer: async () => undefined,
    createClient: (server, options) => {
      if (typeof server !== "function") throw new Error("Native language servers cannot run in the browser.");
      return new LanguageClient("novafile", "NOVA Language Server", server, options);
    },
  });
}
