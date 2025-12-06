import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TextField,
  Autocomplete,
  InputAdornment,
  IconButton,
  Paper,
  Tooltip,
  Typography,
  Box,
  Link,
} from '@mui/material';
import { Search as SearchIcon, Help as HelpIcon } from '@mui/icons-material';
import { useTagSuggestions } from '../../hooks/useTagSuggest';
import type { TagSuggestion } from '../../api/client';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
}

// Strip control characters from tag for suggestion lookup
function getTagForSuggestion(word: string): string {
  // Remove leading -, ~, and other control chars
  return word.replace(/^[-~{]+/, '');
}

// Get prefix (-, ~) from a word
function getPrefix(word: string): string {
  return word.match(/^[-~{]+/)?.[0] || '';
}

export default function SearchBar({ value, onChange, onSearch }: SearchBarProps) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(value);
  const [showHelp, setShowHelp] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track base query (everything except the word being typed) for suggestion selection
  const baseQueryRef = useRef('');
  const lastWordPrefixRef = useRef('');

  // Get the last word being typed for autocomplete
  const words = inputValue.split(/\s+/);
  const lastWord = words.pop() || '';
  const tagForSuggestion = getTagForSuggestion(lastWord);
  const { data: suggestions = [] } = useTagSuggestions(tagForSuggestion);

  // Update base query whenever input changes (for use when selecting)
  useEffect(() => {
    const allWords = inputValue.split(/\s+/);
    const currentLastWord = allWords.pop() || '';
    baseQueryRef.current = allWords.length > 0 ? allWords.join(' ') + ' ' : '';
    lastWordPrefixRef.current = getPrefix(currentLastWord);
  }, [inputValue]);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Focus on "/" key - but not when already in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInputChange = useCallback((_: unknown, newValue: string, reason: string) => {
    // When a suggestion is selected, MUI calls this with reason='reset'
    // We handle selection in handleSelect instead
    if (reason === 'reset') return;

    setInputValue(newValue);
    onChange(newValue);
  }, [onChange]);

  const handleSelect = useCallback((_: unknown, selectedValue: TagSuggestion | string | null, reason: string) => {
    // Only handle actual selections (click or enter on option)
    if (reason !== 'selectOption' || !selectedValue) return;

    // Extract tag name (selectedValue could be object or string from freeSolo)
    const tagName = typeof selectedValue === 'string' ? selectedValue : selectedValue.name;

    // Build new value: base query + prefix + selected tag + space
    const newValue = baseQueryRef.current + lastWordPrefixRef.current + tagName + ' ';

    setInputValue(newValue);
    onChange(newValue);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Only search on Enter if dropdown is closed or no suggestions
    if (e.key === 'Enter' && (!isOpen || suggestions.length === 0)) {
      e.preventDefault();
      onSearch(inputValue);
    }
  }, [inputValue, onSearch, isOpen, suggestions.length]);

  const handleSearchClick = useCallback(() => {
    onSearch(inputValue);
  }, [inputValue, onSearch]);

  const syntaxHelp = (
    <Box sx={{ p: 1, maxWidth: 320 }}>
      <Typography variant="subtitle2" gutterBottom>Search Syntax</Typography>
      <Typography variant="body2" component="div">
        <code>tag1 tag2</code> - Match all tags<br />
        <code>-tag</code> - Exclude tag<br />
        <code>~tag1 ~tag2</code> - Match any (OR)<br />
        <code>{'{'} tag1 tag2 {'}'}</code> - Group tags<br />
        <code>tag*</code> - Wildcard match<br />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Press <kbd>/</kbd> to focus search
        </Typography>
        <Link
          component="button"
          variant="caption"
          onClick={() => {
            setShowHelp(false);
            navigate('/help');
          }}
          sx={{ mt: 0.5, display: 'block' }}
        >
          View full search help
        </Link>
      </Typography>
    </Box>
  );

  return (
    <Autocomplete
      freeSolo
      options={suggestions}
      getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={handleSelect}
      onOpen={() => setIsOpen(true)}
      onClose={() => setIsOpen(false)}
      filterOptions={(x) => x} // Don't filter, server already did
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <Box
            component="li"
            key={key}
            {...rest}
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <span style={{ flex: 1 }}>{option.name}</span>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2, flexShrink: 0 }}>
              {option.count.toLocaleString()}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          placeholder="Search tags..."
          size="small"
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <IconButton size="small" onClick={handleSearchClick}>
                    <SearchIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip
                    title={syntaxHelp}
                    open={showHelp}
                    onClose={() => setShowHelp(false)}
                    onOpen={() => setShowHelp(true)}
                    arrow
                    placement="bottom-end"
                  >
                    <IconButton size="small" onClick={() => setShowHelp(!showHelp)}>
                      <HelpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: 'background.paper',
            },
          }}
        />
      )}
      PaperComponent={(props) => (
        <Paper {...props} elevation={8} sx={{ mt: 0.5 }} />
      )}
    />
  );
}
