import * as vscode from "vscode";
import { FileSystem } from "./fs";
import { GitRepository } from "./gitRepository";

export class GitSourceControl implements vscode.Disposable {
  private scm: vscode.SourceControl;
  private changedResources: vscode.SourceControlResourceGroup;
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
    this.changedResources = this.scm.createResourceGroup(
      "workingTree",
      "isomorphic-git changes"
    );
    this.gitRepository = new GitRepository(workspaceFolderUri, fs);
    this.scm.quickDiffProvider = this.gitRepository;
    this.scm.inputBox.placeholder = "Message to commit";

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
    this.timeout = setTimeout(() => this.tryUpdateChangedGroup(), 500);
  }

  async tryUpdateChangedGroup(): Promise<void> {
    try {
      await this.updateChangedGroup();
    } catch (error) {
      vscode.window.showErrorMessage(error);
    }
  }

  /** This is where the source control determines, which documents were updated, removed, and theoretically added. */
  async updateChangedGroup(): Promise<void> {
    // for simplicity we ignore which document was changed in this event and scan all of them
    const changedResources: vscode.SourceControlResourceState[] = [];

    const result = await this.gitRepository.provideSourceControlledResources();
    console.log(
      "** updateChangedGroup provideSourceControlledResources: ",
      result
    );

    for (const [uri, deleted] of result) {
      const resourceState = this.toSourceControlResourceState(uri, deleted);
      changedResources.push(resourceState);
    }

    this.changedResources.resourceStates = changedResources;

    // the number of modified resources needs to be assigned to the SourceControl.count filed to let VS Code show the number.
    this.scm.count = this.changedResources.resourceStates.length;
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
}
