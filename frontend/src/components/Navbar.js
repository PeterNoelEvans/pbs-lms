import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

const Navbar = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{
            flexGrow: 1,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Teacher Resources
        </Typography>
        <Box>
          <Button
            component={RouterLink}
            to="/resources/new"
            color="inherit"
            startIcon={<AddIcon />}
          >
            Add Resource
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar; 