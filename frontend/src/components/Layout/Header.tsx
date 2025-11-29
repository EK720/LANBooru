import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Home as HomeIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import SearchBar from '../Search/SearchBar';

export default function Header() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');

  // Hide search bar on homepage since it has its own
  const isHomePage = location.pathname === '/' || location.pathname === '/search';

  const handleSearch = useCallback((query: string) => {
    if (query.trim()) {
      navigate(`/?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/');
    }
  }, [navigate]);

  const handleHomeClick = useCallback(() => {
    // Clear search value
    setSearchValue('');
    // Navigate to home without query params
    navigate('/');
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Clear scroll restoration state
    sessionStorage.removeItem('gallery-scroll-state');
  }, [navigate]);

  return (
    <AppBar position="sticky" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 2 }}>
        <IconButton
          color="inherit"
          onClick={handleHomeClick}
          sx={{ p: 1 }}
        >
          <HomeIcon />
        </IconButton>

        {!isMobile && (
          <Typography
            variant="h6"
            component="div"
            sx={{
              fontWeight: 700,
              cursor: 'pointer',
              '&:hover': { opacity: 0.8 },
            }}
            onClick={handleHomeClick}
          >
            LANBooru
          </Typography>
        )}

        {!isHomePage && (
          <Box sx={{ flexGrow: 1, maxWidth: 600 }}>
            <SearchBar
              value={searchValue}
              onChange={setSearchValue}
              onSearch={handleSearch}
            />
          </Box>
        )}

        {isHomePage && <Box sx={{ flexGrow: 1 }} />}

        <IconButton
          color="inherit"
          onClick={() => navigate('/admin')}
          sx={{ p: 1 }}
        >
          <SettingsIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
