# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/ukrsyrianfalcon-spec/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/ukrsyrianfalcon-spec/PlayGround)

- 🎮 [Open the project](https://omgithub.com/ukrsyrianfalcon-spec/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=ukrsyrianfalcon-spec%2FPlayGround).
- 💻 [Explore the source](https://github.com/ukrsyrianfalcon-spec/PlayGround).
- 🛠️ [Check build runs](https://github.com/ukrsyrianfalcon-spec/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/ukrsyrianfalcon-spec/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/ukrsyrianfalcon-spec).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## SKYHOOK — Flappy, rehooked

A touch-first arcade game that keeps Flappy Bird's timing and adds a pendulum grappling hook.

- **Hold** anywhere on the playfield to fire the hook at the highlighted ring.
- **Keep holding** to reel in; **release** to let go and fling through the neon gate.
- Hitting a tower or the street ends the run. Each gate is one point.
- Best score and sound preference are saved locally.

### Optional tilt steering

Open the menu or pause screen and turn on **Tilt steering**. On iOS, the page asks for motion permission in that tap (required by Safari); if it is denied, touch controls keep working. On other devices it calibrates the first couple of seconds of motion automatically. If the direction feels backwards, enable **Invert tilt** on the pause screen.

### Run it

The project is a static site. From this directory:

```sh
PORT=3002 ./start.sh
```

Then open <http://localhost:3002>. The game is a single canvas page with no build step and no external assets — all art and audio are generated at runtime.

