import { supabase } from '@/lib/supabase';

export interface YouTubeTrack {
  videoId:      string;
  title:        string;
  channelTitle: string;
  thumbnail:    string | null;
}

export async function searchYouTubeTracks(query: string): Promise<YouTubeTrack[]> {
  if (!query.trim()) return [];
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('youtube-search', {
    body:    { query },
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (error) return [];
  return (data as { results?: YouTubeTrack[] })?.results ?? [];
}
