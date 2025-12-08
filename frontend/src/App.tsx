import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './theme/ThemeContext';
import { PluginProvider } from './plugins';
import Layout from './components/Layout/Layout';
import HomePage from './pages/HomePage';
import ImagePage from './pages/ImagePage';
import AdminPage from './pages/AdminPage';
import HelpPage from './pages/HelpPage';

// Signal to fallback script that React has mounted
declare global {
  interface Window {
    __REACT_MOUNTED__?: boolean;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  // Signal that React has successfully mounted (prevents fallback redirect)
  useEffect(() => {
    window.__REACT_MOUNTED__ = true;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PluginProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/search" element={<HomePage />} />
                <Route path="/image/:id" element={<ImagePage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/help" element={<HelpPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PluginProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
