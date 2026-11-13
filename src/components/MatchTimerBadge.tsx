import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface MatchTimerBadgeProps {
  startTime?: number;
  durationMinutes?: number;
  status?: 'pending' | 'playing' | 'finished';
  size?: 'sm' | 'md' | 'lg';
  showElapsedWhenUnlimited?: boolean;
}

const formatMinSec = (totalSeconds: number): string => {
  const absSec = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const hours = Math.floor(absSec / 3600);
  const mins = Math.floor((absSec % 3600) / 60);
  const secs = absSec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
};

export const MatchTimerBadge: React.FC<MatchTimerBadgeProps> = ({
  startTime,
  durationMinutes = 0,
  status = 'playing',
  size = 'md',
  showElapsedWhenUnlimited = false
}) => {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (status !== 'playing') return;
    if (durationMinutes <= 0 && !showElapsedWhenUnlimited) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [status, durationMinutes, showElapsedWhenUnlimited]);

  const fontSizes = {
    sm: '0.72rem',
    md: '0.82rem',
    lg: '0.95rem'
  };
  const paddings = {
    sm: '2px 7px',
    md: '3px 10px',
    lg: '4px 12px'
  };
  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16
  };

  if (durationMinutes <= 0 && !showElapsedWhenUnlimited) {
    return null;
  }

  // Match waiting to start: display allocated time
  if (status === 'pending' && durationMinutes > 0) {
    return (
      <span
        title={`Temps imparti pour ce match : ${durationMinutes} minutes`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(245, 158, 11, 0.14)',
          border: '1px solid rgba(245, 158, 11, 0.38)',
          color: '#FBBF24',
          padding: paddings[size],
          borderRadius: '999px',
          fontSize: fontSizes[size],
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap'
        }}
      >
        <Clock size={iconSizes[size]} />
        {durationMinutes} min
      </span>
    );
  }

  if (status !== 'playing' || !startTime) {
    return null;
  }

  const elapsedSec = Math.max(0, Math.floor((now - startTime) / 1000));

  // Unlimited match duration, but caller requested elapsed timer
  if (durationMinutes <= 0) {
    return (
      <span
        title="Temps écoulé depuis le début du match"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          color: '#E2E8F0',
          padding: paddings[size],
          borderRadius: '999px',
          fontSize: fontSizes[size],
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap'
        }}
      >
        <Clock size={iconSizes[size]} />
        {formatMinSec(elapsedSec)}
      </span>
    );
  }

  // Countdown mode
  const totalAllocatedSec = durationMinutes * 60;
  const remainingSec = totalAllocatedSec - elapsedSec;
  const isOvertime = remainingSec <= 0;
  const isCritical = !isOvertime && remainingSec <= 60;
  const isWarning = !isOvertime && !isCritical && remainingSec <= 180;

  const bg = isOvertime
    ? 'rgba(239, 68, 68, 0.28)'
    : isCritical
      ? 'rgba(239, 68, 68, 0.2)'
      : isWarning
        ? 'rgba(245, 158, 11, 0.22)'
        : 'rgba(16, 185, 129, 0.18)';

  const border = isOvertime || isCritical
    ? '1.5px solid #EF4444'
    : isWarning
      ? '1.5px solid #F59E0B'
      : '1px solid rgba(52, 211, 153, 0.45)';

  const color = isOvertime || isCritical
    ? '#FCA5A5'
    : isWarning
      ? '#FDE68A'
      : '#6EE7B7';

  return (
    <span
      title={
        isOvertime
          ? `Temps réglementaire (${durationMinutes} min) dépassé de ${formatMinSec(Math.abs(remainingSec))}`
          : `Temps restant sur ${durationMinutes} min`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: bg,
        border,
        color,
        padding: paddings[size],
        borderRadius: '999px',
        fontSize: fontSizes[size],
        fontWeight: 900,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        boxShadow: isOvertime ? '0 0 14px rgba(239, 68, 68, 0.5)' : 'none',
        animation: isOvertime || isCritical ? 'pulse 1.2s infinite' : undefined
      }}
    >
      <Clock size={iconSizes[size]} />
      {isOvertime
        ? `TEMPS ÉCOULÉ (+${formatMinSec(Math.abs(remainingSec))})`
        : formatMinSec(remainingSec)}
    </span>
  );
};

export default MatchTimerBadge;
