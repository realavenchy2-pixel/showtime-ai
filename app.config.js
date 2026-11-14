// Adds the one setting app.json cannot hold: the path the web app is served from.
// GitHub Pages serves it from /showtime-ai, so that build sets SHOWTIME_BASE_URL=/showtime-ai.
module.exports = ({ config }) => {
  const baseUrl = process.env.SHOWTIME_BASE_URL;
  return baseUrl ? { ...config, experiments: { ...config.experiments, baseUrl } } : config;
};
