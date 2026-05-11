"use client";

import { NotesPanel, type NoteItem } from "./NotesPanel";
import {
  createWorkspaceNoteAction,
  updateWorkspaceNoteAction,
  deleteWorkspaceNoteAction,
  convertWorkspaceNoteToTaskAction,
} from "@/actions/notes";
import type { NotePriority } from "@prisma/client";

type WorkspaceEntry = { id: string; name: string; projects: { id: string; name: string }[] };

interface Props {
  workspaceId: string;
  notes: NoteItem[];
  canEdit: boolean;
  allWorkspaces: WorkspaceEntry[];
}

export function WorkspaceNotesPanel({ workspaceId, notes, canEdit, allWorkspaces }: Props) {
  return (
    <NotesPanel
      notes={notes}
      canEdit={canEdit}
      allWorkspaces={allWorkspaces}
      onCreateNote={(title: string, priority: NotePriority) =>
        createWorkspaceNoteAction(workspaceId, title, priority)
      }
      onUpdateNote={(id: string, data) =>
        updateWorkspaceNoteAction(workspaceId, id, data)
      }
      onDeleteNote={(id: string) =>
        deleteWorkspaceNoteAction(workspaceId, id)
      }
      onConvertToTask={(noteId: string, projectId: string) =>
        convertWorkspaceNoteToTaskAction(workspaceId, noteId, projectId)
      }
    />
  );
}
