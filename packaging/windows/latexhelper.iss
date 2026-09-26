#ifndef SourceDir
#error SourceDir is required
#endif
#ifndef AppUrl
#define AppUrl "http://localhost:38471/"
#endif
#ifndef OutputDir
#define OutputDir "..\\..\\release"
#endif
#ifndef AppVersion
#error AppVersion is required
#endif
[Setup]
AppId={{E9D39251-8F61-4DA6-A830-67E0585A8CA1}
AppName=LatexHelper Bridge
AppVersion={#AppVersion}
AppPublisher=LatexHelper
DefaultDirName={localappdata}\Programs\LatexHelper Bridge
DefaultGroupName=LatexHelper
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputDir}
OutputBaseFilename=LatexHelper-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\latexhelper-bridge.exe
[Files]
Source: "{#SourceDir}\latexhelper-bridge.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LatexHelperBridge"; ValueData: """{app}\latexhelper-bridge.exe"""; Flags: uninsdeletevalue
[Icons]
Name: "{group}\LatexHelper öffnen"; Filename: "{#AppUrl}"
Name: "{group}\LatexHelper Bridge starten"; Filename: "{app}\latexhelper-bridge.exe"
Name: "{group}\LatexHelper Bridge deinstallieren"; Filename: "{uninstallexe}"
[Run]
Filename: "{app}\latexhelper-bridge.exe"; Flags: nowait runhidden
Filename: "{#AppUrl}"; Description: "LatexHelper im Browser öffnen und als App installieren"; Flags: shellexec postinstall skipifsilent
[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM latexhelper-bridge.exe /T /F"; Flags: runhidden; RunOnceId: "StopLatexHelperBridge"
