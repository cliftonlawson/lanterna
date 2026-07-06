import { Plus, X } from 'lucide-react';

type Props = {
  onClose: () => void;
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function NewGalleryModal({ onClose, onCreate }: Props) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={onCreate}>
        <button type="button" className="modal-close" onClick={onClose}><X size={18} /></button>
        <h2>New Gallery</h2>
        <p>Create the gallery before uploading so every file lands in the right client space.</p>
        <label>Gallery name<input name="name" autoFocus required placeholder="Client Wedding Film" /></label>
        <label>Client / couple<input name="client" placeholder="Client names" /></label>
        <label>Event date<input name="date" type="date" /></label>
        <label>Project type<select name="project"><option>Weddings</option><option>Engagements</option><option>Portraits</option></select></label>
        <label>Access<select name="access"><option>Private</option><option>Password</option><option>Public</option></select></label>
        <label>Password<input name="password" type="password" placeholder="Only needed for password access" /></label>
        <button className="primary" type="submit"><Plus size={17} /> Create gallery</button>
      </form>
    </div>
  );
}
