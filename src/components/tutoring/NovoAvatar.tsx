export function NovoAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-heading font-bold text-white"
      style={{
        width: size, height: size,
        background: 'linear-gradient(135deg, #5B6AF5, #8B5CF6)',
        fontSize: size * 0.4,
      }}>
      N
    </div>
  );
}
