// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as git from "isomorphic-git";
import * as vscode from "vscode";
import { FileSystem } from "./fs";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const webFSExtension = vscode.extensions.getExtension("0xgg.vscode-web-fs");
  const webFSApi: any = webFSExtension?.exports;
  console.log("webFSApi: ", webFSApi);
  const fs = new FileSystem(webFSApi);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      console.log("workspaceFolders: ", vscode.workspace.workspaceFolders);
      vscode.workspace.workspaceFolders?.forEach(async (workspaceFolder) => {
        const dir = workspaceFolder.uri.path;
        let currentBranch: string | void;

        try {
          currentBranch = await git.currentBranch({
            fs,
            dir,
            fullname: false,
          });
        } catch (error) {
          currentBranch = undefined;
        }
        console.log("currentBranch: ", currentBranch);
        if (!currentBranch) {
          console.log("init .git");
          await git.init({
            fs,
            dir,
            defaultBranch: "main",
          });
          console.log("done init .git, start checking out branch");
          await git.checkout({
            fs,
            dir,
            ref: "main",
          });
          console.log("done checking out branch");
          try {
            console.log(
              "default branch ",
              await git.currentBranch({ fs, dir, fullname: false })
            );
          } catch (error) {
            console.log(error, "default branch not found");
          }
          console.log("new branches: ", await git.listBranches({ fs, dir }));
        }
      });
    })
  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
