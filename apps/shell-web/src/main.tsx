import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ShellApp } from './ShellApp.js';
import './styles.css';

const target = document.querySelector<HTMLElement>('#root');
if (!target) throw new Error('Web Shell root is missing');
createRoot(target).render(
  <StrictMode>
    <ShellApp runtimeClient={import.meta.env.MODE === 'pages' ? false : undefined} />
  </StrictMode>,
);
