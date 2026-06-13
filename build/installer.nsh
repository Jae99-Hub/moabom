; 설치 시작 전 실행 중인 모아봄 프로세스를 강제 종료
!macro customInit
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM moabom.exe /T'
  Sleep 500
!macroend
