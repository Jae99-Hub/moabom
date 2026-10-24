// 웹 배포: 점검 → 테스트 → 빌드 → Vercel 두 주소에 올리기
//   npm run deploy:web
//
// moabom-app(.vercel/project.json에 연결된 프로젝트) → https://moabom-app-nu.vercel.app
// moabom                                            → https://moabom-app.vercel.app (외부에 알린 주소)
// Vercel 로그인은 'npx vercel login'으로 한 번 해 둔다.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SECOND_PROJECT_ID = 'prj_G4cPcFwDsbxmvQcfvLqOFI7rHSZk' // moabom → moabom-app.vercel.app
const run = (cmd, env) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })

console.log('\n▶ Supabase 표 확인')
run('node scripts/check-schema.mjs')

console.log('\n▶ 타입 검사·자동 테스트')
run('npm run check')

console.log('\n▶ 웹 화면 만들기')
run('npm run build:web')

console.log('\n▶ moabom-app-nu.vercel.app에 올리기')
run('npx --yes vercel@latest deploy --prod --yes')

console.log('\n▶ moabom-app.vercel.app에 올리기')
const { orgId } = JSON.parse(readFileSync('.vercel/project.json', 'utf8'))
run('npx --yes vercel@latest deploy --prod --yes', { VERCEL_ORG_ID: orgId, VERCEL_PROJECT_ID: SECOND_PROJECT_ID })

console.log('\n✔ 두 주소 모두 새 버전이에요.')
