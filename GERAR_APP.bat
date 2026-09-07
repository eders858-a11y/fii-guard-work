@echo off
echo ==========================================
echo    GERANDO APK DO FII GUARD (PRODUCAO)
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
if exist "app\build\outputs\apk\release\app-release.apk" (
    echo [SUCESSO] O APK foi gerado com sucesso!
    echo Abrindo a pasta do arquivo...
    explorer "app\build\outputs\apk\release\"
) else (
    echo [ERRO] O arquivo nao foi encontrado. Verifique as mensagens acima.
)

echo.
echo Pressione qualquer tecla para fechar...
pause