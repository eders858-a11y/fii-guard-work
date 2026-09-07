// src/services/api.ts

const CLOUD_API_URL = 'https://fii-guard-api.onrender.com'; // Sua nuvem 24h
const LOCAL_API_URL = 'http://10.0.0.166:5000';         // Seu PC na rede local

export const getApiUrl = () => {
  if (__DEV__) {
    return LOCAL_API_URL;
  }
  return CLOUD_API_URL;
};