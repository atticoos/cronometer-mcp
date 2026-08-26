---
name: setup-avd
description: Bootstrap the Cronometer reverse-engineering environment from scratch on a new Mac — install Android emulator tooling, create the rootable Pixel8Rooted AVD, install the system CA, and sideload the Cronometer APK. Use when setting up a new machine, when the AVD/emulator is missing, when adb root fails, or when rebuilding the emulator rig after a wipe. NOT for per-session restores (use the capture-cronometer skill for that).
---

# Setting up the Android Emulator Rig from Scratch

One-time bootstrap for the Cronometer API capture environment on an
Apple Silicon Mac. For restoring a session on an existing rig, see the
`capture-cronometer` skill instead.

End state: a rooted Android 15 emulator (`Pixel8Rooted`) running the
Cronometer app, with the mitmproxy CA trusted at the OS level and the
traffic-redirection rules understood.

## 1. Install the emulator stack

If Android Studio is not installed:

```bash
brew install --cask android-studio
```

Verify the bundled JRE (several tools need Java; there is no system Java):

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # should print 17.x
```

Ensure `adb` and the emulator binary exist at `~/Library/Android/sdk/`
(Android Studio installs them on first run).

Add a stable `java` symlink for tools that shell out:

```bash
ln -sf "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java" /opt/homebrew/bin/java
```

## 2. Download a ROOTABLE system image

Only the `google_apis` image variant is rootable. The `google_apis_playstore`
variant is a production build — `adb root` refuses (`adbd cannot run as root in
production builds`) and there is no workaround on an emulator image.

```bash
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
# cmdline-tools (brew cask needs java symlinked from step 1 first):
brew install --cask android-commandlinetools
SDKM=/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin/sdkmanager
yes | $SDKM --sdk_root=$ANDROID_SDK_ROOT "system-images;android-35;google_apis;arm64-v8a"
```

Note: this sdkmanager's `avdmanager create avd` is broken on this setup
(`--sdk_root` rejected for create avd; without it, "Package path is not
valid"). Do NOT fight it — clone an existing AVD instead (step 3). If no AVD
exists yet, create any throwaway AVD via Android Studio's Device Manager GUI
once, then clone it.

## 3. Create the AVD by hand-cloning

```bash
cp ~/.android/avd/Pixel_8_API_35.ini ~/.android/avd/Pixel8Rooted.ini
cp -R ~/.android/avd/Pixel_8_API_35.avd ~/.android/avd/Pixel8Rooted.avd
sed -i '' 's/Pixel_8_API_35.avd/Pixel8Rooted.avd/g' ~/.android/avd/Pixel8Rooted.ini
sed -i '' 's|system-images/android-35/google_apis_playstore/arm64-v8a/|system-images/android-35/google_apis/arm64-v8a/|' \
  ~/.android/avd/Pixel8Rooted.avd/config.ini
rm -rf ~/.android/avd/Pixel8Rooted.avd/snapshots ~/.android/avd/Pixel8Rooted.avd/*.lock
```

Any existing AVD works as the clone source; the two edits that matter are the
path rename in the `.ini` and `image.sysdir.1` pointing at the google_apis
image in `config.ini`.

## 4. Boot writable and enable root + remount

`-writable-system` is REQUIRED at boot for `/system` modifications:

```bash
nohup ~/Library/Android/sdk/emulator/emulator -avd Pixel8Rooted \
  -writable-system -no-snapshot -no-boot-anim > /tmp/emulator.log 2>&1 & disown
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb root && sleep 3
adb disable-verity        # prints "Reboot the device for new settings"
adb reboot
adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
adb root && sleep 3
adb remount               # must print "Remount succeeded"
```

Order matters: `disable-verity` requires root, then reboot, then root again
before `remount`.

## 5. Install the mitmproxy CA

Generate it first if missing (any `mitmdump` run creates `~/.mitmproxy/`):

```bash
[ -f ~/.mitmproxy/mitmproxy-ca-cert.pem ] || (mitmdump --listen-port 18081 >/dev/null 2>&1 & sleep 3; pkill mitmdump)
```

Two locations, TWO different stores, BOTH needed:

```bash
HASH=$(openssl x509 -inform PEM -subject_hash_old -in ~/.mitmproxy/mitmproxy-ca-cert.pem | head -1)
cp ~/.mitmproxy/mitmproxy-ca-cert.pem /tmp/$HASH.0

# (a) legacy system store (some native SDK layers)
adb push /tmp/$HASH.0 /system/etc/security/cacerts/
adb shell chmod 644 /system/etc/security/cacerts/$HASH.0

# (b) Conscrypt APEX store — this is the one apps actually read on Android 14+.
#     /apex is read-only, so overlay it with tmpfs (this does NOT survive reboot;
#     the capture-cronometer skill re-applies it each session):
adb shell su 0 sh -c "
  rm -rf /data/local/tmp/ca-copy && mkdir -p /data/local/tmp/ca-copy
  cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/ca-copy/
  cp /system/etc/security/cacerts/$HASH.0 /data/local/tmp/ca-copy/
  mount -t tmpfs tmpfs /apex/com.android.conscrypt/cacerts
  cp /data/local/tmp/ca-copy/* /apex/com.android.conscrypt/cacerts/
  chown root:root /apex/com.android.conscrypt/cacerts/*
  chmod 644 /apex/com.android.conscrypt/cacerts/*
  chcon u:object_r:system_file:s0 /apex/com.android.conscrypt/cacerts/*
  rm -rf /data/local/tmp/ca-copy"
```

Verify: `adb shell ls /apex/com.android.conscrypt/cacerts/$HASH.0`

## 6. Install Cronometer

Get an **arm64-v8a** build — mandatory on Apple Silicon emulators:

- APKPure's XAPK is armeabi_v7a-only → `INSTALL_FAILED_NO_MATCHING_ABIS`. Do
  not use it.
- APKToy hosts a 4.44.3 arm64-v8a XAPK (used successfully), but its download
  button is gated behind reCAPTCHA — download manually in a browser.
- Alternatively ask the user to grab an arm64 build from any mirror.

Unpack and install (all splits must go in ONE transaction):

```bash
mkdir -p /tmp/xapk && unzip -o ~/Downloads/<file>.xapk -d /tmp/xapk
cd /tmp/xapk && ls   # identify: base apk + config.arm64_v8a.apk + config.en.apk + config.mdpi.apk
adb uninstall com.cronometer.android.gold 2>/dev/null  # if a different-signature copy exists
adb install-multiple com.cronometer.android.gold.apk config.arm64_v8a.apk config.en.apk config.mdpi.apk
```

Errors and fixes:
- `INSTALL_FAILED_NO_MATCHING_ABIS` → wrong-arch build, get arm64
- `INSTALL_FAILED_MISSING_SPLIT` → not all required config splits passed to
  `install-multiple`
- `INSTALL_FAILED_UPDATE_INCOMPATIBLE` → store-signed copy present; uninstall
  first (wipes app data)

## 7. Smoke test

```bash
adb shell monkey -p com.cronometer.android.gold -c android.intent.category.LAUNCHER 1
sleep 5 && adb shell pidof com.cronometer.android.gold   # PID = running
```

Then hand off to the `capture-cronometer` skill for the traffic-redirection
rules (iptables, adb reverse, sni_router, mitmdump) and the session restore
procedure. Log in via the app UI (or let a capture run collect the login flow).
