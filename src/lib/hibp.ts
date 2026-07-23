// Free alternative to Supabase Pro's built-in leaked-password protection.
// Uses the HaveIBeenPwned Pwned Passwords k-anonymity API: only the first 5
// hex chars of the SHA-1 hash are sent, so the real password never leaves
// the device. No API key, no cost. https://haveibeenpwned.com/API/v3#PwnedPasswords

async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** Returns true if the password appears in a known breach corpus. */
export async function isPasswordPwned(password: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) return false; // fail open — don't block signup on an API hiccup

    const body = await res.text();
    return body
      .split('\n')
      .some(line => line.split(':')[0].trim().toUpperCase() === suffix);
  } catch {
    return false; // network failure — fail open, don't block signup
  }
}
