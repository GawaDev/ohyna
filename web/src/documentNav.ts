/**
 * ドキュメント CRUD の遷移先（未保存確認のあとで実行する）。
 */
import type { TextFileHandle } from "./fileIo";
import type { UnsavedChangesAction } from "./UnsavedChangesModal";

export type OpenedDocument = {
  text: string;
  name: string;
  handle: TextFileHandle | null;
};

export type DocumentNav =
  | { type: "new"; template: "empty" | "sample" }
  | { type: "close" }
  | { type: "open"; document: OpenedDocument };

export function navToUnsavedAction(nav: DocumentNav): UnsavedChangesAction {
  switch (nav.type) {
    case "new":
      return nav.template === "sample" ? "new-sample" : "new-empty";
    case "close":
      return "close";
    case "open":
      return "open";
  }
}
