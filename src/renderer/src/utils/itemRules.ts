// 작품 기록 규칙 — 화면 여러 곳(상세창 상태 바꾸기, 추가·편집 창)이 같은 규칙을 쓰도록 한 곳에
import type { Item, ItemFormData, ItemStatus } from '../types'

/** 오늘 날짜 (이 기기 시간대) 'YYYY-MM-DD' — 날짜 입력칸과 같은 형식 */
export function todayLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type StatusTarget = Pick<Item, 'item_type' | 'status' | 'read_date' | 'page_count' | 'current_page'>

/** 상태를 바꿀 때 함께 바꿀 칸.
 *  완료로 바꾸면 ① 완료일이 비어 있으면 오늘 ② 책은 다 읽은 쪽수로.
 *  (예전엔 완료일이 비면 통계가 '마지막 수정 시각'을 대신 써서, 별점만 고쳐도 완료한 달이 이번 달로 바뀌었음) */
export function statusPatch(item: StatusTarget, status: ItemStatus): Partial<ItemFormData> {
  const patch: Partial<ItemFormData> = { status }
  if (status === 'done' && item.status !== 'done') {
    if (!item.read_date) patch.read_date = todayLocal()
    if (item.item_type === 'book' && item.page_count && item.page_count > 0) patch.current_page = item.page_count
  }
  return patch
}

/** 같은 작품이 이미 있는지 (제목·종류가 같고, 연도가 둘 다 있으면 연도도 같음) — 추가할 때 한 번 확인 */
export function findDuplicate(list: Item[], form: Pick<ItemFormData, 'title' | 'item_type' | 'year'>, exceptId?: number): Item | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const title = norm(form.title)
  if (!title) return undefined
  return list.find((m) =>
    m.id !== exceptId && m.item_type === form.item_type && norm(m.title) === title &&
    (m.year == null || form.year == null || Number(m.year) === Number(form.year)))
}

export interface FormProblem { tab: 'info' | 'record'; message: string }

/** 저장 전에 확인할 입력값 — 고칠 곳이 있으면 첫 문제를 돌려줌 */
export function validateForm(form: ItemFormData): FormProblem | null {
  if (!form.title.trim()) return { tab: 'info', message: '제목을 적어 주세요.' }
  // 연도는 클라우드에서 글자('2019')로 올 때도 있어 숫자로 바꿔서 확인
  const year = form.year == null || (form.year as unknown) === '' ? null : Number(form.year)
  if (year != null && (!Number.isInteger(year) || year < 1000 || year > 2100)) {
    return { tab: 'info', message: '연도는 1000~2100 사이의 숫자로 적어 주세요.' }
  }
  if (form.page_count != null && (!Number.isFinite(form.page_count) || form.page_count < 1 || form.page_count > 100000)) {
    return { tab: 'info', message: '전체 페이지는 1 이상의 숫자로 적어 주세요.' }
  }
  return null
}
