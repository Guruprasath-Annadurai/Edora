import { useState } from 'react';

interface UserAvatarProps {
  name: string;
  url: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({ name, url, size = 36, className = '' }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
  const style = { width: size, height: size };

  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={style}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${className}`}
      style={{ ...style, background: 'rgba(91,106,245,0.3)', color: '#A0AEFF' }}
    >
      {initials}
    </div>
  );
}
