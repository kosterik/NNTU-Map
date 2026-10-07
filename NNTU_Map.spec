# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['desktop/app_desktop.py'],
    pathex=['desktop'],
    binaries=[],
    datas=[
        ('src', 'src'),
        ('app_assets', 'app_assets'),
        ('desktop/notify.ps1', 'desktop'),
    ],
    hiddenimports=['webview', 'clr', 'pythonnet', 'webview.platforms.winforms'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='NNTU_Map',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['app_assets/icon.ico'],
)
