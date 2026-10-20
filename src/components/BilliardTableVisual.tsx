import React from 'react';
import { Match, Player } from '../types';

export interface BilliardTableVisualProps {
  number: number;
  name?: string;
  status: 'free' | 'occupied';
  match?: Match;
  player1?: Player;
  player2?: Player;
  isHovered?: boolean;
  scale?: number;
  size?: 'normal' | 'large';
}

export const BilliardTableVisual: React.FC<BilliardTableVisualProps> = ({
  number,
  name,
  status,
  match,
  player1,
  player2,
  isHovered = false,
  size = 'normal'
}) => {
  const isOccupied = status === 'occupied';
  const tableName = name || `Billard ${number}`;
  const isLarge = size === 'large';
  const svgWidth = isLarge ? 240 : 160;
  const svgHeight = isLarge ? 135 : 90;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        transition: 'transform 0.2s ease, filter 0.2s ease',
        transform: isHovered ? 'scale(1.04)' : 'scale(1)',
        filter: isOccupied
          ? (isLarge
              ? 'drop-shadow(0 16px 28px rgba(0, 255, 170, 0.3)) drop-shadow(0 8px 16px rgba(0,0,0,0.8))'
              : 'drop-shadow(0 14px 24px rgba(0, 255, 170, 0.25)) drop-shadow(0 6px 12px rgba(0,0,0,0.7))')
          : (isLarge
              ? 'drop-shadow(0 14px 24px rgba(0,0,0,0.7))'
              : 'drop-shadow(0 10px 20px rgba(0,0,0,0.6))')
      }}
    >
      {/* 3D Billiard Table SVG */}
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox="0 0 160 90"
        style={{
          borderRadius: isLarge ? '14px' : '10px',
          overflow: 'visible',
          display: 'block'
        }}
      >
        <defs>
          {/* Wood Frame Gradient */}
          <linearGradient id={`wood-${number}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a2b16" />
            <stop offset="25%" stopColor="#673d20" />
            <stop offset="50%" stopColor="#3d2212" />
            <stop offset="75%" stopColor="#5a341b" />
            <stop offset="100%" stopColor="#251409" />
          </linearGradient>

          {/* Chrome Corner Caps Gradient */}
          <linearGradient id={`chrome-${number}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#d6d6d6" />
            <stop offset="50%" stopColor="#8c8c8c" />
            <stop offset="75%" stopColor="#e8e8e8" />
            <stop offset="100%" stopColor="#4f4f4f" />
          </linearGradient>

          {/* Simonis Green Felt Cloth - Free State */}
          <radialGradient id={`felt-free-${number}`} cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#127a42" />
            <stop offset="60%" stopColor="#0d5c31" />
            <stop offset="100%" stopColor="#083d20" />
          </radialGradient>

          {/* Simonis Green Felt Cloth - Live Overhead Spotlight */}
          <radialGradient id={`felt-live-${number}`} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#1fd472" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#148f4b" />
            <stop offset="75%" stopColor="#0c592f" />
            <stop offset="100%" stopColor="#07381d" />
          </radialGradient>

          {/* Inner Cushion Shadow */}
          <linearGradient id={`cushion-h-${number}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#052614" />
            <stop offset="100%" stopColor="#0c502b" />
          </linearGradient>

          {/* Pocket Hole Deep Gradient */}
          <radialGradient id={`pocket-${number}`} cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="60%" stopColor="#080808" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>

          {/* 3D Ball - White Cue Ball */}
          <radialGradient id={`ball-white-${number}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#e8e8e8" />
            <stop offset="85%" stopColor="#b0b0b0" />
            <stop offset="100%" stopColor="#666666" />
          </radialGradient>

          {/* 3D Ball - Red 8-Pool Ball */}
          <radialGradient id={`ball-red-${number}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#ff7b88" />
            <stop offset="40%" stopColor="#e6192c" />
            <stop offset="80%" stopColor="#9e0c1a" />
            <stop offset="100%" stopColor="#4a040b" />
          </radialGradient>

          {/* 3D Ball - Yellow 8-Pool Ball */}
          <radialGradient id={`ball-yellow-${number}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#fff388" />
            <stop offset="40%" stopColor="#f5b800" />
            <stop offset="80%" stopColor="#b38200" />
            <stop offset="100%" stopColor="#543c00" />
          </radialGradient>

          {/* 3D Ball - 8 Black Ball */}
          <radialGradient id={`ball-black-${number}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#555555" />
            <stop offset="50%" stopColor="#1a1a1a" />
            <stop offset="90%" stopColor="#050505" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
        </defs>

        {/* 1. Wood Cabinet Outer Rails */}
        <rect
          x="2"
          y="2"
          width="156"
          height="86"
          rx="8"
          ry="8"
          fill={`url(#wood-${number})`}
          stroke="#1a0d06"
          strokeWidth="1.5"
        />

        {/* Subtle wood rail inner bevel */}
        <rect
          x="8"
          y="8"
          width="144"
          height="74"
          rx="5"
          ry="5"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* Sights / Diamonds along rails (Les mouches d'alignement) */}
        {/* Top Rail Sights */}
        <circle cx="45" cy="5.5" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="80" cy="5.5" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="115" cy="5.5" r="1" fill="#f0ebd8" opacity="0.9" />
        {/* Bottom Rail Sights */}
        <circle cx="45" cy="84.5" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="80" cy="84.5" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="115" cy="84.5" r="1" fill="#f0ebd8" opacity="0.9" />
        {/* Left Rail Sights */}
        <circle cx="5.5" cy="30" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="5.5" cy="60" r="1" fill="#f0ebd8" opacity="0.9" />
        {/* Right Rail Sights */}
        <circle cx="154.5" cy="30" r="1" fill="#f0ebd8" opacity="0.9" />
        <circle cx="154.5" cy="60" r="1" fill="#f0ebd8" opacity="0.9" />

        {/* 2. Rubber Cushion Assembly (Bandes biseautées) */}
        {/* Top Left Cushion */}
        <polygon points="17,11 74,11 72,16 22,16" fill="#084222" />
        {/* Top Right Cushion */}
        <polygon points="86,11 143,11 138,16 88,16" fill="#084222" />
        {/* Bottom Left Cushion */}
        <polygon points="17,79 74,79 72,74 22,74" fill="#084222" />
        {/* Bottom Right Cushion */}
        <polygon points="86,79 143,79 138,74 88,74" fill="#084222" />
        {/* Left Cushion */}
        <polygon points="11,17 11,73 16,68 16,22" fill="#073b1e" />
        {/* Right Cushion */}
        <polygon points="149,17 149,73 144,68 144,22" fill="#073b1e" />

        {/* 3. Simonis Green Felt Playing Cloth */}
        <rect
          x="14"
          y="14"
          width="132"
          height="62"
          rx="2"
          ry="2"
          fill={isOccupied ? `url(#felt-live-${number})` : `url(#felt-free-${number})`}
        />

        {/* Inner cloth shadow from cushions */}
        <rect
          x="15"
          y="15"
          width="130"
          height="60"
          fill="none"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1.5"
        />

        {/* Baize Line (Ligne de départ) & Head Spot */}
        <line x1="42" y1="16" x2="42" y2="74" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
        {/* Baize D semicircle */}
        <path d="M 42,35 A 10,10 0 0,0 42,55" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
        {/* Head Spot */}
        <circle cx="42" cy="45" r="1.2" fill="rgba(255,255,255,0.4)" />
        {/* Center Spot */}
        <circle cx="80" cy="45" r="1.2" fill="rgba(255,255,255,0.3)" />
        {/* Foot Spot (Spot du triangle) */}
        <circle cx="116" cy="45" r="1.2" fill="rgba(255,255,255,0.4)" />

        {/* 4. The 6 Pocket Holes (Blouses) */}
        {/* Corner Top-Left */}
        <circle cx="14" cy="14" r="5.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />
        {/* Corner Top-Right */}
        <circle cx="146" cy="14" r="5.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />
        {/* Corner Bottom-Left */}
        <circle cx="14" cy="76" r="5.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />
        {/* Corner Bottom-Right */}
        <circle cx="146" cy="76" r="5.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />
        {/* Side Pocket Top */}
        <ellipse cx="80" cy="11.5" rx="5" ry="3.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />
        {/* Side Pocket Bottom */}
        <ellipse cx="80" cy="78.5" rx="5" ry="3.5" fill={`url(#pocket-${number})`} stroke="#0d0d0d" strokeWidth="0.8" />

        {/* 5. Chrome Castings / Pocket Plates */}
        {/* Corner Chrome Plates */}
        <path d="M 2,12 C 2,6 6,2 12,2 L 18,2 C 12,8 8,12 8,18 L 8,18 L 2,18 Z" fill={`url(#chrome-${number})`} opacity="0.9" />
        <path d="M 158,12 C 158,6 154,2 148,2 L 142,2 C 148,8 152,12 152,18 L 158,18 Z" fill={`url(#chrome-${number})`} opacity="0.9" />
        <path d="M 2,78 C 2,84 6,88 12,88 L 18,88 C 12,82 8,78 8,72 L 2,72 Z" fill={`url(#chrome-${number})`} opacity="0.9" />
        <path d="M 158,78 C 158,84 154,88 148,88 L 142,88 C 148,82 152,78 152,72 L 158,72 Z" fill={`url(#chrome-${number})`} opacity="0.9" />
        {/* Side Pocket Chrome Plates */}
        <rect x="74" y="2" width="12" height="4" rx="1.5" fill={`url(#chrome-${number})`} opacity="0.9" />
        <rect x="74" y="84" width="12" height="4" rx="1.5" fill={`url(#chrome-${number})`} opacity="0.9" />

        {/* 6. Realistic 3D Balls on the Felt */}
        {isOccupied ? (
          /* IN-PLAY: Dynamic realistic game layout of scattered balls */
          <g id="live-balls">
            {/* White Cue Ball */}
            <circle cx="56" cy="38" r="3.2" fill={`url(#ball-white-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="55.2" cy="37.2" r="0.8" fill="#ffffff" opacity="0.8" />

            {/* Black 8 Ball */}
            <circle cx="94" cy="46" r="3.2" fill={`url(#ball-black-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="94" cy="46" r="1.3" fill="#ffffff" />
            <text x="94" y="47.2" fontSize="2.2" fontWeight="900" textAnchor="middle" fill="#000">8</text>

            {/* Red Balls in game */}
            <circle cx="112" cy="32" r="3.2" fill={`url(#ball-red-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="128" cy="54" r="3.2" fill={`url(#ball-red-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="78" cy="62" r="3.2" fill={`url(#ball-red-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="138" cy="24" r="3.2" fill={`url(#ball-red-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />

            {/* Yellow Balls in game */}
            <circle cx="106" cy="58" r="3.2" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="124" cy="38" r="3.2" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="86" cy="28" r="3.2" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="34" cy="60" r="3.2" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />

            {/* Cue stick suggestion on the side */}
            <line x1="20" y1="48" x2="52" y2="39" stroke="#d6a87c" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
            <line x1="50" y1="39.6" x2="52" y2="39" stroke="#3377cc" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
          </g>
        ) : (
          /* FREE: Realistic Racked Triangle Pack at foot spot + Cue Ball at D */
          <g id="racked-pack">
            {/* White Cue Ball behind Baize line */}
            <circle cx="35" cy="45" r="3.2" fill={`url(#ball-white-${number})`} filter="drop-shadow(1px 1px 1.5px rgba(0,0,0,0.6))" />
            <circle cx="34.2" cy="44.2" r="0.8" fill="#ffffff" opacity="0.8" />

            {/* Row 1 (Apex ball at foot spot) */}
            <circle cx="116" cy="45" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />

            {/* Row 2 (2 balls) */}
            <circle cx="121.2" cy="42" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="121.2" cy="48" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />

            {/* Row 3 (3 balls with 8 in center) */}
            <circle cx="126.4" cy="39" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="126.4" cy="45" r="3.1" fill={`url(#ball-black-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="126.4" cy="45" r="1.1" fill="#ffffff" />
            <text x="126.4" y="46.1" fontSize="1.8" fontWeight="900" textAnchor="middle" fill="#000">8</text>
            <circle cx="126.4" cy="51" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />

            {/* Row 4 (4 balls) */}
            <circle cx="131.6" cy="36" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="131.6" cy="42" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="131.6" cy="48" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="131.6" cy="54" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />

            {/* Row 5 (5 balls base) */}
            <circle cx="136.8" cy="33" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="136.8" cy="39" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="136.8" cy="45" r="3.1" fill={`url(#ball-red-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="136.8" cy="51" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />
            <circle cx="136.8" cy="57" r="3.1" fill={`url(#ball-yellow-${number})`} filter="drop-shadow(0.8px 0.8px 1px rgba(0,0,0,0.5))" />

            {/* Triangle rack outline */}
            <polygon
              points="114,45 139,30 139,60"
              fill="none"
              stroke="rgba(240, 220, 180, 0.45)"
              strokeWidth="0.8"
            />
          </g>
        )}

        {/* 7. Overhead Lighting Glow Beam (Under live play) */}
        {isOccupied && (
          <ellipse
            cx="80"
            cy="45"
            rx="50"
            ry="24"
            fill="rgba(255, 255, 255, 0.12)"
            pointerEvents="none"
          />
        )}
      </svg>

      {/* Table Badge & Players / Score Strip */}
      <div
        style={{
          marginTop: isLarge ? '8px' : '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isLarge ? '5px' : '2px',
          background: isOccupied ? 'rgba(5, 8, 20, 0.94)' : 'rgba(10, 15, 25, 0.88)',
          backdropFilter: 'blur(8px)',
          border: isOccupied ? '1px solid rgba(0, 255, 170, 0.45)' : '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: isLarge ? '10px' : '7px',
          padding: isLarge ? '4px 10px' : '2px 8px',
          boxShadow: isOccupied ? '0 4px 16px rgba(0, 255, 170, 0.25)' : '0 2px 6px rgba(0,0,0,0.4)',
          width: isLarge ? '240px' : undefined,
          maxWidth: isLarge ? '240px' : '150px'
        }}
      >
        {/* Table Name + Live/Prêt Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isLarge ? '6px' : '5px' }}>
            <span
              style={{
                width: isLarge ? '7px' : '6px',
                height: isLarge ? '7px' : '6px',
                borderRadius: '50%',
                background: isOccupied ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.35)',
                boxShadow: isOccupied ? '0 0 8px var(--accent-primary)' : 'none',
                animation: isOccupied ? 'pulse 1.5s infinite' : 'none',
                flexShrink: 0
              }}
            />
            <span
              style={{
                fontSize: isLarge ? '0.82rem' : '0.72rem',
                fontWeight: 800,
                color: isOccupied ? 'var(--accent-primary)' : '#ffffff',
                letterSpacing: '0.2px',
                whiteSpace: 'nowrap'
              }}
            >
              {tableName}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {match?.stage && match.stage !== 'qualif' && (
              <span
                style={{
                  fontSize: isLarge ? '0.65rem' : '0.55rem',
                  fontWeight: 900,
                  color: '#ffd700',
                  background: 'rgba(255, 215, 0, 0.2)',
                  padding: isLarge ? '1px 5px' : '0 4px',
                  borderRadius: '3px',
                  border: '1px solid rgba(255, 215, 0, 0.4)',
                  letterSpacing: '0.3px'
                }}
              >
                {match.stage === 'final' ? '🏆 FINALE' : match.stage === 'semi' ? '⚔️ DEMI' : '🎯 1/4'}
              </span>
            )}
            {match?.status === 'playing' ? (
              <span
                style={{
                  fontSize: isLarge ? '0.65rem' : '0.58rem',
                  fontWeight: 900,
                  color: '#000',
                  background: 'var(--accent-primary)',
                  padding: isLarge ? '1px 6px' : '0 4px',
                  borderRadius: '3px',
                  letterSpacing: '0.4px'
                }}
              >
                LIVE
              </span>
            ) : match?.status === 'pending' ? (
              <span
                style={{
                  fontSize: isLarge ? '0.65rem' : '0.58rem',
                  fontWeight: 800,
                  color: '#00e5ff',
                  background: 'rgba(0, 229, 255, 0.15)',
                  padding: isLarge ? '1px 5px' : '0 4px',
                  borderRadius: '3px',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  letterSpacing: '0.4px'
                }}
              >
                PRÊT
              </span>
            ) : (
              <span
                style={{
                  fontSize: isLarge ? '0.62rem' : '0.55rem',
                  fontWeight: 700,
                  color: 'var(--text-muted)'
                }}
              >
                LIBRE
              </span>
            )}
          </div>
        </div>

        {/* Match Players & Score */}
        {match ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: isLarge ? '6px' : '4px',
              fontSize: isLarge ? '0.82rem' : '0.66rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: isLarge ? '5px' : '2px',
              marginTop: isLarge ? '2px' : '1px'
            }}
          >
            <span
              style={{
                flex: isLarge ? 1 : undefined,
                textAlign: isLarge ? 'right' : 'left',
                maxWidth: isLarge ? undefined : '48px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: match.score1 > match.score2 ? 'var(--accent-primary)' : '#fff'
              }}
              title={player1?.name}
            >
              {player1?.name || 'J1'}
            </span>
            <span
              style={{
                color: 'var(--accent-primary)',
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: isLarge ? '1px 6px' : '0',
                background: isLarge && match.status === 'playing' ? 'rgba(0, 255, 170, 0.15)' : 'transparent',
                borderRadius: '4px',
                fontSize: isLarge ? (match.status === 'playing' ? '0.92rem' : '0.78rem') : 'inherit',
                flexShrink: 0
              }}
            >
              {match.status === 'playing' ? `${match.score1}-${match.score2}` : 'VS'}
              {(Boolean(match.handicapP1) || Boolean(match.handicapP2)) && (
                <span style={{ fontSize: isLarge ? '0.65rem' : '0.52rem', color: '#ffd700' }} title="Handicap actif">🎯</span>
              )}
            </span>
            <span
              style={{
                flex: isLarge ? 1 : undefined,
                textAlign: isLarge ? 'left' : 'left',
                maxWidth: isLarge ? undefined : '48px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: match.score2 > match.score1 ? 'var(--accent-primary)' : '#fff'
              }}
              title={player2?.name}
            >
              {player2?.name || 'J2'}
            </span>
          </div>
        ) : (
          isLarge && (
            <div
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: '3px',
                marginTop: '1px'
              }}
            >
              Table disponible
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default BilliardTableVisual;
