// Route: /debate
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';

export default function DebateModePage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[var(--color-base)] flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-safe-top pb-3 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl active:opacity-70"
        >
          <ArrowLeft size={20} className="text-white/70" />
        </button>
        <span className="font-heading font-semibold text-white">Debate Mode</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-16 h-16 rounded-2xl card-l2 flex items-center justify-center">
          <Sparkles size={28} className="text-[var(--color-novo-light)]" />
        </div>
        <h2 className="font-heading text-xl font-bold text-white">Debate Mode</h2>
        <p className="text-sm text-[var(--color-text-secondary)] text-center">
          Coming in v3.7. Your study streak and data are safe.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-2 text-sm font-semibold text-[var(--color-novo-light)] active:opacity-70"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
