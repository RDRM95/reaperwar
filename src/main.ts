import './style.css';
import { App } from './ui/app';

declare global {
  interface Window {
    reaperwar?: App;
  }
}

const app = new App();
window.reaperwar = app;
void app.init();
