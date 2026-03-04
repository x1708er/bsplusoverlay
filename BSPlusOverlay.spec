# -*- mode: python ; coding: utf-8 -*-
import certifi

a = Analysis(
    ['start.py'],
    pathex=[],
    datas=[
        ('index.html',    '.'),
        ('settings.html', '.'),
        ('css',           'css'),
        ('js',            'js'),
        (certifi.where(), 'certifi'),
    ],
    hiddenimports=['server', 'updater', 'certifi'],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [],
    exclude_binaries=True,
    name='BSPlusOverlay',
    console=True,
    icon='NONE',
)
coll = COLLECT(exe, a.binaries, a.datas,
    name='BSPlusOverlay',
)
