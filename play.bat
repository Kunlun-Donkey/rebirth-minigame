@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 我重生了 · 命令行试玩

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 没找到 Node.js，请先安装 Node.js 18 以上版本：https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo 首次运行，正在安装依赖（npm install）……
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

:menu
cls
echo ============================================
echo   我重生了，这一世我将拿回属于我的一切
echo   命令行试玩（看逻辑用，界面以游戏内为准）
echo ============================================
echo   1. 继续试玩（读取上次的轮回存档）
echo   2. 清空存档，从第 1 世重新开始
echo   3. 自动模拟 2000 世，看数值统计
echo   4. 剧本校验（检查事件/条件写错）
echo   0. 退出
echo --------------------------------------------
echo   试玩中：输入编号回车选择，输入 q 保存退出
echo ============================================
set "choice="
set /p choice=请选择：

if "%choice%"=="1" call npm run play --silent & goto done
if "%choice%"=="2" call npm run play --silent -- --new & goto done
if "%choice%"=="3" call npm run sim --silent & goto done
if "%choice%"=="4" call npm run validate --silent & goto done
if "%choice%"=="0" exit /b 0
goto menu

:done
echo.
pause
goto menu
