import React, { useEffect } from 'react';
import { AppState, BackHandler, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useApp } from './store';
import { initAudio, stopAll } from './audio/audio';
import { colors } from './theme';
import { HomeScreen, WorldsScreen, WorldScreen, PlayScreen, GameScreen, RevisionScreen, ExamsScreen, ExamScreen, RewardsScreen, DoneScreen, SongsScreen, CelebrationOverlay } from './screens/child';
import { LessonScreen } from './screens/lesson';
import { ParentGate, ParentScreen } from './screens/parent';
import { Screen } from './components/ui';
import { GameView } from './games';

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
  useEffect(() => {
    useApp.getState().load();
    initAudio();
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
        {loaded ? <Router /> : <View style={{ flex: 1, backgroundColor: colors.cream }} />}
        <CelebrationOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
