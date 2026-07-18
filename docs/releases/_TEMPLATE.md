<!-- title: {{VERSION}} — {{KEYWORDS}} -->
## GoPost {{VERSION}}

### 🖥 Desktop App

| Platform | Download |
|----------|----------|
| **macOS** | `GoPost-*.dmg` — open, drag to Applications |
| **Windows** | `GoPost.exe` — download and run |

> ⚠️ **macOS security warning?** The app isn't notarized yet (needs a $99/yr Apple Developer account).
> Here's how to open it — takes 10 seconds:
>
> 1. Open **Terminal** and run:
>    ```bash
>    xattr -dr com.apple.quarantine /Applications/GoPost.app
>    ```
> 2. Now open GoPost normally from Applications.
>
> *(This removes the quarantine flag that macOS adds to internet downloads.
> It's safe — you're explicitly telling macOS you trust this app.)*

> ⚠️ **Windows SmartScreen?** Click **More info** → **Run anyway**.
> Or right-click `GoPost.exe` → Properties → check **Unblock** → OK.

### ⌨ Command-Line Runner

| Platform | Download |
|----------|----------|
| macOS Apple Silicon | `gopost-darwin-arm64.tar.gz` |
| macOS Intel | `gopost-darwin-amd64.tar.gz` |
| Linux x86_64 | `gopost-linux-amd64.tar.gz` |
| Linux ARM64 | `gopost-linux-arm64.tar.gz` |
| Windows x86_64 | `gopost-windows-amd64.zip` |

### 📦 Package Managers

```bash
brew tap berksunduri/gopost && brew install gopost     # macOS
choco install gopost                                     # Windows
```

---

<details>
<summary><b>📋 What's New in {{VERSION}} — click to expand</b></summary>

{{WHATS_NEW}}

</details>

### 🔑 Checksums
See `checksums.txt` below.
