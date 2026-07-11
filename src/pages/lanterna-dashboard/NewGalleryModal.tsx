import { Plus, X } from 'lucide-react';

type Props = {
  error: string;
  onClose: () => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
};

export function NewGalleryModal({ error, onClose, onCreate, submitting }: Props) {
  return (
    <div className="modal-backdrop">
      <form aria-busy={submitting} className="modal-card" onSubmit={onCreate}>
        <button type="button" className="modal-close" disabled={submitting} onClick={onClose}><X size={18} /></button>
        <h2>New Gallery</h2>
        <p>Create the gallery before uploading so every file lands in the right client space.</p>
        <label>Gallery name<input name="name" autoFocus required placeholder="Client Wedding Film" /></label>
        <label>Client / couple<input name="client" placeholder="Client names" /></label>
        <label>Event date<input name="date" type="date" /></label>
        <label>Project type<select name="project"><option>Weddings</option><option>Engagements</option><option>Portraits</option></select></label>
        <label>Access<select name="access"><option>Private</option><option>Password</option><option>Public</option></select></label>
        <label>Password<input name="password" type="password" placeholder="Only needed for password access" /></label>
        {error && <div className="modal-form-error" role="alert">{error}</div>}
        <button className="primary" disabled={submitting} type="submit"><Plus size={17} /> {submitting ? 'Creating gallery' : 'Create gallery'}</button>
      </form>
    </div>
  );
}
