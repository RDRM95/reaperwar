import './style.css';
import { App } from './ui/app';
import { installUiScaleHotkeys } from './ui/tvDisplay';

declare global {
  interface Window {
    reaperwar?: App;
  }
}

const app = new App();
window.reaperwar = app;
installUiScaleHotkeys(() => app.prefs.uiScale, (scale) => {
  app.prefs.uiScale = scale;
  void app.savePrefs();
});
void app.init();
