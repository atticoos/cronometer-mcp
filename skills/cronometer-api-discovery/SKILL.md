---
name: cronometer-api-discovery
description: Discover and reverse-engineer the Cronometer Android app's private API using a rooted emulator and mitmproxy, then upsert discovered endpoints into specs/cronometer-mobile.yaml. Use when asked to discover Cronometer API endpoints, capture Cronometer traffic, re-run the MITM rig, observe API requests from app actions, check if the API changed after an app update, or update/maintain the Cronometer API spec.
---

# Cronometer API Discovery

Reverse-engineers the private API at `https://mobile.cronometer.com/api/v2/` by
running the Android app in a rooted emulator and decrypting its traffic with
mitmproxy. Discovered endpoints are cataloged in `specs/cronometer-mobile.yaml`.

The Flutter app ignores both Android's system proxy and its network security
config (Dart does its own TLS), so plain proxying does not work. Traffic is
instead captured at the network layer: device iptables -> `adb reverse` tunnel
-> SNI router -> mitmproxy regular mode. The mitmproxy CA is trusted because it
is installed into the Conscrypt APEX certificate store (Android 14+).

## How the MITM works

The app's TLS traffic must be decrypted, which requires the client to trust
mitmproxy's certificate authority:

1. mitmproxy holds a local CA (`~/.mitmproxy/mitmproxy-ca-cert.pem`, generated
   on first run). The emulator has this CA installed as a trusted root (setup
   in the `setup-avd` skill: legacy `/system/etc/security/cacerts` store AND
   the Conscrypt APEX overlay at `/apex/com.android.conscrypt/cacerts` — the
   latter is what Android 14+ apps actually consult, and it evaporates on
   reboot, hence the per-session re-apply in Step 0).
2. Dart (Flutter) does NOT use Android's proxy settings or network security
   config, so traffic is not "proxied" — it is *redirected*. Device iptables
   sends all outbound tcp/443 to localhost:8080; `adb reverse` tunnels that to
   the host's SNI router (:9090); the router reads the ClientHello SNI and
   issues `CONNECT <host>:443` to mitmdump (:18081, regular proxy mode).
3. mitmproxy terminates TLS with its own cert for the target host (trusted
   because of step 1), talks really to the server, and logs plaintext flows.

Prerequisite if missing: `brew install mitmproxy` (provides `mitmdump`), then
generate the CA by running `mitmdump` once (any port) or see `setup-avd`
step 5.

## Rig components

| Piece | Location | Purpose |
|---|---|---|
| Emulator AVD | `Pixel8Rooted` (google_apis image, NOT google_apis_playstore) | Rootable Android 15 |
| SNI router | `skills/cronometer-api-discovery/scripts/sni_router.py` | Accepts tunneled :9090, sniffs ClientHello SNI, chains CONNECT to mitmproxy :18081 |
| Flow dumper | `skills/cronometer-api-discovery/scripts/dump_cronometer_flows.py` | mitmdump script printing cronometer.com requests/responses from a flow file |
| CA cert | `~/.mitmproxy/mitmproxy-ca-cert.pem` | SHA1 old subject hash name `c8750f0d.0` |
| Flow store | `/tmp/opencode/cronomer-flows3.mitm` | All captured flows; re-readable with `mitmdump -nr` |
| Captured dump | `/tmp/opencode/cronomer_api_dump2.txt` | Latest human-readable request/response dump |

## Step 0: Health check / restore

Run these checks first; re-apply whatever fails. The rig is stateful and
several pieces do NOT survive reboots.

1. `adb devices` — emulator present? If not:
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH="$JAVA_HOME/bin:$PATH"
   nohup ~/Library/Android/sdk/emulator/emulator -avd Pixel8Rooted -writable-system -no-snapshot -no-boot-anim &
   adb wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 2; done'
   adb root && sleep 3
   ```
2. **Conscrypt CA overlay** (LOST ON EVERY REBOOT — always re-apply):
   ```bash
   adb shell su 0 sh -c '
     rm -rf /data/local/tmp/ca-copy && mkdir -p /data/local/tmp/ca-copy
     cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/ca-copy/ 2>/dev/null
     [ -f /data/local/tmp/ca-copy/c8750f0d.0 ] || cp /system/etc/security/cacerts/c8750f0d.0 /data/local/tmp/ca-copy/
     mount -t tmpfs tmpfs /apex/com.android.conscrypt/cacerts
     cp /data/local/tmp/ca-copy/* /apex/com.android.conscrypt/cacerts/
     chown root:root /apex/com.android.conscrypt/cacerts/*
     chmod 644 /apex/com.android.conscrypt/cacerts/*
     chcon u:object_r:system_file:s0 /apex/com.android.conscrypt/cacerts/*
     rm -rf /data/local/tmp/ca-copy'
   ```
3. **iptables redirect** (also lost on reboot):
   ```bash
   adb shell su 0 sh -c 'iptables -t nat -F OUTPUT; iptables -t nat -A OUTPUT -p tcp --dport 443 -j REDIRECT --to-ports 8080'
   ```
4. **adb reverse tunnel** (lost when emulator restarts):
   ```bash
   adb reverse tcp:8080 tcp:9090
   ```
5. **Host processes** — `pgrep -lf 'sni_router|mitmdump'`. Start if missing:
   ```bash
   nohup python3 skills/cronometer-api-discovery/scripts/sni_router.py > /tmp/opencode/sni_router.log 2>&1 & disown
   nohup mitmdump --listen-port 18081 -w /tmp/opencode/cronomer-flows3.mitm > /tmp/opencode/mitmdump3.log 2>&1 & disown
   ```
   Always `nohup ... & disown` — plain background jobs die when the shell call ends.

## Step 1: Verify interception works

Verify the whole TLS path (tunnel + router + proxy + CA trust) with a real
handshake against the target host — must print `OK TLSv1.x`, NOT
`UNEXPECTED_MESSAGE`:

```bash
python3 - <<'EOF'
import ssl, socket
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
s = ctx.wrap_socket(socket.create_connection(("127.0.0.1", 9090), 8), server_hostname="mobile.cronometer.com")
print("OK", s.version())
EOF
```

Then launch the app (`adb shell monkey -p com.cronometer.android.gold -c
android.intent.category.LAUNCHER 1`) and confirm `mobile.cronometer.com`
connections complete in the mitmdump log.

## Step 2: Capture app actions

Ask the user to perform the actions in the emulator whose API calls you want
(login, diary edits, food search, ...). Nothing is captured without app
activity — do not wait on a silent capture.

## Step 3: Extract flows

```bash
mitmdump -n -r /tmp/opencode/cronomer-flows3.mitm -s skills/cronometer-api-discovery/scripts/dump_cronometer_flows.py > /tmp/opencode/dump.txt 2>&1
grep -E '^(GET|POST|PUT|DELETE) ' /tmp/opencode/dump.txt
```

Diff the endpoint list against the previous dump to isolate newly-triggered
APIs. The dump script filters to `cronometer.com` hosts only.

## Step 4: Upsert the spec

For each newly observed endpoint, add/upsert a path in
`specs/cronometer-mobile.yaml` with:
- method, path, the observed JSON request body schema (auth block required in
  every v2 body: `{userId, token, api, os, build, flavour}`)
- response schema from the observed 200 example
- an `example` from the actual captured payloads
- `x-observed-at` date and `x-confidence: verified` (captured) vs
  `inferred` (from static analysis only)

Mark unverified/inferred parts explicitly — never present guesses as facts.

## Endpoint surface cheat sheet

Verified live: login, check_user, get_diary, get_report, get_food(s),
get_myfoods, get_recent_foods, get_activity, get_streak,
get_fasting_with_limit, get_dashboard_config, get_dashboard_energy_data,
edit_target, set_pref, get_profile, check_messages, claim_message,
get_pro_client_prefs, add_braze_event_db.

Known from MCP server (scripts may exercise them): add_serving, add_food,
copy, find_food, get_biometrics, get_metrics, get_fasting_stats,
get_fasting_with_date_range, get_macro_schedules, get_macro_target_templates,
get_nutrients, get_nutrition_scores, set_complete.

Full static surface lives in the app binary: `strings libapp.so | grep
'^/[a-z]'` lists ~60 route candidates (mix of API paths and UI routes).

## Gotchas catalog

Read this before debugging anything — nearly all of these cost real time:

1. **Dart ignores the Android proxy AND network security config.** OkHttp/
   native SDK traffic follows the proxy; all Cronometer API traffic (dart:io)
   goes direct. Only network-layer interception works. Symptom of getting this
   wrong: tracker domains appear in mitmproxy but zero cronometer.com entries,
   not even failed handshakes.
2. **Android 14+ Conscrypt APEX cert store.** Apps read trusted CAs from
   `/apex/com.android.conscrypt/cacerts`, NOT `/system/etc/security/cacerts`.
   Installing only the latter gives: native SDKs decrypt fine, Dart fails
   `HandshakeException: UNEXPECTED_MESSAGE (handshake_client.cc:541)`. Fix =
   tmpfs overlay (Step 0.2), and it evaporates on reboot.
3. **google_apis_playstore images cannot be rooted** (`adb root` refuses,
   production build). Only the `google_apis` image variant works. The AVD was
   hand-cloned: copy `~/.android/avd/Pixel_8_API_35.*` to a new name and edit
   `image.sysdir.1` in `config.ini` — `avdmanager create avd` fails on this
   setup ("Flag --sdk_root not valid for create avd" / "Package path not
   valid").
4. **Emulator CPU ABI vs APK**: this app's XAPK from APKPure ships only
   armeabi_v7a; Apple Silicon emulators are arm64-v8a-only =>
   `INSTALL_FAILED_NO_MATCHING_ABIS`. Use an arm64-v8a build (APKToy has one;
   APKPure does not). `.xapk` files install via `unzip` +
   `adb install-multiple base.apk config.*.apk ...` (all splits together, or
   `INSTALL_FAILED_MISSING_SPLIT`). apktoy downloads are gated behind
   reCAPTCHA; uptodown/apkpure blocked or v7a-only.
5. **`-writable-system` flag is required** at emulator boot for `/system`
   remount (CA install). Also do `adb root` before `adb remount`.
6. **Port collisions on the host**: pick uncommon ports (9090/18081);
   8080/8081 collide with dev servers constantly. `lsof -iTCP:<port>` before
   binding.
7. **Background processes must use `nohup ... & disown`** or they die when the
   shell call that started them exits. Check with `pgrep -lf` before assuming
   something is running; stale zombies on the same port cause maddening
   non-determinism (connections randomly handled by old vs new code).
8. **stdout of nohup'd processes is block-buffered** — log files lag reality.
   Trust the flow file (`ls -la`, replay it) over the log tail for freshness.
9. **Transparent mitmproxy mode does not work unprivileged on macOS** (needs
   root pfctl; sudo unavailable). Hence the SNI-router-into-regular-mode
   design. `connection_strategy=lazy` does not save you — pf is queried at
   accept time regardless.
10. **DNAT to 10.0.2.2 loses original destination** (slirp hairpin NAT);
    mitmproxy transparent mode then falls back to a default address and every
    flow logs as `mitmproxy.org`. That is why the SNI router exists.
11. **One bad line in a custom relay poisons everything with the same error as
    unrelated bugs.** A relay that echoes the ClientHello back produces
    exactly BoringSSL's `UNEXPECTED_MESSAGE`, identical to a cert-trust
    failure. Debug relays by hexdumping the first bytes returned for a known
    ClientHello (must be a ServerHello, `16030300...`, not `16030105f1 01...`
    echo).
12. **Kill -9 your own zombies**: after ANY router/script edit, `pkill -f
    sni_router` and verify with `pgrep` + `lsof -iTCP:9090` that exactly one
    fresh process owns the port before testing.
13. **`adb shell` heredocs cannot contain `adb` commands** (not on device
    PATH) — run device commands via separate `adb shell su 0 sh -c '...'`
    invocations.
14. **mitmdump flags**: flow saving is `-w file` (NOT `--save-flows`), reading
    is `-n -r file`. Custom scripts via `-s script.py`; the script filters by
    host, so other traffic does not pollute the dump.
15. **Passwords appear in captured login bodies.** Dumps containing
    `api/v2/login` requests hold the account password in plaintext — treat
    dump files as secrets, never commit them.
16. **`adb root` + emulator restart order**: after `disable-verity` you must
    reboot before `remount` succeeds; after any emulator restart re-run adb
    root, the CA overlay, iptables, and adb reverse (Step 0).
17. **App data persists across our reinstalls only per-signature**: our
    re-signed APKs cannot install over the store-signed app
    (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`); uninstall first (wipes app data,
    user must log in again).
