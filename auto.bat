@echo off
chcp 65001
setlocal
set "SRC=%~dp0scripts"
set "DEST=C:\Users\PC_User\Desktop\GItMatrix\MineProject\devServer\worlds\Bedrock level\behavior_packs\dev\scripts"

:loop
robocopy "%SRC%" "%DEST%" /MOVE /E

echo scriptsフォルダの中身を移動しました。
ping -n 6 127.0.0.1 > nul
goto loop

endlocal
