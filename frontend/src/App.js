import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Container } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import Navbar from './components/Navbar';
import ResourceList from './components/ResourceList';
import ResourceForm from './components/ResourceForm';
import ResourceDetail from './components/ResourceDetail';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Navbar />
        <Container sx={{ mt: 4 }}>
          <Routes>
            <Route path="/" element={<ResourceList />} />
            <Route path="/resources" element={<ResourceList />} />
            <Route path="/resources/new" element={<ResourceForm />} />
            <Route path="/resources/:id" element={<ResourceDetail />} />
            <Route path="/resources/:id/edit" element={<ResourceForm />} />
          </Routes>
        </Container>
      </Router>
    </ThemeProvider>
  );
}

export default App; 