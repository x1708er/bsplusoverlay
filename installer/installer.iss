[Setup]
AppName=BSPlus Overlay
AppVersion=1.0
DefaultDirName={autopf}\BSPlusOverlay
DefaultGroupName=BSPlus Overlay
OutputBaseFilename=BSPlusOverlay-Setup-Windows
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\BSPlusOverlay\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\BSPlus Overlay";         Filename: "{app}\BSPlusOverlay.exe"
Name: "{commondesktop}\BSPlus Overlay"; Filename: "{app}\BSPlusOverlay.exe"
Name: "{group}\Deinstallieren";         Filename: "{uninstallexe}"

[Run]
Filename: "{app}\BSPlusOverlay.exe"; Description: "BSPlus Overlay starten"; Flags: postinstall nowait skipifsilent
