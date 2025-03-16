/**
 * API utility functions for backend requests
 */

const API_BASE_URL = 'http://localhost:8080';

/**
 * Get the current city from localStorage or URL parameters
 */
export const getCurrentCity = () => {
  // Check if we're in the browser environment
  if (typeof window !== 'undefined') {
    // First try to get from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const cityParam = urlParams.get('city');
    
    if (cityParam) {
      // Save to localStorage for persistence
      localStorage.setItem('selectedCity', cityParam);
      return cityParam;
    }
    
    // Fall back to localStorage
    return localStorage.getItem('selectedCity') || 'toronto'; // Default to Toronto if no city is set
  }
  
  return 'toronto'; // Default for server-side rendering
};

/**
 * Append city parameter to a URL
 */
export const appendCityParam = (url, city = null) => {
  const cityToUse = city || getCurrentCity();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}city=${cityToUse}`;
};

/**
 * Fetch data from the API with city parameter
 */
export const fetchFromAPI = async (endpoint, options = {}, city = null) => {
  const url = appendCityParam(`${API_BASE_URL}${endpoint}`, city);
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching from ${url}:`, error);
    throw error;
  }
};

/**
 * Create WebSocket connection with city parameter
 */
export const createWebSocket = (endpoint, city = null) => {
  const cityToUse = city || getCurrentCity();
  const wsUrl = `ws://localhost:8080${endpoint}`;
  const separator = wsUrl.includes('?') ? '&' : '?';
  
  return new WebSocket(`${wsUrl}${separator}city=${cityToUse}`);
};
