#!/usr/bin/env bash
# Builds the release APK. Run from the project folder.
# Needs: Node 20+, Java 17, Android SDK at $ANDROID_HOME, Python with piper-tts
# (only if narration lines changed). Output: dist/MyLittleLearningWorld.apk
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
npx tsx tools/collect-lines.ts
if python3 -c "import piper" 2>/dev/null; then python3 tools/gen-voice.py; fi
npx tsx tools/gen-manifest.ts
npx tsx tools/prepare-private.ts
npx tsc --noEmit
npx tsx --test tests/*.test.ts
EXPO_OFFLINE=1 CI=1 npx expo prebuild --platform android --no-install --clean
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
grep -q "java.installations.paths" android/gradle.properties || printf '\norg.gradle.java.installations.paths=%s\norg.gradle.java.installations.auto-download=false\norg.gradle.jvmargs=-Xmx6g -XX:MaxMetaspaceSize=1g\n' "$JAVA_HOME" >> android/gradle.properties
(cd android && ./gradlew --init-script ../tools/gradle-mirror.gradle assembleRelease -PreactNativeArchitectures=${ARCHS:-arm64-v8a,armeabi-v7a})
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/MyLittleLearningWorld.apk
ls -la dist/MyLittleLearningWorld.apk
