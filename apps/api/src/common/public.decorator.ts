import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'isPublic'
/** Эндпоинт без авторизации. По умолчанию всё закрыто глобальным guard-ом (deny by default). */
export const Public = () => SetMetadata(IS_PUBLIC, true)
