'use client'

import { Sparkles, Swords } from 'lucide-react'
import type { Card, Suit } from '@/lib/game/engine'

function SuitIcon({ suit, className = 'w-6 h-6' }: { suit: Suit; className?: string }) {
  switch (suit) {
    case 'espada':
      return <Swords className={`${className} text-blue-400`} />
    case 'basto':
      return (
        <svg className={`${className} text-green-500 fill-current`} viewBox="0 0 24 24">
          <path d="M7 22h10v-2H7v2zm5-20C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17h8v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z" />
        </svg>
      )
    case 'oro':
      return (
        <div
          className={`${className} bg-yellow-400 rounded-full border-2 border-yellow-600 shadow-[0_0_10px_rgba(250,204,21,0.5)]`}
        />
      )
    case 'copa':
      return (
        <svg className={`${className} text-red-500 fill-current`} viewBox="0 0 24 24">
          <path d="M21 5V3H3v2l4.5 9h9L21 5zM7 21h10v-2H7v2z" />
        </svg>
      )
  }
}

interface PlayingCardProps {
  card?: Card
  faceDown?: boolean
  onClick?: () => void
  isPlayable?: boolean
  className?: string
  small?: boolean
}

export function PlayingCard({ card, faceDown, onClick, isPlayable, className = '', small }: PlayingCardProps) {
  const size = small ? 'w-16 h-24' : 'w-24 h-36'

  if (!card && !faceDown) {
    return <div className={`${size} rounded-xl border-2 border-dashed border-white/20 ${className}`} />
  }

  return (
    <div
      onClick={isPlayable ? onClick : undefined}
      className={`relative ${size} rounded-xl shadow-xl transition-all duration-300 transform
        ${faceDown
          ? 'bg-gradient-to-br from-indigo-900 to-purple-900 border-2 border-indigo-500/50'
          : 'bg-white border-2 border-gray-200'
        }
        ${isPlayable ? 'cursor-pointer hover:-translate-y-4 hover:shadow-2xl hover:shadow-cyan-500/50' : ''}
        ${className}
      `}
    >
      {!faceDown && card && (
        <div className="absolute inset-0 p-2 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className={`text-xl font-bold ${card.suit === 'oro' || card.suit === 'copa' ? 'text-red-600' : 'text-slate-800'}`}>
              {card.number}
            </span>
            <SuitIcon suit={card.suit} className="w-5 h-5" />
          </div>
          <div className="flex-1 flex items-center justify-center opacity-40">
            <SuitIcon suit={card.suit} className={small ? 'w-8 h-8' : 'w-12 h-12'} />
          </div>
          <div className="flex justify-between items-end rotate-180">
            <span className={`text-xl font-bold ${card.suit === 'oro' || card.suit === 'copa' ? 'text-red-600' : 'text-slate-800'}`}>
              {card.number}
            </span>
            <SuitIcon suit={card.suit} className="w-5 h-5" />
          </div>
        </div>
      )}
      {faceDown && (
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <Sparkles className={small ? 'w-8 h-8' : 'w-12 h-12 text-indigo-300'} />
        </div>
      )}
    </div>
  )
}
