# Solo Leveling Mobile

Native Android client for the Solo Leveling server. The app reads penalty state from the server and blocks configured social media apps with an AccessibilityService while the daily penalty is active.

## Server connection

The mobile app does not read SQLite directly. It calls:

- `GET /api/daily`
- `POST /api/daily/flush`

For a physical phone on the same Wi-Fi, run the server with `API_HOST=0.0.0.0` and set the mobile server URL to the PC LAN address, for example `http://192.168.1.40:3333`.

For Android Emulator, use the default URL:

```text
http://10.0.2.2:3333
```

## API token

`API_HOST=0.0.0.0` exposes the API to everything on the network, so the server should also be started with `API_AUTH_TOKEN` set (see the root README). Paste the same value into **Settings → API Token** in the app; it is sent as an `x-api-token` header on every request. Leave the field blank when the server runs unauthenticated on loopback.

## Blocking model

Android does not let a normal app uninstall or truly own Instagram/TikTok. This app uses AccessibilityService:

1. Detect foreground package.
2. If server penalty is active and the package is blocked, send the user home.
3. Show the Solo Leveling penalty screen.
4. Stop blocking after `/api/daily/flush` clears the penalty.

The user must enable `Solo Leveling App Blocker` in Android Accessibility settings.

## Build

Open `mobile/` in Android Studio and run the `app` configuration.
