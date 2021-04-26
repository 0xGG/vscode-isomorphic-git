// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as git from "isomorphic-git";
import * as path from "path";
import * as vscode from "vscode";
import { FileSystem } from "./fs";
import { GitDocumentContentProvider } from "./gitDocumentContentProvider";
import { GIT_SCHEME } from "./gitRepository";
import { GitSourceControl } from "./gitSourceControl";

const gitSourceControlRegister = new Map<string, GitSourceControl>();
let gitDocumentContentProvider: GitDocumentContentProvider;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const webFSExtension = vscode.extensions.getExtension("0xgg.vscode-web-fs");
  const webFSApi: any = webFSExtension?.exports;
  const fs = new FileSystem(webFSApi);
  gitDocumentContentProvider = new GitDocumentContentProvider(
    fs,
    webFSApi.nativeFSPrefix
  );

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
    vscode.commands.registerCommand(
      "isomorphic-git.commit",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = sourceControlPane
          ? gitSourceControlRegister.get(sourceControlPane.rootUri.toString())
          : Array.from(gitSourceControlRegister.values())[0];
        if (!gitSourceControl) {
          vscode.window.showErrorMessage("Failed to git commit");
        } else {
          let commitMessage = gitSourceControl.scm.inputBox.value;
          if (!commitMessage) {
            commitMessage = await vscode.window.showInputBox({
              prompt: "Please provide a commit message",
              placeHolder: "Message",
            });
          }
          if (commitMessage.length) {
            await gitSourceControl.commit(commitMessage);
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.refresh",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = sourceControlPane
          ? gitSourceControlRegister.get(sourceControlPane.rootUri.toString())
          : Array.from(gitSourceControlRegister.values())[0];
        // console.log("isomorphic-git.refresh: ", gitSourceControl);
        if (gitSourceControl) {
          gitSourceControl.tryUpdateResourceGroups();
        } else {
          vscode.window.showErrorMessage(
            "isomorphic-git.refresh command failed to find git repo: " +
              sourceControlPane.rootUri.toString()
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.stage",
      async (state: vscode.SourceControlResourceState) => {
        const workspaceFolderUri = getWorkspaceUriByFileUri(state.resourceUri);
        const error = () => {
          vscode.window.showErrorMessage(
            "Failed to git stage the file " + state.resourceUri.toString()
          );
        };
        if (workspaceFolderUri) {
          const gitSourceControl = gitSourceControlRegister.get(
            workspaceFolderUri.toString()
          );
          if (gitSourceControl) {
            gitSourceControl.stageFile(state.resourceUri);
          } else {
            error();
          }
        } else {
          error();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.stageAll",
      async (group: vscode.SourceControlResourceGroup) => {
        if (group.resourceStates.length) {
          const workspaceFolderUri = getWorkspaceUriByFileUri(
            group.resourceStates[0].resourceUri
          );
          const error = () => {
            vscode.window.showErrorMessage("Failed to git unstage all files");
          };
          if (workspaceFolderUri) {
            const gitSourceControl = gitSourceControlRegister.get(
              workspaceFolderUri.toString()
            );
            if (gitSourceControl) {
              gitSourceControl.stageAll(group.resourceStates);
            } else {
              error();
            }
          } else {
            error();
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.unstage",
      async (state: vscode.SourceControlResourceState) => {
        const workspaceFolderUri = getWorkspaceUriByFileUri(state.resourceUri);
        const error = () => {
          vscode.window.showErrorMessage(
            "Failed to git unstage the file " + state.resourceUri.toString()
          );
        };
        if (workspaceFolderUri) {
          const gitSourceControl = gitSourceControlRegister.get(
            workspaceFolderUri.toString()
          );
          if (gitSourceControl) {
            gitSourceControl.unstageFile(state.resourceUri);
          } else {
            error();
          }
        } else {
          error();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.unstageAll",
      async (group: vscode.SourceControlResourceGroup) => {
        if (group.resourceStates.length) {
          const workspaceFolderUri = getWorkspaceUriByFileUri(
            group.resourceStates[0].resourceUri
          );
          const error = () => {
            vscode.window.showErrorMessage("Failed to git unstage all files");
          };
          if (workspaceFolderUri) {
            const gitSourceControl = gitSourceControlRegister.get(
              workspaceFolderUri.toString()
            );
            if (gitSourceControl) {
              gitSourceControl.unstageAll(group.resourceStates);
            } else {
              error();
            }
          } else {
            error();
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.clean",
      async (state: vscode.SourceControlResourceState) => {
        const workspaceFolderUri = getWorkspaceUriByFileUri(state.resourceUri);
        const error = () => {
          vscode.window.showErrorMessage(
            "Failed to git clean the file " + state.resourceUri.toString()
          );
        };
        if (workspaceFolderUri) {
          const gitSourceControl = gitSourceControlRegister.get(
            workspaceFolderUri.toString()
          );
          if (gitSourceControl) {
            gitSourceControl.clean(state.resourceUri);
          } else {
            error();
          }
        } else {
          error();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.cleanAll",
      async (group: vscode.SourceControlResourceGroup) => {
        if (group.resourceStates.length) {
          const workspaceFolderUri = getWorkspaceUriByFileUri(
            group.resourceStates[0].resourceUri
          );
          const error = () => {
            vscode.window.showErrorMessage("Failed to git clean all files");
          };
          if (workspaceFolderUri) {
            const gitSourceControl = gitSourceControlRegister.get(
              workspaceFolderUri.toString()
            );
            if (gitSourceControl) {
              gitSourceControl.cleanAll(group.resourceStates);
            } else {
              error();
            }
          } else {
            error();
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
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
    gitSourceControl.tryUpdateResourceGroups();
  } catch (error) {}
}

async function registerGitSourceControl(
  folderUri: vscode.Uri,
  context: vscode.ExtensionContext,
  fs: FileSystem
): Promise<GitSourceControl> {
  const gitSourceControl = new GitSourceControl(context, folderUri, fs);
  if (
    gitSourceControlRegister.has(
      gitSourceControl.getWorkspaceFolderUri().toString()
    )
  ) {
    const previousSourceControl = gitSourceControlRegister.get(
      gitSourceControl.getWorkspaceFolderUri().toString()
    )!;
    previousSourceControl.dispose();
  }
  gitSourceControlRegister.set(
    gitSourceControl.getWorkspaceFolderUri().toString(),
    gitSourceControl
  );
  context.subscriptions.push(gitSourceControl);
  return gitSourceControl;
}

function unregisterGitSourceControl(folderUri: vscode.Uri): void {
  if (gitSourceControlRegister.has(folderUri.toString())) {
    const previousSourceControl = gitSourceControlRegister.get(
      folderUri.toString()
    )!;
    previousSourceControl.dispose();

    gitSourceControlRegister.delete(folderUri.toString());
  }
}

function getWorkspaceUriByFileUri(uri: vscode.Uri): vscode.Uri | undefined {
  for (let i = 0; i < vscode.workspace.workspaceFolders.length; i++) {
    const workspaceFolder = vscode.workspace.workspaceFolders[i];
    if (
      workspaceFolder.uri.scheme === uri.scheme &&
      uri.path.indexOf(workspaceFolder.uri.path) === 0
    ) {
      return workspaceFolder.uri;
    }
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
