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
    console.log("** onResourceChange: ", _uri);
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => this.tryUpdateResourceGroups(), 500);
  }

  async tryUpdateResourceGroups(): Promise<void> {
    try {
      await this.updateChangedGroup();
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
    console.log(
      "** updateChangedGroup provideSourceControlledResources: ",
      result
    );

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
    console.log("stageFile " + uri.toString());
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
    console.log("finished stageFile " + uri.toString());
    if (refresh) {
      await this.tryUpdateResourceGroups();
    }
  }

  async clean(uri: vscode.Uri) {
    console.log("clean: " + uri.toString());
    await git.checkout({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      force: true,
      filepaths: [path.relative(this.workspaceFolderUri.path, uri.path)],
    });
    await this.tryUpdateResourceGroups();
  }

  async unstageFile(uri: vscode.Uri, refresh: boolean = true) {
    console.log("unstageFile " + uri.toString());
    await git.resetIndex({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      filepath: path.relative(this.workspaceFolderUri.path, uri.path),
    });
    console.log("finished unstageFile " + uri.toString());
    if (refresh) {
      await this.tryUpdateResourceGroups();
    }
  }

  async stageAll(resourceStates: vscode.SourceControlResourceState[]) {
    console.log("stageAll ", resourceStates);
    const promises: Promise<void>[] = [];
    for (let i = 0; i < resourceStates.length; i++) {
      promises.push(this.stageFile(resourceStates[i].resourceUri, false));
    }
    await Promise.all(promises);
    await this.tryUpdateResourceGroups();
  }

  async unstageAll(resourceStates: vscode.SourceControlResourceState[]) {
    console.log("unstageAll ", resourceStates);
    const promises: Promise<void>[] = [];
    for (let i = 0; i < resourceStates.length; i++) {
      promises.push(this.unstageFile(resourceStates[i].resourceUri, false));
    }
    await Promise.all(promises);
    await this.tryUpdateResourceGroups();
  }

  async cleanAll(resourceStates: vscode.SourceControlResourceState[]) {
    console.log("cleanAll ", resourceStates);
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

  async commit(commitMessage: string) {
    const config = vscode.workspace.getConfiguration("isomorphic-git");
    const authorName = config.get<string>("authorName") || "Anonymous";
    const authorEmail =
      config.get<string>("authorEmail") || "anonymous@git.com";
    console.log("commit ", commitMessage, authorName, authorEmail);
    const sha = await git.commit({
      fs: this.fs,
      dir: this.workspaceFolderUri.path,
      message: commitMessage,
      author: {
        name: authorName,
        email: authorEmail,
      },
    });
    console.log("commited: ", sha);
    await this.tryUpdateResourceGroups();
    this.scm.inputBox.value = "";
  }
}
