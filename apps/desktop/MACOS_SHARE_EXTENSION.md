# macOS video sharing

Burrowise includes a macOS Share Extension named **Save to Burrowise**. Local
ad-hoc development builds fall back to the extension's sandbox container when
an Apple-provisioned App Group container is unavailable.

The extension accepts MP4, MOV, and M4V movies, copies them into the shared App
Group inbox, and opens Burrowise. The desktop app preserves each original under
`sources/videos/`, extracts an M4A audio track with macOS `avconvert`, transcribes
it with the selected Apple Speech or Parakeet provider, writes `source.md`, and
rebuilds the local search index. An extraction or transcription failure never
removes the original.

## Apple signing requirement

Production signing must enable the App Groups capability for both bundle IDs:

- `ai.recursivesolutions.secondbrain`
- `ai.recursivesolutions.secondbrain.share`

Both targets must include `group.ai.recursivesolutions.secondbrain`. This is
required by macOS for the sandboxed Share Extension and the desktop app to use
the same durable inbox.

## Build

`npm run tauri:release` builds the `.app`, compiles and embeds the `.appex`, signs
the nested extension before the containing app, verifies both signatures, and
then creates the DMG. The app must remain installed in `/Applications` for
Launch Services to keep the Share Extension registered reliably.

After first installation, **Save to Burrowise** can be enabled under **System
Settings → General → Login Items & Extensions → Sharing** if macOS does not
enable it automatically.
