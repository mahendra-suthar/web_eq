import config from './config.json';

export const getConfig = () => {
  return config;
};

export const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim() !== "") return envUrl.trim();
  return config.API_URL;
};
