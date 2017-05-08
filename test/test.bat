@echo off

set PORT=COM1
set ARGS=%*

where curl > NUL
if "%ERRORLEVEL%"=="1" goto error-curl

:test
echo Testing remote serial port
echo.
echo API info
curl -X GET -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo List of serial ports
curl -X GET -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Get port %PORT% info
curl -X GET -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port/%PORT%
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Open port %PORT%
curl -X POST -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port/%PORT%/open
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Write data to port %PORT%
curl -X POST -H "Accept: application/json" -d "Hello World!" %ARGS% http://localhost:5147/api/v1/port/%PORT%/write
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Read data from port %PORT%
curl -X GET -H "Accept: text/plain" %ARGS% http://localhost:5147/api/v1/port/%PORT%/read
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Clear receive buffer on port %PORT%
curl -X DELETE -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port/%PORT%/read
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Check available bytes on port %PORT%
curl -X GET -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port/%PORT%/available
if "%ERRORLEVEL%"=="1" goto error-test
echo.
echo.
echo Close port %PORT%
curl -X POST -H "Accept: application/json" %ARGS% http://localhost:5147/api/v1/port/%PORT%/close
if "%ERRORLEVEL%"=="1" goto error-test
goto end

:error-test
curl -X POST -H "Accept: application/json" http://localhost:5147/api/v1/port/%PORT%/close > NUL
echo Test failed!
goto end

:error-curl
echo Cannot find curl.exe
goto end

:error
exit /b 1

:end