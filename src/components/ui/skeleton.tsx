import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  style?: React.CSSProperties;
}

export function Skeleton({ className, rounded = '2xl', style }: SkeletonProps) {
  return (
    <div className={cn('skeleton-dark', `rounded-${rounded}`, className)} style={style} />
  );
}

export function HomePageSkeleton() {
  return (
    <div className="h-full px-4 py-4 flex flex-col gap-5 bg-gradient-page">
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <Skeleton className="w-11 h-11" rounded="full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="w-20 h-3" />
            <Skeleton className="w-32 h-5" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-14 h-7" rounded="full" />
          <Skeleton className="w-14 h-7" rounded="full" />
          <Skeleton className="w-9 h-9"  rounded="full" />
        </div>
      </div>
      <Skeleton className="w-full h-48" rounded="3xl" />
      <Skeleton className="w-full h-10" rounded="full" />
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" rounded="3xl" />)}
      </div>
      <div className="flex flex-col gap-2.5">
        {[1,2,3].map(i => <Skeleton key={i} className="w-full h-14" rounded="2xl" />)}
      </div>
    </div>
  );
}

export function CardRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="w-full h-16" rounded="2xl" />
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center gap-4">
        <Skeleton className="w-20 h-20" rounded="full" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="w-36 h-5" />
          <Skeleton className="w-24 h-4" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" rounded="2xl" />)}
      </div>
      {[1,2,3,4].map(i => <Skeleton key={i} className="w-full h-14" rounded="2xl" />)}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex gap-2 items-start">
        <Skeleton className="w-8 h-8 shrink-0" rounded="full" />
        <Skeleton className="w-64 h-20" rounded="2xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="w-48 h-12" rounded="2xl" />
      </div>
      <div className="flex gap-2 items-start">
        <Skeleton className="w-8 h-8 shrink-0" rounded="full" />
        <Skeleton className="w-56 h-16" rounded="2xl" />
      </div>
    </div>
  );
}

// ── Page-specific compound skeletons ─────────────────────────────────────────

export function SkeletonProfileHero() {
  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)' }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-[60px] h-[60px] shrink-0" rounded="2xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="w-28 h-5 rounded-lg" />
              <Skeleton className="w-16 h-3 rounded-lg" />
            </div>
          </div>
          <Skeleton className="w-20 h-7" rounded="full" />
        </div>
        <Skeleton className="w-full h-2.5 mb-2" rounded="full" />
        <div className="flex justify-between">
          <Skeleton className="w-14 h-3 rounded-md" />
          <Skeleton className="w-24 h-3 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`flex flex-col items-center py-3 gap-1.5 ${i < 3 ? 'border-r border-white/5' : ''}`}>
            <Skeleton className="w-8 h-4 rounded-md" />
            <Skeleton className="w-10 h-2.5 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonLeaderboardRows({ count = 5 }: { count?: number }) {
  return (
    <div className="rounded-3xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: i < count - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <Skeleton className="w-7 h-7 shrink-0" rounded="full" />
          <Skeleton className="h-4 flex-1" rounded="xl" />
          <Skeleton className="w-14 h-4 shrink-0" rounded="xl" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonMasteryBars({ count = 3 }: { count?: number }) {
  const widths = [96, 72, 88];
  return (
    <div className="flex flex-col gap-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="w-3 h-3 rounded-sm" />
              <Skeleton className="h-4 rounded-lg" style={{ width: widths[i % widths.length] }} />
            </div>
            <Skeleton className="w-8 h-4" rounded="xl" />
          </div>
          <Skeleton className="w-full h-2" rounded="full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonWeeklyStats() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0,1,2].map(i => (
        <div key={i} className="flex flex-col items-center gap-1.5 text-center p-3 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Skeleton className="w-4 h-4 rounded-sm" />
          <Skeleton className="w-8 h-6" rounded="xl" />
          <Skeleton className="w-12 h-2.5 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTopWeakness() {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: 'rgba(251,191,36,0.04)', border: '1.5px solid rgba(251,191,36,0.1)' }}>
      <Skeleton className="w-4 h-4 rounded-sm shrink-0 mt-0.5" />
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <Skeleton className="w-24 h-3 rounded-md" />
        <Skeleton className="w-full h-4" rounded="xl" />
        <Skeleton className="w-3/4 h-4" rounded="xl" />
      </div>
      <Skeleton className="w-16 h-7 shrink-0" rounded="xl" />
    </div>
  );
}

export function ListPageSkeleton({ count = 5, header = true }: { count?: number; header?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {header && (
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="w-9 h-9" rounded="full" />
          <Skeleton className="w-40 h-5" rounded="xl" />
          <div className="flex-1" />
          <Skeleton className="w-20 h-7" rounded="full" />
        </div>
      )}
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Skeleton className="w-10 h-10 shrink-0" rounded="2xl" />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <Skeleton className="w-3/4 h-4" rounded="xl" />
            <Skeleton className="w-1/2 h-3" rounded="xl" />
          </div>
          <Skeleton className="w-14 h-6 shrink-0" rounded="full" />
        </div>
      ))}
    </div>
  );
}

export function StatsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-3 mb-1">
        <Skeleton className="w-9 h-9" rounded="full" />
        <Skeleton className="w-44 h-5" rounded="xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-3xl p-4 flex flex-col gap-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Skeleton className="w-8 h-8" rounded="xl" />
            <Skeleton className="w-16 h-6" rounded="xl" />
            <Skeleton className="w-24 h-3" rounded="xl" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl p-4 flex flex-col gap-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <Skeleton className="w-32 h-4" rounded="xl" />
        {[1,2,3].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-20 h-3" rounded="xl" />
            <div className="flex-1"><Skeleton className="w-full h-2" rounded="full" /></div>
            <Skeleton className="w-10 h-3" rounded="xl" />
          </div>
        ))}
      </div>
      {[1,2].map(i => <Skeleton key={i} className="w-full h-24" rounded="3xl" />)}
    </div>
  );
}

export function SkeletonNcertCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="w-36 h-3 rounded-md" />
              <Skeleton className="w-10 h-10" rounded="xl" />
            </div>
            <Skeleton className="w-full h-4 mb-1.5" rounded="xl" />
            <Skeleton className="w-5/6 h-4 mb-1.5" rounded="xl" />
            <Skeleton className="w-4/5 h-4 mb-3" rounded="xl" />
            <Skeleton className="w-full h-9" rounded="xl" />
          </div>
          <Skeleton className="w-full h-9" rounded="xl" style={{ borderRadius: 0 }} />
        </div>
      ))}
    </div>
  );
}
