// 데스크톱 앱 배포: 점검 → 테스트 → 빌드 → 결과 확인 → GitHub 릴리스 올리기
//
//   npm run release -- --notes 릴리스노트.md            새 버전 올리기 (모두에게 업데이트됨)
//   npm run release -- --notes 노트.md --prerelease      시험판으로 올리기 (자동 업데이트 대상 아님)
//   npm run release -- --promote v1.6.0                  시험판을 정식판으로 바꾸기
//
// 버전은 package.json의 version을 쓴다. 올리기 전에 커밋을 마치고, 이 스크립트가 현재 브랜치를 push한다.
// GitHub 로그인은 gh CLI(gh auth login)를 쓴다 — 토큰을 파일에 두지 않음.
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1) }
const step = (msg) => console.log(`\n▶ ${msg}`)

const promote = opt('--promote')
if (promote) {
  step(`${promote}를 정식판으로 바꿔요`)
  run(`gh release edit ${promote} --prerelease=false --latest`)
  console.log('\n✔ 이제 모두에게 업데이트로 보여요.')
  process.exit(0)
}

const notes = opt('--notes')
const prerelease = args.includes('--prerelease')
if (!notes || !existsSync(notes)) fail('릴리스 노트 파일을 --notes로 알려 주세요.')

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${version}`

step(`${tag} 배포 전 확인`)
if (out('git status --porcelain')) fail('커밋하지 않은 변경이 있어요. 먼저 커밋해 주세요.')
let exists = true
try { execSync(`gh release view ${tag}`, { stdio: 'ignore' }) } catch { exists = false }
if (exists) fail(`${tag} 릴리스가 이미 있어요. package.json의 version을 올려 주세요.`)

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'MAIN_VITE_TMDB_API_KEY', 'MAIN_VITE_GOOGLE_BOOKS_API_KEY']) {
  if (!new RegExp(`^${key}=\\S+`, 'm').test(env)) fail(`.env에 ${key}가 없어요.`)
}

step('Supabase 표 확인')
run('node scripts/check-schema.mjs')

step('타입 검사·자동 테스트')
run('npm run check')

step('설치 파일 만들기')
run('npm run package:win')

step('만든 파일 확인')
const exe = `dist/moabom-setup-${version}.exe`
for (const f of [exe, `${exe}.blockmap`, 'dist/latest.yml']) if (!existsSync(f)) fail(`${f}가 없어요.`)
if (!readFileSync('dist/latest.yml', 'utf8').includes(`version: ${version}`)) fail('latest.yml의 버전이 package.json과 달라요.')
const mainJs = readFileSync('out/main/index.js', 'utf8')
if (!/AIza[0-9A-Za-z_-]{35}/.test(mainJs)) fail('도서 검색 키가 빌드에 들어가지 않았어요.')

step('GitHub에 올리기')
run('git push origin HEAD')
const sha = out('git rev-parse HEAD')
run(`gh release create ${tag} "${exe}" "${exe}.blockmap" dist/latest.yml --title ${tag} --notes-file "${notes}" --target ${sha} ${prerelease ? '--prerelease' : '--latest'}`)

console.log(prerelease
  ? `\n✔ ${tag} 시험판을 올렸어요. 확인 후 'npm run release -- --promote ${tag}'로 정식판으로 바꿔요.`
  : `\n✔ ${tag}를 올렸어요. 앱을 켜면 업데이트 알림이 떠요.`)
