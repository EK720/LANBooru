import { createTheme } from '@mui/material/styles';

// Extend MUI theme with custom palette values
declare module '@mui/material/styles' {
  interface Palette {
    imageViewer: {
      background: string;
      controls: string;
      gradient: string;
    };
  }
  interface PaletteOptions {
    imageViewer?: {
      background: string;
      controls: string;
      gradient: string;
    };
  }
}

const baseTheme = {
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
};

export const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#0ea5e9', // Sky blue
      light: '#38bdf8',
      dark: '#0284c7',
    },
    secondary: {
      main: '#6366f1', // Indigo
      light: '#818cf8',
      dark: '#4f46e5',
    },
    background: {
      default: '#0f172a', // Slate 900
      paper: '#1e293b', // Slate 800
    },
    text: {
      primary: '#f1f5f9', // Slate 100
      secondary: '#94a3b8', // Slate 400
    },
    divider: '#334155', // Slate 700
    imageViewer: {
      background: '#000000',
      controls: '#ffffff',
      gradient: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
    },
  },
  components: {
    ...baseTheme.components,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#475569 #1e293b',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            background: '#1e293b',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#475569',
            borderRadius: 4,
          },
        },
      },
    },
  },
});

export const lightTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: {
      main: '#2082fd', // Sky 600
      light: '#3399ff',
      dark: '#0862ef',
    },
    secondary: {
      main: '#4f46e5', // Indigo 600
      light: '#6366f1',
      dark: '#4338ca',
    },
    background: {
      default: '#f8fafc', // Slate 50
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b', // Slate 800
      secondary: '#64748b', // Slate 500
    },
    divider: '#e2e8f0', // Slate 200
    imageViewer: {
      background: '#ffffff',
      controls: '#334155', // Slate 700
      gradient: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, transparent 100%)',
    },
  },
  components: {
    ...baseTheme.components,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#cbd5e1 #f1f5f9',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            background: '#f1f5f9',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#cbd5e1',
            borderRadius: 4,
          },
        },
      },
    },
  },
});

// Default export for backward compatibility
export const theme = darkTheme;
