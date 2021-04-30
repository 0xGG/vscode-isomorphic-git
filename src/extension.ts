// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import * as path from "path";
import * as vscode from "vscode";
import { FileSystem } from "./fs";
import { GitDocumentContentProvider } from "./gitDocumentContentProvider";
import { GIT_SCHEME } from "./gitRepository";
import { GitSourceControl } from "./gitSourceControl";

const gitSourceControlRegister = new Map<string, GitSourceControl>();
let gitOutputChannel: vscode.OutputChannel;
let gitDocumentContentProvider: GitDocumentContentProvider;
let fs: FileSystem;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const webFSExtension = vscode.extensions.getExtension("0xgg.vscode-web-fs");
  const webFSApi: any = webFSExtension?.exports;
  gitOutputChannel = vscode.window.createOutputChannel("isomorphic-git");
  fs = new FileSystem(webFSApi);
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
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );

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
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );
        if (gitSourceControl) {
          gitSourceControl.tryUpdateResourceGroups();
        } else {
          vscode.window.showErrorMessage(
            "isomorphic-git.refresh command failed to find git repo"
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
    vscode.commands.registerCommand(
      "isomorphic-git.openGitConfig",
      async () => {
        const workspaceFolderUri = await pickWorkspaceFolderUriWithGit();
        if (workspaceFolderUri) {
          vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.joinPath(workspaceFolderUri, "./.git/config"),
            vscode.ViewColumn.Active
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("isomorphic-git.addRemote", async () => {
      const workspaceFolderUri = await pickWorkspaceFolderUriWithGit();
      if (!workspaceFolderUri) {
        return;
      }
      const remoteUrl = await vscode.window.showInputBox({
        placeHolder:
          "Please enter the Git url. We only support http(s):// protocol",
      });
      if (!remoteUrl || !remoteUrl.match(/^https?:\/\//)) {
        return;
      }
      const remoteName = await vscode.window.showInputBox({
        placeHolder: "Remote name",
        prompt: "Please provide a remote name",
      });
      if (!remoteName) {
        return;
      }
      const gitSourceControl = gitSourceControlRegister.get(
        workspaceFolderUri.toString()
      );
      if (gitSourceControl) {
        gitSourceControl.addRemote(remoteName, remoteUrl);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("isomorphic-git.removeRemote", async () => {
      const workspaceFolderUri = await pickWorkspaceFolderUriWithGit();
      if (!workspaceFolderUri) {
        return;
      }
      const gitSourceControl = gitSourceControlRegister.get(
        workspaceFolderUri.toString()
      );
      if (!gitSourceControl) {
        return;
      }
      const remotes = await gitSourceControl.listRemotes();
      if (remotes.length) {
        const pick = await vscode.window.showQuickPick(
          remotes.map(({ remote, url }) => {
            return `${remote}: ${url}`;
          }),
          {
            canPickMany: false,
            placeHolder: "Please pick the remote that you would like to remove",
          }
        );
        if (pick) {
          const remoteName = pick.split(":")[0]?.trim();
          if (remoteName) {
            await gitSourceControl.removeRemote(remoteName);
          }
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.checkout",
      async (workspaceFolderUri: vscode.Uri) => {
        workspaceFolderUri =
          workspaceFolderUri || (await pickWorkspaceFolderUriWithGit());
        if (!workspaceFolderUri) {
          return;
        }
        const gitSourceControl = gitSourceControlRegister.get(
          workspaceFolderUri.toString()
        );
        if (!gitSourceControl) {
          return;
        }
        const branches = await gitSourceControl.listBranches();
        const createNewBranchLabel = "$(plus) Create new branch";
        const createNewBranchFromLabel = "$(plus) Create new branch from";
        const pick = await vscode.window.showQuickPick(
          [
            { label: createNewBranchLabel },
            {
              label: createNewBranchFromLabel,
            },
            ...branches.map((branch) => {
              return {
                label: branch,
              };
            }),
          ],
          {
            canPickMany: false,
            placeHolder: `Select a ref to checkout for ${workspaceFolderUri.toString()}`,
          }
        );
        if (pick) {
          if (pick.label === createNewBranchLabel) {
            const newBranchName = await vscode.window.showInputBox({
              placeHolder: "Branch name",
              prompt: "Please provide a new branch name",
            });
            if (newBranchName) {
              await gitSourceControl.checkoutNewBranch(newBranchName);
            }
          } else if (pick.label === createNewBranchFromLabel) {
            const newBranchName = await vscode.window.showInputBox({
              placeHolder: "Branch name",
              prompt: "Please provide a new branch name",
            });
            const ref = await vscode.window.showQuickPick(
              branches.map((branch) => {
                return {
                  label: branch,
                };
              }),
              {
                placeHolder: `Select a ref to create the ${newBranchName} from`,
              }
            );
            if (ref) {
              await gitSourceControl.checkoutNewBranch(
                newBranchName,
                ref.label
              );
            }
          } else {
            await gitSourceControl.checkoutBranch(pick.label);
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("isomorphic-git.deleteBranch", async () => {
      const workspaceFolderUri = await pickWorkspaceFolderUriWithGit();
      if (!workspaceFolderUri) {
        return;
      }
      const gitSourceControl = gitSourceControlRegister.get(
        workspaceFolderUri.toString()
      );
      if (!gitSourceControl) {
        return;
      }
      const currentbranch = await gitSourceControl.currentBranch();
      if (!currentbranch) {
        return;
      }
      const branches = (await gitSourceControl.listBranches(false)).filter(
        (b) => b !== currentbranch
      );
      if (branches.length) {
        const pick = await vscode.window.showQuickPick(branches, {
          canPickMany: false,
          placeHolder: "Select a branch to delete",
        });
        if (pick) {
          await gitSourceControl.deleteBranch(pick);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("isomorphic-git.clone", async () => {
      const url = await vscode.window.showInputBox({
        placeHolder: "Provide repository URL",
        prompt: "We only support cloning http(s):// Git repository",
      });
      if (!url) {
        return;
      }
      if (!url.match(/^https?:\/\//)) {
        vscode.window.showErrorMessage(
          "We only support http(s):// protocol Git repository"
        );
        return;
      }
      const corsProxy = getCORSProxy();
      const dir = url.replace(/^https?:\/+/, "/").replace(/\.git$/, "");
      vscode.window
        .withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Cloning ${url}`,
            cancellable: false,
          },
          (progress, token) => {
            gitOutputChannel.show();
            gitOutputChannel.appendLine(`Cloning ${url}`);
            progress.report({ increment: 0 });
            return git.clone({
              fs: fs,
              http: http,
              dir: dir,
              corsProxy,
              url: url,
              depth: 1,
              onAuthFailure: createOnAuthFailure(),
              onMessage: (message) => {
                gitOutputChannel.appendLine(message);
              },
              onProgress: (gitProgress) => {
                progress.report({
                  increment:
                    (gitProgress.loaded / (gitProgress.total || 100)) * 100,
                  message: "\n\n" + gitProgress.phase,
                });
              },
            });
          }
        )
        .then(
          () => {
            const uri = vscode.Uri.parse(`memfs:${dir}`);
            vscode.window.showInformationMessage(`Done cloning ${url}`);
            vscode.workspace.updateWorkspaceFolders(
              vscode.workspace.workspaceFolders
                ? vscode.workspace.workspaceFolders.length
                : 0,
              null,
              {
                uri, // We only support saving to MemFS for now
                name: path.basename(dir),
              }
            );
            tryInitializeGitSourceControlForWorkspace(uri, context, fs);
          },
          (error) => {
            console.error(error);
            vscode.window.showErrorMessage(`Failed to clone ${url}`);
          }
        );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.fetch",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );
        if (!gitSourceControl) {
          return;
        }
        const remotes = await gitSourceControl.listRemotes();
        let remote: string;
        let url: string;
        if (!remotes.length) {
          return;
        } else if (remotes.length === 1) {
          remote = remotes[0].remote;
          url = remotes[0].url;
        } else {
          const pickRemote = await vscode.window.showQuickPick(
            remotes.map(({ remote, url }) => {
              return {
                label: remote,
                description: url,
              };
            }),
            {
              canPickMany: false,
              placeHolder: "Pick the remote that you would like to fetch",
            }
          );
          if (!pickRemote) {
            return;
          } else {
            remote = pickRemote.label;
            url = pickRemote.description;
          }
        }
        const corsProxy = getCORSProxy();
        gitOutputChannel.show();
        gitOutputChannel.appendLine(`Fetching ${url}`);
        await git.fetch({
          fs: fs,
          http: http,
          dir: gitSourceControl.getWorkspaceFolderUri().path,
          corsProxy,
          singleBranch: false,
          url,
          remote,
          tags: false,
          onAuthFailure: createOnAuthFailure(),
          onMessage: (message) => {
            gitOutputChannel.appendLine(message);
          },
        });
        gitOutputChannel.appendLine(`Done fetching ${url}`);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.pullFrom",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );
        if (!gitSourceControl) {
          return;
        }
        const remotes = await gitSourceControl.listRemotes();
        if (!remotes.length) {
          return;
        }

        const pickRemote = await vscode.window.showQuickPick(
          remotes.map(({ remote, url }) => {
            return {
              label: remote,
              description: url,
            };
          }),
          {
            canPickMany: false,
            placeHolder: "Pick a remote to pull the branch from",
          }
        );
        if (!pickRemote) {
          return;
        }
        const remote = pickRemote.label;
        const url = pickRemote.description;
        const branches = (
          await gitSourceControl.listBranches(true)
        ).filter((b) => b.startsWith(remote + "/"));
        if (!branches.length) {
          return;
        }
        let branch = await vscode.window.showQuickPick(branches, {
          canPickMany: false,
          placeHolder: "Pick a branch to pull from",
        });
        if (!branch) {
          return;
        }
        branch = branch.replace(remote + "/", "");
        const corsProxy = getCORSProxy();
        const { authorName, authorEmail } = getAuthorNameAndEmail();
        vscode.window
          .withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Pulling from ${url} ${remote} ${branch}`,
              cancellable: false,
            },
            (progress, token) => {
              gitOutputChannel.show();
              gitOutputChannel.appendLine(
                `Pulling from ${url} ${remote} ${branch}`
              );
              progress.report({ increment: 0 });
              return git.pull({
                fs,
                http,
                dir: gitSourceControl.getWorkspaceFolderUri().path,
                corsProxy,
                url: url,
                remote: remote,
                remoteRef: branch,
                author: {
                  name: authorName,
                  email: authorEmail,
                },
                onAuthFailure: createOnAuthFailure(),
                onMessage: (message) => {
                  gitOutputChannel.appendLine(message);
                },
                onProgress: (gitProgress) => {
                  progress.report({
                    increment:
                      (gitProgress.loaded / (gitProgress.total || 100)) * 100,
                    message: "\n\n" + gitProgress.phase,
                  });
                },
              });
            }
          )
          .then(
            () => {
              vscode.window.showInformationMessage(
                `Done pulling from ${url} ${remote} ${branch}`
              );
              gitSourceControl.tryUpdateResourceGroups();
            },
            (error) => {
              console.error(error);
              vscode.window.showErrorMessage(
                `Failed to pull from ${url} ${remote} ${branch}`
              );
            }
          );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.pushTo",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );
        if (!gitSourceControl) {
          return;
        }
        const remotes = await gitSourceControl.listRemotes();
        let remote: string;
        let url: string;
        if (!remotes.length) {
          return;
        } else if (remotes.length === 1) {
          remote = remotes[0].remote;
          url = remotes[0].url;
        } else {
          const pickRemote = await vscode.window.showQuickPick(
            remotes.map(({ remote, url }) => {
              return {
                label: remote,
                description: url,
              };
            }),
            {
              canPickMany: false,
              placeHolder: "Pick the remote that you would like to fetch",
            }
          );
          if (!pickRemote) {
            return;
          } else {
            remote = pickRemote.label;
            url = pickRemote.description;
          }
        }
        const corsProxy = getCORSProxy();
        const currentBranch = await gitSourceControl.currentBranch();
        if (!currentBranch) {
          return;
        }
        vscode.window
          .withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Pushing to ${url} ${remote} ${currentBranch}`,
            },
            (progress, token) => {
              gitOutputChannel.show();
              gitOutputChannel.appendLine(
                `Pushing to ${url} ${remote} ${currentBranch}`
              );
              progress.report({ increment: 0 });
              return git.push({
                fs: fs,
                http: http,
                dir: gitSourceControl.getWorkspaceFolderUri().path,
                remote: remote,
                ref: currentBranch,
                corsProxy,
                onAuthFailure: createOnAuthFailure(),
                onMessage: (message) => {
                  gitOutputChannel.appendLine(message);
                },
                onProgress: (gitProgress) => {
                  progress.report({
                    increment:
                      (gitProgress.loaded / (gitProgress.total || 100)) * 100,
                    message: "\n\n" + gitProgress.phase,
                  });
                },
              });
            }
          )
          .then(
            () => {
              vscode.window.showInformationMessage(
                `Done pushing to ${url} ${remote} ${currentBranch}`
              );
              gitSourceControl.tryUpdateResourceGroups();
            },
            (error) => {
              console.error(error);
              vscode.window.showErrorMessage(
                `Failed to push to ${url} ${remote} ${currentBranch}`
              );
            }
          );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "isomorphic-git.merge",
      async (sourceControlPane: vscode.SourceControl) => {
        const gitSourceControl = gitSourceControlRegister.get(
          sourceControlPane
            ? sourceControlPane.rootUri.toString()
            : (await pickWorkspaceFolderUriWithGit()).toString()
        );
        if (!gitSourceControl) {
          return;
        }
        const branches = await gitSourceControl.listBranches(true);
        if (!branches.length) {
          return;
        }
        const pickBranch = await vscode.window.showQuickPick(branches, {
          canPickMany: false,
          placeHolder: "Select a branch to merge from",
        });
        await gitSourceControl.mergeBranch(pickBranch);
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

function getUrisOfWorkspaceFoldersWithGit() {
  return Array.from(gitSourceControlRegister.keys()).map((p) =>
    vscode.Uri.parse(p)
  );
}

async function pickWorkspaceFolderUriWithGit(
  placeHolder: string = "Choose a repository"
): Promise<vscode.Uri | undefined> {
  const workspaceFolderUris = getUrisOfWorkspaceFoldersWithGit();
  let pick: string;
  if (!workspaceFolderUris.length) {
    vscode.window.showErrorMessage(`No workspace folder with git found`);
    return;
  } else if (workspaceFolderUris.length === 1) {
    pick = workspaceFolderUris[0].toString();
  } else {
    pick = await vscode.window.showQuickPick(
      workspaceFolderUris.map((uri) => uri.toString()) || [],
      {
        canPickMany: false,
        placeHolder: placeHolder,
      }
    );
  }
  return vscode.Uri.parse(pick);
}

interface Credential {
  url: string;
  username: string;
  password: string;
}

async function getUsernameAndPasswordFromRepo(repoUrl: string) {
  repoUrl = repoUrl.trim();
  const config = vscode.workspace.getConfiguration("isomorphic-git");
  const credentials = config.get<Credential[]>("credentials") || [];
  let { username, password } = credentials.find((c) => c.url === repoUrl) || {
    url: "",
    username: "",
    password: "",
  };
  if (!username) {
    username = await vscode.window.showInputBox({
      placeHolder: "Username",
    });
  }
  if (!password) {
    password = await vscode.window.showInputBox({
      placeHolder: "Password",
      prompt: `Password for username ${username}`,
    });
  }
  return { username, password };
}

function getAuthorNameAndEmail() {
  const config = vscode.workspace.getConfiguration("isomorphic-git");
  const authorName = config.get<string>("authorName") || "Anonymous";
  const authorEmail = config.get<string>("authorEmail") || "anonymous@git.com";
  return { authorName, authorEmail };
}

function getCORSProxy() {
  const config = vscode.workspace.getConfiguration("isomorphic-git");
  return config.get<string>("corsProxy");
}

function createOnAuthFailure(allowedFailureTime = 3) {
  let failureTime = 0;
  return async function (url: string, auth: git.GitAuth): Promise<git.GitAuth> {
    failureTime++;
    if (failureTime >= allowedFailureTime) {
      vscode.window.showErrorMessage(`Too many authentication failures`);
      return { cancel: true };
    } else {
      const { username, password } = await getUsernameAndPasswordFromRepo(url);
      return {
        username,
        password,
      };
    }
  };
}

// this method is called when your extension is deactivated
export function deactivate() {}
