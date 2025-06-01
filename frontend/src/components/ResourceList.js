import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Box,
  Chip,
  Container,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

const ResourceList = () => {
  const [resources, setResources] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchResources = async (query = '') => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/resources/search?q=${encodeURIComponent(query)}`);
      setResources(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch resources');
      console.error('Error fetching resources:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchResources(searchQuery);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this resource?')) {
      try {
        await axios.delete(`/api/resources/${id}`);
        setResources(resources.filter(resource => resource.id !== id));
      } catch (err) {
        console.error('Error deleting resource:', err);
        alert('Failed to delete resource');
      }
    }
  };

  if (loading) return <Typography>Loading...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Container>
      <form onSubmit={handleSearch} style={{ marginBottom: 16 }}>
        <TextField
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search resources..."
          size="small"
          InputProps={{ endAdornment: <SearchIcon /> }}
        />
        <Button type="submit" variant="contained" sx={{ ml: 2 }}>Search</Button>
      </form>
      <Grid container spacing={3}>
        {resources.map((resource) => (
          <Grid item xs={12} sm={6} md={4} key={resource.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {resource.title}
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  {resource.description}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  {resource.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Link to={`/resources/${resource.id}`}>
                    <Button size="small">View Details</Button>
                  </Link>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleDelete(resource.id)}
                  >
                    Delete
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default ResourceList; 