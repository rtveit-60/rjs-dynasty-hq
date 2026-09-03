import { useEffect } from 'react';
import { contrastOn } from './lib/format.ts';
import { useEffectiveTheme, useHQ } from './store.ts';
import { SCALE_STEP, clampScale } from './components/ScaleControl.tsx';
import CarouselView from './components/CarouselView.tsx';
import DynastySettingsView from './components/DynastySettingsView.tsx';
import MediaView from './components/MediaView.tsx';
import Onboarding from './components/Onboarding.tsx';
import ProfileModal from './components/ProfileModal.tsx';
import RecruitingView from './components/RecruitingView.tsx';
import SchoolPicker from './components/SchoolPicker.tsx';
import SideNav from './components/SideNav.tsx';
import TeamHQ from './components/TeamHQ.tsx';
import Setup from './components/Setup.tsx';
import TitleBar from './components/TitleBar.tsx';

export default function App() {
  const ready = useHQ((s) => s.ready);
  const init = useHQ((s) => s.init);
  const settings = useHQ((s) => s.settings);
  const snapshot = useHQ((s) => s.snapshot);
  const nav = useHQ((s) => s.nav);
  const theme = useEffectiveTheme();

  useEffect(() => {
    void init();
  }, [init]);

  // Ctrl+= / Ctrl+− / Ctrl+0 step the app-wide zoom, browser style.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const s = useHQ.getState();
      const cur = s.settings?.uiScale ?? 1;
      if (e.key === '=' || e.key === '+') void s.setUiScale(clampScale(cur + SCALE_STEP));
      else if (e.key === '-' || e.key === '_') void s.setUiScale(clampScale(cur - SCALE_STEP));
      else if (e.key === '0') void s.setUiScale(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const team = snapshot?.school?.team ?? null;
  useEffect(() => {
    const root = document.documentElement.style;
    if (team) {
      root.setProperty('--team', team.colors.primary);
      root.setProperty('--team-2', team.colors.secondary ?? team.colors.primary);
      root.setProperty('--team-contrast', contrastOn(team.colors.primary));
    } else {
      root.removeProperty('--team');
      root.removeProperty('--team-2');
      root.removeProperty('--team-contrast');
    }
  }, [team]);

  if (!ready) return <div className="frame" />;

  const needsSave = !settings?.savePath;
  const needsSchool = !needsSave && settings?.schoolTeamRow == null;

  let body: React.ReactNode;
  if (needsSave) {
    body = <Onboarding />;
  } else if (needsSchool) {
    body = <SchoolPicker />;
  } else if (nav === 'setup') {
    body = <Setup />;
  } else if (nav === 'recruiting') {
    body = <RecruitingView />;
  } else if (nav === 'media') {
    body = <MediaView />;
  } else if (nav === 'carousel') {
    body = <CarouselView />;
  } else if (nav === 'settings') {
    body = <DynastySettingsView />;
  } else {
    body = <TeamHQ />;
  }

  return (
    <div className="frame">
      <TitleBar />
      {needsSave || needsSchool ? (
        <div className="content">{body}</div>
      ) : (
        <div className="body-grid">
          <SideNav />
          <div className="content">{body}</div>
        </div>
      )}
      <ProfileModal />
    </div>
  );
}
