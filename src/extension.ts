// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as git from "isomorphic-git";
import * as path from "path";
import * as vscode from "vscode";
import { FileSystem } from "./fs";
import { GitDocumentContentProvider } from "./gitDocumentContentProvider";
import { GIT_SCHEME } from "./gitRepository";
import { GitSourceControl } from "./gitSourceControl";

const gitSourceControlRegister = new Map<vscode.Uri, GitSourceControl>();
let gitDocumentContentProvider: GitDocumentContentProvider;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Activated the vscode-isomorphic-git extension");
  const webFSExtension = vscode.extensions.getExtension("0xgg.vscode-web-fs");
  const webFSApi: any = webFSExtension?.exports;
  const fs = new FileSystem(webFSApi);
  gitDocumentContentProvider = new GitDocumentContentProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      GIT_SCHEME,
      gitDocumentContentProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("isomorphic-git.init", async () => {
      const pick = await vscode.window.showQuickPick(
        (vscode.workspace.workspaceFolders || []).map((wf) =>
          wf.uri.toString()
        ),
        {
          canPickMany: false,
          placeHolder: "Pick workspace folder to initialize git repo in",
        }
      );
      if (!pick) {
        vscode.window.showErrorMessage(`Failed to initialize git repo`);
      } else {
        const workspaceFolderUri = vscode.Uri.parse(pick);
        await git.init({
          fs,
          dir: workspaceFolderUri.path,
          defaultBranch: "master",
        });
        registerGitSourceControl(workspaceFolderUri, context, fs);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      console.log("workspaceFolders: ", vscode.workspace.workspaceFolders);
      try {
        e.added.forEach(async (workspaceFolder) => {
          tryInitializeGitSourceControlForWorkspace(
            workspaceFolder.uri,
            context,
            fs
          );
        });
      } catch (error) {
        vscode.window.showErrorMessage(error.message);
      } finally {
        e.removed.forEach((workspaceFolder) => {
          unregisterGitSourceControl(workspaceFolder.uri);
        });
      }
    })
  );
  vscode.workspace.workspaceFolders?.forEach((workspaceFolder) => {
    tryInitializeGitSourceControlForWorkspace(workspaceFolder.uri, context, fs);
  });
}

async function tryInitializeGitSourceControlForWorkspace(
  folderUri: vscode.Uri,
  context: vscode.ExtensionContext,
  fs: FileSystem
) {
  try {
    await fs.promises.stat(path.join(folderUri.path, "./.git/config"));
    const gitSourceControl = await registerGitSourceControl(
      folderUri,
      context,
      fs
    );
    gitSourceControl.tryUpdateChangedGroup();
  } catch (error) {}
}

async function registerGitSourceControl(
  folderUri: vscode.Uri,
  context: vscode.ExtensionContext,
  fs: FileSystem
): Promise<GitSourceControl> {
  const gitSourceControl = new GitSourceControl(context, folderUri, fs);
  if (gitSourceControlRegister.has(gitSourceControl.getWorkspaceFolderUri())) {
    const previousSourceControl = gitSourceControlRegister.get(
      gitSourceControl.getWorkspaceFolderUri()
    )!;
    previousSourceControl.dispose();
  }
  gitSourceControlRegister.set(
    gitSourceControl.getWorkspaceFolderUri(),
    gitSourceControl
  );
  context.subscriptions.push(gitSourceControl);
  return gitSourceControl;
}

function unregisterGitSourceControl(folderUri: vscode.Uri): void {
  if (gitSourceControlRegister.has(folderUri)) {
    const previousSourceControl = gitSourceControlRegister.get(folderUri)!;
    previousSourceControl.dispose();

    gitSourceControlRegister.delete(folderUri);
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
