# Browser and Webcam Test Matrix

Test matrix for EchoCV desktop and mobile web experiences, covering browser engines, hardware profiles, camera and microphone configurations, and mobile responsive validation.

## Desktop Browser Support Matrix

EchoCV Live mode runs client-side face and posture models in the browser. Target support tiers are structured based on WebGPU availability, WebAssembly fallback, and MediaStream / MediaRecorder compatibility.

| Browser | Platform | Engine | Vision Runtime Target | MediaRecorder Output | Support Tier | Notes |
|---|---|---|---|---|---|---|
| Google Chrome (120+) | Windows, macOS, Linux | Chromium (Blink) | WebGPU (primary), CPU fallback | `audio/webm;codecs=opus`, `video/webm` | Tier 1 (Primary) | Full WebGPU hardware acceleration supported out of the box. Recommended practice browser. |
| Microsoft Edge (120+) | Windows, macOS | Chromium (Blink) | WebGPU (primary), CPU fallback | `audio/webm;codecs=opus`, `video/webm` | Tier 1 (Primary) | Matches Chrome runtime characteristics with Windows DirectX / Direct3D hardware acceleration. |
| Apple Safari (18+) | macOS 14, 15 | WebKit | WebGPU (primary), CPU fallback | `audio/mp4`, `video/mp4` | Tier 2 (Supported) | Uses WebKit MediaRecorder with MP4 container preference; WebGPU enabled on Apple Silicon. |
| Mozilla Firefox (125+) | Windows, macOS, Linux | Gecko | CPU / WASM fallback | `audio/webm;codecs=opus`, `video/webm` | Tier 2 (Supported) | WebGPU under standard flags may require CPU fallback. Graceful degradation verified. |

## Team Hardware and Device Profiles

Hardware configurations across team devices used for local verification, benchmarking, and cross-platform compatibility checks.

| Device ID | Device Type | Operating System | Processor | GPU / Acceleration | Webcam Specifications | Microphone | WebGPU Status |
|---|---|---|---|---|---|---|---|
| DEV-01 | Laptop (Training & AI Lead) | Windows 11 64-bit | Intel Core i7 / AMD Ryzen | NVIDIA GeForce RTX 3050 Ti (4 GB VRAM) | Integrated HD Webcam (720p/1080p @ 30 fps) | Built-in dual microphone array | Supported (Dedicated GPU) |
| DEV-02 | Laptop (Backend Lead) | macOS Sonoma / Sequoia | Apple Silicon (M-series) | Integrated Apple 8-core / 10-core GPU | FaceTime HD Camera (1080p @ 30 fps) | Integrated 3-mic array with directional beamforming | Supported (Metal WebGPU) |
| DEV-03 | Laptop (Frontend Lead) | Windows 11 / macOS | Intel Core i5 / Apple Silicon | Intel Iris Xe / Apple M-series GPU | Built-in HD Camera (720p @ 30 fps) | Built-in microphone | Supported (Integrated GPU) |
| DEV-04 | Laptop (UI/UX Lead) | macOS Sonoma | Apple Silicon (M-series) | Integrated Apple GPU | FaceTime HD Camera (1080p @ 30 fps) | Integrated microphone | Supported (Metal WebGPU) |
| DEV-05 | Laptop (QA Lead) | macOS / Windows 11 | Multi-core x86_64 / ARM | Integrated GPU | HD Webcam (720p/1080p @ 30 fps) | Built-in microphone | Supported |
| BASE-LOW | Reference Low-End Laptop | Windows 10/11 | Intel Core i3 / Celeron | Intel UHD Graphics 620 | USB Webcam / Built-in 720p (15-30 fps) | Basic mono microphone | CPU Fallback Mode |

## Webcam and Microphone Capture Constraints

Testing requirements for candidate media capture in live practice mode.

| Capability | Target Standard | Minimum Requirement | Fallback Behavior |
|---|---|---|---|
| Camera Resolution | 1920x1080 (1080p) or 1280x720 (720p) | 640x480 (VGA) | Scales down to 640x480 letterboxed input for model inference |
| Camera Frame Rate | 30 frames per second | 15 frames per second | Model inference frame skipping drops evaluation to 5-10 fps |
| Audio Channels | Mono or Stereo | Mono | Downmixed to mono 16 kHz for speech analysis |
| Audio Sampling Rate | 48 kHz or 44.1 kHz | 16 kHz | Resampled to 16 kHz prior to speech service transmission |
| Camera Permissions | Granted via browser prompt | Required | User prompted with instructional recovery banner |
| Microphone Permissions | Granted via browser prompt | Required | Live practice blocked if microphone access is denied |

## Mobile Browser Matrix (Responsive Views)

Live interview recording is designed for laptop webcams. Landing pages, authentication, session setup, and feedback reports must render responsively on mobile form factors.

| Device Category | Browser | Screen Widths | Orientation | Focus Test Areas |
|---|---|---|---|---|
| iPhone (iOS 17, 18) | Mobile Safari | 375 px, 390 px, 428 px | Portrait | Dynamic Island, top URL bar, bottom navigation safe area (`env(safe-area-inset-bottom)`), report score cards |
| iPhone (iOS 17, 18) | Chrome for iOS | 390 px, 414 px | Portrait, Landscape | Visual viewport resize behavior on form input focus |
| Android Flagship | Chrome Mobile | 412 px | Portrait | Fluid typography, pace meter readability, transcript timeline |
| Android Compact | Chrome Mobile | 360 px | Portrait | 16 px horizontal screen padding, button reachability without horizontal scroll |
| Social In-App WebViews | Instagram / WhatsApp In-App Browser | 375 px - 412 px | Portrait | Viewport unit handling (`100dvh` vs `100vh`), redirect handling |

## Verification Checklist

- [ ] Chrome 120+ renders live practice camera view with WebGPU enabled.
- [ ] Safari 18+ correctly initializes MediaRecorder with MP4 container format.
- [ ] Firefox falls back gracefully to CPU inference when WebGPU flags are disabled.
- [ ] Permission denial displays clear in-app guidance for resetting camera and mic access.
- [ ] Report page renders cleanly on 360 px mobile viewport with zero horizontal overflow.
- [ ] Safe area padding protects bottom actions on iPhone Safari in portrait orientation.
