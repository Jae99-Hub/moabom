/** DB 시각 문자열 → Date. 로컬 형식('YYYY-MM-DD HH:MM:SS[.SSS]', UTC)·ISO·날짜만('YYYY-MM-DD') 모두 처리. 해석 못 하면 null */
export function parseDbDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? null : d
}
