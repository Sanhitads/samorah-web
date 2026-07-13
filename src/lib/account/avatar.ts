/**
 * Avatar abstraction (review point 7). Consumers call resolveAvatar() and never care
 * where the image lives. Today it prefers a cached (re-hosted) URL, else the provider
 * URL (Google). A future job can populate avatar_cached_url (e.g. Cloudinary) with NO
 * schema or consumer change — the provider URL stays as the fallback.
 */
export interface AvatarSource { avatarUrl?: string | null; avatarCachedUrl?: string | null }

export function resolveAvatar(s: AvatarSource): string | null {
  return s.avatarCachedUrl || s.avatarUrl || null;
}
