"use client";

import { NotesPanel, type NoteItem } from "./NotesPanel";
import {
  createPersonalNoteAction,
  updatePersonalNoteAction,
  deletePersonalNoteAction,
  convertPersonalNoteToTaskAction,
} from "@/actions/notes";
import type { NotePriority } from "@prisma/client";

type WorkspaceEntry = { id: string; name: string; projects: { id: string; name: string }[] };

interface Props {
  notes: NoteItem[];
  allWorkspaces: WorkspaceEntry[];
}

export function PersonalNotesPanel({ notes, allWorkspaces }: Props) {
  return (
    <NotesPanel
      notes={notes}
      canEdit
      allWorkspaces={allWorkspaces}
      onCreateNote={(title: string, priority: NotePriority) =>
        createPersonalNoteAction(title, priority)
      }
      onUpdateNote={(id: string, data) =>
        updatePersonalNoteAction(id, data)
      }
      onDeleteNote={(id: string) =>
        deletePersonalNoteAction(id)
      }
      onConvertToTask={(noteId: string, projectId: string) =>
        convertPersonalNoteToTaskAction(noteId, projectId)
      }
    />
  );
}
