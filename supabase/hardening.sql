-- 모아봄 Supabase 점검·보강 (Supabase 대시보드 → SQL Editor에 붙여 넣고 실행)
-- 앱 코드는 이것 없이도 동작한다. 실행하면 다른 기기 간 동기화가 더 튼튼해진다.

-- ① 정책 확인 (읽기만 함)
--    결과의 qual / with_check가 모두 (auth.uid() = user_id) 이어야 한다.
--    'true'나 auth.role() = 'authenticated' 같은 넓은 조건이 있으면 남의 기록이 보일 수 있으니 알려 주세요.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- ② 바뀐 시각(updated_at) 자동 기록
--    어느 기기·웹에서 고치든 서버가 시각을 남겨, 다른 기기가 '이 시각 이후 바뀐 것'으로 빠짐없이 받아 간다.
--    (예전 웹 버전이 넣은 명대사는 시각이 비어 있어 데스크톱 앱이 받아 가지 못했음)
create or replace function public.moabom_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

alter table public.quotes alter column updated_at set default now();
-- 비어 있던 명대사는 지금 시각으로 → 다음 동기화 때 데스크톱 앱이 받아 감
update public.quotes set updated_at = now() where updated_at is null;

drop trigger if exists moabom_touch_items on public.items;
create trigger moabom_touch_items
  before insert or update on public.items
  for each row execute function public.moabom_touch_updated_at();

drop trigger if exists moabom_touch_quotes on public.quotes;
create trigger moabom_touch_quotes
  before insert or update on public.quotes
  for each row execute function public.moabom_touch_updated_at();
