import { BadRequestException, ConflictException, HttpException, HttpStatus } from '@nestjs/common'
import { z } from 'zod'

/** Деньги — строкой целых сумов (без float). */
export const money = z.string().regex(/^[1-9]\d{0,14}$/, 'целое число сумов')
export const inspectionSchema = z.object({
  summary: z.string().trim().max(1000).default(''),
  battery: z.number().int().min(0).max(100).nullable().default(null),
  imeiChecked: z.boolean().default(false),
  kit: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  defects: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
})
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) })

export function parse<T extends z.ZodTypeAny>(schema: T, body: unknown, message = 'Проверьте поля формы'): z.infer<T> {
  const r = schema.safeParse(body)
  if (!r.success) {
    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message,
      fields: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return r.data
}

export const conflict = (code: string, message: string) => new ConflictException({ code, message })
export const unprocessable = (code: string, message: string) =>
  new HttpException({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY)

/** Prisma: нарушение уникальности. */
export const isUniqueViolation = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
