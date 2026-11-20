import React, { useEffect, useState } from 'react';
import { AppState, BackHandler, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { FONT_FILES } from './components/text';
import { useApp } from './store';
import { initAudio, stopAll } from './audio/audio';
import { colors } from './theme';
import { HomeScreen, WorldsScreen, WorldScreen, PlayScreen, GameScreen, RevisionScreen, ExamsScreen, ExamScreen, RewardsScreen, DoneScreen, SongsScreen, CelebrationOverlay } from './screens/child';
import { LessonScreen } from './screens/lesson';
import { ParentGate, ParentScreen } from './screens/parent';
import { Screen } from './components/ui';
import { GameView } from './games';

// If anything goes wrong, show a calm page with the details instead of closing.
function ErrorPage({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = error as any;
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>Oops! Something went wrong.</Text>
      <Text style={{ fontSize: 18, color: colors.ink }}>Please tell the grown-up. Tap the button to try again.</Text>
      <Pressable onPress={onRetry} style={{ backgroundColor: colors.leaf, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 18 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>Try again</Text>
      </Pressable>
      <ScrollView style={{ maxHeight: 240, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 12, padding: 12 }}>
        <Text selectable style={{ fontSize: 13, color: '#B91C1C' }}>{String(e?.message ?? e)}{'\n'}{String(e?.stack ?? '').slice(0, 1500)}</Text>
      </ScrollView>
    </View>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { console.error('[app] screen error', error); }
  render() {
    if (this.state.error) return <ErrorPage error={this.state.error} onRetry={() => { useApp.getState().home(); this.setState({ error: null }); }} />;
    return this.props.children;
  }
}

function Router() {
  const route = useApp((s) => s.stack[s.stack.length - 1]);
  const depth = useApp((s) => s.stack.length);
  const key = `${depth}-${JSON.stringify(route)}`;
  switch (route.name) {
    case 'home': return <HomeScreen key={key} />;
    case 'worlds': return <WorldsScreen key={key} />;
    case 'world': return <WorldScreen key={key} worldId={route.world} />;
    case 'lesson': return <LessonScreen key={key} lessonId={route.lesson} startStage={route.stage} />;
    case 'play': return <PlayScreen key={key} />;
    case 'game': return <GameScreen key={key} lessonId={route.lesson} index={route.index} />;
    case 'photo': return (
      <Screen key={key} title="My Body, My Picture">
        <GameView activity={{ type: 'photoBody', title: 'My Body, My Picture! Tap a part of your body.', mode: route.mode }} lessonId="L1" onDone={() => {}} />
      </Screen>
    );
    case 'revision': return <RevisionScreen key={key} />;
    case 'exams': return <ExamsScreen key={key} />;
    case 'exam': return <ExamScreen key={key} mode={route.mode as any} lesson={route.lesson} />;
    case 'rewards': return <RewardsScreen key={key} />;
    case 'songs': return <SongsScreen key={key} />;
    case 'done': return <DoneScreen key={key} />;
    case 'parentGate': return <ParentGate key={key} />;
    case 'parent': return <ParentScreen key={key} />;
  }
}

// Browser build only: lets the automated screen check navigate directly.
if (Platform.OS === 'web') { (globalThis as any).__app = useApp; (globalThis as any).__bank = require('./content/questions').questions; (globalThis as any).__items = require('./content/items').items; }

export default function App() {
  const loaded = useApp((s) => s.loaded);
  const [fontsReady, fontError] = useFonts(FONT_FILES);
  const [startError, setStartError] = useState<unknown>(null);
  useEffect(() => {
    try { useApp.getState().load(); } catch (e) { console.error('[app] start-up failed', e); setStartError(e); }
    initAudio().catch((e) => console.error('[app] audio init failed', e));
    // Count learning time while the app is open on a child screen.
    const t = setInterval(() => {
      const s = useApp.getState();
      const r = s.stack[s.stack.length - 1].name;
      if (AppState.currentState === 'active' && r !== 'parent' && r !== 'parentGate' && r !== 'done') s.tickSeconds(10);
    }, 10000);
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active') stopAll(); });
    const bh = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useApp.getState();
      if (s.stack.length > 1) { stopAll(); s.back(); return true; }
      return true; // never leave the app from Home by accident
    });
    return () => { clearInterval(t); sub.remove(); bh.remove(); };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.cream }}>
      <SafeAreaProvider>
        <StatusBar hidden />
        <ErrorBoundary>
          {startError ? <ErrorPage error={startError} onRetry={() => { try { useApp.getState().load(); setStartError(null); } catch (e) { setStartError(e); } }} />
            : loaded && (fontsReady || fontError) ? <Router /> : <View style={{ flex: 1, backgroundColor: colors.cream }} />}
          <CelebrationOverlay />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
