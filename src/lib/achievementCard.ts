// ─────────────────────────────────────────────────────────────────────────────
// achievementCard — renders a shareable Instagram-Story-sized milestone card
// using the native Canvas API (no html2canvas dependency needed)
// ─────────────────────────────────────────────────────────────────────────────

const CARD_W = 1080;
const CARD_H = 1920;

export interface AchievementCardData {
  type:       'streak' | 'level' | 'mock_score' | 'battle_won' | 'rank';
  headline:   string;          // "30 Day Streak!" / "Level 10 Reached!"
  subtitle:   string;          // "JEE Main 2026 prep" / "Top 1% this week"
  value:      string;          // "30" / "10" / "280/300"
  userName:   string;
  avatarUrl?: string | null;
}

function gradientFor(type: AchievementCardData['type']): [string, string] {
  switch (type) {
    case 'streak':     return ['#F59E0B', '#EF4444'];
    case 'level':      return ['#5B6AF5', '#8B5CF6'];
    case 'mock_score': return ['#10B981', '#059669'];
    case 'battle_won': return ['#EC4899', '#8B5CF6'];
    case 'rank':       return ['#3B82F6', '#06B6D4'];
    default:            return ['#5B6AF5', '#8B5CF6'];
  }
}

function emojiFor(type: AchievementCardData['type']): string {
  switch (type) {
    case 'streak':     return '🔥';
    case 'level':      return '⚡';
    case 'mock_score': return '🎯';
    case 'battle_won': return '⚔️';
    case 'rank':       return '👑';
    default:            return '🎉';
  }
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderAchievementCard(data: AchievementCardData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  const [c1, c2] = gradientFor(data.type);

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#05060F');
  bg.addColorStop(0.5, c1 + '22');
  bg.addColorStop(1, '#05060F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Decorative glow circles
  ctx.globalAlpha = 0.25;
  const glow1 = ctx.createRadialGradient(CARD_W * 0.2, CARD_H * 0.2, 0, CARD_W * 0.2, CARD_H * 0.2, 400);
  glow1.addColorStop(0, c1); glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow2 = ctx.createRadialGradient(CARD_W * 0.85, CARD_H * 0.7, 0, CARD_W * 0.85, CARD_H * 0.7, 450);
  glow2.addColorStop(0, c2); glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.globalAlpha = 1;

  // Edora logo (top)
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '700 48px -apple-system, sans-serif';
  ctx.fillText('⚡ Edora', CARD_W / 2, 160);

  // Big emoji
  ctx.font = '200px -apple-system, sans-serif';
  ctx.fillText(emojiFor(data.type), CARD_W / 2, 560);

  // Value (huge number)
  const valGrad = ctx.createLinearGradient(CARD_W * 0.15, 0, CARD_W * 0.85, 0);
  valGrad.addColorStop(0, c1); valGrad.addColorStop(1, c2);
  ctx.fillStyle = valGrad;
  ctx.font = '900 220px -apple-system, sans-serif';
  ctx.fillText(data.value, CARD_W / 2, 880);

  // Headline
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 70px -apple-system, sans-serif';
  wrapText(ctx, data.headline, CARD_W / 2, 980, CARD_W - 160, 80);

  // Subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 42px -apple-system, sans-serif';
  ctx.fillText(data.subtitle, CARD_W / 2, 1100);

  // Avatar + username card
  const cardY = 1280;
  roundedRect(ctx, CARD_W / 2 - 280, cardY, 560, 140, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();

  const avatarSize = 90;
  const avatarX = CARD_W / 2 - 230;
  const avatarY = cardY + 25;

  if (data.avatarUrl) {
    const img = await loadImage(data.avatarUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    }
  } else {
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    const avGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    avGrad.addColorStop(0, c1); avGrad.addColorStop(1, c2);
    ctx.fillStyle = avGrad;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 40px -apple-system, sans-serif';
    ctx.fillText(data.userName.slice(0, 1).toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 14);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = '700 46px -apple-system, sans-serif';
  ctx.fillText(data.userName, avatarX + avatarSize + 30, cardY + 80);

  // Watermark footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '500 38px -apple-system, sans-serif';
  ctx.fillText('Study free at edora.app', CARD_W / 2, CARD_H - 80);

  return canvas.toDataURL('image/png', 0.95);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  let lines: string[] = [];
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line.trim());
      line = word + ' ';
    } else {
      line = test;
    }
  }
  lines.push(line.trim());
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

// ── Milestone detection helpers ───────────────────────────────────────────────

export function streakMilestoneCard(streakDays: number, userName: string, avatarUrl?: string | null): AchievementCardData | null {
  if (![7, 14, 30, 50, 100, 365].includes(streakDays)) return null;
  return {
    type: 'streak', value: String(streakDays),
    headline: `${streakDays} Day Streak!`, subtitle: 'Consistency is the key to cracking exams',
    userName, avatarUrl,
  };
}

export function levelMilestoneCard(level: number, userName: string, avatarUrl?: string | null): AchievementCardData | null {
  if (level % 5 !== 0 || level === 0) return null;
  return {
    type: 'level', value: String(level),
    headline: `Level ${level} Reached!`, subtitle: 'Keep climbing the ranks',
    userName, avatarUrl,
  };
}

export function mockScoreCard(score: number, total: number, examName: string, userName: string, avatarUrl?: string | null): AchievementCardData | null {
  if (score / total < 0.7) return null; // only celebrate strong scores
  return {
    type: 'mock_score', value: `${score}/${total}`,
    headline: 'Mock Test Cleared!', subtitle: examName,
    userName, avatarUrl,
  };
}
