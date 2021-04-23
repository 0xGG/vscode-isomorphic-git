import {
  CancellationToken,
  Disposable,
  EventEmitter,
  ProviderResult,
  TextDocumentContentProvider,
  Uri,
} from "vscode";

export class GitDocumentContentProvider
  implements TextDocumentContentProvider, Disposable {
  private _onDidChange = new EventEmitter<Uri>();

  dispose(): void {
    this._onDidChange.dispose();
  }

  provideTextDocumentContent(
    uri: Uri,
    token: CancellationToken
  ): ProviderResult<string> {
    if (token.isCancellationRequested) {
      return "Canceled";
    }
    return "Not implemented";
  }
}
