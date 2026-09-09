@echo off
echo ==========================================
echo    GERANDO APK DO FIIS GUARD (PRODUCAO)
echo ==========================================
echo.

cd android
set NODE_ENV=production
set CI=1

echo Limpando builds anteriores...
if exist ".gradle" rd /s /q .gradle
if exist "app\.cxx" rd /s /q app\.cxx
if exist "app\build" rd /s /q app\build
call gradlew clean

echo.
echo Iniciando compilacao final (Isso pode demorar alguns minutos)...
call gradlew assembleRelease

echo.
echo Finalizando e renomeando...

set "PASTA_REL=app\build\outputs\apk\release"
set "ARQ_ORIGINAL=%PASTA_REL%\app-release.apk"
set "ARQ_FINAL_NOME=FIIs Guard.apk"
set "ARQ_FINAL_PATH=%PASTA_REL%\%ARQ_FINAL_NOME%"

if exist "%ARQ_ORIGINAL%" (
    echo [OK] Arquivo gerado com sucesso.
    if exist "%ARQ_FINAL_PATH%" del /f /q "%ARQ_FINAL_PATH%"
    ren "%ARQ_ORIGINAL%" "%ARQ_FINAL_NOME%"

    echo.
    echo [SUCESSO] APK pronto: %ARQ_FINAL_NOME%

    echo Criando atalho na sua Area de Trabalho...
    set "ORIGEM_ABS=%CD%\%ARQ_FINAL_PATH%"
    powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'FIIs Guard.lnk')); $s.TargetPath = '%ORIGEM_ABS%'; $s.Save()"

    echo Abrindo a pasta de destino...
    explorer "%PASTA_REL%\"
) else (
    if exist "%ARQ_FINAL_PATH%" (
        echo [SUCESSO] O APK ja existe. Atualizando atalho...
        set "ORIGEM_ABS=%CD%\%ARQ_FINAL_PATH%"
        powershell -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'FIIs Guard.lnk')); $s.TargetPath = '%ORIGEM_ABS%'; $s.Save()"
        explorer "%PASTA_REL%\"
    ) else (
        echo.
        echo [ERRO] O arquivo nao foi gerado. Verifique as mensagens de erro acima.
    )
)

echo.
echo Processo concluido! Verifique sua Area de Trabalho.
echo Pressione qualquer tecla para fechar...
pause
