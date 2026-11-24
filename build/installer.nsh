!macro customInstall
  WriteRegStr HKCU "Software\Classes\Dafeiyu.Notebook.dfy" "" "大肥鱼笔记"
  WriteRegStr HKCU "Software\Classes\Dafeiyu.Notebook.dfy\DefaultIcon" "" "$INSTDIR\resources\app\app.ico,0"
  WriteRegStr HKCU "Software\Classes\Dafeiyu.Notebook.dfy\shell\open\command" "" '$\"$INSTDIR\DafeiyuNotebook.exe$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\.dfy" "" "Dafeiyu.Notebook.dfy"
  WriteRegStr HKCU "Software\Classes\.dfy\ShellNew" "FileName" "$INSTDIR\resources\app\大肥鱼笔记.dfy"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Applications\DafeiyuNotebook.exe"
  DeleteRegKey HKCU "Software\Classes\Dafeiyu.Notebook.dfy"
  ReadRegStr $0 HKCU "Software\Classes\.dfy" ""
  StrCmp $0 "Dafeiyu.Notebook.dfy" 0 done
    DeleteRegKey HKCU "Software\Classes\.dfy"
  done:
!macroend
