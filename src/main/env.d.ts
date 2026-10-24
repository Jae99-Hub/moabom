// 빌드할 때 .env에서 넣는 메인 프로세스용 값 (저장소에는 올라가지 않음)
interface ImportMetaEnv {
  readonly MAIN_VITE_TMDB_API_KEY?: string
  readonly MAIN_VITE_GOOGLE_BOOKS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
