# Media Assets

This directory contains all media files referenced by the project documentation.

## Structure

```
docs/media/
├── logo-banner.png          # Main logo banner for README
├── demos/                   # Feature demo videos (MP4, max 10MB each)
│   ├── 01-chat.mp4          # Multi-provider AI chat
│   ├── 02-artifacts.mp4     # Artifacts panel (code + preview)
│   ├── 03-branching.mp4     # Conversation branching
│   ├── 04-task-dag.mp4      # Task DAG editor
│   ├── 05-memory-map.mp4    # Memory map (knowledge graph)
│   ├── 06-context-pin.mp4   # Context pinning
│   ├── 07-voice-gesture.mp4 # Voice & gesture mode
│   ├── 08-widgets.mp4       # Widget builder
│   ├── 09-notepad-search.mp4# Notepad & semantic search
│   └── 10-settings-security.mp4 # Settings & security
└── screenshots/             # Static screenshots (optional)
```

## Adding Demo Videos

1. Record each feature as a short (15-30s) MP4 video
2. Name the file following the pattern: `XX-feature-name.mp4`
3. Place it in `docs/media/demos/`
4. Uncomment the corresponding `<video>` tag in `README.md`
5. Remove or keep the "Coming Soon" badge as needed

## Recommended Recording Settings

- Resolution: 1280x720 or 1920x1080
- Format: MP4 (H.264)
- Max file size: 10MB per video (GitHub limit)
- For larger files, use GitHub LFS or link to external hosting
