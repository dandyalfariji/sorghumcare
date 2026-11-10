import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Reply, Trash2, Send, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import {
  RecipeComment,
  fetchComments,
  postComment,
  deleteComment,
  fetchLikesForComments,
  toggleCommentLike,
  resolveRecipeId,
} from '../../lib/supabase';

interface CommentSectionProps {
  recipeId: string;
  recipeSlug?: string;
  isGoogleUser?: boolean;
  displayName?: string;
  avatarUrl?: string | null;
  /** Dipanggil setiap jumlah komentar berubah (load/tambah/hapus). */
  onCountChange?: (count: number) => void;
}

// Build a tree from flat list
interface CommentNode extends RecipeComment {
  children: CommentNode[];
}

function buildTree(flat: RecipeComment[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];
  for (const c of flat) {
    map.set(c.id, { ...c, children: [] });
  }
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}h lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function getAvatar(c: RecipeComment): string {
  if (c.avatar_url) return c.avatar_url;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.display_name)}&backgroundColor=cbebc3&textColor=163422`;
}

/** True hanya untuk uuid asli — kolom recipe_comments.recipe_id bertipe uuid,
 *  jadi mengirim slug/source_id ke sana selalu ditolak PostgREST (22P02). */
function isUuidLike(value: string | null | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/* ---- Single comment row ---- */
const CommentItem: React.FC<{
  node: CommentNode;
  depth: number;
  currentUserId: string | null;
  onReply: (parentId: string) => void;
  onDelete: (id: string) => void;
  likeCounts: Record<string, number>;
  likedByUser: Set<string>;
  onToggleLike: (commentId: string) => void;
}> = ({ node, depth, currentUserId, onReply, onDelete, likeCounts, likedByUser, onToggleLike }) => {
  const [showReplies, setShowReplies] = useState(depth < 2);
  const isOwn = currentUserId === node.user_id;
  const maxDepth = 4;

  return (
    <div className={depth > 0 ? 'ml-4 sm:ml-8 mt-2' : 'mt-3'}>
      <div className="flex gap-2.5 items-start">
        <img
          src={getAvatar(node)}
          alt={node.display_name}
          className="w-8 h-8 rounded-full flex-shrink-0 bg-[#e8eae6] border border-[#c2c8c0]/40"
          referrerPolicy="no-referrer"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#163422] truncate">{node.display_name}</span>
            <span className="text-[10px] text-[#727972]">{timeAgo(node.created_at)}</span>
            {isOwn && (
              <span className="text-[9px] bg-[#cbebc3] text-[#324d30] px-1.5 py-0.5 rounded-full font-bold">Kamu</span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-[#1a1c1b] mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{node.content}</p>
          <div className="flex items-center gap-3 mt-1">
            {/* Like button */}
            <button
              onClick={() => onToggleLike(node.id)}
              className={`flex items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer ${
                likedByUser.has(node.id)
                  ? 'text-[#ba1a1a]'
                  : 'text-[#727972] hover:text-[#ba1a1a]'
              }`}
              title={likedByUser.has(node.id) ? 'Batal suka' : 'Suka'}
            >
              <Heart
                className="w-3 h-3"
                fill={likedByUser.has(node.id) ? 'currentColor' : 'none'}
                strokeWidth={likedByUser.has(node.id) ? 0 : 2}
              />
              {(likeCounts[node.id] || 0) > 0 && <span>{likeCounts[node.id]}</span>}
            </button>
            {depth < maxDepth && (
              <button
                onClick={() => onReply(node.id)}
                className="flex items-center gap-1 text-[10px] font-bold text-[#727972] hover:text-[#163422] transition-colors cursor-pointer"
              >
                <Reply className="w-3 h-3" /> Balas
              </button>
            )}
            {isOwn && (
              <button
                onClick={() => onDelete(node.id)}
                className="flex items-center gap-1 text-[10px] font-bold text-[#ba1a1a]/60 hover:text-[#ba1a1a] transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Hapus
              </button>
            )}
          </div>

          {/* Nested replies toggle */}
          {node.children.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 text-[10px] font-bold text-[#163422] hover:text-[#2d4b37] cursor-pointer"
              >
                {showReplies ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {node.children.length} balasan
              </button>
              {showReplies && node.children.map((child) => (
                <CommentItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  currentUserId={currentUserId}
                  onReply={onReply}
                  onDelete={onDelete}
                  likeCounts={likeCounts}
                  likedByUser={likedByUser}
                  onToggleLike={onToggleLike}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---- Main section ---- */
export const CommentSection: React.FC<CommentSectionProps> = ({
  recipeId,
  recipeSlug,
  isGoogleUser = false,
  displayName = 'Guest',
  avatarUrl,
  onCountChange,
}) => {
  const [comments, setComments] = useState<RecipeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [resolvedId, setResolvedId] = useState<string>(recipeId);
  // Like state
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likedByUser, setLikedByUser] = useState<Set<string>>(new Set());

  useEffect(() => {
    const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipeId);
    if (looksLikeUuid) {
      setResolvedId(recipeId);
      return;
    }
    // Resolusi lewat helper bersama `resolveRecipeId` yang memetakan
    // slug/source_id -> uuid. Versi lama di sini mencari `.eq('slug', recipeSlug)`
    // saja; untuk resep bawaan (source_id seperti `nasi-goreng-sorgum-sd`) slug
    // tidak cocok, sehingga `resolvedId` tetap berisi source_id dan setiap muat
    // halaman detail mengirim GET recipe_comments dengan nilai non-uuid -> 400
    // (PostgREST 22P02).
    let alive = true;
    resolveRecipeId(recipeId)
      .then((id) => {
        if (!alive) return;
        setResolvedId(id ?? recipeId);
      })
      .catch(() => {
        if (alive) setResolvedId(recipeId);
      });
    return () => {
      alive = false;
    };
  }, [recipeId, recipeSlug]);

  const loadComments = useCallback(async () => {
    // Jangan panggil API selama id masih berupa source_id/slug — kolom
    // recipe_comments.recipe_id bertipe uuid, jadi request itu pasti 400.
    // Cukup tunggu sampai `resolveRecipeId` selesai (ia setidaknya
    // mengembalikan nilai awal, tidak akan menggantung).
    if (!isUuidLike(resolvedId)) {
      return;
    }
    const data = await fetchComments(resolvedId);
    setComments(data);
    setLoading(false);

    // Load likes for all comments
    const ids = data.map((c) => c.id);
    if (ids.length > 0) {
      const userId = currentUserId;
      const likes = await fetchLikesForComments(ids, userId);
      setLikeCounts(likes.counts);
      setLikedByUser(likes.likedByUser);
    }
  }, [resolvedId, currentUserId]);

  useEffect(() => {
    // Get current user id first, then load comments (so likes know who the user is)
    import('../../lib/supabase').then((m) => {
      m.getUserIdAsync().then((uid) => {
        setCurrentUserId(uid);
      });
    });
  }, []);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Laporkan jumlah ke parent (badge di halaman detail) setiap berubah
  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const handleToggleLike = async (commentId: string) => {
    if (!currentUserId) return;
    // Optimistic update
    const wasLiked = likedByUser.has(commentId);
    const prevCount = likeCounts[commentId] || 0;
    setLikedByUser((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [commentId]: wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1,
    }));

    const result = await toggleCommentLike(commentId);
    if (result) {
      // Sync with server truth
      setLikeCounts((prev) => ({ ...prev, [commentId]: result.count }));
      setLikedByUser((prev) => {
        const next = new Set(prev);
        if (result.liked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    const result = await postComment(
      resolvedId,
      text,
      isGoogleUser ? displayName : 'Guest',
      isGoogleUser ? avatarUrl : null,
      replyTo,
    );
    if (result) {
      setComments((prev) => [...prev, result]);
      setInputText('');
      setReplyTo(null);
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteComment(id);
    if (ok) {
      loadComments();
    }
  };

  const tree = buildTree(comments);
  const totalCount = comments.length;
  const replyTarget = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <section className="bg-white rounded-2xl p-4 sm:p-5 shadow-[0px_4px_12px_rgba(45,75,55,0.08)] border border-[rgba(45,75,55,0.1)]">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-[#163422]" />
          <h3 className="text-base sm:text-lg font-bold text-[#1a1c1b]">Komentar</h3>
          {totalCount > 0 && (
            <span className="bg-[#cbebc3] text-[#324d30] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-[#424843]" /> : <ChevronDown className="w-4 h-4 text-[#424843]" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {/* Comment list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-2.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-[#e8eae6]" />
                  <div className="flex-1 space-y-1.5">
                    <div className="w-24 h-3 bg-[#e8eae6] rounded" />
                    <div className="w-full h-3 bg-[#f4f4f2] rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : tree.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-[#727972]">Belum ada komentar. Jadilah yang pertama!</p>
            </div>
          ) : (
            <div>
              {tree.map((node) => (
                <CommentItem
                  key={node.id}
                  node={node}
                  depth={0}
                  currentUserId={currentUserId}
                  onReply={(parentId) => {
                    setReplyTo(parentId);
                    const input = document.getElementById('comment-input');
                    if (input) input.focus();
                  }}
                  onDelete={handleDelete}
                  likeCounts={likeCounts}
                  likedByUser={likedByUser}
                  onToggleLike={handleToggleLike}
                />
              ))}
            </div>
          )}

          {/* Reply indicator */}
          {replyTo && replyTarget && (
            <div className="flex items-center justify-between bg-[#f4f4f2] px-3 py-1.5 rounded-lg text-[10px] border border-[#e2e3e1]">
              <span className="text-[#424843]">
                Membalas <strong className="text-[#163422]">{replyTarget.display_name}</strong>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-[#ba1a1a] font-bold cursor-pointer hover:underline"
              >
                Batal
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex gap-2 items-end pt-2 border-t border-[#e2e3e1]">
            <img
              src={isGoogleUser && avatarUrl ? avatarUrl : `https://api.dicebear.com/7.x/initials/svg?seed=Guest&backgroundColor=e2e3e1&textColor=424843`}
              alt="You"
              className="w-8 h-8 rounded-full flex-shrink-0 bg-[#e8eae6] border border-[#c2c8c0]/40"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 relative">
              <input
                id="comment-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }}}
                placeholder={replyTo ? 'Tulis balasan...' : 'Tulis komentar...'}
                className="w-full px-3 py-2 pr-10 text-xs sm:text-sm border border-[#c2c8c0] rounded-xl focus:outline-none focus:border-[#163422] bg-[#f9f9f7]"
                disabled={sending}
              />
              <button
                onClick={handleSubmit}
                disabled={!inputText.trim() || sending}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-[#163422] hover:bg-[#cbebc3] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
