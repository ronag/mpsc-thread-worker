export const WRITE_INDEX = 0
export const READ_INDEX = 4

export function align(value) {
  if (value & 0x7) {
    value |= 0x7
    value++
  }
  return value
}
