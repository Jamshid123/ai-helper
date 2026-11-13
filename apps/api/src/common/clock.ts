import { Injectable } from '@nestjs/common'

/** Источник времени. В логике — только он (тесты подменяют FakeClock: «ставка в 18:00:00»). */
@Injectable()
export class Clock {
  now(): Date {
    return new Date()
  }
}

export class FakeClock extends Clock {
  constructor(private current: Date) {
    super()
  }
  override now(): Date {
    return new Date(this.current)
  }
  set(date: Date | string) {
    this.current = new Date(date)
  }
}
