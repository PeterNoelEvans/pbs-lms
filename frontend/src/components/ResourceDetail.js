import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Paper,
  Typography,
  Box,
  Button,
  Chip,
  CircularProgress,
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

const ResourceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResource();
  }, [id]);

  const fetchResource = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/resources/${id}`);
      setResource(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch resource');
      console.error('Error fetching resource:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this resource?')) {
      try {
        await axios.delete(`/api/resources/${id}`);
        navigate('/resources');
      } catch (err) {
        console.error('Error deleting resource:', err);
        alert('Failed to delete resource');
      }
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" sx={{ mt: 4 }}>
        {error}
      </Typography>
    );
  }

  if (!resource) {
    return (
      <Typography sx={{ mt: 4 }}>
        Resource not found
      </Typography>
    );
  }

  return (
    <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" component="h1">
          {resource.title}
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/resources/${id}/edit`)}
            sx={{ mr: 1 }}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </Box>
      </Box>

      <Typography variant="body1" paragraph>
        {resource.description}
      </Typography>

      <Box sx={{ mb: 3 }}>
        {resource.tags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            sx={{ mr: 1, mb: 1 }}
          />
        ))}
      </Box>

      <Typography
        variant="body1"
        sx={{
          whiteSpace: 'pre-wrap',
          backgroundColor: 'grey.50',
          p: 2,
          borderRadius: 1,
        }}
      >
        {resource.content}
      </Typography>

      <Box sx={{ mt: 4 }}>
        <Button
          variant="outlined"
          onClick={() => navigate('/resources')}
        >
          Back to Resources
        </Button>
      </Box>
    </Paper>
  );
};

export default ResourceDetail; 