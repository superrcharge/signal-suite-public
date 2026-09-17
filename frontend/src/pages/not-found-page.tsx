import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router';
import HomeIcon from '@mui/icons-material/Home';
import { useAuth } from '@/contexts/auth-context';
import { fallbackPathFor } from '@/routes/home-path';

export function NotFoundPage() {
  const navigate = useNavigate();
  const { role } = useAuth();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        px: 3
      }}>
      <Typography
        variant="h1"
        component="h1"
        sx={{
          fontSize: '8rem',
          fontWeight: 700,
          color: 'primary.main',
          lineHeight: 1,
        }}
      >
        404
      </Typography>
      <Typography variant="h5" gutterBottom>
        Page Not Found
      </Typography>
      <Typography
        variant="body1"
        sx={{
          color: 'text.secondary',
          mb: 4,
          maxWidth: 400
        }}>
        The page you're looking for doesn't exist or has been moved.
      </Typography>
      <Button
        variant="contained"
        startIcon={<HomeIcon />}
        onClick={() => void navigate(fallbackPathFor(role))}
      >
        {role === 'planner' ? 'Go to PACE' : 'Go to Dashboard'}
      </Button>
    </Box>
  );
}
