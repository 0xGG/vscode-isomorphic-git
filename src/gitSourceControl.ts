import * as git from "isomorphic-git";
import * as path from "path";
import * as vscode from "vscode";
import { FileSystem } from "./fs";
import { GitRepository } from "./gitRepository";

export class GitSourceControl implements vscode.Disposable {
  public scm: vscode.SourceControl;
  private indexGroup: vscode.SourceControlResourceGroup;
  private workingTreeGroup: vscode.SourceControlResourceGroup;
  private gitRepository: GitRepository;
  private timeout?: NodeJS.Timer;

  constructor(
    context: vscode.ExtensionContext,
    private readonly workspaceFolderUri: vscode.Uri,
    private readonly fs: FileSystem
  ) {
    this.scm = vscode.scm.createSourceControl(
      "isomorphic-git",
      "isomorphic-git",
      workspaceFolderUri
    );
    this.indexGroup = this.scm.createResourceGroup("index", "Staged Changes");
    // this.indexGroup.hideWhenEmpty = true;
    this.workingTreeGroup = this.scm.createResourceGroup(
      "workingTree",
      "Changes"
    );
    this.gitRepository = new GitRepository(workspaceFolderUri, fs);
    this.scm.quickDiffProvider = this.gitRepository;
    this.scm.inputBox.placeholder = "Message to commit (Ctrl+Enter to commit)";
    this.scm.acceptInputCommand = {
      command: "isomorphic-git.commit",
      title: "Commit",
      arguments: [this.scm],
      tooltip: "Commit your changes",
    };
    this.refreshStatusBar();

    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolderUri, "*.*")
    );
    fileSystemWatcher.onDidChange(
      (uri) => this.onResourceChange(uri),
      context.subscriptions
    );
    fileSystemWatcher.onDidCreate(
      (uri) => this.onResourceChange(uri),
      context.subscriptions
    );
    fileSystemWatcher.onDidDelete(
      (uri) => this.onResourceChange(uri),
      context.subscriptions
    );

    context.subscriptions.push(this.scm);
    context.subscriptions.push(fileSystemWatcher);
  }

  public getWorkspaceFolderUri(): vscode.Uri {
    return this.workspaceFolderUri;
  }

  onResourceChange(_uri: vscode.Uri): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => this.tryUpdateResourceGroups(), 500);
  }

  async tryUpdateResourceGroups(): Promise<void> {
    try {
      await this.updateChangedGroup();
      await this.refreshStatusBar();
    } catch (error) {
      vscode.window.showErrorMessage(error);
    }
  }

  /** This is where the source control determines, which documents were updated, removed, and theoretically added. */
  async updateChangedGroup(): Promise<void> {
    // for simplicity we ignore which document was changed in this event and scan all of them
    const workingTreeGroup: vscode.SourceControlResourceState[] = [];
    const indexGroup: vscode.SourceControlResourceState[] = [];

    const result = await this.gitRepository.provideSourceControlledResources();
    for (const [uri, deleted, staged] of result) {
      const resourceState = this.toSourceControlResourceState(uri, deleted);
      if (staged) {
        indexGroup.push(resourceState);
      } else {
        workingTreeGroup.push(resourceState);
      }
    }

    this.workingTreeGroup.resourceStates = workingTreeGroup;
    this.indexGroup.resourceStates = indexGroup;

    // the number of modified resources needs to be assigned to the SourceControl.count filed to let VS Code show the number.
    this.scm.count =
      this.workingTreeGroup.resourceStates.length +
      this.indexGroup.resourceStates.length;
  }

  dispose() {
    this.scm.dispose();
  }

  private async refreshStatusBar() {
    let currentBranch: string | void = "";
    try {
      currentBranch = await git.currentBranch({
        fs: this.fs,
        dir: this.workspaceFolderUri.path,
        fullname: false,
      });
      if (!currentBranch) {
        currentBranch = (
          await git.resolveRef({
            fs: this.fs,
            dir: this.workspaceFolderUri.path,
            ref: "HEAD",
          })
        ).slice(0, 8);
      }
      this.scm.statusBarCommands = [
        {
          command: "isomorphic-git.checkout",
          arguments: [this.workspaceFolderUri],
          title: `$(git-branch) ${currentBranch}`,
        },
      ];
    } catch (error) {}
  }

  toSourceControlResourceState(
    docUri: vscode.Uri,
    deleted: boolean
  ): vscode.SourceControlResourceState {
    const repositoryUri = this.gitRepository.provideOriginalResource(
      docUri,
      null
    );

    const command: vscode.Command = !deleted
      ? {
          title: "Show changes",
          command: "vscode.diff",
          arguments: [
            repositoryUri,
            docUri,
            `isomorphic-git ${docUri.toString()} ↔ Local changes`,
          ],
          tooltip: `Diff your changes`,
        }
      : null;

    const resourceState: vscode.SourceControlResourceState = {
      resourceUri: docUri,
      command: command,
      decorations: {
        strikeThrough: deleted,
        tooltip: "File was locally deleted.",
      },
    };

    return resourceState;
  }

  async stageFile(uri: vscode.Uri, refresh: boolean = true) {
    try {
      await this.fs.promises.stat(uri.path);
      await git.add({
        fs: this.fs,
        dir: this.workspaceFolderUri.path,
        filepath: path.relative(this.workspaceFolderUri.path, uri.path),
      });
    } catch (error) {
      await git.remove({
        fs: this.fs,
        dir: this.workspaceFolderUri.path,
        filepath: path.relative(this.workspaceFolderUri.path, uri.path),
      });
    }
    if (refresh) {
      await this.tryUpdateResourceGroups();
    }
  }

  async clean(uri: vscode.Uri) {
    await git.checkout({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      force: true,
      filepaths: [path.relative(this.workspaceFolderUri.path, uri.path)],
    });
    await this.tryUpdateResourceGroups();
  }

  async unstageFile(uri: vscode.Uri, refresh: boolean = true) {
    await git.resetIndex({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      filepath: path.relative(this.workspaceFolderUri.path, uri.path),
    });
    if (refresh) {
      await this.tryUpdateResourceGroups();
    }
  }

  async stageAll(resourceStates: vscode.SourceControlResourceState[]) {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < resourceStates.length; i++) {
      promises.push(this.stageFile(resourceStates[i].resourceUri, false));
    }
    await Promise.all(promises);
    await this.tryUpdateResourceGroups();
  }

  async unstageAll(resourceStates: vscode.SourceControlResourceState[]) {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < resourceStates.length; i++) {
      promises.push(this.unstageFile(resourceStates[i].resourceUri, false));
    }
    await Promise.all(promises);
    await this.tryUpdateResourceGroups();
  }

  async cleanAll(resourceStates: vscode.SourceControlResourceState[]) {
    await git.checkout({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      force: true,
      filepaths: resourceStates.map((state) =>
        path.relative(this.workspaceFolderUri.path, state.resourceUri.path)
      ),
    });
    await this.tryUpdateResourceGroups();
  }

  private getAuthorNameAndEmail() {
    const config = vscode.workspace.getConfiguration("isomorphic-git");
    const authorName = config.get<string>("authorName") || "Anonymous";
    const authorEmail =
      config.get<string>("authorEmail") || "anonymous@git.com";
    return { authorName, authorEmail };
  }

  async commit(commitMessage: string) {
    const { authorName, authorEmail } = this.getAuthorNameAndEmail();
    const sha = await git.commit({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      message: commitMessage,
      author: {
        name: authorName,
        email: authorEmail,
      },
    });
    await this.tryUpdateResourceGroups();
    this.scm.inputBox.value = "";
  }

  async addRemote(remoteName: string, remoteUrl: string) {
    await git.addRemote({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      remote: remoteName,
      url: remoteUrl,
    });
  }

  async listRemotes() {
    return await git.listRemotes({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
    });
  }

  async removeRemote(remoteName: string) {
    await git.deleteRemote({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      remote: remoteName,
    });
  }

  async listBranches(includingRemotes: boolean = true) {
    let branches: string[] = await git.listBranches({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
    });
    if (includingRemotes) {
      const remotes = await this.listRemotes();
      for (let i = 0; i < remotes.length; i++) {
        const { remote } = remotes[i];
        const remoteBranches = (
          await git.listBranches({
            fs: this.fs,
            dir: this.workspaceFolderUri.path,
            remote: remote,
          })
        ).map((branch) => `${remote}/${branch}`);
        branches = branches.concat(remoteBranches || []);
      }
    }

    return branches;
  }

  /**
   * Checkout an existing branch
   * @param branchName
   */
  async checkoutBranch(branchName: string) {
    await git.checkout({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      ref: branchName,
    });
    await this.tryUpdateResourceGroups();
  }

  async checkoutNewBranch(newBranchName: string, ref: string | void) {
    if (!ref) {
      try {
        ref = await git.currentBranch({
          fs: this.fs,
          dir: this.workspaceFolderUri.path,
          fullname: false,
        });
      } catch (error) {}
    }
    if (!ref) {
      return; // Error
    }
    await git.checkout({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      ref: ref,
    });
    await git.branch({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      ref: newBranchName,
      checkout: true,
    });
    await this.tryUpdateResourceGroups();
  }

  async currentBranch() {
    try {
      return await git.currentBranch({
        fs: this.fs,
        dir: this.workspaceFolderUri.path,
        fullname: false,
      });
    } catch (error) {
      return "";
    }
  }

  async deleteBranch(branchName: string) {
    await git.deleteBranch({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      ref: branchName,
    });
    await this.tryUpdateResourceGroups();
  }

  async mergeBranch(branchName: string) {
    const { authorName, authorEmail } = this.getAuthorNameAndEmail();
    await git.merge({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      // ours: (await this.currentBranch()) || "",
      theirs: branchName,
      author: {
        name: authorName,
        email: authorEmail,
      },
    });
    await this.tryUpdateResourceGroups();
  }
}
