# My Little Learning World

A personal, offline Android app that teaches one four-year-old her PVS
curriculum: 5 worlds, 9 lessons, each in 7 stages (Welcome, Listen and Learn,
See and Explore, Practice, Sing and Remember, Little Exam, Celebration).

- Expo SDK 55, React Native 0.83, TypeScript, Reanimated 4, Gesture Handler, SVG
- expo-sqlite for progress, expo-audio for narration and songs, expo-speech as fallback
- No internet permission, no cloud backup, no accounts, no ads, no analytics

## Build the APK

```bash
./tools/build-apk.sh
```

The script regenerates narration clips if needed, runs the type check and the
tests, then builds `dist/MyLittleLearningWorld.apk`. Requirements: Node 20+,
Java 17, the Android SDK (platform 36, build-tools 36, NDK 27.1), and
`pip install piper-tts` plus the voice model in `/opt/piper` only when a
spoken line has changed.

## Private family media

`private/` (never committed) holds the child's name, her photo with
body-part markers and the parent's name recording. `tools/prepare-private.ts`
bundles them into the build; without that folder the app builds with no name
or photo and the parent adds them in the parent area.

## Layout

| Path | What |
| --- | --- |
| `src/content/` | Lessons, question bank (145 questions), pictures, every spoken phrase |
| `src/engine/` | Exam selection, adaptive revision (5 review boxes, 4 levels), marker maths |
| `src/games/` | The game engine: 12 game types plus brushing, sun, breathing, story activities |
| `src/screens/` | Child screens, the lesson player, the PIN-protected parent dashboard |
| `src/audio/` | Narration (parent recording, then bundled clip, then text-to-speech), music, effects |
| `src/db/` | SQLite schema and repository (in-memory version for the browser checks) |
| `tools/` | Voice clip generator (Piper), song and sound synthesiser, build and screen-check scripts |
| `tests/` | Content and engine tests (`npx tsx --test tests/*.test.ts`) |

Navigation is a small custom stack in `src/store.ts` rather than Expo Router:
the app has no URLs or deep links, and a single stack keeps the child's
navigation simple and predictable.

## Checks

- `npx tsx --test tests/*.test.ts`: curriculum wording preserved, 15+ questions
  per lesson in all four kinds, valid games, every spoken line has a clip, exams
  never use untaught lessons, mock exam rules, mastery levels, marker alignment.
- `node tools/ui-sweep.js` and `node tools/ui-interact.js` (after
  `npx expo export --platform web`): open every screen at tablet size and play
  the games with real taps and drags.
