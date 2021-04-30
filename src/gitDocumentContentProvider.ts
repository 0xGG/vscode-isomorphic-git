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

  constructor(
    private readonly fs: FileSystem,
    private readonly nativeFSPrefix: string = "/nativefs-"
  ) {}

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
    const dir = uri.path.startsWith(this.nativeFSPrefix)
      ? uri.path.split("/").slice(0, 3).join("/") // nativefs
      : uri.path.split("/").slice(0, 2).join("/"); // memfs
    let currentBranch: string | void;
    try {
      currentBranch = await git.currentBranch({
        fs: this.fs,
        dir,
      });
    } catch (error) {}
    if (!currentBranch) {
      try {
        currentBranch = await git.resolveRef({
          fs: this.fs,
          dir: dir,
          ref: "HEAD",
        });
      } catch (error) {
        return "";
      }
    }
    try {
      const commitOid = await git.resolveRef({
        fs: this.fs,
        dir,
        ref: currentBranch,
      });
      const { blob } = await git.readBlob({
        fs: this.fs,
        dir,
        oid: commitOid,
        filepath: path.relative(dir, uri.path),
      });
      return Buffer.from(blob).toString("utf8");
    } catch (error) {
      return "";
    }
  }
}
