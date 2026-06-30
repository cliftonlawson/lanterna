import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, MoreHorizontal, Play, Trash2, Eye, Download, X, ChevronLeft, ChevronRight, Film, Upload } from 'lucide-react';
import { supabase, Gallery, Video } from '../lib/supabase';

type Props = {
  gallery: Gallery;
  onBack: () => void;
};

function posterUrl() {
  return null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

function VideoModal({
  video,
  allVideos,
  onClose,
  onNavigate,
  onDelete,
  onUpdate,
}: {
  video: Video;
  allVideos: Video[];
  onClose: () => void;
  onNavigate: (v: Video) => void;
  onDelete: (id: string) => void;
  onUpdate: (v: Video) => void;
}) {
  const idx = allVideos.findIndex((v) => v.id === video.id);
  const canPrev = idx > 0;
  const canNext = idx < allVideos.length - 1;
  const [editTitle, setEditTitle] = useState(video.title);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editTitle.trim() === video.title) return;
    setSaving(true);
    const { data } = await supabase
      .from('videos')
      .update({ title: editTitle.trim() })
      .eq('id', video.id)
      .select()
      .single();
    if (data) onUpdate(data as Video);
    setSaving(false);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && canPrev) onNavigate(allVideos[idx - 1]);
      if (e.key === 'ArrowRight' && canNext) onNavigate(allVideos[idx + 1]);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canPrev, canNext, idx, allVideos, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md">
      {/* Top nav */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => canPrev && onNavigate(allVideos[idx - 1])}
            disabled={!canPrev}
            className="p-2 rounded-lg text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06] transition-all"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-gray-500">
            {idx + 1} of {allVideos.length} videos
          </span>
          <button
            onClick={() => canNext && onNavigate(allVideos[idx + 1])}
            disabled={!canNext}
            className="p-2 rounded-lg text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06] transition-all"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all text-sm"
        >
          <X size={14} />
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex flex-col p-6 overflow-auto">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white mb-1">{video.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{formatDate(video.created_at)}</span>
              {video.r2_bytes > 0 && <span>{formatSize(video.r2_bytes)}</span>}
              <span className="flex items-center gap-1.5"><Eye size={13} /> 0 views</span>
              <span className="flex items-center gap-1.5"><Download size={13} /> 0 downloads</span>
            </div>
          </div>

          {/* Player */}
          <div className="relative rounded-xl overflow-hidden bg-[#0d0c0b] border border-white/[0.06] flex-1 min-h-0">
            {posterUrl() ? (
              <div className="relative w-full h-full min-h-[240px]">
                <img
                  src={posterUrl() ?? ''}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="w-16 h-16 bg-orange-500/90 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.6)] hover:bg-orange-400 cursor-pointer transition-all hover:scale-105">
                    <Play size={24} fill="white" className="text-white ml-1" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full min-h-[240px] flex items-center justify-center">
                <div className="text-center">
                  <Film size={40} className="text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">No preview available</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm text-gray-300 border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04] transition-all">
                Share
              </button>
              <button className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm text-gray-300 border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04] transition-all">
                <Download size={14} />
                Download
              </button>
            </div>
            <button
              onClick={() => { onDelete(video.id); onClose(); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm text-red-400 border border-red-500/20 hover:bg-red-500/[0.08] transition-all"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-72 border-l border-white/[0.06] flex flex-col overflow-auto bg-[#0d0c0b] flex-shrink-0">
          <div className="p-5 border-b border-white/[0.06]">
            <div className="flex gap-4 mb-4">
              <button className="text-sm font-medium text-orange-400 border-b border-orange-400 pb-1">General</button>
            </div>

            <label className="block text-xs text-gray-500 mb-1.5">Video title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/40 transition-all mb-2"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600">{editTitle.length}/80</span>
              <button
                onClick={handleSave}
                disabled={saving || editTitle.trim() === video.title}
                className="text-xs bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-all"
              >
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>

          <div className="p-5">
            <label className="block text-xs text-gray-500 mb-2.5">Thumbnail</label>
            {posterUrl() ? (
              <div className="relative rounded-lg overflow-hidden border border-white/[0.08]">
                <img src={posterUrl() ?? ''} alt="" className="w-full aspect-video object-cover" />
              </div>
            ) : (
              <div className="aspect-video bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center justify-center">
                <p className="text-xs text-gray-700">No thumbnail</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddVideoModal({
  galleryId,
  onClose,
  onAdded,
}: {
  galleryId: string;
  onClose: () => void;
  onAdded: (v: Video) => void;
}) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('videos')
      .insert({
        gallery_id: galleryId,
        title: title.trim(),
        r2_bytes: Math.floor(Math.random() * 800 + 100) * 1024 * 1024,
        processing_status: 'ready',
      })
      .select()
      .single();

    if (!error && data) {
      onAdded(data as Video);
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#131211] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Add video</h2>
        <p className="text-sm text-gray-500 mb-5">Add a new video to this gallery.</p>

        <div className="border-2 border-dashed border-white/[0.08] rounded-xl p-8 text-center mb-5 hover:border-orange-500/25 transition-colors cursor-pointer">
          <Upload size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-1">Drag and drop video files</p>
          <p className="text-xs text-gray-700">or enter a title below to add a placeholder</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Video title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. Ceremony Highlight Reel"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500/50 transition-all"
          />
        </div>

        <div className="flex gap-2.5 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!title.trim() || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 text-white transition-all"
          >
            {loading ? 'Adding...' : 'Add video'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VideoCard({
  video,
  onOpen,
  onDelete,
}: {
  video: Video;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="group relative rounded-xl overflow-hidden border border-white/[0.07] hover:border-orange-500/25 bg-white/[0.02] cursor-pointer transition-all duration-300"
      onClick={onOpen}
    >
      <div className="relative aspect-video bg-[#111010] overflow-hidden">
        {posterUrl() ? (
          <img
            src={posterUrl() ?? ''}
            alt={video.title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film size={24} className="text-gray-700" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="w-12 h-12 bg-orange-500/90 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.6)] transform scale-90 group-hover:scale-100 transition-transform">
            <Play size={16} fill="white" className="text-white ml-0.5" />
          </div>
        </div>

        {/* Date badge */}
        <div className="absolute bottom-2 left-2 bg-black/70 text-[10px] text-gray-300 px-2 py-1 rounded-md backdrop-blur-sm">
          {formatDate(video.created_at)}
        </div>
      </div>

      <div className="p-3.5 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-200 truncate">{video.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/[0.06] transition-all flex-shrink-0 ml-2"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div className="absolute bottom-12 right-3 z-20 bg-[#1a1815] border border-white/[0.1] rounded-xl shadow-xl py-1 min-w-[130px]">
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/[0.05] transition-colors"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function GalleryView({ gallery, onBack }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [showAddVideo, setShowAddVideo] = useState(false);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('gallery_id', gallery.id)
      .order('created_at', { ascending: false });
    if (data) setVideos(data as Video[]);
    setLoading(false);
  }, [gallery.id]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const handleDelete = async (id: string) => {
    await supabase.from('videos').delete().eq('id', id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  };

  const handleUpdate = (updated: Video) => {
    setVideos((prev) => prev.map((v) => v.id === updated.id ? updated : v));
    setSelectedVideo(updated);
  };

  return (
    <div className="min-h-full bg-[#080808] text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-orange-500/[0.05] rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#090808]">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </button>
          <div className="w-px h-4 bg-white/[0.1]" />
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 bg-orange-500/20 border border-orange-500/30 rounded-md flex items-center justify-center">
              <Film size={10} className="text-orange-400" />
            </div>
            <span className="text-sm font-medium text-gray-200">Videos</span>
            <span className="text-gray-600 text-sm">/</span>
            <span className="text-sm text-gray-300">{gallery.name}</span>
          </div>
        </div>

        <button
          onClick={() => setShowAddVideo(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(249,115,22,0.4)]"
        >
          <Upload size={14} />
          Add Video
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-white/[0.06] animate-pulse">
                <div className="aspect-video bg-white/[0.04]" />
                <div className="p-3.5">
                  <div className="h-3 bg-white/[0.06] rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex items-center justify-center mb-4">
              <Film size={24} className="text-gray-600" />
            </div>
            <h3 className="text-gray-400 font-medium mb-1">No videos yet</h3>
            <p className="text-sm text-gray-600 mb-5">Add your first video to start building this gallery.</p>
            <button
              onClick={() => setShowAddVideo(true)}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all"
            >
              <Plus size={15} />
              Add video
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-600">
                {videos.length} {videos.length === 1 ? 'video' : 'videos'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onOpen={() => setSelectedVideo(video)}
                  onDelete={() => handleDelete(video.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {selectedVideo && (
        <VideoModal
          video={selectedVideo}
          allVideos={videos}
          onClose={() => setSelectedVideo(null)}
          onNavigate={setSelectedVideo}
          onDelete={(id) => { handleDelete(id); setSelectedVideo(null); }}
          onUpdate={handleUpdate}
        />
      )}

      {showAddVideo && (
        <AddVideoModal
          galleryId={gallery.id}
          onClose={() => setShowAddVideo(false)}
          onAdded={(v) => setVideos((prev) => [v, ...prev])}
        />
      )}
    </div>
  );
}
