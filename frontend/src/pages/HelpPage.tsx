import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from '@mui/material';

function CodeExample({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="code"
      sx={{
        fontFamily: 'monospace',
        bgcolor: 'action.hover',
        px: 0.75,
        py: 0.25,
        borderRadius: 0.5,
        fontSize: '0.9em',
      }}
    >
      {children}
    </Typography>
  );
}

export default function HelpPage() {
  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Search Help
      </Typography>

      {/* Basic Tag Search */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Basic Tag Search
        </Typography>
        <Typography variant="body1" paragraph>
          Search for images by typing tag names. Tags are combined with AND logic by default.
        </Typography>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Syntax</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Example</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell><CodeExample>tag1 tag2</CodeExample></TableCell>
                <TableCell>Match all tags (AND)</TableCell>
                <TableCell><CodeExample>cat cute</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><CodeExample>-tag</CodeExample></TableCell>
                <TableCell>Exclude tag (NOT)</TableCell>
                <TableCell><CodeExample>cat -dog</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><CodeExample>~tag1 ~tag2</CodeExample></TableCell>
                <TableCell>Match any tag (OR)</TableCell>
                <TableCell><CodeExample>~cat ~dog</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><CodeExample>{'{ tag1 tag2 }'}</CodeExample></TableCell>
                <TableCell>Group tags together</TableCell>
                <TableCell><CodeExample>{'~{ cat cute } ~{ dog cute }'}</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell><CodeExample>tag*</CodeExample></TableCell>
                <TableCell>Wildcard match</TableCell>
                <TableCell><CodeExample>anim*</CodeExample> matches "animal", "anime", etc.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Metatags */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Metatags
        </Typography>
        <Typography variant="body1" paragraph>
          Metatags filter images by their metadata. They use the format <CodeExample>key:value</CodeExample>.
        </Typography>

        {/* Rating */}
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          rating:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by content rating. Supports NOT and OR operators.
        </Typography>
        <TableContainer sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Value</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Alias</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Example</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>safe</TableCell>
                <TableCell>s</TableCell>
                <TableCell><CodeExample>rating:safe</CodeExample> or <CodeExample>rating:s</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>questionable</TableCell>
                <TableCell>q</TableCell>
                <TableCell><CodeExample>rating:questionable</CodeExample> or <CodeExample>rating:q</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>explicit</TableCell>
                <TableCell>e</TableCell>
                <TableCell><CodeExample>rating:explicit</CodeExample> or <CodeExample>rating:e</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>unrated</TableCell>
                <TableCell>u</TableCell>
                <TableCell><CodeExample>rating:unrated</CodeExample> or <CodeExample>rating:u</CodeExample></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>-rating:q</CodeExample> (exclude questionable), <CodeExample>~rating:safe ~rating:questionable</CodeExample> (safe OR questionable)
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* Artist */}
        <Typography variant="h6" gutterBottom>
          artist:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by artist name. Supports wildcards (*) and NOT/OR operators.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>artist:someone</CodeExample> (exact match), <CodeExample>artist:some*</CodeExample> (wildcard match)
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* File */}
        <Typography variant="h6" gutterBottom>
          file:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by filename. Supports wildcards (*) and NOT/OR operators.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>file:image.jpg</CodeExample> (exact match), <CodeExample>file:*.png</CodeExample> (all PNGs), <CodeExample>file:photo*</CodeExample> (filename starts with "photo")
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* Date */}
        <Typography variant="h6" gutterBottom>
          date:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by creation date. Supports year, month, day, and comparison operators.
        </Typography>
        <TableContainer sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Format</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Example</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>YYYY</TableCell>
                <TableCell>Entire year</TableCell>
                <TableCell><CodeExample>date:2023</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>YYYY-MM</TableCell>
                <TableCell>Entire month</TableCell>
                <TableCell><CodeExample>date:2023-06</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>YYYY-MM-DD</TableCell>
                <TableCell>Specific day</TableCell>
                <TableCell><CodeExample>date:2023-06-15</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{'>'} or {'<'}</TableCell>
                <TableCell>After/before date</TableCell>
                <TableCell><CodeExample>date:&gt;2020-01-01</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{'>='} or {'<='}</TableCell>
                <TableCell>On or after/before</TableCell>
                <TableCell><CodeExample>date:&gt;=2020</CodeExample></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Divider sx={{ my: 2 }} />

        {/* ID */}
        <Typography variant="h6" gutterBottom>
          id:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by image ID. Supports exact match and comparison operators.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>id:1234</CodeExample> (exact), <CodeExample>id:&gt;1000</CodeExample> (greater than), <CodeExample>id:&lt;500</CodeExample> (less than)
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* Source */}
        <Typography variant="h6" gutterBottom>
          source:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by source URL. Supports wildcards (*) and NOT/OR operators.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>source:*pixiv*</CodeExample> (contains "pixiv"), <CodeExample>source:*x.com*</CodeExample> (from X/Twitter), <CodeExample>-source:*</CodeExample> (no source)
        </Typography>

        <Divider sx={{ my: 2 }} />

        {/* Tags */}
        <Typography variant="h6" gutterBottom>
          tags:
        </Typography>
        <Typography variant="body2" paragraph>
          Filter by tag count. Supports exact match and comparison operators.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Examples: <CodeExample>tags:0</CodeExample> (untagged), <CodeExample>tags:&gt;10</CodeExample> (more than 10 tags), <CodeExample>tags:&lt;3</CodeExample> (needs tagging)
        </Typography>
      </Paper>

      {/* Sorting */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>
          Sorting
        </Typography>
        <Typography variant="body1" paragraph>
          Use <CodeExample>sort:</CodeExample> to change the order of results. Default is newest first.
        </Typography>

        <TableContainer sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Field</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Example</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>date</TableCell>
                <TableCell>Creation date</TableCell>
                <TableCell><CodeExample>sort:date</CodeExample> or <CodeExample>sort:date_asc</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>id</TableCell>
                <TableCell>Image ID</TableCell>
                <TableCell><CodeExample>sort:id</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>rating</TableCell>
                <TableCell>Content rating</TableCell>
                <TableCell><CodeExample>sort:rating</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>width / height</TableCell>
                <TableCell>Image dimensions</TableCell>
                <TableCell><CodeExample>sort:width_desc</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>size</TableCell>
                <TableCell>File size</TableCell>
                <TableCell><CodeExample>sort:size</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>updated</TableCell>
                <TableCell>Last updated date</TableCell>
                <TableCell><CodeExample>sort:updated</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>file</TableCell>
                <TableCell>Filename (alphabetical)</TableCell>
                <TableCell><CodeExample>sort:file</CodeExample></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>random</TableCell>
                <TableCell>Random order</TableCell>
                <TableCell><CodeExample>sort:random</CodeExample></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="body2" paragraph>
          Add <CodeExample>_asc</CodeExample> or <CodeExample>_desc</CodeExample> suffix to control direction (default is descending).
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Multiple sort fields act as tiebreakers: <CodeExample>sort:rating sort:date</CodeExample> sorts by rating first, then by date.
        </Typography>
      </Paper>

      {/* Keyboard Shortcuts */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Keyboard Shortcuts
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell sx={{ width: 100 }}><kbd>/</kbd></TableCell>
                <TableCell>Focus search bar</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><kbd>Enter</kbd></TableCell>
                <TableCell>Submit search</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
