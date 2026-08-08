'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormError, TextField, fieldClass } from '@sfsr/ui';
import { MAX_ANNOUNCEMENT_IMAGES, type AnnouncementImageInput } from '@/lib/announcements';
import { publishAnnouncement } from './actions';
import { ImageUpload } from './image-upload';

export interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Compose an announcement.
 *
 * Three inputs, in the order RBAC.xls names them: something to read, which
 * project it concerns, and the pictures. The project is optional because "Upload
 * announcement, project details" covers a company notice as well as a post
 * about Emerald Park, and forcing a project onto the first kind would file it
 * somewhere untrue.
 *
 * Validation runs here for ergonomics and AGAIN in `publishAnnouncement` with
 * the same zod schema. The second one is the control — this form is a
 * convenience that a crafted request simply skips (§3.3).
 *
 * Rendered inside `NewAnnouncementDialog`, which owns the shell. This owns
 * whether the post succeeded, so IT decides when the dialog closes: `onPosted`
 * fires only after the server accepted, keeping field errors and a half-typed
 * post on screen when it did not.
 */
export function AnnouncementForm({
  projects,
  onPosted,
  onCancel,
}: {
  projects: readonly ProjectOption[];
  onPosted: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [projectId, setProjectId] = useState('');
  const [images, setImages] = useState<AnnouncementImageInput[]>([]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await publishAnnouncement({ title, body, projectId, images });

      if (!result.ok) {
        // Field errors when there are any — "Please check the form" above three
        // marked fields says nothing the marks do not already say.
        setErrors(result.fieldErrors ?? { form: result.error });
        return;
      }

      // The list behind the dialog is a server component — refresh rather than
      // splicing a row in, so what is on screen is what was actually written.
      router.refresh();
      onPosted();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {errors.form ? <FormError>{errors.form}</FormError> : null}

      <TextField
        label="Title"
        name="title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        placeholder="Emerald Park Residences — new tower now selling"
        maxLength={120}
        autoComplete="off"
      />

      <div>
        <label htmlFor="body" className="block text-sm font-medium">
          Details
          <span className="ml-0.5 text-rose-500">*</span>
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined}
          placeholder="What is being announced, and what should a buyer do about it."
          className={`${fieldClass} mt-1.5 resize-y`}
        />
        {errors.body ? (
          <p className="mt-1 text-xs text-rose-600">{errors.body}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">{body.length} / 4000 characters</p>
        )}
      </div>

      <div>
        <label htmlFor="projectId" className="block text-sm font-medium">
          Project
        </label>
        <select
          id="projectId"
          name="projectId"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={`${fieldClass} mt-1.5`}
        >
          <option value="">No specific project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {errors.projectId ? (
          <p className="mt-1 text-xs text-rose-600">{errors.projectId}</p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            Optional. Leave this if the announcement is about the company rather than one building.
          </p>
        )}
      </div>

      <ImageUpload
        images={images}
        onChange={setImages}
        max={MAX_ANNOUNCEMENT_IMAGES}
        error={errors.images}
      />

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Posting…' : 'Post announcement'}
        </button>
      </div>
    </form>
  );
}
