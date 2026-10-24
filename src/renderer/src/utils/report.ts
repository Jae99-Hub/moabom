// 사용자가 모르게 실패한 일을 개발자에게 알림 (Sentry, 배포판에서만)
// 예: 서버가 명대사 저장을 넉 달 동안 거절했는데 아무도 몰랐음 — 실패를 그냥 넘기는 곳은 여기를 거친다.
import * as Sentry from '@sentry/react'

const reported = new Set<string>()

/** 오류 코드 (Supabase는 PGRST204·42501 같은 코드를 줌. 연결이 끊기면 빈 코드) */
export function errorCode(error: unknown): string {
  const e = error as { code?: unknown; status?: unknown } | null
  return String(e?.code || e?.status || 'unknown')
}

const messageOf = (error: unknown): string => String((error as { message?: unknown } | null)?.message ?? error)

/** 연결이 끊겼거나 응답이 없던 경우 — 흔하고 앱 잘못이 아니라 보고하지 않음 */
export function isNetworkError(error: unknown): boolean {
  return /fetch|network|load failed|timed? ?out|abort/i.test(messageOf(error))
}

/** 화면 문구 끝에 붙일 오류 코드 — 사용자가 알려 주면 원인을 바로 찾을 수 있게 */
export function codeSuffix(error: unknown): string {
  const code = errorCode(error)
  return code === 'unknown' || isNetworkError(error) ? '' : ` (${code})`
}

/** 문제를 기록하고 개발자에게 알림. 같은 곳·같은 코드는 한 번만 보냄.
 *  보내는 것은 위치·코드·따옴표 안 값을 지운 문구뿐 — 기록 내용(제목·문장)은 보내지 않음 */
export function reportProblem(where: string, error: unknown): void {
  const code = errorCode(error)
  const message = messageOf(error)
    .replace(/"[^"]*"/g, '"…"') // 따옴표 안 값(사용자가 쓴 글일 수 있음)은 지움
    .replace(/\(.*\)/g, '(…)') // 'Failing row contains (…)' 같은 행 내용도 지움
    .slice(0, 300)
  console.error(`[문제] ${where} (${code}) ${message}`)
  if (isNetworkError(error)) return
  const key = `${where}:${code}`
  if (reported.has(key)) return
  reported.add(key)
  try {
    Sentry.captureMessage(`${where}: ${code}`, { level: 'error', tags: { where, code }, extra: { message } })
  } catch { /* 보고 실패는 앱 동작과 무관 */ }
}
