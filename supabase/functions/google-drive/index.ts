// ═══════════════════════════════════════════════════════════════════════════
// google-drive — Manage Google Drive files for teachers
//
// Actions:
//   upload_text      → create a Drive file from text/HTML content
//   upload_report    → upload a student progress report (HTML → stored as Google Doc)
//   list_files       → list Edora-created Drive files for this teacher
//   delete_file      → delete a Drive file
//   get_share_link   → get the shareable link for a file
//
// Uses drive.file scope — only accesses files created by this app.
// Secrets: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
//          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════════════════

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCors }      from '../_shared/cors.ts';
import { getValidAccessToken } from '../_shared/classroom-tokens.ts';

import { withSentry } from '../_shared/sentry.ts';
const DRIVE_API    = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

// ── Fetch with timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Ensure the Edora folder exists in the teacher's Drive ────────────────────
async function ensureEdoraFolder(token: string): Promise<string> {
  // Search for existing folder
  const searchRes = await fetchWithTimeout(
    `${DRIVE_API}/files?q=${encodeURIComponent("name='Edora Reports' and mimeType='application/vnd.google-apps.folder' and trashed=false")}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json() as { files?: Array<{ id: string }> };
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create the folder
  const createRes = await fetchWithTimeout(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      name:     'Edora Reports',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  const folder = await createRes.json() as { id: string };
  return folder.id;
}

// ── Multipart upload helper ───────────────────────────────────────────────────
async function uploadFile(
  token:    string,
  folderId: string,
  name:     string,
  mimeType: string,
  content:  string,
): Promise<{ id: string; webViewLink: string; webContentLink?: string; size?: string } | null> {
  const contentBytes = new TextEncoder().encode(content);
  const boundary = '---EdoraBoundary';

  const metadata = JSON.stringify({ name, mimeType, parents: [folderId] });
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const contentPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const metaBytes    = new TextEncoder().encode(metaPart);
  const contentStart = new TextEncoder().encode(contentPart);
  const closingBytes = new TextEncoder().encode(closing);

  const body = new Uint8Array(metaBytes.length + contentStart.length + contentBytes.length + closingBytes.length);
  body.set(metaBytes, 0);
  body.set(contentStart, metaBytes.length);
  body.set(contentBytes, metaBytes.length + contentStart.length);
  body.set(closingBytes, metaBytes.length + contentStart.length + contentBytes.length);

  const res = await fetchWithTimeout(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,webViewLink,webContentLink,size`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    60_000, // uploads can take longer for large reports
  );

  if (!res.ok) return null;
  return await res.json() as { id: string; webViewLink: string; webContentLink?: string; size?: string };
}

serve(withSentry('google-drive', async (req) => {
  const CORS = getCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const serviceDb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: authErr } = await userDb.auth.getUser();
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const body   = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ── upload_report — upload a student/class progress report ───────────────
  if (action === 'upload_report') {
    const {
      file_name, content, assignment_id,
      mime_type = 'text/html',
    } = body as {
      file_name:    string;
      content:      string;
      assignment_id?: string;
      mime_type?:   string;
    };

    if (!file_name || !content) {
      return json({ error: 'file_name and content required' }, 400);
    }

    const authConn = await getValidAccessToken(user.id, serviceDb);
    const token = authConn?.token;
    if (!token) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const folderId = await ensureEdoraFolder(token);
    const file     = await uploadFile(token, folderId, file_name, mime_type, content);

    if (!file) return json({ error: 'Drive upload failed' }, 500);

    // Make the file viewable by anyone with the link
    await fetchWithTimeout(`${DRIVE_API}/files/${file.id}/permissions`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    // Fetch updated file with share link
    const fileRes = await fetchWithTimeout(
      `${DRIVE_API}/files/${file.id}?fields=id,webViewLink,webContentLink,size`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const fileData = await fileRes.json() as {
      id: string; webViewLink: string; webContentLink?: string; size?: string;
    };

    await serviceDb.from('google_drive_files').insert({
      teacher_id:       user.id,
      assignment_id:    assignment_id ?? null,
      drive_file_id:    fileData.id,
      drive_file_name:  file_name,
      web_view_link:    fileData.webViewLink,
      web_content_link: fileData.webContentLink ?? null,
      mime_type,
      file_size_bytes:  fileData.size ? parseInt(fileData.size, 10) : null,
    });

    return json({
      ok:               true,
      file_id:          fileData.id,
      web_view_link:    fileData.webViewLink,
      web_content_link: fileData.webContentLink ?? null,
    });
  }

  // ── upload_text — generic text/HTML file upload ───────────────────────────
  if (action === 'upload_text') {
    const { file_name, content, assignment_id } = body as {
      file_name: string; content: string; assignment_id?: string;
    };

    if (!file_name || !content) {
      return json({ error: 'file_name and content required' }, 400);
    }

    const authConn = await getValidAccessToken(user.id, serviceDb);
    const token = authConn?.token;
    if (!token) return json({ error: 'Not connected to Google. Please reconnect.' }, 400);

    const folderId = await ensureEdoraFolder(token);
    const file     = await uploadFile(token, folderId, file_name, 'text/plain', content);

    if (!file) return json({ error: 'Drive upload failed' }, 500);

    await serviceDb.from('google_drive_files').insert({
      teacher_id:      user.id,
      assignment_id:   assignment_id ?? null,
      drive_file_id:   file.id,
      drive_file_name: file_name,
      web_view_link:   file.webViewLink,
      mime_type:       'text/plain',
    });

    return json({ ok: true, file_id: file.id, web_view_link: file.webViewLink });
  }

  // ── list_files ────────────────────────────────────────────────────────────
  if (action === 'list_files') {
    const { assignment_id, limit = 50 } = body as { assignment_id?: string; limit?: number };

    let query = serviceDb
      .from('google_drive_files')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200));

    if (assignment_id) query = query.eq('assignment_id', assignment_id);

    const { data: files } = await query;
    return json({ files: files ?? [] });
  }

  // ── delete_file ───────────────────────────────────────────────────────────
  if (action === 'delete_file') {
    const { file_id } = body as { file_id: string };
    if (!file_id) return json({ error: 'file_id required' }, 400);

    const { data: file } = await serviceDb
      .from('google_drive_files')
      .select('drive_file_id')
      .eq('id', file_id)
      .eq('teacher_id', user.id)
      .single();

    if (!file) return json({ error: 'File not found' }, 404);

    const authConn = await getValidAccessToken(user.id, serviceDb);
    if (authConn?.token) {
      await fetchWithTimeout(`${DRIVE_API}/files/${file.drive_file_id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${authConn.token}` },
      });
    }

    await serviceDb.from('google_drive_files').delete().eq('id', file_id);
    return json({ ok: true });
  }

  // ── get_share_link ────────────────────────────────────────────────────────
  if (action === 'get_share_link') {
    const { file_id } = body as { file_id: string };
    if (!file_id) return json({ error: 'file_id required' }, 400);

    const { data: file } = await serviceDb
      .from('google_drive_files')
      .select('web_view_link, drive_file_name')
      .eq('id', file_id)
      .eq('teacher_id', user.id)
      .single();

    if (!file) return json({ error: 'File not found' }, 404);
    return json({ web_view_link: file.web_view_link, name: file.drive_file_name });
  }

  return json({
    error: 'Unknown action. Use: upload_report | upload_text | list_files | delete_file | get_share_link',
  }, 400);
}));
