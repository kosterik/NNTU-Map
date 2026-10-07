import os
import sys
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
JAVA_HOME = Path(r"C:\Program Files\Android\openjdk\jdk-21.0.8")
SDK_DIR = Path(r"C:\Program Files (x86)\Android\android-sdk")
BUILD_TOOLS_DIR = SDK_DIR / "build-tools" / "36.0.0"
PLATFORM_JAR = SDK_DIR / "platforms" / "android-35" / "android.jar"

AAPT2 = BUILD_TOOLS_DIR / "aapt2.exe"
D8 = BUILD_TOOLS_DIR / "d8.bat"
ZIPALIGN = BUILD_TOOLS_DIR / "zipalign.exe"
APKSIGNER = BUILD_TOOLS_DIR / "apksigner.bat"

JAVAC = JAVA_HOME / "bin" / "javac.exe"
KEYTOOL = JAVA_HOME / "bin" / "keytool.exe"
JAR = JAVA_HOME / "bin" / "jar.exe"

BUILD_TMP = BASE_DIR / "android" / "build_tmp"
OUTPUT_APK = BASE_DIR / "NNTU_Map.apk"
KEYSTORE = BASE_DIR / "android" / "nntu.keystore"
KEYSTORE_PASS = "nntu123"
KEY_ALIAS = "nntu"

def run(cmd, env=None, cwd=None):
    print(f"\n[EXEC] {' '.join(str(c) for c in cmd)}")
    cur_env = os.environ.copy()
    cur_env["JAVA_HOME"] = str(JAVA_HOME)
    cur_env["PATH"] = f"{JAVA_HOME / 'bin'};{cur_env.get('PATH', '')}"
    if env:
        cur_env.update(env)
    res = subprocess.run(cmd, env=cur_env, cwd=cwd or str(BASE_DIR), capture_output=True, text=True)
    if res.returncode != 0:
        print("[ERROR STDOUT]:", res.stdout)
        print("[ERROR STDERR]:", res.stderr)
        raise RuntimeError(f"Command failed with code {res.returncode}")
    if res.stdout.strip():
        print("[STDOUT]:", res.stdout[:500])
    return res

def main():
    print("=== Starting NNTU Map APK Standalone Build ===")
    if BUILD_TMP.exists():
        shutil.rmtree(BUILD_TMP, ignore_errors=True)
    BUILD_TMP.mkdir(parents=True, exist_ok=True)

    gen_dir = BUILD_TMP / "gen"
    classes_dir = BUILD_TMP / "classes"
    dex_dir = BUILD_TMP / "dex"
    gen_dir.mkdir(parents=True, exist_ok=True)
    classes_dir.mkdir(parents=True, exist_ok=True)
    dex_dir.mkdir(parents=True, exist_ok=True)

    res_dir = BASE_DIR / "android" / "app" / "src" / "main" / "res"
    manifest = BASE_DIR / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    assets_dir = BASE_DIR / "android" / "app" / "src" / "main" / "assets"
    java_dir = BASE_DIR / "android" / "app" / "src" / "main" / "java"

    # Step 0: Sync assets
    print("\n--- Step 0: Sync latest src and app_assets to Android assets ---")
    dest_src = assets_dir / "src"
    dest_app_assets = assets_dir / "app_assets"
    shutil.rmtree(dest_src, ignore_errors=True)
    shutil.copytree(BASE_DIR / "src", dest_src)

    shutil.rmtree(dest_app_assets, ignore_errors=True)
    shutil.copytree(BASE_DIR / "app_assets", dest_app_assets)
    schedules_dir = dest_app_assets / "schedules"
    if schedules_dir.exists():
        for f in list(schedules_dir.iterdir()):
            if not f.name.isascii():
                f.unlink()

    # Step 1: Compile Android resources
    print("\n--- Step 1: aapt2 compile resources ---")
    compiled_res_zip = BUILD_TMP / "compiled_res.zip"
    run([str(AAPT2), "compile", "--dir", str(res_dir), "-o", str(compiled_res_zip)])

    # Step 2: aapt2 link
    print("\n--- Step 2: aapt2 link ---")
    unaligned_apk = BUILD_TMP / "unaligned.apk"
    run([
        str(AAPT2), "link",
        "-o", str(unaligned_apk),
        "-I", str(PLATFORM_JAR),
        "--manifest", str(manifest),
        "--min-sdk-version", "26",
        "--target-sdk-version", "34",
        "--version-code", "3",
        "--version-name", "2.0.1",
        "--no-compress",
        "-A", str(assets_dir),
        "--java", str(gen_dir),
        "--auto-add-overlay",
        str(compiled_res_zip)
    ])

    # Step 3: Find Java sources & compile with javac
    print("\n--- Step 3: Compile Java sources with javac ---")
    java_files = list(java_dir.rglob("*.java")) + list(gen_dir.rglob("*.java"))
    java_file_paths = [str(p) for p in java_files]
    print(f"Found {len(java_file_paths)} Java files to compile.")

    run([
        str(JAVAC),
        "-encoding", "UTF-8",
        "-source", "1.8",
        "-target", "1.8",
        "-cp", str(PLATFORM_JAR),
        "-d", str(classes_dir),
        *java_file_paths
    ])

    # Step 4: Convert classes to dex with d8
    print("\n--- Step 4: Convert classes to classes.dex with d8 ---")
    class_files = [str(p) for p in classes_dir.rglob("*.class")]
    print(f"Found {len(class_files)} .class files for dex.")
    run([
        str(D8),
        "--lib", str(PLATFORM_JAR),
        "--output", str(dex_dir),
        *class_files
    ])

    classes_dex = dex_dir / "classes.dex"
    if not classes_dex.exists():
        raise FileNotFoundError(f"classes.dex was not generated at {classes_dex}")
    print(f"Generated classes.dex ({classes_dex.stat().st_size} bytes)")

    # Step 5: Add classes.dex into unaligned.apk
    print("\n--- Step 5: Add classes.dex into unaligned.apk ---")
    run([
        str(JAR),
        "uf",
        str(unaligned_apk),
        "-C", str(dex_dir),
        "classes.dex"
    ])

    # Step 6: zipalign
    print("\n--- Step 6: zipalign ---")
    aligned_apk = BUILD_TMP / "aligned.apk"
    run([
        str(ZIPALIGN),
        "-f",
        "4",
        str(unaligned_apk),
        str(aligned_apk)
    ])

    # Step 7: Create keystore if not exists
    if not KEYSTORE.exists():
        print("\n--- Step 7: Generate Keystore ---")
        run([
            str(KEYTOOL),
            "-genkeypair",
            "-v",
            "-keystore", str(KEYSTORE),
            "-alias", KEY_ALIAS,
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-storepass", KEYSTORE_PASS,
            "-keypass", KEYSTORE_PASS,
            "-dname", "CN=kosterik, OU=NNTU, O=NNTU, L=NizhnyNovgorod, ST=NN, C=RU"
        ])

    # Step 8: Sign APK with apksigner
    print("\n--- Step 8: Sign APK with apksigner ---")
    if OUTPUT_APK.exists():
        OUTPUT_APK.unlink()

    run([
        str(APKSIGNER),
        "sign",
        "--ks", str(KEYSTORE),
        "--ks-pass", f"pass:{KEYSTORE_PASS}",
        "--ks-key-alias", KEY_ALIAS,
        "--key-pass", f"pass:{KEYSTORE_PASS}",
        "--out", str(OUTPUT_APK),
        str(aligned_apk)
    ])

    # Step 9: Verify APK
    print("\n--- Step 9: Verify signed APK ---")
    run([
        str(APKSIGNER),
        "verify",
        "-v",
        str(OUTPUT_APK)
    ])

    apk_size = OUTPUT_APK.stat().st_size
    print(f"\n========================================================")
    print(f" SUCCESS! Android APK built: {OUTPUT_APK}")
    print(f" APK Size: {apk_size:,} bytes ({apk_size / (1024*1024):.2f} MB)")
    print(f"========================================================")

if __name__ == "__main__":
    main()
