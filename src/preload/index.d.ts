// 렌더러에서 쓰는 window.api / authBridge / updaterBridge 타입은 src/renderer/src/types/index.ts 한 곳에서 정의한다
// (여기 따로 두면 실제 브릿지와 어긋나기 쉬움 — 예: 업데이트 구독 함수가 해제 함수를 돌려주는 것)
export {}
