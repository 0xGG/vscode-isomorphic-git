import * as git from "isomorphic-git";
import * as path from "path";
import {
  CancellationToken,
  Disposable,
  EventEmitter,
  TextDocumentContentProvider,
  Uri,
} from "vscode";
import { FileSystem } from "./fs";

export class GitDocumentContentProvider
  implements TextDocumentContentProvider, Disposable {
  private _onDidChange = new EventEmitter<Uri>();

  constructor(private readonly fs: FileSystem) {}

  dispose(): void {
    this._onDidChange.dispose();
  }

  async provideTextDocumentContent(
    uri: Uri,
    token: CancellationToken
  ): Promise<string> {
    if (token.isCancellationRequested) {
      return "Canceled";
    }

    console.log("* provideTextDocumentContent: ", uri.toString());
    const dir = "/Welcome/";
    const currentBranch = await git.currentBranch({
      fs: this.fs,
      dir,
    });
    console.log("** currentBranch: ", currentBranch);
    if (!currentBranch) {
      return "";
    }
    try {
      const commitOid = await git.resolveRef({
        fs: this.fs,
        dir,
        ref: currentBranch,
      });
      console.log("** commitOid: ", commitOid);
      const { blob } = await git.readBlob({
        fs: this.fs,
        dir,
        oid: commitOid,
        filepath: path.relative(dir, uri.path),
      });
      console.log("** readBlob: ", Buffer.from(blob).toString("utf8"));
    } catch (error) {
      console.error(error);
      return "";
    }
  }
}
