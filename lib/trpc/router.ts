import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import superjson from 'superjson'
import { auth } from '../auth'
import { prisma } from '../prisma'
import bcrypt from 'bcryptjs'

const t = initTRPC.create({ transformer: superjson })

const publicProcedure = t.procedure
const protectedProcedure = t.procedure.use(async ({ next }) => {
  const session = await auth()
  if (!session?.user?.id) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { userId: session.user.id, userName: session.user.name ?? 'Jugador' } })
})

export const appRouter = t.router({
  auth: t.router({
    register: publicProcedure
      .input(z.object({ email: z.string().email(), name: z.string().min(2), password: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const existing = await prisma.user.findUnique({ where: { email: input.email } })
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Email ya registrado' })
        const passwordHash = await bcrypt.hash(input.password, 12)
        const user = await prisma.user.create({
          data: { email: input.email, name: input.name, passwordHash },
        })
        return { id: user.id, name: user.name }
      }),
  }),

  game: t.router({
    create: protectedProcedure
      .input(z.object({ vsAi: z.boolean().default(false) }))
      .mutation(async ({ ctx, input }) => {
        const game = await prisma.game.create({
          data: {
            player1Id: ctx.userId,
            status: input.vsAi ? 'PLAYING' : 'WAITING',
            isAiGame: input.vsAi,
          },
        })
        return { gameId: game.id }
      }),

    join: protectedProcedure
      .input(z.object({ gameId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const game = await prisma.game.findUnique({ where: { id: input.gameId } })
        if (!game) throw new TRPCError({ code: 'NOT_FOUND' })
        if (game.status !== 'WAITING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Partida no disponible' })
        if (game.player1Id === ctx.userId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ya estás en esta partida' })

        await prisma.game.update({
          where: { id: input.gameId },
          data: { player2Id: ctx.userId, status: 'PLAYING' },
        })
        return { gameId: input.gameId }
      }),

    finish: protectedProcedure
      .input(z.object({ gameId: z.string(), winnerId: z.string() }))
      .mutation(async ({ input }) => {
        await prisma.game.update({
          where: { id: input.gameId },
          data: { status: 'FINISHED', winnerId: input.winnerId },
        })
        return { ok: true }
      }),

    listOpen: publicProcedure.query(async () => {
      return prisma.game.findMany({
        where: { status: 'WAITING' },
        include: { player1: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
    }),
  }),
})

export type AppRouter = typeof appRouter
