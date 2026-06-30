import { Gallery } from '../lib/supabase';
import { ClaudeDashboard } from './ClaudeDashboard';

type Props = {
  onOpenGallery: (gallery: Gallery) => void;
};

export function Dashboard({ onOpenGallery }: Props) {
  void onOpenGallery;
  return <ClaudeDashboard />;
}
