import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// `npm run dev:phone` serves over https on your local network, because phones
// only allow camera access on secure pages.
export default defineConfig(({ mode }) =>
  mode === 'phone' ? { plugins: [basicSsl()], server: { host: true } } : {},
);
