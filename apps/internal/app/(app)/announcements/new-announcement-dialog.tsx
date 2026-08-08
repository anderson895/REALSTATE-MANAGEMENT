'use client';

import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Modal } from '@sfsr/ui';
import { AnnouncementForm, type ProjectOption } from './announcement-form';

/**
 * Post an announcement, in a dialog.
 *
 * Same reasoning as the add-employee dialog, and the same shell, because a form
 * that appears one way here and another way there teaches nobody anything. The
 * page's job is the list of what has been posted; composing is an occasional
 * act and should cost one button until it is wanted — this form is the taller
 * of the two, carrying a six-row textarea and an image grid.
 *
 * The dialog closes ITSELF on a successful post, which is why `Modal` is used
 * in controlled mode: the form is what knows whether the server accepted it,
 * and a dialog that closed on submit would throw away the field errors
 * explaining why it did not.
 */
export function NewAnnouncementDialog({ projects }: { projects: readonly ProjectOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      size="lg"
      title="New announcement"
      description="Project news and promotional material. Your name and the time are recorded on the post."
      trigger={
        <button
          type="button"
          className="flex shrink-0 items-center justify-center gap-2 rounded-md bg-navy-800 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
        >
          <Megaphone className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          New announcement
        </button>
      }
    >
      <AnnouncementForm
        projects={projects}
        onPosted={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </Modal>
  );
}
