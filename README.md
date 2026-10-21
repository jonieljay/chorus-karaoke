# Chorus Karaoke

A complete, self-hosted karaoke website inspired by the "one host screen, everyone's phone is a remote" party flow. Chorus has its own name, visual design, source code, and branding.

**Important:** This is a working first version, not a hosted public website. You need to run it on your own computer/server. YouTube videos play inside the official YouTube embedded player on the host screen; the site does not download YouTube content, extract audio, or manufacture synchronized lyrics or scores.

## Included features

- Modern mobile-friendly homepage, host dashboard, and phone-sized guest remote
- Create a named room with a six-character join code
- Automatically generated, scannable room QR code
- Search YouTube karaoke tracks through the official YouTube Data API v3 (optional API key)
- Paste YouTube video links **without an API key**; automatic title lookup when available
- Shared real-time song queue across phones and the host screen
- Host can start, pause/resume, skip, reorder, and remove tracks; adjust volume and enter fullscreen
- Guests can add up to five queued songs each, remove their own queued songs, and send live emoji reactions
- Host can lock/unlock guest requests
- Browser refresh recovery for host and returning guests, with queues persisted to disk
- Automatic cleanup of rooms after 24 hours without updates
- No npm install, database service, or user account is required: Node.js alone runs the backend

## Windows quick start (easiest)

1. Install **Node.js 18 or newer** from https://nodejs.org/ . Node.js 20 or 22 is recommended.
2. Extract the ZIP to a folder, such as `C:\Karaoke\chorus-karaoke`.
3. Double-click **START-KARAOKE-WINDOWS.bat**.
4. Keep the command window open. On your host PC, open **http://localhost:3000**.
5. Create your party. The host dashboard shows your **QR code**. Other people scan the code with their phones.
6. To test the song queue right away, open a karaoke video on YouTube, copy its URL, and paste it into Chorus using the **Or paste a YouTube video URL** box. Click **Add**, then the host clicks **Start queue**.

Your PC and phones must be able to reach each other over the same Wi-Fi or local network. If Windows asks whether to allow Node.js on private networks, allow it. Public Wi-Fi networks sometimes block devices from communicating; try a regular home network instead.

When the host opens the site via `localhost`, the QR code automatically uses the computer's local IP address (for example `http://192.168.1.10:3000/room/XXXXXX?join=1`) instead of `localhost` so other devices can connect.

**No internet?** You can open the app locally, but YouTube playback and video title lookup require internet access. Remote phones need local-network access, and video playback needs internet.

## Mac / Linux quick start

```bash
cd chorus-karaoke
node server.js
```

Open `http://localhost:3000` in your browser. The terminal also prints the local Wi-Fi address.

## Optional: search songs within the website

Without configuration, the **paste-link flow already works**. To enable direct keyword search results inside Chorus:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Enable **YouTube Data API v3** for that project.
3. Under **APIs & Services > Credentials**, create an API key.
4. Copy `.env.example` and name the copy `.env` in the root of the project.
5. Edit `.env`, and set `YOUTUBE_API_KEY=YOUR_ACTUAL_API_KEY` (do not add spaces around `=`).
6. Restart the Node server. Search inside Chorus will now show embeddable YouTube video results.

Keep your API key private. It stays on the server and is not sent to browsers. Search consumes API quota. Configure API restrictions and billing/quota alerts suitable for your deployment. The app caches repeated searches for five minutes, and rate-limits users.

## Put your karaoke website online

This is a **Node.js app**, not a static HTML website. The easiest approach is a host supporting persistent Node services, such as Railway, Render (a Web Service), or a self-hosted Linux VPS. Do not upload only the `public` folder to a static site host: the room/queue/QR APIs would not work.

1. Upload the entire extracted folder to your hosting provider (or your private GitHub repository).
2. Configure the service to run `node server.js`. There is no build step and no `npm install` step.
3. Set environment variables:

   ```env
   PORT=3000
   PUBLIC_URL=https://your-karaoke-domain.com
   YOUTUBE_API_KEY=optional_api_key
   ```

   Some hosts automatically supply their own `PORT`; let the host's value take precedence.
4. Use HTTPS for the public domain (usually provided by your hosting service).
5. Open the public domain on your host PC/TV, create a room, and share its QR code with friends anywhere. Guests request songs, but playback happens only on the host screen.
6. **Persistence:** Mount a persistent volume for `data/` if you want room data to survive service rebuilds/redeployments. On hosts with ephemeral filesystems, room data can be lost when the instance is redeployed. This first version is intended for **one server instance**; a multi-instance production rollout would require shared storage and a shared events broker.

Alternatively, Docker can be used:

```bash
docker build -t chorus-karaoke .
docker run --rm -p 3000:3000 -v chorus-data:/app/data -e PUBLIC_URL=http://localhost:3000 chorus-karaoke
```

Change `PUBLIC_URL` to your actual reachable address before inviting phones. For local PC hosting, it is usually easiest to leave `PUBLIC_URL` unset and let the app discover the LAN address.

## How a karaoke party works

1. Open the homepage on the **host PC**, create a party, and keep that tab open.
2. The dashboard shows the host-side YouTube video, queue, and QR invitation.
3. Guests scan the QR code, enter a nickname, and use their phone to search/request songs, review the queue, and send reactions. Guest devices **do not play karaoke audio**.
4. Host clicks **Start queue** after songs are added. The official YouTube player loads the karaoke video on the main screen.
5. When YouTube signals the song has ended, Chorus moves to the next queued video. The host can skip, pause, change volume, or reorder requests.
6. If a browser blocks autoplay, the host must click **Play** once on the player; browsers enforce this behavior for sound playback.

## What this first version does not include

- AI voice scoring or microphone analysis (needs a separate audio/AI implementation)
- Separate synced lyric data (choose YouTube karaoke videos that already contain lyrics)
- Audio/pitch shifting or extracting YouTube audio
- Remote playback or singing from different locations
- Email accounts, payments, or moderation beyond room host controls
- DRM/age-restricted/non-embeddable YouTube video playback (YouTube may refuse to embed some videos)

YouTube's own ads and policies still apply. Use YouTube videos in compliance with [YouTube Terms of Service](https://www.youtube.com/t/terms) and [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service). YouTube videos must be displayed using the official embedded player.

## Troubleshooting

**QR scans but the phone cannot open the site:** make sure host and phone use the same local network. Check the PC firewall, guest Wi-Fi isolation, and whether the QR shows your PC's correct LAN IPv4 address. If your PC has multiple adapters or VPNs, set `PUBLIC_URL=http://YOUR_PC_LAN_IP:3000` in `.env` and restart.

**The video cannot play:** choose a video that permits YouTube embedding. Some music and age-restricted videos are blocked; try another karaoke version or use the **Open on YouTube** fallback. For playback, keep the host browser tab active.

**YouTube search shows a configuration message:** add your API key to `.env`, restart, and ensure the YouTube Data API v3 is enabled in the Google Cloud project. Paste-link requests work without search.

**The room says expired:** rooms are removed after 24 hours of inactivity. Start a new room.

**I closed the browser:** reopen the same room URL on the same host browser profile. Its host permissions are saved in local browser storage; private/incognito mode or clearing browser data can lose that key.

**No API calls after installing:** make sure `node server.js` is running. Opening `index.html` directly from your file explorer will not run the backend.

## Project structure

```
chorus-karaoke/
  server.js                Node HTTP server, API, SSE live sync, QR endpoint
  public/
    index.html             Browser document
    styles.css             Responsive design
    app.js                 Host + guest room interface
    favicon.svg            Chorus favicon
  vendor/QRCode/           QR matrix generator, bundled from an Apache/MIT-licensed package
  data/                    Server-created room persistence (do not commit rooms.json)
  tests/                   Node integration tests
  .env.example             Optional configuration sample
  Dockerfile               Docker deployment option
  START-KARAOKE-WINDOWS.bat Double-click Windows launcher
  package.json             Run/test scripts, no external dependencies
```

## Open-source notice

The bundled QR code generator is derived from the MIT-licensed "QRCode for JavaScript" by Kazuhiko Arase and the Apache-2.0-licensed qrcode-terminal distribution by Gord Tanner et al. Their copyright headers and the original package license are retained in `vendor/`. All original Chorus code is distributed under the MIT license in `LICENSE`.
