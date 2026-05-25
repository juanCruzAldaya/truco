import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GameBoard } from '@/components/game/GameBoard'
import type { PlayerSeat } from '@/lib/game/engine'

interface Props {
  params: Promise<{ id: string }>
}

export default async function GamePage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const game = await prisma.game.findUnique({ where: { id } })
  if (!game) redirect('/lobby')

  const userId = session.user.id
  let seat: PlayerSeat = 'p1'
  if (game.player2Id === userId) seat = 'p2'
  else if (game.player1Id !== userId) redirect('/lobby')

  return (
    <GameBoard
      gameId={id}
      userId={userId}
      seat={seat}
      userName={session.user.name ?? 'Jugador'}
    />
  )
}
