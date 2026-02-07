import config from './config.json';

export const getConfig = () => {
  return config;
};

export const getApiUrl = () => {
  return config.API_URL;
};
