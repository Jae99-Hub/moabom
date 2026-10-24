// 한국어 문구 도우미

// 숫자를 읽을 때 받침이 있는지 (0 영, 1 일, 2 이, 3 삼, 4 사, 5 오, 6 육, 7 칠, 8 팔, 9 구)
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false]
// 'ㄹ' 받침 (으로/로에서 '로'를 씀): 1 일, 7 칠, 8 팔
const DIGIT_RIEUL = [false, true, false, false, false, false, false, true, true, false]

type JosaPair = '을/를' | '이/가' | '은/는' | '과/와' | '으로/로'

/** 단어 끝 받침에 맞는 조사. josa('데미안', '을/를') → '을', josa('기생충', '이/가') → '이'.
 *  한글·숫자로 끝나지 않으면(영어 제목 등) '을(를)'처럼 둘 다 적는다 */
export function josa(word: string, pair: JosaPair): string {
  const [withBatchim, without] = pair.split('/')
  const last = word.trim().replace(/[\s'"’”)\]」』〉》…]+$/u, '').slice(-1)
  let batchim: boolean
  let rieul = false
  const code = last.charCodeAt(0) - 0xac00
  if (code >= 0 && code <= 11171) {
    const jong = code % 28
    batchim = jong !== 0
    rieul = jong === 8
  } else if (/[0-9]/.test(last)) {
    batchim = DIGIT_BATCHIM[Number(last)]
    rieul = DIGIT_RIEUL[Number(last)]
  } else {
    return `${withBatchim}(${without})`
  }
  if (pair === '으로/로' && rieul) return without
  return batchim ? withBatchim : without
}

/** 화면에 띄울 짧은 제목 — 길면 잘라서 '…' */
export function shortTitle(title: string, max = 24): string {
  return title.length > max ? title.slice(0, max) + '…' : title
}
