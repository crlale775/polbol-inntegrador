import { createContext } from 'react';

// Pages can still render standalone, while routed pages reuse the existing shell.
export const ShellContext = createContext(false);
