import { ArrowRight, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LanternLogo } from '../../components/LanternLogo';

type Props = {
  error: string;
  onClose: () => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
};

const projectOptions = ['Weddings', 'Engagements', 'Portraits'] as const;
const accessOptions = ['Public', 'Password', 'Private'] as const;

export function NewGalleryModal({ error, onClose, onCreate, submitting }: Props) {
  const [project, setProject] = useState<(typeof projectOptions)[number]>('Weddings');
  const [access, setAccess] = useState<(typeof accessOptions)[number]>('Private');
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  onCloseRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    const previouslyFocused = previouslyFocusedRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => !element.hasAttribute('hidden') && !element.closest('[inert]'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop new-gallery-backdrop">
      <form
        aria-busy={submitting}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-card new-gallery-modal"
        onSubmit={onCreate}
        ref={dialogRef}
        role="dialog"
      >
        <header className="new-gallery-header">
          <div className="new-gallery-heading">
            <LanternLogo size={28} />
            <div>
              <h2 id={titleId}>New gallery</h2>
              <p id={descriptionId}>Set up the client&apos;s gallery, then add films and photos.</p>
            </div>
          </div>
          <button aria-label="Close new gallery dialog" type="button" className="modal-close new-gallery-close" disabled={submitting} onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </header>

        <div className="new-gallery-body">
          <div className="new-gallery-field">
            <label htmlFor="new-gallery-name">Gallery name <span aria-hidden="true">*</span></label>
            <input id="new-gallery-name" name="name" autoFocus required placeholder="e.g. Andi & Romano" />
          </div>

          <div className="new-gallery-field-row">
            <div className="new-gallery-field">
              <label htmlFor="new-gallery-client">Client / couple</label>
              <input id="new-gallery-client" name="client" placeholder="Names" />
            </div>
            <div className="new-gallery-field">
              <label htmlFor="new-gallery-date">Event date</label>
              <input id="new-gallery-date" name="date" type="date" />
            </div>
          </div>

          <fieldset className="new-gallery-fieldset">
            <legend>Project type</legend>
            <input name="project" type="hidden" value={project} />
            <div className="new-gallery-project-options" role="group" aria-label="Project type">
              {projectOptions.map((option) => (
                <button
                  aria-pressed={project === option}
                  className={project === option ? 'is-selected' : ''}
                  disabled={submitting}
                  key={option}
                  onClick={() => setProject(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="new-gallery-fieldset new-gallery-access-fieldset">
            <legend>Access</legend>
            <input name="access" type="hidden" value={access} />
            <div className="segmented wide new-gallery-access-options" role="group" aria-label="Gallery access">
              {accessOptions.map((option) => (
                <button
                  aria-pressed={access === option}
                  className={access === option ? 'on' : ''}
                  disabled={submitting}
                  key={option}
                  onClick={() => setAccess(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            {access === 'Password' && (
              <div className="new-gallery-field new-gallery-password-field">
                <label htmlFor="new-gallery-password">Gallery password</label>
                <input autoComplete="new-password" id="new-gallery-password" name="password" placeholder="Set a gallery password" required type="password" />
              </div>
            )}
          </fieldset>

          {error && <div className="modal-form-error new-gallery-error" role="alert">{error}</div>}
        </div>

        <footer className="new-gallery-footer">
          <button className="secondary new-gallery-cancel" disabled={submitting} onClick={onClose} type="button">Cancel</button>
          <button className="primary new-gallery-submit" disabled={submitting} type="submit">
            {submitting ? 'Creating gallery' : 'Create & add media'} <ArrowRight aria-hidden="true" size={16} />
          </button>
        </footer>
      </form>
    </div>,
    document.querySelector('.lanterna-app') ?? document.body,
  );
}
