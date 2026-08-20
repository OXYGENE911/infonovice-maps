// Point d'entrée. La page « en construction » n'a besoin que de ses styles ;
// le service worker est enregistré par vite-plugin-pwa (registerType
// autoUpdate) via ce module virtuel. La carte arrive en PR #2.
import './styles/tokens.css';
import './styles/construction.css';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });
