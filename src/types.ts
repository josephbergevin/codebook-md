import { NotebookCell } from "vscode";

export interface Cell {
    index: number;
    contents: string;
    cell: NotebookCell;
}

export enum CommentDecorator {
    clear = "codebook-md:clear",
    skip = "codebook-md:skip",
}
