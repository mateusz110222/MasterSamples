import { createContext } from 'react';
import type { LanguageContextType } from './LanguageContext';

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
